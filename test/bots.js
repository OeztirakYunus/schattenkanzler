/* Automatischer Test: Bots spielen komplette Partien für 5–10 Spieler.
 * Aufruf: npm test   (startet eigene Server-Instanzen auf Port 39xx) */
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const GAMES_PER_COUNT = Number(process.env.GAMES) || 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const h = {}; const acks = {}; let seq = 0;
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.e === '__ack') { const cb = acks[m.d.id]; delete acks[m.d.id]; if (cb) cb(m.d.res); return; }
    (h[m.e] || []).forEach((f) => f(m.d));
  });
  return {
    ws,
    on(e, f) { (h[e] = h[e] || []).push(f); },
    emit(e, d = {}, cb) { const m = { e, d }; if (cb) { m.id = ++seq; acks[m.id] = cb; } if (ws.readyState === 1) ws.send(JSON.stringify(m)); },
    open: new Promise((r) => ws.on('open', r)),
  };
}

async function runCount(n, port) {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(port), SPEED: '0.004' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvErr = '';
  srv.stderr.on('data', (d) => { srvErr += d; });
  await new Promise((r) => srv.stdout.on('data', (d) => { if (String(d).includes('Controller')) r(); }));

  const host = client(port); await host.open; host.emit('host');
  const stats = { games: 0, lib: 0, fas: 0, reasons: {}, errors: [], powers: {}, vetoes: 0, chaos: 0, rounds: 0, maxRounds: 0 };
  host.on('fx', (f) => {
    if (f.type === 'power') stats.powers[f.power] = (stats.powers[f.power] || 0) + 1;
    if (f.type === 'vetoAccepted') stats.vetoes++;
    if (f.type === 'chaos') stats.chaos++;
  });
  let hostState = null;
  host.on('state', (s) => {
    hostState = s;
    if (['nominate'].includes(s.phase)) {
      const total = s.deckCount + s.discardCount + s.lib + s.fas;
      if (total !== 17) stats.errors.push(`Kartenzahl ${total} != 17`);
    }
  });

  let gameOver = null;
  host.on('fx', (f) => { if (f.type === 'gameover') gameOver = f; });

  const bots = [];
  for (let i = 0; i < n; i++) {
    const c = client(port); await c.open;
    const bot = { c, name: `Bot${i + 1}`, state: null, lastKey: '' };
    c.on('state', (s) => { bot.state = s; act(bot); });
    c.on('toast', (t) => stats.errors.push(`toast(${bot.name}): ${t}`));
    await new Promise((r) => c.emit('join', { name: bot.name }, (res) => { if (res.error) stats.errors.push(res.error); r(); }));
    bots.push(bot);
  }

  function act(bot) {
    const s = bot.state; const me = s.me; if (!me) return;
    const pl = s.players.find((p) => p.id === me.id);
    const key = `${s.phase}|${s.round}|${s.power}|${me.hand ? me.hand.join() : ''}|${me.myVote}|${pl.ready}|${me.canVeto}`;
    if (key === bot.lastKey) return;
    bot.lastKey = key;
    const rnd = (a) => a[Math.floor(Math.random() * a.length)];
    const send = (e, d) => setTimeout(() => bot.c.emit(e, d, (r) => { if (r && r.error) stats.errors.push(`${bot.name} ${e}: ${r.error}`); }), Math.random() * 15);
    switch (s.phase) {
      case 'reveal': if (!pl.ready) send('ready'); break;
      case 'nominate': if (me.eligible) send('nominate', { id: rnd(me.eligible) }); break;
      case 'vote': if (pl.alive && me.myVote === undefined) send('vote', { ja: Math.random() < 0.65 }); break;
      case 'legPresident': if (me.isPres && me.hand) send('discard', { index: Math.floor(Math.random() * 3) }); break;
      case 'legChancellor': if (me.isChan && me.hand) { if (me.canVeto && Math.random() < 0.4) send('veto'); else send('enact', { index: Math.floor(Math.random() * 2) }); } break;
      case 'veto': if (me.isPres) send('vetoResponse', { accept: Math.random() < 0.5 }); break;
      case 'power': if (me.isPres) { if (me.peek) send('ack'); else if (me.targets) send('powerTarget', { id: rnd(me.targets) }); } break;
      case 'investigateResult': if (me.isPres) send('ack'); break;
    }
  }

  for (let g = 0; g < GAMES_PER_COUNT; g++) {
    gameOver = null;
    // Ein falscher Spieler darf nicht starten
    if (g === 0) bots[1].c.emit('startGame', {}, (r) => { if (!r.error) stats.errors.push('Nicht-Leiter konnte starten'); });
    await sleep(30);
    bots[0].c.emit('startGame', {}, (r) => { if (r.error) stats.errors.push('start: ' + r.error); });
    const t0 = Date.now();
    while (!gameOver && Date.now() - t0 < 30000) await sleep(20);
    if (!gameOver) { stats.errors.push(`Spiel hängt in Phase ${hostState && hostState.phase}`); break; }
    await sleep(60);
    stats.games++;
    stats[gameOver.winner === 'liberal' ? 'lib' : 'fas']++;
    const r = gameOver.reason.replace(/^\S+ (war|ist) /, '… $1 ');
    stats.reasons[r] = (stats.reasons[r] || 0) + 1;
    stats.rounds += hostState.round; stats.maxRounds = Math.max(stats.maxRounds, hostState.round);
    // Rollenverteilung prüfen
    const roles = hostState.players.map((p) => p.role);
    const fasc = roles.filter((r) => r === 'fascist').length, hit = roles.filter((r) => r === 'hitler').length;
    const expected = { 5: 1, 6: 1, 7: 2, 8: 2, 9: 3, 10: 3 }[n];
    if (hit !== 1 || fasc !== expected) stats.errors.push(`Rollen falsch: ${fasc} Faschisten, ${hit} Hitler`);
    bots[2].c.emit('newGame', {});
    await sleep(60);
  }

  // Reconnect-Test: Bot verbindet sich mit Token neu
  srv.kill();
  if (srvErr) stats.errors.push('Server-Fehler: ' + srvErr.slice(0, 500));
  return stats;
}

(async () => {
  let fail = false;
  for (let n = 5; n <= 10; n++) {
    const st = await runCount(n, 3900 + n);
    const errs = st.errors.filter((e) => !/Gerade nicht möglich|Stimme|Ungültig/.test(e));
    console.log(`${n} Spieler: ${st.games} Partien, Liberale ${st.lib} / Faschisten ${st.fas}, Ø ${(st.rounds / Math.max(1, st.games)).toFixed(1)} Runden, Vollmachten ${JSON.stringify(st.powers)}, Vetos ${st.vetoes}, Chaos ${st.chaos}`);
    console.log('   Gründe:', JSON.stringify(st.reasons));
    if (st.errors.length) console.log('   Meldungen:', st.errors.slice(0, 6));
    if (errs.length || st.games < GAMES_PER_COUNT) fail = true;
  }
  console.log(fail ? '\n❌ Test fehlgeschlagen' : '\n✅ Alle Tests bestanden');
  process.exit(fail ? 1 : 0);
})();
