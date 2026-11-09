/*!
 * MiniGame Studio embed SDK v1.0.0
 * Drop-in script: <script src="https://YOUR_HOST/sdk/minigames.js"></script>
 *
 *   MiniGames.mount('#game', { sessionEndpoint: '/game-session', onEvent: e => console.log(e) });
 *
 * The SDK never sees your secret license key. Your own server creates a short-lived
 * session (POST {host}/api/v1/sessions) and returns { playUrl } to this script.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';

  function resolve(target) {
    if (typeof target === 'string') return document.querySelector(target);
    return target && target.nodeType === 1 ? target : null;
  }
  function note(el, text, isError) {
    el.innerHTML = '';
    var d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:120px;' +
      'font:14px/1.4 system-ui,sans-serif;text-align:center;padding:16px;box-sizing:border-box;color:' + (isError ? '#b91c1c' : '#6b7280');
    d.textContent = text;
    el.appendChild(d);
  }

  /**
   * mount(target, options)
   *  options.playUrl          Play URL returned by your server, OR
   *  options.sessionEndpoint  URL of YOUR endpoint that returns { playUrl } (POST)
   *  options.sessionBody      optional JSON body sent to sessionEndpoint
   *  options.onEvent(e)       called with { type, data } for: ready, login, round, balance, error
   *  options.title            iframe title (accessibility)
   * Returns { iframe, reload(), destroy(), on(type, fn) }
   */
  function mount(target, options) {
    var el = resolve(target);
    if (!el) throw new Error('MiniGames.mount: target element not found');
    var opts = options || {};
    var listeners = {};
    var iframe = null, handler = null, expectedOrigin = null, destroyed = false;

    function emit(type, data) {
      var e = { type: type, data: data };
      if (typeof opts.onEvent === 'function') { try { opts.onEvent(e); } catch (x) { console.error(x); } }
      (listeners[type] || []).forEach(function (fn) { try { fn(data); } catch (x) { console.error(x); } });
    }
    function getPlayUrl() {
      if (opts.playUrl) return Promise.resolve(opts.playUrl);
      if (!opts.sessionEndpoint) return Promise.reject(new Error('Provide playUrl or sessionEndpoint'));
      return fetch(opts.sessionEndpoint, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts.sessionBody || {}),
      }).then(function (r) {
        if (!r.ok) throw new Error('Your session endpoint returned ' + r.status);
        return r.json();
      }).then(function (j) {
        if (!j || !j.playUrl) throw new Error('Your session endpoint did not return a playUrl');
        return j.playUrl;
      });
    }
    function cleanup() {
      if (handler) window.removeEventListener('message', handler);
      handler = null;
    }
    function load() {
      cleanup();
      note(el, 'Loading game…');
      return getPlayUrl().then(function (url) {
        if (destroyed) return;
        expectedOrigin = new URL(url, location.href).origin;
        iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.title = opts.title || 'Game';
        iframe.allow = 'autoplay; fullscreen';
        iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#000';
        handler = function (ev) {
          if (ev.origin !== expectedOrigin || !iframe || ev.source !== iframe.contentWindow) return;
          var d = ev.data;
          if (d && d.source === 'minigames' && d.type) emit(d.type, d.data);
        };
        window.addEventListener('message', handler);
        el.innerHTML = '';
        el.appendChild(iframe);
      }).catch(function (err) {
        note(el, 'Could not load the game: ' + err.message, true);
        emit('error', { message: err.message });
      });
    }
    load();
    return {
      get iframe() { return iframe; },
      reload: load,
      destroy: function () { destroyed = true; cleanup(); el.innerHTML = ''; },
      on: function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    };
  }

  root.MiniGames = { version: VERSION, mount: mount };
})(typeof window !== 'undefined' ? window : this);
