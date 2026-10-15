/* Gemeinsame SVG-Icons und Karten-Bausteine */
window.ICONS = {
  star: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.8l3 7 7.4.6-5.6 4.9 1.7 7.3L12 17.8l-6.5 3.8 1.7-7.3L1.6 9.4 9 8.8z"/></svg>',
  dove: '<svg viewBox="0 0 64 64"><path fill="currentColor" d="M6 34c8-1 14 2 18 6 2-8 0-17-6-24 9 2 16 9 18 18 4-8 12-12 22-12-3 3-5 6-6 10 3 1 5 2 7 4-5 0-8 1-11 3-3 9-11 15-22 15-6 0-11-2-14-6l-8 2 4-6c-2-3-3-6-2-10z"/></svg>',
  skull: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5c-5.2 0-9 3.7-9 8.6 0 3 1.4 5.3 3.6 6.7V20c0 .9.7 1.6 1.6 1.6h1.3v-2.3h1.6v2.3h1.8v-2.3h1.6v2.3h1.3c.9 0 1.6-.7 1.6-1.6v-3.2c2.2-1.4 3.6-3.7 3.6-6.7 0-4.9-3.8-8.6-9-8.6z"/><circle cx="8.4" cy="11" r="2.3" fill="#1a0b08"/><circle cx="15.6" cy="11" r="2.3" fill="#1a0b08"/><path d="M12 13.6l-1.3 2.5h2.6z" fill="#1a0b08"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M1.5 12S5.5 4.8 12 4.8 22.5 12 22.5 12 18.5 19.2 12 19.2 1.5 12 1.5 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.6" fill="currentColor"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15 15l6.5 6.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  crown: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2.5 18.5h19l-1.8-11-4.7 4.2L12 4.5l-3 7.2-4.7-4.2zM3 20h18v2H3z"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 1v5.5M12 17.5V23M1 12h5.5M17.5 12H23" stroke="currentColor" stroke-width="2"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5l9 3.5v6.5c0 5.4-3.8 9.7-9 11-5.2-1.3-9-5.6-9-11V5z"/></svg>',
  ban: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M5.6 5.6l12.8 12.8" stroke="currentColor" stroke-width="2.4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wifiOff: '<svg viewBox="0 0 24 24"><path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="2.4"/></svg>',
  cross: '<svg viewBox="0 0 24 24"><path d="M10 2h4v6h6v4h-6v10h-4V12H4V8h6z" fill="currentColor"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9z"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  music: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 18.5a3 3 0 1 1-2-2.8V5l12-2.5v12.2a3 3 0 1 1-2-2.8V6.2L9 7.8z"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
};

window.POWER_INFO = {
  peek: { icon: 'eye', label: 'Gesetzes­vorschau', desc: 'Präsident sieht die obersten 3 Gesetze' },
  investigate: { icon: 'search', label: 'Loyalität prüfen', desc: 'Präsident prüft die Partei eines Spielers' },
  special: { icon: 'crown', label: 'Sonderwahl', desc: 'Präsident wählt den nächsten Präsidenten' },
  execute: { icon: 'target', label: 'Hinrichtung', desc: 'Präsident richtet einen Spieler hin' },
};

window.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
window.initials = (name) => {
  const parts = String(name).trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : String(name).slice(0, 2)).toUpperCase();
};

window.policyCard = (policy, extra = '') => {
  const lib = policy === 'liberal';
  return `<div class="policy ${lib ? 'lib' : 'fas'} ${extra}">
    <div class="policy-frame">
      <div class="policy-icon">${lib ? ICONS.dove : ICONS.skull}</div>
      <div class="policy-label">${lib ? 'Liberal' : 'Faschistisch'}</div>
      <div class="policy-sub">Gesetz</div>
    </div></div>`;
};
window.policyBack = () => `<div class="policy back"><div class="policy-frame"><div class="policy-icon">${ICONS.shield}</div><div class="policy-label">Gesetz</div></div></div>`;

window.ROLE_INFO = {
  liberal: { title: 'Liberal', party: 'Liberale Partei', icon: 'dove', cls: 'lib', goal: 'Erlasse 5 liberale Gesetze oder richte Hitler hin.' },
  fascist: { title: 'Faschist', party: 'Faschistische Partei', icon: 'skull', cls: 'fas', goal: 'Erlasse 6 faschistische Gesetze oder bringe Hitler nach 3 faschistischen Gesetzen ins Kanzleramt. Bleib unentdeckt.' },
  hitler: { title: 'Hitler', party: 'Faschistische Partei', icon: 'skull', cls: 'hit', goal: 'Werde nach 3 faschistischen Gesetzen zum Kanzler gewählt. Gib dich als Liberaler aus und überlebe.' },
};
window.roleCard = (role, extra = '') => {
  const r = ROLE_INFO[role];
  if (!r) return '';
  return `<div class="rolecard ${r.cls} ${extra}"><div class="rc-inner">
    <div class="rc-top">Geheime Rolle</div>
    <div class="rc-icon">${ICONS[r.icon]}</div>
    <div class="rc-title">${r.title}</div>
    <div class="rc-party">${r.party}</div></div></div>`;
};
