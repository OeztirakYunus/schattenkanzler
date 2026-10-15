/* Spielbrett (Fernseher) */
(() => {
  const $ = (s) => document.querySelector(s);
  const socket = io();
  let S = null;
  const disp = { lib: 0, fas: 0 };
  let enactAnim = false;
  let builtBoardFor = null;
  let gameOverShown = false;
  let lastHeadline = '';
  const knownLobby = new Set();

  // ---------- Audio-Gate & Steuerung ----------
  const gate = $('#audioGate');
  function closeGate(withSound) {
    if (gate.classList.contains('hide')) return;
    if (withSound) {
      SFX.unlock();
      SFX.setMusic(localStorage.getItem('sh_music') !== '0');
    } else {
      SFX.unlock(); SFX.setEnabled(false); SFX.setMusic(false);
    }
    gate.classList.add('hide');
    updateControls();
  }
  $('#gateSilent').addEventListener('click', (e) => { e.stopPropagation(); closeGate(false); });
  gate.addEventListener('click', () => closeGate(true));
  window.addEventListener('keydown', () => closeGate(true), { once: true });

  function updateControls() {
    $('#btnSound').innerHTML = SFX.enabled ? ICONS.sound : ICONS.mute;
    $('#btnSound').classList.toggle('off', !SFX.enabled);
    $('#btnMusic').innerHTML = ICONS.music;
    $('#btnMusic').classList.toggle('off', !SFX.musicOn);
    $('#btnFull').innerHTML = ICONS.full;
  }
  $('#btnSound').onclick = () => { SFX.unlock(); SFX.setEnabled(!SFX.enabled); SFX.play('click'); updateControls(); };
  $('#btnMusic').onclick = () => { SFX.unlock(); SFX.setMusic(!SFX.musicOn); updateControls(); };
  $('#btnFull').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  $('#btnSkip').onclick = () => socket.emit('hostSkipReveal');
  $('#startBtn').onclick = () => { SFX.play('click'); socket.emit('hostStart'); };
  $('#newGameBtn').onclick = () => { SFX.play('click'); socket.emit('hostNewGame'); };
  updateControls();

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // ---------- Netzwerk ----------
  socket.on('connect', () => socket.emit('host'));
  socket.on('state', (s) => { S = s; render(); });
  socket.on('fx', onFx);
  socket.on('toast', toast);
  fetch('/join-info').then((r) => r.json()).then((info) => {
    $('#joinUrl').textContent = info.url.replace(/^http:\/\//, '');
    try { $('#qr').innerHTML = QR.svg(info.url, { dark: '#1b1410', light: '#f1e4c6', quiet: 1 }); } catch (e) { console.error(e); }
  }).catch(() => {});

  const P = (id) => (S ? S.players.find((p) => p.id === id) : null);
  const nm = (id) => esc(P(id)?.name || '?');

  // ---------- Render ----------
  function render() {
    if (!S) return;
    document.body.classList.toggle('in-game', S.phase !== 'lobby');
    $('#lobby').hidden = S.phase !== 'lobby';
    $('#game').hidden = S.phase === 'lobby';
    $('#btnSkip').hidden = S.phase !== 'reveal';
    if (S.phase === 'lobby') { renderLobby(); hideGameOver(); removeReveal(); return; }
    if (!enactAnim) { disp.lib = S.lib; disp.fas = S.fas; }
    if (builtBoardFor !== S.startCount) buildBoards();
    renderBoards();
    renderPiles();
    renderPlayers();
    renderHeadline();
    renderLog();
    renderReveal();
    document.body.classList.toggle('phase-fascist-mood', S.fas >= 3);
    if (S.phase === 'gameover') { if (!gameOverShown) showGameOver(false); }
    else hideGameOver();
  }

  // Lobby
  function renderLobby() {
    const n = S.players.length;
    $('#lobbyCount').textContent = `${n}/${S.maxPlayers}`;
    const table = { 5: [3, 1], 6: [4, 1], 7: [4, 2], 8: [5, 2], 9: [5, 3], 10: [6, 3] };
    const split = table[n];
    $('#roleSplit').innerHTML = split
      ? `<b class="l">${split[0]} Liberale</b> · <b class="f">${split[1]} Faschist${split[1] > 1 ? 'en' : ''} + Hitler</b>`
      : 'Für 5 bis 10 Spieler';
    const wrap = $('#lobbyPlayers');
    const html = [];
    S.players.forEach((p) => {
      const fresh = !knownLobby.has(p.id); knownLobby.add(p.id);
      html.push(`<div class="lp ${p.connected ? '' : 'off'} ${fresh ? 'fresh' : ''}" data-id="${p.id}">
        <div class="avatar" style="--c:${p.color}">${esc(initials(p.name))}</div>
        <div class="lp-name">${esc(p.name)}</div>
        ${p.leader ? '<div class="lp-tag">Spielleiter</div>' : ''}
        ${p.connected ? '' : '<div class="lp-tag">offline</div>'}
        <button class="kick" data-kick="${p.id}" title="Entfernen">✕</button></div>`);
    });
    for (let i = n; i < S.maxPlayers; i++) html.push(`<div class="lp empty">${i < S.minPlayers ? 'Platz frei' : 'optional'}</div>`);
    const sig = html.join('').replace(/ fresh/g, '');
    if (wrap._sig !== sig) { wrap.innerHTML = html.join(''); wrap._sig = sig; }
    wrap.querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => socket.emit('hostKick', { id: b.dataset.kick })));
    const ok = n >= S.minPlayers;
    $('#startBtn').disabled = !ok;
    $('#startHint').textContent = ok ? 'oder der Spielleiter startet am Handy' : `Noch ${S.minPlayers - n} Spieler bis zum Start`;
  }

  // Bretter
  function buildBoards() {
    builtBoardFor = S.startCount;
    const lib = $('#libSlots'); lib.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div'); d.className = 'slot';
      d.innerHTML = i === 4 ? `<div class="s-ico">${ICONS.dove}</div><div class="s-txt">Liberale siegen</div>` : '';
      lib.appendChild(d);
    }
    const fas = $('#fasSlots'); fas.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div'); d.className = 'slot';
      const pw = S.powers[i];
      if (i === 5) { d.classList.add('win'); d.innerHTML = `<div class="s-ico">${ICONS.skull}</div><div class="s-txt">Faschisten siegen</div>`; }
      else if (pw) d.innerHTML = `<div class="s-ico">${ICONS[POWER_INFO[pw].icon]}</div><div class="s-txt">${POWER_INFO[pw].label}${i === 4 ? '<br>+ Veto' : ''}</div>`;
      if (i >= 3 && i < 6) d.classList.add('danger');
      fas.appendChild(d);
    }
    $('#fasFoot').innerHTML = `<span class="ft" id="ftHitler"><i></i>Ab 3 Gesetzen: Hitler als Kanzler gewählt ⇒ Faschisten siegen</span><span class="ft" id="ftVeto">Ab 5 Gesetzen: Veto-Recht</span>`;
  }

  function fillSlots(container, count, policy) {
    const slots = container.children;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const has = s.querySelector('.policy');
      if (i < count && !has) s.insertAdjacentHTML('beforeend', policyCard(policy));
      if (i >= count && has) has.remove();
      s.classList.toggle('next', i === count && S.phase !== 'gameover');
    }
  }
  function renderBoards() {
    fillSlots($('#libSlots'), disp.lib, 'liberal');
    fillSlots($('#fasSlots'), disp.fas, 'fascist');
    $('#ftHitler')?.classList.toggle('on', S.fas >= 3);
    $('#ftVeto')?.classList.toggle('on', S.fas >= 5);
    const dot = document.querySelector('.tr-dot[data-i="1"]');
    const step = dot ? dot.offsetLeft - document.querySelector('.tr-dot[data-i="0"]').offsetLeft : 0;
    $('#trackerToken').style.transform = `translateX(${S.tracker * step}px)`;
  }
  function renderPiles() {
    $('#deckCount').textContent = S.deckCount;
    $('#discardCount').textContent = S.discardCount;
    $('#discardPile .pile-stack').style.opacity = S.discardCount ? 0.85 : 0.25;
  }

  // Spieler
  function renderPlayers() {
    const wrap = $('#players');
    const ids = S.players.map((p) => p.id).join(',');
    if (wrap._ids !== ids) {
      wrap.innerHTML = '';
      S.players.forEach((p) => {
        const el = document.createElement('div');
        el.className = 'plate'; el.dataset.id = p.id;
        el.innerHTML = `<div class="vote"><div class="v-inner"><div class="v-face v-back"></div><div class="v-face v-front"></div></div></div>
          <div class="p-icons"></div>
          <div class="avatar" style="--c:${p.color}">${esc(initials(p.name))}</div>
          <div class="p-name">${esc(p.name)}</div><div class="p-badges"></div>`;
        wrap.appendChild(el);
      });
      wrap._ids = ids;
    }
    const size = S.players.length > 8 ? 13 : 15;
    S.players.forEach((p, i) => {
      const el = wrap.querySelector(`.plate[data-id="${p.id}"]`);
      if (!el) return;
      el.style.width = size + 'vh';
      el.classList.toggle('is-pres', p.isPresident);
      el.classList.toggle('is-chan', p.isChancellor);
      el.classList.toggle('is-nom', p.isNominee);
      el.classList.toggle('dead', !p.alive);
      el.classList.toggle('offline', !p.connected);
      const thinking = (S.phase === 'nominate' && p.isPresident) || (S.phase === 'legPresident' && p.isPresident) ||
        (S.phase === 'legChancellor' && p.isChancellor) || (S.phase === 'veto' && p.isPresident) ||
        (S.phase === 'power' && p.isPresident) || (S.phase === 'investigateResult' && p.isPresident) ||
        (S.phase === 'vote' && p.alive && !p.hasVoted);
      el.classList.toggle('thinking', thinking);
      const badges = [];
      if (p.isPresident) badges.push('<span class="badge pres">Präsident</span>');
      if (p.isChancellor) badges.push('<span class="badge chan">Kanzler</span>');
      if (p.isNominee) badges.push('<span class="badge nom">Kandidat</span>');
      if (!p.alive) badges.push('<span class="badge dead">Tot</span>');
      const bh = badges.join('');
      const bEl = el.querySelector('.p-badges');
      if (bEl._h !== bh) { bEl.innerHTML = bh; bEl._h = bh; }
      const icons = [];
      if (p.termLimited) icons.push(`<span class="ico limited" title="Amtszeitsperre">${ICONS.ban}</span>`);
      if (p.investigated && S.phase !== 'gameover') icons.push(`<span class="ico inv" title="Wurde überprüft">${ICONS.search}</span>`);
      if (!p.connected) icons.push(`<span class="ico off" title="Verbindung getrennt">${ICONS.wifiOff}</span>`);
      if (p.hasVoted) icons.push(`<span class="ico voted">${ICONS.check}</span>`);
      const ih = icons.join('');
      const iEl = el.querySelector('.p-icons');
      if (iEl._h !== ih) { iEl.innerHTML = ih; iEl._h = ih; }

      // Wahlkarten
      const v = el.querySelector('.vote');
      const front = v.querySelector('.v-front');
      if (S.phase === 'vote') {
        v.classList.toggle('cast', !!p.hasVoted);
        v.classList.remove('show');
      } else if (S.phase === 'voteResult' && p.alive && p.vote !== undefined) {
        front.className = 'v-face v-front ' + (p.vote ? 'ja' : 'nein');
        front.textContent = p.vote ? 'JA!' : 'NEIN';
        v.classList.add('cast');
        if (!v.classList.contains('show')) setTimeout(() => v.classList.add('show'), 1300 + i * 140);
      } else {
        v.classList.remove('cast', 'show');
      }
    });
  }

  // Überschrift
  function renderHeadline() {
    const pres = S.presidentId, nom = S.nomineeId, chan = S.chancellorId;
    let h = '', sub = '';
    const aliveN = S.players.filter((p) => p.alive).length;
    switch (S.phase) {
      case 'reveal': {
        const r = S.players.filter((p) => p.ready).length;
        h = 'Geheime Rollen werden verteilt'; sub = `${r}/${S.players.length} bereit – schaut heimlich auf eure Handys`; break;
      }
      case 'nominate': h = `<em>${nm(pres)}</em> wählt einen Kanzler`; sub = 'Diskutiert! Wem könnt ihr trauen?'; break;
      case 'vote': {
        const c = S.players.filter((p) => p.hasVoted).length;
        h = `Abstimmung: <em>${nm(pres)}</em> & <em>${nm(nom)}</em>`; sub = `${c}/${aliveN} Stimmen abgegeben`; break;
      }
      case 'voteResult': h = 'Die Stimmen werden ausgezählt…'; sub = ''; break;
      case 'legPresident': h = `Präsident <em>${nm(pres)}</em> legt ein Gesetz ab`; sub = 'Ruhe bitte – keine Absprachen während der Gesetzgebung!'; break;
      case 'legChancellor': h = `Kanzler <em>${nm(chan)}</em> erlässt ein Gesetz`; sub = S.vetoUnlocked ? 'Der Kanzler darf ein Veto vorschlagen' : 'Ruhe bitte – keine Absprachen während der Gesetzgebung!'; break;
      case 'veto': h = 'Veto vorgeschlagen!'; sub = `Präsident ${nm(pres)} entscheidet`; break;
      case 'vetoed': h = 'Veto!'; sub = S.notice; break;
      case 'enacted': h = S.lastEnacted?.policy === 'liberal' ? 'Liberales Gesetz erlassen' : 'Faschistisches Gesetz erlassen'; sub = S.lastEnacted?.chaos ? 'Durch Chaos – keine Vollmacht' : ''; break;
      case 'power': {
        const map = { peek: 'sieht sich die obersten 3 Gesetze an', investigate: 'prüft die Loyalität eines Spielers', special: 'bestimmt den nächsten Präsidenten', execute: 'muss einen Spieler hinrichten' };
        h = `<em>${nm(pres)}</em> ${map[S.power] || ''}`; sub = 'Präsidiale Vollmacht'; break;
      }
      case 'investigateResult': h = `<em>${nm(pres)}</em> prüft <em>${nm(S.investigationTarget)}</em>`; sub = 'Der Präsident darf lügen…'; break;
      case 'powerResolved': h = S.notice || ''; sub = ''; break;
      case 'gameover': h = S.winner === 'liberal' ? 'Die Liberalen gewinnen!' : 'Die Faschisten gewinnen!'; sub = S.winReason; break;
    }
    const el = $('#headline');
    if (h !== lastHeadline) { el.innerHTML = h; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); lastHeadline = h; }
    $('#subline').innerHTML = sub;
    $('#roundTag').textContent = S.round ? `Runde ${S.round}` : '';
  }

  function renderLog() {
    const ul = $('#log');
    const items = S.log.slice(-14).reverse();
    const sig = items.map((l) => l.t + l.text).join('|');
    if (ul._sig === sig) return;
    ul._sig = sig;
    ul.innerHTML = items.map((l, i) => `<li class="${l.kind} ${i === 0 ? 'fresh' : ''}">${esc(l.text)}</li>`).join('');
  }

  // Rollen-Phase-Overlay
  function renderReveal() {
    let ov = $('.reveal-overlay');
    if (S.phase !== 'reveal') { removeReveal(); return; }
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'reveal-overlay';
      ov.innerHTML = `<div><div class="rv-title">Prüft eure geheime Rolle</div>
        <div class="rv-sub">Haltet euer Handy verdeckt und haltet die Karte gedrückt. Faschisten erfahren, wer zu ihnen gehört – die Liberalen tappen im Dunkeln.</div>
        <div class="reveal-cards"></div></div>`;
      document.body.appendChild(ov);
    }
    ov.querySelector('.reveal-cards').innerHTML = S.players.map((p) =>
      `<div style="text-align:center"><div class="rc ${p.ready ? 'ready' : ''}">${p.ready ? ICONS.check : ICONS.shield}</div><div style="margin-top:1vh;font-weight:700;font-size:1.8vh">${esc(p.name)}</div></div>`).join('');
  }
  function removeReveal() { $('.reveal-overlay')?.remove(); }

  // ---------- Effekte ----------
  function banner(kicker, title, sub, kind = '', dur = 2800) {
    const b = $('#banner');
    b.className = 'banner ' + kind;
    b.querySelector('.b-kicker').textContent = kicker || '';
    b.querySelector('.b-title').innerHTML = title || '';
    b.querySelector('.b-sub').innerHTML = sub || '';
    b.style.setProperty('--dur', dur + 'ms');
    void b.offsetWidth; b.classList.add('show');
  }
  function flash(kind) { const f = $('#flash'); f.className = ''; void f.offsetWidth; f.className = kind; }
  function shake() { document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 700); }
  function plate(id) { return document.querySelector(`.plate[data-id="${id}"]`); }

  function onFx(f) {
    switch (f.type) {
      case 'join': SFX.play('join'); break;
      case 'leave': SFX.play('leave'); break;
      case 'start': SFX.play('start'); gameOverShown = false; disp.lib = 0; disp.fas = 0; break;
      case 'lobby': gameOverShown = false; stopParticles(); break;
      case 'newRound': SFX.play('tick'); break;
      case 'nominated':
        SFX.play('nominate');
        setTimeout(() => banner('Nominierung', `${nm(f.nomineeId)}`, `wird von Präsident ${nm(f.presidentId)} als Kanzler vorgeschlagen. Jetzt abstimmen!`, '', 2600), 50);
        break;
      case 'voteCast': SFX.play('voteCast'); break;
      case 'votesRevealed':
        SFX.play('drumroll');
        setTimeout(() => {
          SFX.play(f.passed ? 'ja' : 'nein');
          banner(`${f.ja} × Ja  ·  ${f.nein} × Nein`, f.passed ? 'Regierung gewählt!' : 'Regierung abgelehnt', f.passed ? 'Die Gesetzgebung beginnt' : 'Der Wahltracker rückt vor', f.passed ? 'lib' : 'fas', 2900);
        }, 1300 + S.players.length * 140 + 300);
        break;
      case 'notHitler':
        setTimeout(() => { SFX.play('reveal'); banner('Erleichterung', `${nm(f.playerId)} ist nicht Hitler`, 'Der Kanzler hat es offiziell bestätigt', 'lib', 2500); }, 200);
        break;
      case 'legislative': SFX.play('whoosh'); pulsePile('#drawPile'); break;
      case 'presidentDiscarded': SFX.play('card'); pulsePile('#discardPile'); break;
      case 'trackerUp': setTimeout(() => SFX.play('tracker'), 150); break;
      case 'chaos':
        SFX.play('chaos'); shake(); flash('red');
        banner('Das Volk ist es leid', 'CHAOS!', 'Das oberste Gesetz tritt ohne Regierung in Kraft', 'fas', 2400);
        break;
      case 'enact': animateEnact(f.policy, f.index, f.chaos ? 2300 : 0); break;
      case 'reshuffle': SFX.play('whoosh'); pulsePile('#drawPile'); break;
      case 'vetoProposed': SFX.play('alert'); banner('Kanzler sagt', 'VETO?', 'Der Präsident muss zustimmen oder ablehnen', '', 2500); break;
      case 'vetoRejected': SFX.play('nein'); banner('Präsident sagt', 'Veto abgelehnt', 'Der Kanzler muss ein Gesetz erlassen', 'fas', 2400); break;
      case 'vetoAccepted': SFX.play('veto'); pulsePile('#discardPile'); banner('Einigkeit', 'VETO!', 'Beide Gesetze landen im Ablagestapel', '', 2800); break;
      case 'power': {
        SFX.play('power');
        const pi = POWER_INFO[f.power];
        setTimeout(() => banner('Präsidiale Vollmacht', pi.label, pi.desc, 'fas', 2800), 100);
        break;
      }
      case 'investigated':
        SFX.play('investigate');
        banner('Loyalitätsprüfung', `${nm(f.targetId)}`, `wird von ${nm(f.presidentId)} überprüft`, '', 2600);
        break;
      case 'peeked': SFX.play('card'); break;
      case 'specialElection':
        SFX.play('nominate');
        banner('Sonderwahl', `${nm(f.targetId)}`, 'wird nächster Präsidentschaftskandidat', '', 3200);
        break;
      case 'executed': {
        const el = plate(f.targetId);
        if (el) el.classList.add('targeted');
        setTimeout(() => {
          SFX.play('gunshot'); flash('red'); shake();
          if (el) { el.classList.remove('targeted'); el.classList.add('killed'); setTimeout(() => el.classList.remove('killed'), 1300); }
          banner('Hinrichtung', `${nm(f.targetId)} ist tot`, 'Tote dürfen nicht mehr sprechen oder abstimmen', 'fas', 3000);
        }, 900);
        break;
      }
      case 'gameover': setTimeout(() => showGameOver(true), 900); break;
    }
  }
  function pulsePile(sel) { const p = $(sel); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }

  // Gesetz fliegt vom Stapel aufs Brett
  function animateEnact(policy, index, delay) {
    enactAnim = true;
    setTimeout(() => {
      const container = policy === 'liberal' ? $('#libSlots') : $('#fasSlots');
      const slot = container.children[index];
      const from = $('#drawPile .pile-stack').getBoundingClientRect();
      const to = slot ? slot.getBoundingClientRect() : from;
      const dim = document.createElement('div'); dim.className = 'fx-dim'; document.body.appendChild(dim);
      const card = document.createElement('div');
      card.className = 'flycard';
      card.innerHTML = `<div class="fc-inner"><div class="fc-face fc-back">${policyBack()}</div><div class="fc-face fc-front">${policyCard(policy)}</div></div>`;
      $('#fxLayer').appendChild(card);
      const cw = card.offsetWidth, ch = card.offsetHeight;
      const cx = innerWidth / 2 - cw / 2, cy = innerHeight / 2 - ch / 2;
      const inner = card.querySelector('.fc-inner');
      SFX.play('whoosh');
      requestAnimationFrame(() => dim.classList.add('on'));
      const a1 = card.animate([
        { transform: `translate(${from.left}px, ${from.top}px) scale(${from.width / cw}) rotate(-8deg)` },
        { transform: `translate(${cx}px, ${cy}px) scale(2.6) rotate(0deg)` },
      ], { duration: 700, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' });
      a1.onfinish = () => {
        setTimeout(() => SFX.play('card'), 150);
        const a2 = inner.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], { duration: 650, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'forwards' });
        a2.onfinish = () => {
          SFX.play(policy === 'liberal' ? 'liberal' : 'fascist');
          setTimeout(() => {
            dim.classList.remove('on');
            const a3 = card.animate([
              { transform: `translate(${cx}px, ${cy}px) scale(2.6)` },
              { transform: `translate(${to.left}px, ${to.top}px) scale(${to.width / cw})` },
            ], { duration: 650, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
            a3.onfinish = () => {
              SFX.play('stamp'); shake();
              card.remove(); dim.remove();
              enactAnim = false;
              disp.lib = S.lib; disp.fas = S.fas;
              render();
              const placed = slot && slot.querySelector('.policy');
              if (placed) placed.classList.add('stamp');
              if (policy === 'fascist') flash('red'); else flash('white');
            };
          }, 1000);
        };
      };
    }, delay);
  }

  // Spielende
  function showGameOver(animated) {
    if (!S || S.phase !== 'gameover') return;
    gameOverShown = true;
    const go = $('#gameover');
    go.hidden = false;
    go.className = S.winner === 'liberal' ? 'lib' : 'fas';
    $('#goTitle').textContent = S.winner === 'liberal' ? 'Die Liberalen siegen' : 'Die Faschisten siegen';
    $('#goReason').textContent = S.winReason;
    const order = [...S.players].sort((a, b) => (a.role === 'hitler' ? 1 : 0) - (b.role === 'hitler' ? 1 : 0));
    $('#goRoles').innerHTML = order.map((p) => {
      const won = (S.winner === 'liberal') === (p.role === 'liberal');
      return `<div class="go-role ${p.alive ? '' : 'dead'} ${won ? 'winner' : ''}" data-role="${p.role}">
        <div class="gr-inner"><div class="gr-face gr-back">${ICONS.shield}</div><div class="gr-face gr-front">${roleCard(p.role)}</div></div>
        <div class="gr-name">${esc(p.name)}</div></div>`;
    }).join('');
    const cards = [...document.querySelectorAll('.go-role')];
    if (animated) {
      SFX.play(S.winner === 'liberal' ? 'winLiberal' : 'winFascist');
      cards.forEach((c, i) => setTimeout(() => {
        c.classList.add('flip');
        SFX.play(c.dataset.role === 'hitler' ? 'fascist' : 'reveal');
      }, 1600 + i * (c.dataset.role === 'hitler' ? 900 : 380)));
    } else cards.forEach((c) => c.classList.add('flip'));
    startParticles(S.winner);
  }
  function hideGameOver() {
    if (!$('#gameover').hidden) { $('#gameover').hidden = true; stopParticles(); }
    gameOverShown = false;
  }

  // ---------- Partikel (Konfetti / Glut) ----------
  const cv = $('#particles'); const ctx = cv.getContext('2d');
  let parts = [], partMode = null, raf = null;
  function resize() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
  addEventListener('resize', resize); resize();
  function startParticles(winner) {
    partMode = winner; parts = [];
    if (!raf) raf = requestAnimationFrame(tick);
    if (winner === 'liberal') {
      for (let i = 0; i < 260; i++) parts.push(confetti(true));
    }
  }
  function stopParticles() { partMode = null; parts = []; ctx.clearRect(0, 0, cv.width, cv.height); }
  function confetti(burst) {
    const cols = ['#5fa9d6', '#cfeaff', '#f3d58b', '#ffffff', '#2f6f96'];
    return { x: Math.random() * cv.width, y: burst ? -Math.random() * cv.height : -20, vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .2, w: 8 + Math.random() * 10, h: 4 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], kind: 'c' };
  }
  function ember() {
    return { x: Math.random() * cv.width, y: cv.height + 10, vx: (Math.random() - .5) * 1.2, vy: -(1 + Math.random() * 3), life: 1, size: 1.5 + Math.random() * 4, kind: 'e' };
  }
  function tick() {
    raf = null;
    if (!partMode) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (partMode === 'fascist' && parts.length < 220) for (let i = 0; i < 4; i++) parts.push(ember());
    if (partMode === 'liberal' && parts.length < 120) parts.push(confetti(false));
    parts = parts.filter((p) => {
      if (p.kind === 'c') {
        p.x += p.vx; p.y += p.vy * devicePixelRatio; p.r += p.vr; p.vx += Math.sin(p.y / 60) * .05;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 3))); ctx.restore();
        return p.y < cv.height + 30;
      }
      p.x += p.vx + Math.sin(p.y / 40) * .6; p.y += p.vy * devicePixelRatio; p.life -= .004;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
      g.addColorStop(0, `rgba(255,${150 + (p.life * 80) | 0},60,${p.life})`); g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2); ctx.fill();
      return p.life > 0 && p.y > -20;
    });
    raf = requestAnimationFrame(tick);
  }
})();
