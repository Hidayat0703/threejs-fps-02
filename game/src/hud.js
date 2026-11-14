// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, kill feed,
// buy menu, channel bar and a live minimap. It never touches the simulation; main.js
// pushes numbers in and reads the buy and play callbacks out.
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';

const BUY_ITEMS = [
  { key: '1', kind: 'sidearm', label: 'P9 Sidearm' },
  { key: '2', kind: 'smg', label: 'Wasp-9 SMG' },
  { key: '3', kind: 'rifle', label: 'VK-47 Rifle' },
  { key: '4', kind: 'shotgun', label: 'Breacher-12' },
  { key: '5', kind: 'sniper', label: 'Longbow-50' },
  { key: '6', kind: 'grenade', label: 'Spark Frag' },
  { key: '7', kind: 'armor', label: 'Kevlar Vest' },
];

const COPY = {
  start: {
    title: 'SANDLINE',
    copy: 'A round-based tactical FPS. Plant the spike at A or B, or eliminate DUSK. Buy with B, plant with E, throw a frag with G.',
    action: 'Click to play',
  },
  paused: {
    title: 'SANDLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  match: {
    title: 'Match over',
    copy: 'The match is decided.',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoBox = $('ammo');
  const weaponName = $('weapon-name');
  const grenadesEl = $('grenades');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorEl = $('armor');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreEl = $('round-score');
  const killsEl = $('kills');
  const feedEl = $('killfeed');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buymenu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const channel = $('channel');
  const channelFill = $('channel-fill');
  const channelLabel = $('channel-label');
  const spikeEl = $('spike');
  const minimap = $('minimap');
  const vignette = $('damage-vignette');
  const mapCtx = minimap.getContext('2d');
  let hitTimer = 0;
  let bannerTimer = 0;
  let lastAmmo = '';
  let lastHealth = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let buyOpen = false;
  let buyHandler = null;

  for (const item of BUY_ITEMS) {
    const def = item.kind === 'grenade' ? GRENADE : item.kind === 'armor' ? ARMOR : WEAPONS[item.kind];
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.dataset.kind = item.kind;
    row.innerHTML = `<b>${item.key}</b><span>${item.label}</span><em>$${def.price}</em>`;
    row.addEventListener('click', () => buyHandler && buyHandler(item.kind));
    buyList.appendChild(row);
  }

  function priceOf(kind) {
    return kind === 'grenade' ? GRENADE.price : kind === 'armor' ? ARMOR.price : WEAPONS[kind].price;
  }

  return {
    setAmmo(mag, reserve) {
      const text = `${mag}|${reserve}`;
      if (text === lastAmmo) return;
      lastAmmo = text;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) { weaponName.textContent = name; },
    setGrenades(n) { grenadesEl.textContent = n > 0 ? `FRAG x${n}` : ''; },
    setHealth(hp, armor) {
      if (hp === lastHealth) return;
      lastHealth = hp;
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
      healthFill.classList.toggle('low', hp <= 30);
      armorEl.textContent = armor > 0 ? `ARMOR ${Math.ceil(armor)}` : '';
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyEl.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
      for (const row of buyList.children) {
        row.classList.toggle('poor', priceOf(row.dataset.kind) > value);
      }
    },
    setTimer(seconds, buyPhase = false, fuse = false) {
      const text = `${buyPhase ? 'BUY ' : fuse ? 'FUSE ' : ''}${Math.max(0, seconds)}`;
      if (text === lastTimer) return;
      lastTimer = text;
      timerEl.textContent = text;
      timerEl.classList.toggle('buy', buyPhase);
      timerEl.classList.toggle('fuse', fuse);
    },
    setRound(round, attackWins, defendWins) {
      scoreEl.textContent = `ROUND ${round}   SANDLINE ${attackWins} — ${defendWins} DUSK`;
    },
    setKills(kills, deaths) { killsEl.textContent = `K ${kills}  ·  D ${deaths}`; },
    setSpike(planted, site) {
      spikeEl.textContent = planted ? `SPIKE PLANTED — SITE ${site}` : '';
      spikeEl.classList.toggle('on', planted);
    },
    setSpikeCarrier(who) {
      spikeEl.textContent = who === 'YOU' ? 'YOU CARRY THE SPIKE' : who === 'DROPPED' ? 'SPIKE DROPPED' : `${who} CARRIES THE SPIKE`;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${Math.round(px)}px`);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    killfeed(killer, victim) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      row.innerHTML = `<b>${killer}</b><span> eliminated </span><b>${victim}</b>`;
      feedEl.prepend(row);
      while (feedEl.children.length > 5) feedEl.removeChild(feedEl.lastChild);
      setTimeout(() => row.remove(), 6000);
    },
    banner(titleText, subText) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      bannerTitle.parentElement.classList.toggle('on', !!titleText);
      clearTimeout(bannerTimer);
      if (titleText) bannerTimer = setTimeout(() => bannerTitle.parentElement.classList.remove('on'), 3400);
    },
    showBuy(open) {
      buyOpen = open;
      buyMenu.hidden = !open;
    },
    isBuyOpen() { return buyOpen; },
    onBuy(handler) { buyHandler = handler; },
    setChannel(kind, frac, name = '') {
      if (!kind) {
        channel.hidden = true;
        return;
      }
      channel.hidden = false;
      channelFill.style.width = `${Math.round(frac * 100)}%`;
      channelLabel.textContent = kind === 'plant' ? `PLANTING THE SPIKE${name ? ` — ${name}` : ''}` : `DEFUSING${name ? ` — ${name}` : ''}`;
    },
    showOverlay(mode, state) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'match' && state
        ? `${state.matchWinner === 'attack' ? 'SANDLINE' : 'DUSK'} wins ${state.attackWins} — ${state.defendWins}. ${text.copy}`
        : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    // Minimap: 44 x 34 m yard scaled to the canvas. Enemies show only while they are
    // fighting or close by; teammates and the spike always show.
    drawMinimap(player, yaw, bots, spike, world) {
      const w = minimap.width;
      const h = minimap.height;
      const sx = w / 46;
      const sy = h / 36;
      const X = (x) => (x + 23) * sx;
      const Z = (z) => (z + 18) * sy;
      mapCtx.clearRect(0, 0, w, h);
      mapCtx.fillStyle = 'rgba(23,27,34,0.85)';
      mapCtx.fillRect(0, 0, w, h);
      mapCtx.strokeStyle = '#333a45';
      mapCtx.strokeRect(X(-22), Z(-17), 44 * sx, 34 * sy);
      mapCtx.fillStyle = '#b5502a';
      mapCtx.fillRect(X(world.siteA.x - 3.5), Z(world.siteA.z - 3.5), 7 * sx, 7 * sy);
      mapCtx.fillStyle = '#3fb8a6';
      mapCtx.fillRect(X(world.siteB.x - 3.5), Z(world.siteB.z - 3.5), 7 * sx, 7 * sy);
      mapCtx.fillStyle = '#e9e6df';
      mapCtx.font = 'bold 11px system-ui, sans-serif';
      mapCtx.textAlign = 'center';
      mapCtx.fillText('A', X(world.siteA.x), Z(world.siteA.z) + 4);
      mapCtx.fillText('B', X(world.siteB.x), Z(world.siteB.z) + 4);
      mapCtx.fillStyle = '#333a45';
      for (const b of world.blockers) {
        if (b.top > 1.5) mapCtx.fillRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * sx, (b.maxZ - b.minZ) * sy);
      }
      if (spike.dropped) {
        mapCtx.fillStyle = '#e8b23a';
        mapCtx.beginPath();
        mapCtx.arc(X(spike.x), Z(spike.z), 4, 0, Math.PI * 2);
        mapCtx.fill();
      }
      for (const b of bots) {
        if (!b.alive) continue;
        const dist = Math.hypot(b.x - player.x, b.z - player.z);
        const seen = b.team === 'attack' || b.state === 'engage' || dist < 12;
        if (!seen) continue;
        mapCtx.fillStyle = b.team === 'attack' ? '#e8b23a' : '#e0533d';
        mapCtx.beginPath();
        mapCtx.arc(X(b.x), Z(b.z), 3.5, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // Player arrow.
      mapCtx.save();
      mapCtx.translate(X(player.x), Z(player.z));
      mapCtx.rotate(Math.atan2(-Math.sin(yaw), -Math.cos(yaw)) + Math.PI / 2);
      mapCtx.fillStyle = '#e9e6df';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -6);
      mapCtx.lineTo(4.5, 5);
      mapCtx.lineTo(-4.5, 5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    },
  };
}
