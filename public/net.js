/* Schlanke Socket-Schicht über WebSocket mit automatischem Wiederverbinden */
window.io = function io() {
  const handlers = {};
  const acks = {};
  let ws = null, seq = 0, connected = false, manual = false, delay = 400, retryTimer = null, lastMsg = Date.now();

  const fire = (ev, d) => (handlers[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } });

  const api = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return api; },
    emit(ev, d, cb) {
      if (typeof d === 'function') { cb = d; d = {}; }
      const m = { e: ev, d: d || {} };
      if (cb) { m.id = ++seq; acks[m.id] = cb; }
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
      else if (cb) { delete acks[m.id]; cb({ error: 'Keine Verbindung zum Server.' }); }
    },
    get connected() { return connected; },
    disconnect() { manual = true; if (ws) ws.close(); },
  };

  function connect() {
    clearTimeout(retryTimer);
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => { connected = true; delay = 400; lastMsg = Date.now(); fire('connect'); };
    ws.onmessage = (ev) => {
      lastMsg = Date.now();
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.e === '__ack') { const cb = acks[m.d.id]; delete acks[m.d.id]; if (cb) cb(m.d.res); return; }
      if (m.e === 'pong') return;
      fire(m.e, m.d);
    };
    ws.onclose = () => {
      const was = connected; connected = false;
      if (was) fire('disconnect');
      if (!manual) { retryTimer = setTimeout(connect, delay); delay = Math.min(delay * 1.6, 4000); }
    };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }

  // Lebenszeichen: tote Verbindungen (z.B. nach Handy-Standby) schnell erkennen
  setInterval(() => {
    if (!ws || ws.readyState !== 1) return;
    if (Date.now() - lastMsg > 25000) { try { ws.close(); } catch (e) {} return; }
    try { ws.send('{"e":"ping"}'); } catch (e) {}
  }, 8000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || manual) return;
    if (!ws || ws.readyState > 1) { delay = 400; connect(); }
    else if (ws.readyState === 1) { try { ws.send('{"e":"ping"}'); } catch (e) {} }
  });
  window.addEventListener('online', () => { if (!manual) { delay = 400; connect(); } });

  connect();
  return api;
};
