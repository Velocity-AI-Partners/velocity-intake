// Tests for the page-reading half of scrape-location-page.
//
//   deno test --allow-net supabase/functions/scrape-location-page/extract_test.ts
//
// The unit tests are offline. The tests tagged LIVE hit real brand sites and
// are the ones that actually prove the Firecrawl replacement works — they are
// the check that would have caught the eleven-day outage.
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decodeEntities,
  htmlToText,
  extractJsonLd,
  isBlockedHost,
  embeddedPrivateIp,
  enrichmentLinks,
  snapTime,
  snapHours,
  guardedFetch,
  pageText,
  FINDER_PATH_RE,
} from './extract.ts';

const LIVE = Deno.env.get('SKIP_LIVE') !== '1';

// ---------------------------------------------------------------- SSRF guard
Deno.test('isBlockedHost rejects private, loopback and metadata hosts', () => {
  for (const h of [
    'localhost', 'app.localhost', '127.0.0.1', '0.0.0.0', '10.1.2.3',
    '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '::1', 'fd00::1', 'fe80::1',
  ]) {
    assert(isBlockedHost(h), `${h} should be blocked`);
  }
});

Deno.test('isBlockedHost allows real public hosts', () => {
  for (const h of ['www.stretchzone.com', 'stretchlab.com', '8.8.8.8', '172.32.0.1']) {
    assert(!isBlockedHost(h), `${h} should be allowed`);
  }
});

Deno.test('isBlockedHost does not reject real domains starting fc/fd', () => {
  // The IPv6 private-range prefixes used to be tested against every hostname.
  for (const h of ['fcfitness.com', 'fdny.org', 'fcbarcelona.com', 'fe80studios.com']) {
    assert(!isBlockedHost(h), `${h} is a public domain and must be allowed`);
  }
});

Deno.test('embeddedPrivateIp catches wildcard-DNS hosts pointing at private space', () => {
  for (const h of ['127.0.0.1.nip.io', '169.254.169.254.nip.io', '10-0-0-1.sslip.io', '192.168.1.1.xip.io']) {
    assert(embeddedPrivateIp(h), `${h} embeds a private address`);
  }
  for (const h of ['www.stretchzone.com', 'studio24.com', '8.8.8.8.nip.io']) {
    assert(!embeddedPrivateIp(h), `${h} does not embed a private address`);
  }
});

// ------------------------------------------------------------------- parsing
Deno.test('decodeEntities handles named, decimal and hex references', () => {
  assertEquals(decodeEntities('Mon&nbsp;9&ndash;5 &amp; Sat'), 'Mon 9–5 & Sat');
  assertEquals(decodeEntities('&#8212;&#x2014;'), '——');
  assertEquals(decodeEntities('&notarealentity;'), '&notarealentity;');
});

Deno.test('htmlToText drops scripts and styles but keeps visible copy', () => {
  const html = `
    <html><head><style>.x{color:red}</style></head>
    <body><script>var secret='DO NOT LEAK';</script>
    <h1>Stretch Zone Brickell</h1>
    <p>1234 Main St</p><p>(786) 636-1305</p>
    <noscript>enable js</noscript></body></html>`;
  const t = htmlToText(html);
  assertStringIncludes(t, 'Stretch Zone Brickell');
  assertStringIncludes(t, '(786) 636-1305');
  assert(!t.includes('DO NOT LEAK'), 'script contents must not survive');
  assert(!t.includes('color:red'), 'style contents must not survive');
  // Block tags must separate, or the address runs into the phone number.
  assert(/1234 Main St\n/.test(t), `address should end a line, got: ${JSON.stringify(t)}`);
});

Deno.test('extractJsonLd recovers LocalBusiness structured data', () => {
  const html = `<script type="application/ld+json">
    {"@type":"HealthClub","name":"Stretch Zone","telephone":"(786) 636-1305",
     "address":{"postalCode":"33131"},"openingHours":"Mo-Fr 08:00-20:00"}
  </script><body>hi</body>`;
  const ld = extractJsonLd(html);
  assertStringIncludes(ld, 'HealthClub');
  assertStringIncludes(ld, '33131');
  assertStringIncludes(ld, 'Mo-Fr 08:00-20:00');
});

