'use strict';
/*
 * Schattenkanzler – Partyspiel-Server
 * Fernseher öffnet  http://<IP>:3000/      (Spielbrett)
 * Handys öffnen     http://<IP>:3000/play  (Controller)
 *
 * Spielprinzip basiert auf "Secret Hitler" von Mike Boxleiter, Tommy Maranges & Max Temkin,
 * lizenziert unter CC BY-NC-SA 4.0 (secrethitler.com). Nicht kommerziell.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const MIN_PLAYERS = Math.max(3, Number(process.env.MIN_PLAYERS) || 5);
const MAX_PLAYERS = 10;
const SPEED = Number(process.env.SPEED) || 1; // nur für Tests (z.B. 0.02)
const DELAY = { voteResult: 5200, enacted: 4800, chaosExtra: 1800, vetoed: 3500, powerResolved: 4000, executeHitler: 4200 };

const ROLE_TABLE = { 5: [3, 1], 6: [4, 1], 7: [4, 2], 8: [5, 2], 9: [5, 3], 10: [6, 3] };
const POWER_TRACKS = {
  small: [null, null, 'peek', 'execute', 'execute'],
  medium: [null, 'investigate', 'special', 'execute', 'execute'],
  large: ['investigate', 'investigate', 'special', 'execute', 'execute'],
};
const COLORS = ['#e8a33d', '#4fb3bf', '#d4566b', '#8bc34a', '#9575cd', '#f06292', '#4db6ac', '#ffb74d', '#7986cb', '#c49a6c'];

function powerTrackFor(n) { return n >= 9 ? POWER_TRACKS.large : n >= 7 ? POWER_TRACKS.medium : POWER_TRACKS.small; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const newId = (n = 6) => crypto.randomBytes(n).toString('hex');
const pick = (arr) => arr[crypto.randomInt(arr.length)];

class Game {
  constructor() {
    this.players = [];
    this.gameId = 0;
    this.onFx = () => {};
    this.onChange = () => {};
    this.reset();
  }

  reset() {
    this.gameId++;
    this.phase = 'lobby';
    this.deck = []; this.discard = [];
    this.lib = 0; this.fas = 0; this.tracker = 0;
    this.presIdx = -1; this.nomineeId = null; this.chancellorId = null;
    this.lastPresId = null; this.lastChanId = null;
    this.votes = {}; this.lastVote = null; this.specialReturnIdx = null;
    this.hand = []; this.vetoUsed = false; this.power = null; this.investigation = null;
    this.winner = null; this.winReason = ''; this.notice = ''; this.lastEnacted = null;
    this.log = []; this.round = 0; this.startCount = 0;
    for (const p of this.players) { p.role = null; p.alive = true; p.investigated = false; p.ready = false; p.knowledge = []; }
  }

  // ---------- Helfer ----------
  byId(id) { return this.players.find((p) => p.id === id); }
  alive() { return this.players.filter((p) => p.alive); }
  president() { return this.players[this.presIdx] || null; }
  chancellor() { return this.byId(this.chancellorId); }
  addLog(text, kind = 'info') { this.log.push({ t: Date.now(), text, kind }); if (this.log.length > 80) this.log.shift(); }
  fx(type, data = {}) { this.onFx({ type, ...data }); }
  schedule(phase, ms, fn) {
    const gid = this.gameId;
    setTimeout(() => {
      if (this.gameId !== gid || this.phase !== phase) return;
      fn();
      this.onChange();
    }, ms * SPEED);
  }
  ensureDeck() {
    if (this.deck.length < 3) {
      this.deck = shuffle(this.deck.concat(this.discard));
      this.discard = [];
      this.addLog('Der Ablagestapel wird neu gemischt.', 'info');
      this.fx('reshuffle');
    }
  }
  eligibleChancellors() {
    const pres = this.president();
    const aliveCount = this.alive().length;
    let list = this.alive().filter((p) => p !== pres && p.id !== this.lastChanId && !(aliveCount > 5 && p.id === this.lastPresId));
    if (!list.length) list = this.alive().filter((p) => p !== pres);
    return list;
  }
  validTargets() {
    const pres = this.president();
    return this.alive().filter((p) => p !== pres && !(this.power === 'investigate' && p.investigated));
  }

  // ---------- Lobby ----------
  join(socketId, rawName, token) {
    const name = String(rawName || '').trim().replace(/\s+/g, ' ').slice(0, 16);
    let p = token ? this.players.find((x) => x.token === token) : null;
    if (!p && this.phase !== 'lobby' && name) p = this.players.find((x) => !x.connected && x.name.toLowerCase() === name.toLowerCase());
    if (p) {
      const old = p.socketId;
      p.socketId = socketId; p.connected = true;
      return { player: p, replacedSocket: old };
    }
    if (this.phase !== 'lobby') return { error: 'Das Spiel läuft bereits. Warte auf die nächste Runde.' };
    if (!name) return { error: 'Bitte gib einen Namen ein.' };
    if (this.players.length >= MAX_PLAYERS) return { error: 'Das Spiel ist voll (max. 10 Spieler).' };
    if (this.players.some((x) => x.name.toLowerCase() === name.toLowerCase())) return { error: 'Dieser Name ist schon vergeben.' };
    const used = new Set(this.players.map((x) => x.color));
    p = {
      id: newId(4), token: newId(16), name, socketId, connected: true,
      color: COLORS.find((c) => !used.has(c)) || pick(COLORS),
      role: null, alive: true, investigated: false, ready: false, knowledge: [],
    };
    this.players.push(p);
    this.addLog(`${name} ist beigetreten.`, 'info');
    this.fx('join', { name });
    return { player: p };
  }
  removePlayer(id) {
    if (this.phase !== 'lobby') return 'Spieler können nur in der Lobby entfernt werden.';
    const p = this.byId(id);
    if (!p) return 'Spieler nicht gefunden.';
    this.players = this.players.filter((x) => x !== p);
    this.addLog(`${p.name} hat die Lobby verlassen.`, 'info');
    this.fx('leave', { name: p.name });
    return { removed: p };
  }

  start() {
    if (this.phase !== 'lobby') return 'Das Spiel läuft bereits.';
    const n = this.players.length;
    if (n < MIN_PLAYERS) return `Mindestens ${MIN_PLAYERS} Spieler nötig.`;
    if (n > MAX_PLAYERS) return 'Maximal 10 Spieler.';
    const players = this.players;
    this.reset();
    this.players = players;
    this.startCount = n;
    const [L, F] = ROLE_TABLE[n] || [n - 2, 1];
    const roles = shuffle([...Array(L).fill('liberal'), ...Array(F).fill('fascist'), 'hitler']);
    this.players.forEach((p, i) => { p.role = roles[i]; });
    this.deck = shuffle([...Array(6).fill('liberal'), ...Array(11).fill('fascist')]);
    this.presIdx = crypto.randomInt(n);
    this.phase = 'reveal';
    this.addLog(`Neues Spiel mit ${n} Spielern: ${L} Liberale, ${F} Faschist${F > 1 ? 'en' : ''} und Hitler.`, 'info');
    this.fx('start', { count: n });
    return null;
  }

  setReady(p) {
    if (this.phase !== 'reveal') return 'Gerade nicht möglich.';
    p.ready = true;
    if (this.players.every((x) => x.ready)) this.beginGame();
    return null;
  }
  skipReveal() {
    if (this.phase !== 'reveal') return 'Gerade nicht möglich.';
    this.players.forEach((x) => { x.ready = true; });
    this.beginGame();
    return null;
  }
  beginGame() {
    this.addLog('Alle kennen ihre Rolle. Das Spiel beginnt!', 'info');
    this.beginNomination(false);
  }

  // ---------- Runde ----------
  advancePresident() {
    const n = this.players.length;
    let i = this.specialReturnIdx !== null ? this.specialReturnIdx : this.presIdx;
    this.specialReturnIdx = null;
    for (let k = 0; k < n; k++) { i = (i + 1) % n; if (this.players[i].alive) break; }
    this.presIdx = i;
  }
  beginNomination(advance) {
    if (advance) this.advancePresident();
    this.nomineeId = null; this.chancellorId = null; this.votes = {};
    this.hand = []; this.vetoUsed = false; this.power = null; this.investigation = null; this.notice = '';
    this.phase = 'nominate';
    this.round++;
    const pres = this.president();
    this.addLog(`Runde ${this.round}: ${pres.name} ist Präsidentschaftskandidat.`, 'round');
    this.fx('newRound', { presidentId: pres.id, round: this.round });
  }

  nominate(p, targetId) {
    if (this.phase !== 'nominate') return 'Gerade wird niemand nominiert.';
    if (p !== this.president()) return 'Nur der Präsident nominiert.';
    const t = this.byId(targetId);
    if (!t || !this.eligibleChancellors().includes(t)) return 'Dieser Spieler kann nicht Kanzler werden.';
    this.nomineeId = t.id;
    this.votes = {};
    this.phase = 'vote';
    this.addLog(`${p.name} nominiert ${t.name} als Kanzler.`, 'info');
    this.fx('nominated', { presidentId: p.id, nomineeId: t.id });
    return null;
  }

  vote(p, ja) {
    if (this.phase !== 'vote') return 'Gerade findet keine Abstimmung statt.';
    if (!p.alive) return 'Tote stimmen nicht ab.';
    const first = this.votes[p.id] === undefined;
    this.votes[p.id] = !!ja;
    if (first) this.fx('voteCast', { playerId: p.id });
    if (this.alive().every((x) => this.votes[x.id] !== undefined)) this.resolveVote();
    return null;
  }

  resolveVote() {
    const alive = this.alive();
    const ja = alive.filter((x) => this.votes[x.id]).length;
    const nein = alive.length - ja;
    const passed = ja > alive.length / 2;
    this.lastVote = { ja, nein, passed, votes: { ...this.votes } };
    this.phase = 'voteResult';
    const pres = this.president(); const nom = this.byId(this.nomineeId);
    this.addLog(`Abstimmung: ${ja}× Ja, ${nein}× Nein – Regierung ${pres.name}/${nom.name} ${passed ? 'gewählt' : 'abgelehnt'}.`, passed ? 'good' : 'bad');
    this.fx('votesRevealed', { ja, nein, passed });
    this.schedule('voteResult', DELAY.voteResult, () => (passed ? this.governmentElected() : this.electionFailed()));
  }

  governmentElected() {
    const pres = this.president();
    const chan = this.byId(this.nomineeId);
    this.chancellorId = chan.id;
    this.lastPresId = pres.id; this.lastChanId = chan.id;
    this.tracker = 0;
    if (this.fas >= 3) {
      if (chan.role === 'hitler') return this.endGame('fascist', `${chan.name} ist Hitler und wurde zum Kanzler gewählt!`);
      this.addLog(`${chan.name} ist bestätigt NICHT Hitler.`, 'good');
      this.fx('notHitler', { playerId: chan.id });
    }
    this.ensureDeck();
    this.hand = this.deck.splice(0, 3);
    this.phase = 'legPresident';
    this.fx('legislative', { presidentId: pres.id, chancellorId: chan.id });
  }

  electionFailed() {
    this.tracker++;
    this.addLog(`Wahltracker steht auf ${this.tracker}/3.`, 'bad');
    this.fx('trackerUp', { value: this.tracker });
    if (this.tracker >= 3) this.chaos();
    else this.beginNomination(true);
  }

  chaos() {
    this.ensureDeck();
    const policy = this.deck.shift();
    this.tracker = 0;
    this.lastPresId = null; this.lastChanId = null;
    this.addLog('CHAOS! Das Volk erlässt das oberste Gesetz. Amtszeitsperren aufgehoben.', 'bad');
    this.fx('chaos', { policy });
    this.enact(policy, true);
  }

  presidentDiscard(p, idx) {
    if (this.phase !== 'legPresident') return 'Gerade nicht möglich.';
    if (p !== this.president()) return 'Nur der Präsident.';
    if (!(idx >= 0 && idx < this.hand.length)) return 'Ungültige Karte.';
    this.discard.push(this.hand.splice(idx, 1)[0]);
    this.phase = 'legChancellor';
    this.addLog(`${p.name} legt ein Gesetz verdeckt ab und reicht zwei an den Kanzler weiter.`, 'info');
    this.fx('presidentDiscarded', { chancellorId: this.chancellorId });
    return null;
  }

  chancellorEnact(p, idx) {
    if (this.phase !== 'legChancellor') return 'Gerade nicht möglich.';
    if (p.id !== this.chancellorId) return 'Nur der Kanzler.';
    if (!(idx >= 0 && idx < this.hand.length)) return 'Ungültige Karte.';
    const policy = this.hand.splice(idx, 1)[0];
    this.discard.push(...this.hand);
    this.hand = [];
    this.enact(policy, false);
    return null;
  }

  proposeVeto(p) {
    if (this.phase !== 'legChancellor') return 'Gerade nicht möglich.';
    if (p.id !== this.chancellorId) return 'Nur der Kanzler.';
    if (this.fas < 5) return 'Das Veto ist noch nicht freigeschaltet.';
    if (this.vetoUsed) return 'Das Veto wurde bereits abgelehnt.';
    this.phase = 'veto';
    this.addLog(`Kanzler ${p.name} schlägt ein Veto vor.`, 'info');
    this.fx('vetoProposed');
    return null;
  }

  vetoResponse(p, accept) {
    if (this.phase !== 'veto') return 'Gerade nicht möglich.';
    if (p !== this.president()) return 'Nur der Präsident.';
    if (!accept) {
      this.vetoUsed = true;
      this.phase = 'legChancellor';
      this.addLog(`${p.name} lehnt das Veto ab. Der Kanzler muss ein Gesetz erlassen.`, 'bad');
      this.fx('vetoRejected');
      return null;
    }
    this.discard.push(...this.hand);
    this.hand = [];
    this.tracker++;
    this.phase = 'vetoed';
    this.notice = 'Veto! Beide Gesetze wurden verworfen.';
    this.addLog(`Veto angenommen! Beide Gesetze verworfen. Wahltracker: ${this.tracker}/3.`, 'info');
    this.fx('vetoAccepted', { tracker: this.tracker });
    this.schedule('vetoed', DELAY.vetoed, () => {
      if (this.tracker >= 3) this.chaos();
      else this.beginNomination(true);
    });
    return null;
  }

  enact(policy, chaos) {
    if (policy === 'liberal') this.lib++; else this.fas++;
    this.lastEnacted = { policy, chaos, index: policy === 'liberal' ? this.lib - 1 : this.fas - 1 };
    this.phase = 'enacted';
    this.addLog(`${policy === 'liberal' ? 'Liberales' : 'Faschistisches'} Gesetz erlassen${chaos ? ' (durch Chaos)' : ''}.`, policy === 'liberal' ? 'lib' : 'fas');
    this.fx('enact', { policy, chaos, index: this.lastEnacted.index });
    this.ensureDeck();
    this.schedule('enacted', DELAY.enacted + (chaos ? DELAY.chaosExtra : 0), () => this.afterEnact(policy, chaos));
  }

  afterEnact(policy, chaos) {
    if (this.lib >= 5) return this.endGame('liberal', 'Fünf liberale Gesetze wurden erlassen.');
    if (this.fas >= 6) return this.endGame('fascist', 'Sechs faschistische Gesetze wurden erlassen.');
    if (!chaos && policy === 'fascist') {
      const power = powerTrackFor(this.startCount)[this.fas - 1];
      if (power) return this.startPower(power);
    }
    this.beginNomination(true);
  }

  startPower(power) {
    this.power = power;
    this.phase = 'power';
    const pres = this.president();
    const txt = {
      peek: `${pres.name} darf sich die obersten drei Gesetze ansehen.`,
      investigate: `${pres.name} darf die Parteizugehörigkeit eines Spielers prüfen.`,
      special: `${pres.name} bestimmt den nächsten Präsidentschaftskandidaten.`,
      execute: `${pres.name} muss einen Spieler hinrichten.`,
    }[power];
    this.addLog(`Präsidiale Vollmacht: ${txt}`, 'power');
    this.fx('power', { power, presidentId: pres.id });
  }

  powerTarget(p, targetId) {
    if (this.phase !== 'power' || this.power === 'peek') return 'Gerade nicht möglich.';
    if (p !== this.president()) return 'Nur der Präsident.';
    const t = this.byId(targetId);
    if (!t || !this.validTargets().includes(t)) return 'Ungültiges Ziel.';
    if (this.power === 'investigate') {
      t.investigated = true;
      const party = t.role === 'liberal' ? 'liberal' : 'fascist';
      this.investigation = { targetId: t.id, name: t.name, party };
      p.knowledge.push({ name: t.name, party });
      this.phase = 'investigateResult';
      this.addLog(`${p.name} prüft die Parteizugehörigkeit von ${t.name}.`, 'power');
      this.fx('investigated', { presidentId: p.id, targetId: t.id });
      return null;
    }
    if (this.power === 'special') {
      this.specialReturnIdx = this.presIdx;
      this.phase = 'powerResolved';
      this.notice = `Sonderwahl: ${t.name} wird nächster Präsidentschaftskandidat.`;
      this.addLog(`Sonderwahl! ${p.name} ernennt ${t.name} zum nächsten Präsidentschaftskandidaten.`, 'power');
      this.fx('specialElection', { presidentId: p.id, targetId: t.id });
      this.schedule('powerResolved', DELAY.powerResolved, () => {
        this.presIdx = this.players.indexOf(t);
        this.beginNomination(false);
      });
      return null;
    }
    if (this.power === 'execute') {
      t.alive = false;
      this.phase = 'powerResolved';
      this.notice = `${t.name} wurde hingerichtet.`;
      this.addLog(`${p.name} hat ${t.name} hingerichtet.`, 'bad');
      this.fx('executed', { presidentId: p.id, targetId: t.id });
      if (t.role === 'hitler') {
        this.schedule('powerResolved', DELAY.executeHitler, () => this.endGame('liberal', `${t.name} war Hitler und wurde hingerichtet!`));
      } else {
        this.schedule('powerResolved', DELAY.powerResolved, () => {
          this.addLog(`${t.name} war nicht Hitler.`, 'info');
          this.beginNomination(true);
        });
      }
      return null;
    }
    return 'Unbekannte Vollmacht.';
  }

  ack(p) {
    if (p !== this.president()) return 'Nur der Präsident.';
    if (this.phase === 'power' && this.power === 'peek') {
      this.addLog(`${p.name} hat sich die obersten drei Gesetze angesehen.`, 'power');
      this.fx('peeked');
      this.beginNomination(true);
      return null;
    }
    if (this.phase === 'investigateResult') { this.beginNomination(true); return null; }
    return 'Gerade nicht möglich.';
  }

  endGame(winner, reason) {
    this.phase = 'gameover';
    this.winner = winner;
    this.winReason = reason;
    this.addLog(`${winner === 'liberal' ? 'Die Liberalen' : 'Die Faschisten'} gewinnen! ${reason}`, winner === 'liberal' ? 'lib' : 'fas');
    this.fx('gameover', { winner, reason });
  }

  newGame() {
    if (this.phase === 'lobby') return 'Schon in der Lobby.';
    this.reset();
    this.addLog('Zurück in der Lobby.', 'info');
    this.fx('lobby');
    return null;
  }

  // ---------- Sichten ----------
  publicState() {
    const pres = this.president();
    const inGame = this.phase !== 'lobby';
    const aliveCount = this.alive().length;
    return {
      phase: this.phase, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS,
      players: this.players.map((p, i) => ({
        id: p.id, name: p.name, color: p.color, connected: p.connected, alive: p.alive, ready: p.ready, leader: i === 0,
        isPresident: !!(inGame && pres && pres.id === p.id && this.phase !== 'reveal'),
        isNominee: this.nomineeId === p.id && !this.chancellorId,
        isChancellor: this.chancellorId === p.id,
        termLimited: inGame && !['reveal', 'gameover'].includes(this.phase) && p.alive && (p.id === this.lastChanId || (aliveCount > 5 && p.id === this.lastPresId)),
        hasVoted: this.phase === 'vote' && this.votes[p.id] !== undefined,
        vote: this.phase === 'voteResult' ? this.votes[p.id] : undefined,
        investigated: p.investigated,
        role: this.phase === 'gameover' ? p.role : undefined,
      })),
      lib: this.lib, fas: this.fas, tracker: this.tracker,
      deckCount: this.deck.length, discardCount: this.discard.length,
      powers: powerTrackFor(this.startCount || Math.max(5, this.players.length)),
      vetoUnlocked: this.fas >= 5,
      presidentId: inGame && pres ? pres.id : null,
      nomineeId: this.nomineeId, chancellorId: this.chancellorId,
      lastVote: this.phase === 'voteResult' ? this.lastVote : null,
      lastEnacted: this.lastEnacted, power: this.power,
      investigationTarget: this.investigation ? this.investigation.targetId : null,
      winner: this.winner, winReason: this.winReason, notice: this.notice,
      log: this.log.slice(-30), round: this.round, startCount: this.startCount,
    };
  }

  privateState(p) {
    const pres = this.president();
    const isPres = !!pres && pres.id === p.id && this.phase !== 'lobby' && this.phase !== 'reveal';
    const isChan = this.chancellorId === p.id;
    const priv = {
      id: p.id, role: p.role, party: p.role ? (p.role === 'liberal' ? 'liberal' : 'fascist') : null,
      teammates: [], hand: null, canVeto: false, peek: null, investigation: null,
      eligible: null, targets: null, myVote: this.votes[p.id], knowledge: p.knowledge, isPres, isChan,
      hitlerKnows: this.startCount <= 6,
    };
    if (p.role === 'fascist' || (p.role === 'hitler' && this.startCount <= 6)) {
      priv.teammates = this.players.filter((x) => x !== p && x.role && x.role !== 'liberal').map((x) => ({ id: x.id, name: x.name, role: x.role }));
    }
    if (this.phase === 'legPresident' && isPres) priv.hand = [...this.hand];
    if ((this.phase === 'legChancellor' || this.phase === 'veto') && isChan) priv.hand = [...this.hand];
    if (this.phase === 'veto' && isPres) priv.hand = [...this.hand];
    if (this.phase === 'legChancellor' && isChan) priv.canVeto = this.fas >= 5 && !this.vetoUsed;
    if (this.phase === 'power' && isPres) {
      if (this.power === 'peek') priv.peek = this.deck.slice(0, 3);
      else priv.targets = this.validTargets().map((x) => x.id);
    }
    if (this.phase === 'investigateResult' && isPres) priv.investigation = this.investigation;
    if (this.phase === 'nominate' && isPres) priv.eligible = this.eligibleChancellors().map((x) => x.id);
    return priv;
  }
}

// ======================================================================
//  Webserver (statische Dateien) + WebSocket-Verbindungen
// ======================================================================
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function lanIPs() {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(a.address);
  }
  const score = (ip) => (ip.startsWith('192.168.') ? 3 : ip.startsWith('10.') ? 2 : ip.startsWith('172.') ? 1 : 0);
  return out.sort((a, b) => score(b) - score(a));
}
function joinUrl(req) {
  const hostHeader = (req && req.headers.host) || '';
  const isLocal = !hostHeader || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(hostHeader);
  if (!isLocal) return `http://${hostHeader}/play`;
  const ip = lanIPs()[0] || 'localhost';
  return `http://${ip}:${PORT}/play`;
}

function sendFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Nicht gefunden'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '/tv' || p === '/host') return sendFile(res, path.join(PUBLIC, 'host.html'));
  if (p === '/play' || p === '/p' || p === '/join') return sendFile(res, path.join(PUBLIC, 'player.html'));
  if (p === '/favicon.ico') { return sendFile(res, path.join(PUBLIC, 'icon.svg')); }
  if (p === '/join-info') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ url: joinUrl(req) }));
    return;
  }
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); res.end(); return; }
  sendFile(res, file);
});

// --- kleine Socket-Schicht über WebSocket (Events + Antworten) ---
const sockets = new Map();
const wss = new WebSocketServer({ server, path: '/ws' });

function makeSocket(ws) {
  const sock = {
    id: newId(8), data: {}, handlers: {}, ws,
    emit(ev, d) { if (ws.readyState === 1) ws.send(JSON.stringify({ e: ev, d })); },
    on(ev, fn) { this.handlers[ev] = fn; },
  };
  return sock;
}
function toSocket(id, ev, d) { const s = sockets.get(id); if (s) s.emit(ev, d); }
function toHosts(ev, d) { for (const s of sockets.values()) if (s.data.host) s.emit(ev, d); }
function toAll(ev, d) { for (const s of sockets.values()) s.emit(ev, d); }

const game = new Game();
function broadcast() {
  const pub = game.publicState();
  toHosts('state', pub);
  for (const p of game.players) if (p.socketId) toSocket(p.socketId, 'state', { ...pub, me: game.privateState(p) });
}
game.onFx = (fx) => toAll('fx', fx);
game.onChange = broadcast;

wss.on('connection', (ws) => {
  const socket = makeSocket(ws);
  sockets.set(socket.id, socket);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.e !== 'string') return;
    if (m.e === 'ping') { socket.emit('pong'); return; }
    const fn = socket.handlers[m.e];
    if (!fn) return;
    const cb = m.id != null ? (r) => socket.emit('__ack', { id: m.id, res: r }) : undefined;
    try { fn(m.d || {}, cb); } catch (e) { console.error(e); }
  });
  ws.on('close', () => {
    sockets.delete(socket.id);
    if (socket.handlers.disconnect) socket.handlers.disconnect();
  });
  onConnection(socket);
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 10000);

function onConnection(socket) {
  socket.on('host', () => {
    socket.data.host = true;
    socket.emit('state', game.publicState());
  });

  socket.on('join', (data, cb) => {
    const res = game.join(socket.id, data.name, data.token);
    if (res.error) { if (cb) cb({ error: res.error }); return; }
    socket.data.playerId = res.player.id;
    if (res.replacedSocket && res.replacedSocket !== socket.id) toSocket(res.replacedSocket, 'replaced');
    if (cb) cb({ ok: true, token: res.player.token, id: res.player.id, name: res.player.name });
    broadcast();
  });

  const act = (ev, fn) => socket.on(ev, (data, cb) => {
    const p = game.byId(socket.data.playerId);
    let err;
    if (!p || p.socketId !== socket.id) err = 'Du bist nicht im Spiel.';
    else {
      try { err = fn(p, data); } catch (e) { console.error(e); err = 'Interner Fehler.'; }
    }
    const msg = err && typeof err === 'string' ? err : null;
    if (cb) cb(msg ? { error: msg } : { ok: true });
    broadcast();
  });
  const hostAct = (ev, fn) => socket.on(ev, (data) => {
    if (!socket.data.host) return;
    let err;
    try { err = fn(data); } catch (e) { console.error(e); }
    if (err && typeof err === 'string') socket.emit('toast', err);
    broadcast();
  });

  act('ready', (p) => game.setReady(p));
  act('nominate', (p, d) => game.nominate(p, d.id));
  act('vote', (p, d) => game.vote(p, d.ja));
  act('discard', (p, d) => game.presidentDiscard(p, Number(d.index)));
  act('enact', (p, d) => game.chancellorEnact(p, Number(d.index)));
  act('veto', (p) => game.proposeVeto(p));
  act('vetoResponse', (p, d) => game.vetoResponse(p, !!d.accept));
  act('powerTarget', (p, d) => game.powerTarget(p, d.id));
  act('ack', (p) => game.ack(p));
  act('startGame', (p) => (p === game.players[0] ? game.start() : 'Nur der Spielleiter (erster Spieler) kann starten.'));
  act('newGame', () => game.newGame());
  act('leave', (p) => {
    const r = game.removePlayer(p.id);
    if (typeof r === 'string') return r;
    socket.data.playerId = null;
    socket.emit('left');
    return null;
  });

  hostAct('hostStart', () => game.start());
  hostAct('hostSkipReveal', () => game.skipReveal());
  hostAct('hostNewGame', () => game.newGame());
  hostAct('hostKick', (d) => {
    const r = game.removePlayer(d.id);
    if (typeof r === 'string') return r;
    if (r.removed.socketId) toSocket(r.removed.socketId, 'kicked');
    return null;
  });

  socket.on('disconnect', () => {
    const p = game.byId(socket.data.playerId);
    if (p && p.socketId === socket.id) {
      p.connected = false; p.socketId = null;
      broadcast();
    }
  });
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n  Port ${PORT} ist belegt. Starte mit einem anderen Port, z.B.:  PORT=3001 npm start\n`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  const ip = ips[0] || 'localhost';
  console.log('');
  console.log('  ███  SCHATTENKANZLER – Partyspiel  ███');
  console.log('');
  console.log(`  📺 Fernseher / Spielbrett:  http://${ip}:${PORT}/`);
  console.log(`  📱 Handys / Controller:     http://${ip}:${PORT}/play`);
  if (ips.length > 1) console.log(`     (weitere Adressen: ${ips.slice(1).map((x) => `http://${x}:${PORT}`).join(', ')})`);
  console.log('');
  console.log('  Öffne die Fernseher-Adresse im Browser des TVs (oder Laptop per HDMI).');
  console.log('  Alle Geräte müssen im selben WLAN sein. Beenden mit Strg+C.');
  console.log('');
});

module.exports = { Game };
