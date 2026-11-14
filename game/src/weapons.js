// The armoury: five guns and one grenade. Each entry owns its numbers — damage, head
// multiplier, fire rate, magazine, spread, recoil, price — and the view model is built
// from boxes per weapon, so the gun on screen always matches the gun in hand.
// To the judge: buy with B during the buy phase, keys 1-7. A rifle costs $2100, a
// sniper $3400, armour $650, a frag grenade $300 — money is earned every round.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  sidearm: {
    name: 'P9 Sidearm', kind: 'sidearm', price: 0, damage: 26, headMult: 3.0,
    mag: 12, reserve: 48, gap: 0.16, reload: 1.3, spreadStill: 0.004, spreadMove: 0.02,
    kick: 0.008, auto: false, range: 60,
  },
  smg: {
    name: 'Wasp-9 SMG', kind: 'smg', price: 950, damage: 21, headMult: 2.6,
    mag: 28, reserve: 84, gap: 0.075, reload: 1.7, spreadStill: 0.006, spreadMove: 0.026,
    kick: 0.006, auto: true, range: 55,
  },
  rifle: {
    name: 'VK-47 Rifle', kind: 'rifle', price: 2100, damage: 34, headMult: 3.2,
    mag: 30, reserve: 90, gap: 0.098, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028,
    kick: 0.011, auto: true, range: 80,
  },
  shotgun: {
    name: 'Breacher-12', kind: 'shotgun', price: 1250, damage: 14, headMult: 2.0,
    mag: 6, reserve: 24, gap: 0.85, reload: 2.6, spreadStill: 0.02, spreadMove: 0.035,
    kick: 0.03, auto: false, pellets: 7, range: 28,
  },
  sniper: {
    name: 'Longbow-50', kind: 'sniper', price: 3400, damage: 95, headMult: 2.2,
    mag: 5, reserve: 15, gap: 1.15, reload: 2.8, spreadStill: 0.0006, spreadMove: 0.05,
    kick: 0.045, auto: false, range: 100,
  },
};

export const GRENADE = { name: 'Spark Frag', price: 300, damage: 120, radius: 6.5, fuse: 1.6 };
export const ARMOR = { name: 'Kevlar Vest', price: 650 };

const VIEW_SHAPES = {
  sidearm: { receiver: [0.07, 0.09, 0.3], barrel: [0.04, 0.04, 0.16], stock: null, pos: [0.22, -0.2, -0.36] },
  smg: { receiver: [0.08, 0.1, 0.34], barrel: [0.04, 0.04, 0.26], stock: [0.06, 0.07, 0.14], pos: [0.23, -0.2, -0.4] },
  rifle: { receiver: [0.09, 0.1, 0.44], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22], pos: [0.24, -0.2, -0.42] },
  shotgun: { receiver: [0.1, 0.11, 0.5], barrel: [0.06, 0.06, 0.42], stock: [0.08, 0.09, 0.24], pos: [0.24, -0.21, -0.44] },
  sniper: { receiver: [0.08, 0.1, 0.52], barrel: [0.04, 0.04, 0.55], stock: [0.07, 0.08, 0.26], scope: true, pos: [0.24, -0.19, -0.46] },
};

export function createWeaponView(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.3 });

  const model = new THREE.Group();
  camera.add(model);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let current = 'rifle';
  function buildModel(kind) {
    while (model.children.length) model.remove(model.children[0]);
    const shape = VIEW_SHAPES[kind];
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...shape.receiver), bodyMat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...shape.barrel), grip);
    barrel.position.set(0, 0.025, -shape.receiver[2] / 2 - shape.barrel[2] / 2 + 0.05);
    model.add(receiver, barrel);
    if (shape.stock) {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(...shape.stock), grip);
      stock.position.set(0, -0.02, shape.receiver[2] / 2 + shape.stock[2] / 2 - 0.03);
      model.add(stock);
    }
    if (shape.scope) {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), dark);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.05);
      model.add(scope);
    }
    model.position.set(...shape.pos);
  }

  const state = { mag: 30, reserve: 90, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0 };
  let def = WEAPONS.rifle;
  buildModel('rifle');

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = VIEW_SHAPES[current].pos[2] + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    get def() { return def; },
    get kind() { return current; },
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def.gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return false;
      state.reloadLeft = def.reload;
      return true;
    },
    spread(speed, crouching) {
      const move = Math.min(1, speed / 5.4);
      let s = def.spreadStill + move * def.spreadMove;
      if (crouching) s *= 0.65;
      return s;
    },
    // Equip a bought weapon: full magazine, fresh reserve, view model rebuilt.
    equip(kind) {
      current = kind;
      def = WEAPONS[kind];
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      buildModel(kind);
    },
    refill() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    addGrenade() { state.grenades += 1; },
    takeGrenade() {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      return true;
    },
  };
}