Deno.test('extractJsonLd survives a malformed block', () => {
  const html = `<script type="application/ld+json">{ this is not json </script>
                <script type="application/ld+json">{"@type":"Store"}</script>`;
  assertStringIncludes(extractJsonLd(html), 'Store');
});

Deno.test('enrichmentLinks finds same-domain About links only', () => {
  const html = `
    <a href="/about-us">About Us</a>
    <a href="/our-story">Our Story</a>
    <a href="https://evil.example.com/about">About</a>
    <a href="http://127.0.0.1/about">About</a>
    <a href="/pricing">Pricing</a>`;
  const links = enrichmentLinks(html, 'https://www.stretchzone.com/locations/fl/brickell', 5);
  assert(links.some((l) => l.endsWith('/about-us')), 'should find /about-us');
  assert(links.some((l) => l.endsWith('/our-story')), 'should find /our-story');
  assert(!links.some((l) => l.includes('evil.example.com')), 'must not cross domains');
  assert(!links.some((l) => l.includes('127.0.0.1')), 'must not reach loopback');
  assert(!links.some((l) => l.includes('/pricing')), 'should ignore non-About links');
});

Deno.test('snapTime rounds to the 15-minute grid the form offers', () => {
  assertEquals(snapTime('08:07'), '08:00');
  assertEquals(snapTime('08:08'), '08:15');
  assertEquals(snapTime('23:58'), '00:00');
  assertEquals(snapTime('nope'), null);
  assertEquals(snapTime('25:00'), null);
});

Deno.test('snapHours keeps closed days and drops unparseable ones', () => {
  const h = snapHours({ mon: { open: '08:07', close: '20:02' }, sun: { closed: true }, tue: { open: 'x' } });
  assertEquals(h?.mon, { open: '08:00', close: '20:00', closed: false });
  assertEquals(h?.sun, { closed: true });
  assertEquals(h?.tue, undefined);
});

Deno.test('FINDER_PATH_RE matches brand location finders, not real studio pages', () => {
  for (const p of ['/location-search', '/locations', '/find-a-studio', '/store-locator', '/studios/']) {
    assert(FINDER_PATH_RE.test(p), `${p} should look like a finder`);
  }
  for (const p of ['/locations/fl/brickell', '/location/carlsbad-ca', '/studios/reston-va']) {
    assert(!FINDER_PATH_RE.test(p), `${p} is a real location page`);
  }
});

// ---------------------------------------------------------------------- LIVE
Deno.test({
  name: 'LIVE: a real Stretch Zone location page yields address, phone and hours',
  ignore: !LIVE,
  fn: async () => {
    const { text, finalUrl } = await pageText('https://www.stretchzone.com/locations/fl/brickell');
    assert(text.length > 1000, `expected real content, got ${text.length} chars`);
    assertStringIncludes(finalUrl, 'brickell');
    assert(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(text), 'should contain a phone number');
    assert(/\b\d{5}\b/.test(text), 'should contain a ZIP');
    assert(/(?:mon|monday)/i.test(text), 'should mention weekday hours');
  },
});

Deno.test({
  name: 'LIVE: a stale location URL is detected as a finder redirect, not scraped',
  ignore: !LIVE,
  fn: async () => {
    const requested = new URL('https://www.stretchlab.com/location/carlsbad');
    const { finalUrl } = await guardedFetch(requested.toString());
    const landedElsewhere =
      new URL(finalUrl).pathname.replace(/\/+$/, '').toLowerCase() !==
      requested.pathname.replace(/\/+$/, '').toLowerCase();
    assert(landedElsewhere, `expected a redirect away from ${requested.pathname}, landed ${finalUrl}`);
    assert(
      FINDER_PATH_RE.test(new URL(finalUrl).pathname),
      `redirect target ${finalUrl} should be recognised as a finder page`,
    );
  },
});

Deno.test({
  name: 'LIVE: guardedFetch refuses to follow a redirect into a private host',
  ignore: !LIVE,
  fn: async () => {
    // nip.io resolves *.127.0.0.1.nip.io to loopback; the hostname itself is
    // public-looking, so this exercises the per-hop check rather than the
    // up-front one in the handler.
    const r = await guardedFetch('http://127.0.0.1.nip.io/');
    assert(r.error, 'should have refused');
    assertStringIncludes(r.error!, 'blocked host');
  },
});
