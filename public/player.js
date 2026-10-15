/* Handy-Controller */
(() => {
  const $ = (s) => document.querySelector(s);
  const socket = io({ reconnectionDelayMax: 3000 });
  let S = null, ME = null;
  let token = localStorage.getItem('sh_token');
  let myName = localStorage.getItem('sh_name') || '';
  let joined = false;
  let sel = null;            // aktuelle Auswahl (Karte / Spieler / Stimme)
  let selKey = '';           // Auswahl gehört zu diesem Phasen-Schlüssel
  let lastNeedKey = '';
  let sending = false;

  // ---------- Hilfen ----------
  const P = (id) => S?.players.find((p) => p.id === id);
  const nm = (id) => esc(P(id)?.name || '?');
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function emit(ev, data = {}) {
    if (sending) return;
    sending = true;
    SFX.play('select');
    socket.emit(ev, data, (res) => {
      sending = false;
      if (res && res.error) { toast(res.error); SFX.vibrate(200); }
    });
    setTimeout(() => { sending = false; }, 1500);
  }
  const avatar = (p, size) => `<div class="avatar" style="--c:${p.color}${size ? `;width:${size}px;font-size:${size * 0.44}px` : ''}">${esc(initials(p.name))}</div>`;

  // ---------- Beitreten ----------
  $('#nameInput').value = myName;
  $('#joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    SFX.unlock();
    const name = $('#nameInput').value.trim();
    if (!name) { toast('Bitte gib einen Namen ein.'); return; }
    join(name, false);
  });
  function join(name, silent) {
    socket.emit('join', { name, token }, (res) => {
      if (!res || res.error) {
        if (!silent) toast(res ? res.error : 'Fehler');
        showJoin();
        return;
      }
      token = res.token; myName = res.name; joined = true;
      localStorage.setItem('sh_token', token);
      localStorage.setItem('sh_name', myName);
      $('#joinScreen').hidden = true; $('#gameScreen').hidden = false;
      tryWakeLock();
    });
  }
  function showJoin() {
    joined = false;
    $('#joinScreen').hidden = false; $('#gameScreen').hidden = true;
  }

  socket.on('connect', () => {
    $('#offline').hidden = true;
    if (token || joined) join(myName, true); else showJoin();
  });
  socket.on('disconnect', () => { $('#offline').hidden = false; });
  socket.on('state', (s) => { S = s; ME = s.me || null; render(); });
  socket.on('fx', onFx);
  socket.on('toast', toast);
  socket.on('kicked', () => { localStorage.removeItem('sh_token'); token = null; showJoin(); toast('Du wurdest aus der Lobby entfernt.'); });
  socket.on('left', () => { localStorage.removeItem('sh_token'); token = null; showJoin(); });
  socket.on('replaced', () => { $('#replaced').hidden = false; socket.disconnect(); });

  // Bildschirm wach halten (nur wo möglich)
  let wakeLock = null;
  async function tryWakeLock() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tryWakeLock(); });
  document.addEventListener('touchstart', () => SFX.unlock(), { passive: true });
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- Rolle gedrückt halten ----------
  let holding = false;
  function showRole() {
    if (!ME || !ME.role) return;
    holding = true;
    const info = ROLE_INFO[ME.role];
    $('#rsCard').innerHTML = roleCard(ME.role);
    let html = `<div class="goal">${info.goal}</div>`;
    if (ME.teammates.length) {
      html += `<h4>${ME.role === 'hitler' ? 'Deine Faschisten' : 'Dein Team'}</h4><div class="mates">${ME.teammates.map((t) => `<span class="mate ${t.role}">${esc(t.name)}${t.role === 'hitler' ? ' – HITLER' : ''}</span>`).join('')}</div>`;
    } else if (ME.role === 'hitler') {
      html += '<h4>Dein Team</h4><div>Du kennst deine Faschisten nicht – aber sie kennen dich.</div>';
    } else if (ME.role === 'liberal') {
      html += '<h4>Tipp</h4><div>Du kennst niemanden. Achte auf Abstimmungen und Gesetze!</div>';
    }
    if (ME.knowledge && ME.knowledge.length) {
      html += `<h4>Deine Überprüfungen</h4><div class="mates">${ME.knowledge.map((k) => `<span class="mate ${k.party === 'liberal' ? 'liberal' : 'fascist'}">${esc(k.name)}: ${k.party === 'liberal' ? 'Liberal' : 'Faschist'}</span>`).join('')}</div>`;
    }
    $('#rsInfo').innerHTML = html;
    $('#roleSheet').hidden = false;
    $('#roleBtn').classList.add('holding');
    SFX.vibrate(15);
  }
  function hideRole() {
    if (!holding) return;
    holding = false;
    $('#roleSheet').hidden = true;
    $('#roleBtn').classList.remove('holding');
  }
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-hold]')) { e.preventDefault(); showRole(); }
  });
  ['pointerup', 'pointercancel', 'blur'].forEach((ev) => window.addEventListener(ev, hideRole));
  document.addEventListener('visibilitychange', hideRole);

  // ---------- Klicks ----------
  $('#view').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act, v = b.dataset.v;
    switch (act) {
      case 'sel': sel = v; selKey = phaseKey(); SFX.play('click'); SFX.vibrate(8); render(); break;
      case 'vote': emit('vote', { ja: v === 'ja' }); SFX.vibrate(20); break;
      case 'ready': emit('ready'); break;
      case 'start': emit('startGame'); break;
      case 'leave': emit('leave'); break;
      case 'nominate': if (sel) emit('nominate', { id: sel }); break;
      case 'discard': if (sel !== null) emit('discard', { index: Number(sel) }); break;
      case 'enact': if (sel !== null) emit('enact', { index: Number(sel) }); break;
      case 'veto': emit('veto'); break;
      case 'vetoYes': emit('vetoResponse', { accept: true }); break;
      case 'vetoNo': emit('vetoResponse', { accept: false }); break;
      case 'target': if (sel) emit('powerTarget', { id: sel }); break;
      case 'ack': emit('ack'); break;
      case 'newGame': emit('newGame'); break;
    }
  });

  function onFx(f) {
    if (!S) return;
    if (f.type === 'executed' && ME && f.targetId === ME.id) { SFX.vibrate([300, 100, 300]); }
    if (f.type === 'enact') SFX.vibrate(f.policy === 'fascist' ? [60, 40, 60] : 40);
    if (f.type === 'gameover') SFX.vibrate([100, 60, 100, 60, 200]);
  }

  // ---------- Render ----------
  function phaseKey() { return S ? `${S.phase}|${S.round}|${S.power || ''}|${S.chancellorId || ''}` : ''; }
  function needsAction() {
    if (!S || !ME) return false;
    const me = P(ME.id); if (!me) return false;
    switch (S.phase) {
      case 'reveal': return !me.ready;
      case 'nominate': return ME.isPres;
      case 'vote': return me.alive && ME.myVote === undefined;
      case 'legPresident': return ME.isPres;
      case 'legChancellor': return ME.isChan;
      case 'veto': return ME.isPres;
      case 'power': case 'investigateResult': return ME.isPres;
    }
    return false;
  }

  function render() {
    if (!S || !ME || !joined) return;
    const me = P(ME.id);
    if (!me) return;
    if (selKey !== phaseKey()) { sel = null; selKey = phaseKey(); }

    // Aufmerksamkeit, wenn man dran ist
    const need = needsAction();
    const nk = need ? phaseKey() : '';
    if (need && nk !== lastNeedKey) { SFX.play('alert'); SFX.vibrate([70, 50, 70]); }
    lastNeedKey = nk;

    const av = $('#myAvatar');
    av.style.setProperty('--c', me.color); av.textContent = initials(me.name);
    $('#myName').textContent = me.name;
    const tags = [];
    if (me.isPresident) tags.push('Präsident');
    if (me.isChancellor) tags.push('Kanzler');
    if (me.isNominee) tags.push('Kanzlerkandidat');
    if (!me.alive) tags.push('† hingerichtet');
    $('#mySub').textContent = tags.join(' · ') || (S.phase === 'lobby' ? (me.leader ? 'Spielleiter' : 'In der Lobby') : 'Bürger');
    const inGame = S.phase !== 'lobby';
    $('#roleBtn').style.visibility = inGame && ME.role ? 'visible' : 'hidden';
    $('#rbIco').innerHTML = ICONS.shield;
    renderMini(inGame);
    const html = viewHtml(me);
    const view = $('#view');
    if (view._html === html) return;
    const pk = phaseKey();
    const animate = view._pk !== pk;
    view._html = html; view._pk = pk;
    view.innerHTML = `<div class="panel ${animate ? 'anim' : ''}">${html}</div>`;
  }

  function renderMini(inGame) {
    const mb = $('#miniBoard');
    if (!inGame) { mb.innerHTML = ''; mb._h = ''; return; }
    const pips = (n, on) => Array.from({ length: n }, (_, i) => `<i class="pip ${i < on ? 'on' : ''}"></i>`).join('');
    const h = `<div class="mb l"><b>Lib</b><span class="pips">${pips(5, S.lib)}</span></div>
      <div class="mb f"><b>Fas</b><span class="pips">${pips(6, S.fas)}</span></div>
      <div class="mb t"><b>Wahl</b><span class="pips">${pips(3, S.tracker)}</span></div>`;
    if (mb._h !== h) { mb.innerHTML = h; mb._h = h; }
  }

  const wait = (title, text = '') => `<div class="wait"><div class="spinner"></div><h2>${title}</h2><p>${text}</p></div>`;

  function playerPicker(ids, { danger = false, sub = null } = {}) {
    const list = S.players.filter((p) => p.alive && p.id !== ME.id);
    return `<div class="pick-list">${list.map((p) => {
      const ok = ids.includes(p.id);
      return `<button class="pick ${danger ? 'danger' : ''} ${sel === p.id ? 'sel' : ''}" data-act="sel" data-v="${p.id}" ${ok ? '' : 'disabled'}>
        ${avatar(p)}<span>${esc(p.name)}${!ok && sub ? `<small>${sub(p)}</small>` : ''}</span></button>`;
    }).join('')}</div>`;
  }

  function handHtml(cards, mode) {
    return `<div class="hand ${mode} ${sel !== null && mode !== 'static' ? 'has-sel' : ''}">${cards.map((c, i) =>
      `<button class="hc ${String(sel) === String(i) ? 'sel' : ''}" data-act="sel" data-v="${i}">
        <span class="mark">${mode === 'discard' ? 'Ablegen' : mode === 'enact' ? 'Erlassen' : ''}</span>${policyCard(c)}</button>`).join('')}</div>`;
  }

  function viewHtml(me) {
    const deadNote = !me.alive && S.phase !== 'gameover' ? '<div class="dead-note">† Du bist tot – bitte schweigen</div>' : '';
    switch (S.phase) {
      case 'lobby': return lobbyView(me);
      case 'reveal': return revealView(me);
      case 'nominate': return deadNote + nominateView(me);
      case 'vote': return deadNote + voteView(me);
      case 'voteResult': return deadNote + voteResultView(me);
      case 'legPresident': return deadNote + legPresView(me);
      case 'legChancellor': return deadNote + legChanView(me);
      case 'veto': return deadNote + vetoView(me);
      case 'vetoed': return deadNote + wait('Veto!', esc(S.notice));
      case 'enacted': return deadNote + enactedView();
      case 'power': return deadNote + powerView(me);
      case 'investigateResult': return deadNote + investigateView(me);
      case 'powerResolved': return deadNote + wait(esc(S.notice), 'Schaut auf den Fernseher');
      case 'gameover': return gameoverView(me);
    }
    return '';
  }

  function lobbyView(me) {
    const n = S.players.length;
    const chips = S.players.map((p) => `<div class="chip ${p.id === ME.id ? 'me' : ''}">${avatar(p)}${esc(p.name)}</div>`).join('');
    let action = '';
    if (me.leader) {
      action = n >= S.minPlayers
        ? '<button class="btn primary" data-act="start">Spiel starten</button>'
        : `<button class="btn primary" disabled>Noch ${S.minPlayers - n} Spieler nötig</button>`;
    } else {
      action = `<p class="desc">Warte, bis ${esc(S.players[0].name)} das Spiel startet…</p>`;
    }
    return `<div class="kicker">Lobby</div><div class="title">Du bist dabei!</div>
      <p class="desc">Schau auf den Fernseher. ${n}/${S.maxPlayers} Spieler – gespielt wird mit 5 bis 10.</p>
      <div class="lobby-list">${chips}</div>
      <div class="info-box"><b>So geht's:</b> Liberale wollen 5 liberale Gesetze oder Hitler hinrichten. Faschisten wollen 6 faschistische Gesetze oder Hitler nach 3 faschistischen Gesetzen zum Kanzler machen. Niemand weiß, wem er trauen kann…</div>
      <div class="spacer"></div>${action}
      <button class="btn ghost" data-act="leave" style="margin-top:14px">Lobby verlassen</button>`;
  }

  function revealView(me) {
    if (me.ready) {
      const r = S.players.filter((p) => p.ready).length;
      return wait('Gleich geht\'s los', `${r}/${S.players.length} Spieler bereit.<br>Du kannst deine Rolle jederzeit oben rechts ansehen.`);
    }
    return `<div class="kicker">Deine geheime Rolle</div><div class="title">Psst!</div>
      <p class="desc">Halte dein Handy verdeckt und die Karte gedrückt, um deine Rolle zu sehen.</p>
      <div class="hold-area" data-hold>${ICONS.shield}<span>Gedrückt halten</span><small>Loslassen zum Verstecken</small></div>
      <div class="spacer"></div>
      <button class="btn primary" data-act="ready">Ich kenne meine Rolle</button>`;
  }

  function nominateView(me) {
    if (ME.isPres && ME.eligible) {
      return `<div class="kicker your-turn">Du bist Präsidentschaftskandidat</div><div class="title">Wähle deinen Kanzler</div>
        <p class="desc">Gesperrte Spieler waren Teil der letzten gewählten Regierung.</p>
        ${playerPicker(ME.eligible, { sub: () => 'Amtszeitsperre' })}
        <div class="spacer" style="min-height:18px"></div>
        <button class="btn primary" data-act="nominate" ${sel ? '' : 'disabled'}>${sel ? `${nm(sel)} nominieren` : 'Spieler wählen'}</button>`;
    }
    return wait(`<em>${nm(S.presidentId)}</em> wählt einen Kanzler`, 'Diskutiert mit – wer ist vertrauenswürdig?');
  }

  function govHtml(presId, chanId, chanLabel = 'Kanzler') {
    const pr = P(presId), ch = P(chanId);
    return `<div class="gov">
      <div class="g">${pr ? avatar(pr, 52) : ''}<div class="gl">Präsident</div><div class="gn">${pr ? esc(pr.name) : '?'}</div></div>
      <div class="g">${ch ? avatar(ch, 52) : ''}<div class="gl">${chanLabel}</div><div class="gn">${ch ? esc(ch.name) : '?'}</div></div></div>`;
  }

  function voteView(me) {
    const aliveN = S.players.filter((p) => p.alive).length;
    const cast = S.players.filter((p) => p.hasVoted).length;
    if (!me.alive) return wait('Abstimmung läuft', `${cast}/${aliveN} Stimmen`);
    const v = ME.myVote;
    const has = v !== undefined;
    return `<div class="kicker ${has ? '' : 'your-turn'}">Abstimmung</div><div class="title">Diese Regierung?</div>
      ${govHtml(S.presidentId, S.nomineeId, 'Kanzlerkandidat')}
      ${S.fas >= 3 ? '<div class="info-box" style="text-align:center"><b>Achtung:</b> Wird Hitler jetzt Kanzler, gewinnen die Faschisten!</div>' : ''}
      <div class="ballots ${has ? 'has-sel' : ''}">
        <button class="ballot ja ${v === true ? 'sel' : ''}" data-act="vote" data-v="ja"><div class="bi"><div class="bw">JA!</div><div class="bs">Zustimmen</div></div></button>
        <button class="ballot nein ${v === false ? 'sel' : ''}" data-act="vote" data-v="nein"><div class="bi"><div class="bw">NEIN</div><div class="bs">Ablehnen</div></div></button>
      </div>
      <div class="vote-progress">${has ? 'Stimme abgegeben – du kannst sie noch ändern.' : 'Tippe auf eine Karte.'} ${cast}/${aliveN} haben gewählt.</div>`;
  }

  function voteResultView(me) {
    const v = S.lastVote;
    const mine = ME.myVote;
    return `<div class="result-card ${v && v.passed ? 'lib' : 'fas'}">
      <div class="rc-t">${v ? (v.passed ? 'Gewählt!' : 'Abgelehnt') : '…'}</div>
      <div class="rc-s">${v ? `${v.ja}× Ja · ${v.nein}× Nein` : ''}</div></div>
      ${me.alive && mine !== undefined ? `<p class="desc">Du hast mit <b>${mine ? 'JA' : 'NEIN'}</b> gestimmt.</p>` : ''}
      <p class="desc">Schaut auf den Fernseher – wer hat wie gestimmt?</p>`;
  }

  function legPresView() {
    if (ME.isPres && ME.hand) {
      return `<div class="kicker your-turn">Gesetzgebung · Präsident</div><div class="title">Lege ein Gesetz ab</div>
        <p class="desc">Du hast 3 Gesetze gezogen. Wähle eines, das verdeckt abgelegt wird – die anderen zwei gehen an Kanzler <b>${nm(S.chancellorId)}</b>.</p>
        ${handHtml(ME.hand, 'discard')}
        <div class="spacer"></div>
        <button class="btn danger" data-act="discard" ${sel !== null ? '' : 'disabled'}>Ablegen &amp; weiterreichen</button>`;
    }
    if (ME.isChan) return wait('Gleich bist du dran', `Präsident <b>${nm(S.presidentId)}</b> wählt gerade zwei Gesetze für dich aus.`);
    return wait(`<em>${nm(S.presidentId)}</em> legt ein Gesetz ab`, 'Während der Gesetzgebung wird nicht geredet!');
  }

  function legChanView() {
    if (ME.isChan && ME.hand) {
      return `<div class="kicker your-turn">Gesetzgebung · Kanzler</div><div class="title">Erlasse ein Gesetz</div>
        <p class="desc">Wähle das Gesetz, das in Kraft tritt. Das andere wird verdeckt abgelegt.</p>
        ${handHtml(ME.hand, 'enact')}
        <div class="spacer"></div>
        <button class="btn primary" data-act="enact" ${sel !== null ? '' : 'disabled'}>Gesetz erlassen</button>
        ${ME.canVeto ? '<button class="btn ghost" data-act="veto">Veto vorschlagen</button>' : ''}`;
    }
    return wait(`Kanzler <em>${nm(S.chancellorId)}</em> erlässt ein Gesetz`, 'Gleich wissen wir mehr…');
  }

  function vetoView() {
    if (ME.isPres) {
      return `<div class="kicker your-turn">Veto-Antrag</div><div class="title">Kanzler will ein Veto</div>
        <p class="desc">Kanzler <b>${nm(S.chancellorId)}</b> möchte beide Gesetze verwerfen. Stimmst du zu, rückt der Wahltracker um eins vor.</p>
        ${ME.hand ? handHtml(ME.hand, 'static') : ''}
        <div class="spacer"></div>
        <button class="btn primary" data-act="vetoYes">Veto zustimmen</button>
        <button class="btn danger" data-act="vetoNo">Veto ablehnen</button>`;
    }
    if (ME.isChan) return wait('Veto vorgeschlagen', `Präsident <b>${nm(S.presidentId)}</b> entscheidet…`);
    return wait('Veto vorgeschlagen!', `Präsident <b>${nm(S.presidentId)}</b> entscheidet.`);
  }

  function enactedView() {
    const e = S.lastEnacted;
    if (!e) return '';
    const lib = e.policy === 'liberal';
    return `<div class="result-card ${lib ? 'lib' : 'fas'}"><div class="rc-i">${lib ? ICONS.dove : ICONS.skull}</div>
      <div class="rc-t">${lib ? 'Liberales' : 'Faschistisches'} Gesetz</div><div class="rc-s">${e.chaos ? 'durch Chaos erlassen' : 'wurde erlassen'}</div></div>
      <p class="desc">Liberal ${S.lib}/5 · Faschistisch ${S.fas}/6</p>`;
  }

  function powerView() {
    const pi = POWER_INFO[S.power] || {};
    if (!ME.isPres) return wait(`<em>${nm(S.presidentId)}</em>: ${pi.label}`, pi.desc);
    if (S.power === 'peek' && ME.peek) {
      return `<div class="kicker your-turn">Präsidiale Vollmacht</div><div class="title">Gesetzesvorschau</div>
        <p class="desc">Das sind die nächsten drei Gesetze (oben = links). Du darfst darüber reden – oder lügen.</p>
        ${handHtml(ME.peek, 'static peek')}
        <div class="spacer"></div><button class="btn primary" data-act="ack">Verstanden</button>`;
    }
    if (ME.targets) {
      const cfg = {
        investigate: { t: 'Wen überprüfst du?', d: 'Du erfährst geheim die Parteizugehörigkeit (nicht die Rolle). Jeder kann nur einmal überprüft werden.', b: 'überprüfen', sub: () => 'schon geprüft' },
        special: { t: 'Wer wird nächster Präsident?', d: 'Danach geht die Reihenfolge normal nach dir weiter.', b: 'ernennen' },
        execute: { t: 'Wen richtest du hin?', d: 'Ist es Hitler, gewinnen die Liberalen sofort. Sonst bleibt die Rolle geheim.', b: 'hinrichten' },
      }[S.power];
      return `<div class="kicker your-turn">Präsidiale Vollmacht · ${pi.label}</div><div class="title">${cfg.t}</div>
        <p class="desc">${cfg.d}</p>
        ${playerPicker(ME.targets, { danger: S.power === 'execute', sub: cfg.sub })}
        <div class="spacer" style="min-height:18px"></div>
        <button class="btn ${S.power === 'execute' ? 'danger' : 'primary'}" data-act="target" ${sel ? '' : 'disabled'}>${sel ? `${nm(sel)} ${cfg.b}` : 'Spieler wählen'}</button>`;
    }
    return wait('…');
  }

  function investigateView() {
    if (ME.isPres && ME.investigation) {
      const lib = ME.investigation.party === 'liberal';
      return `<div class="kicker">Streng geheim</div><div class="title">Ergebnis der Prüfung</div>
        <div class="result-card ${lib ? 'lib' : 'fas'}"><div class="rc-i">${lib ? ICONS.dove : ICONS.skull}</div>
        <div class="rc-t">${esc(ME.investigation.name)}</div><div class="rc-s">ist Mitglied der <b>${lib ? 'Liberalen' : 'Faschistischen'} Partei</b></div></div>
        <p class="desc">Du darfst das Ergebnis teilen – oder lügen. Es bleibt unter „Rolle“ gespeichert.</p>
        <div class="spacer"></div><button class="btn primary" data-act="ack">Weiter</button>`;
    }
    return wait(`<em>${nm(S.presidentId)}</em> prüft <em>${nm(S.investigationTarget)}</em>`, 'Was wird der Präsident wohl erzählen?');
  }

  function gameoverView(me) {
    const lib = S.winner === 'liberal';
    const myWin = (ME.role === 'liberal') === lib;
    const list = S.players.map((p) => `<div class="rr ${p.role}">${avatar(p)}<span>${esc(p.name)}${p.alive ? '' : ' †'}</span><small>${ROLE_INFO[p.role]?.title || ''}</small></div>`).join('');
    return `<div class="go-banner ${lib ? 'lib' : 'fas'}"><div class="gt">${lib ? 'Liberale' : 'Faschisten'} siegen!</div>
      <div class="gr">${esc(S.winReason)}</div><div class="gy">${myWin ? 'Du hast gewonnen!' : 'Du hast verloren.'}</div></div>
      <div class="role-reveal-list">${list}</div>
      <div class="spacer"></div><button class="btn primary" data-act="newGame">Nochmal spielen</button>`;
  }
})();
