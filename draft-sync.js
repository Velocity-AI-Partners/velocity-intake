/* draft-sync.js — server-side draft persistence shared by the intake forms.
 *
 * WHY THIS EXISTS
 * ---------------
 * The per-client variants (gorman, song-koh, magretti) previously saved only
 * to localStorage. That meant nothing reached the Velocity team until the
 * client pressed submit: a client could fill in 90% of the form and we would
 * have no idea they had ever opened it, and switching device lost everything.
 *
 * This module adds a server-side draft alongside the existing localStorage
 * save. localStorage is deliberately kept as the offline fallback, so a
 * network failure degrades to the old behaviour instead of losing answers.
 *
 * ONE SHARED FILE, NOT THREE COPIES
 * ---------------------------------
 * The variants are otherwise standalone by design. This one is shared because
 * it is the security-sensitive path: it is the only place that knows to send
 * the x-draft-id header the RLS policies check. Three drifting copies of that
 * is how a form quietly ends up unable to save, or reading someone else's row.
 *
 * HOW ACCESS CONTROL WORKS (migration 016)
 * ----------------------------------------
 * anon may read or update a submission only by presenting that row's uuid in
 * an `x-draft-id` header. A v4 uuid is unguessable, so you cannot reach a row
 * you were not given. Creating a row (INSERT) stays open, which is what a
 * public intake form requires.
 *
 * Every GET and PATCH here MUST send that header. Without it the request
 * succeeds but matches zero rows.
 */
(function (global) {
  'use strict';

  var DEBOUNCE_MS = 900;

  function create(cfg) {
    // cfg: {
    //   supabaseUrl, anonKey, table,
    //   storageKey,                 localStorage namespace for this variant
    //   buildPayload(status, id),   returns a full row object
    //   applyRow(row),              applies a loaded server row to the form
    //   onState(state),             'saving' | 'saved' | 'local-only' | 'preview'
    //   preview                     true on localhost: never touch the network
    // }
    var draftId = null;
    var timer = null;
    var inFlight = false;
    var dirtyWhileInFlight = false;

    var idKey = cfg.storageKey + ':draft-id';

    function headers(extra) {
      var h = {
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + cfg.anonKey,
        'Content-Type': 'application/json'
      };
      for (var k in (extra || {})) h[k] = extra[k];
      return h;
    }

    function endpoint(query) {
      return cfg.supabaseUrl + '/rest/v1/' + cfg.table + (query || '');
    }

    function setState(s) {
      if (typeof cfg.onState === 'function') cfg.onState(s);
    }

    function rememberId(id) {
      draftId = id;
      try { localStorage.setItem(idKey, id); } catch (e) {}
      // Put the draft in the address bar so the client can resume from another
      // device by reopening the same link.
      try {
        var url = new URL(location.href);
        if (url.searchParams.get('draft') !== id) {
          url.searchParams.set('draft', id);
          history.replaceState({}, '', url.toString());
        }
      } catch (e) {}
    }

    function forgetId() {
      draftId = null;
      try { localStorage.removeItem(idKey); } catch (e) {}
    }

    /* ------------------------------- load -------------------------------- */

    // Resolves to the server row if one exists and is still a draft.
    function load() {
      var urlId = null, storedId = null;
      try { urlId = new URLSearchParams(location.search).get('draft'); } catch (e) {}
      try { storedId = localStorage.getItem(idKey); } catch (e) {}
      var id = urlId || storedId;

      if (!id || cfg.preview) return Promise.resolve(null);

      return fetch(endpoint('?id=eq.' + encodeURIComponent(id) + '&select=*'), {
        headers: headers({ 'x-draft-id': id })
      }).then(function (resp) {
        if (!resp.ok) return null;
        return resp.json();
      }).then(function (rows) {
        var row = rows && rows[0];
        if (!row) {
          // Draft was deleted, provisioned, or the id is not ours. Start clean
          // rather than stranding the client on a dead id.
          forgetId();
          return null;
        }
        if (row.status !== 'draft') {
          // Already submitted. Do not let them silently edit a live submission.
          forgetId();
          return { alreadySubmitted: true, row: row };
        }
        rememberId(id);
        return { alreadySubmitted: false, row: row };
      }).catch(function () {
        return null;
      });
    }

    /* ------------------------------- save -------------------------------- */

    function save() {
      if (cfg.preview) { setState('preview'); return Promise.resolve(); }
      if (inFlight) { dirtyWhileInFlight = true; return Promise.resolve(); }

      inFlight = true;
      setState('saving');

      var creating = !draftId;
      var id = draftId || (global.crypto && global.crypto.randomUUID
        ? global.crypto.randomUUID()
        : null);
      if (!id) { inFlight = false; setState('local-only'); return Promise.resolve(); }

      var payload = cfg.buildPayload('draft', id);
      var req;

      if (creating) {
        req = fetch(endpoint(), {
          method: 'POST',
          headers: headers({ Prefer: 'return=minimal' }),
          body: JSON.stringify(payload)
        });
      } else {
        // The primary key never changes, and PostgREST is happier without it.
        delete payload.id;
        req = fetch(endpoint('?id=eq.' + encodeURIComponent(id)), {
          method: 'PATCH',
          headers: headers({ 'x-draft-id': id, Prefer: 'return=minimal' }),
          body: JSON.stringify(payload)
        });
      }

      return req.then(function (resp) {
        if (!resp.ok) return resp.text().then(function (t) { throw new Error(resp.status + ' ' + t); });
        if (creating) rememberId(id);
        setState('saved');
      }).catch(function (err) {
        // Never break the form over a sync failure. localStorage still holds
        // the answers, and the label tells the truth about where they are.
        console.warn('[draft-sync] save failed:', err && err.message);
        setState('local-only');
      }).then(function () {
        inFlight = false;
        if (dirtyWhileInFlight) { dirtyWhileInFlight = false; touch(); }
      });
    }

    function touch() {
      clearTimeout(timer);
      timer = setTimeout(save, DEBOUNCE_MS);
    }

    // Best-effort write when the tab is being hidden or closed.
    function flush() {
      if (cfg.preview || !draftId || inFlight) return;
      clearTimeout(timer);
      var payload = cfg.buildPayload('draft', draftId);
      delete payload.id;
      try {
        fetch(endpoint('?id=eq.' + encodeURIComponent(draftId)), {
          method: 'PATCH',
          keepalive: true,
          headers: headers({ 'x-draft-id': draftId, Prefer: 'return=minimal' }),
          body: JSON.stringify(payload)
        }).catch(function () {});
      } catch (e) {}
    }

    /* ------------------------------ submit ------------------------------- */

    // Flips the draft to 'pending', or inserts straight to 'pending' if no
    // draft was ever created. Resolves to the row id for the n8n webhook.
    function submit() {
      clearTimeout(timer);
      var id = draftId || (global.crypto && global.crypto.randomUUID
        ? global.crypto.randomUUID()
        : null);
      var payload = cfg.buildPayload('pending', id);
      var primary;

      if (!draftId) {
        // The client submitted without ever triggering a draft save.
        primary = fetch(endpoint(), {
          method: 'POST',
          headers: headers({ Prefer: 'return=minimal' }),
          body: JSON.stringify(payload)
        });
      } else {
        delete payload.id;
        primary = fetch(endpoint('?id=eq.' + encodeURIComponent(id)), {
          method: 'PATCH',
          headers: headers({ 'x-draft-id': id, Prefer: 'return=minimal' }),
          body: JSON.stringify(payload)
        });
      }

      return primary.then(function (resp) {
        if (!resp.ok) return resp.text().then(function (t) { throw new Error('Submit failed: ' + resp.status + ' ' + t); });
        // The draft is now a live submission; stop editing it locally.
        forgetId();
        // Multi-studio forms fan out to one row per studio. The draft carries
        // the first studio; the rest are inserted once that row has landed.
        if (typeof cfg.afterSubmit === 'function') return cfg.afterSubmit(id);
      }).then(function () { return id; });
    }

    return {
      load: load,
      touch: touch,
      flush: flush,
      save: save,
      submit: submit,
      id: function () { return draftId; }
    };
  }

  global.VelocityDraftSync = { create: create };
})(window);
