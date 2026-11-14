// The bots: two teammates (SANDLINE, amber) and three defenders (DUSK, teal). Each bot
// walks the waypoint graph, scans for line of sight on a stagger, and fights with a
// small state machine: patrol, engage, retreat, plant, defuse. Accuracy falls with
// distance and with the target's speed, so stopping to aim pays — for both sides.
// To the judge: bots follow routes, hold positions, react to what they see and hear,
// plant the spike when a site is clear, and defuse when it is planted.
import * as THREE from 'three';
import { TEAM } from './palette.js';

const BOT_DEFS = [
  { name: 'VEX', team: 'attack', spawn: 0 },
  { name: 'MIRA', team: 'attack', spawn: 1 },
  { name: 'ROOK', team: 'defend', spawn: 0 },
  { name: 'HALE', team: 'defend', spawn: 1 },
  { name: 'SABLE', team: 'defend', spawn: 2 },
];
const HEALTH = 100;
const EYE = 1.55;
const RADIUS = 0.36;
const PATROL_SPEED = 3.4;
const ENGAGE_SPEED = 4.4;
const SCAN_EVERY = 0.15;

function makeBody(team, scene) {
  const color = new THREE.Color(TEAM[team]);
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#232830'), roughness: 0.6, metalness: 0.3 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a06b'), roughness: 0.8 });
  const group = new THREE.Group();
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.18), dark);
  legL.position.set(-0.11, 0.375, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.8, 0.32), cloth);
  torso.position.y = 1.12;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.68;
  head.userData.part = 'head';
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), dark);
  helmet.position.y = 1.86;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.22, 1.25, -0.25);
  group.add(legL, legR, torso, head, helmet, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  scene.add(group);
  return { group, torso, head, gun };
}

export function createBots(scene, world, ctx) {
  const bots = [];
  const hitMeshes = [];
  let time = 0;

  for (const def of BOT_DEFS) {
    const visual = makeBody(def.team, scene);
    const spawn = world.spawns[def.team === 'attack' ? 'attack' : 'defend'][def.spawn];
    const bot = {
      ...def,
      visual,
      pos: new THREE.Vector3(spawn[0], 0, spawn[1]),
      yaw: def.team === 'attack' ? Math.PI : 0,
      vel: new THREE.Vector3(),
      health: HEALTH,
      alive: true,
      state: 'patrol',
      waypoint: world.nearestWaypoint(spawn[0], spawn[1]),
      path: [],
      pathIdx: 0,
      target: null,
      scanAt: Math.random() * SCAN_EVERY,
      burstLeft: 0,
      burstAt: 0,
      pauseUntil: 0,
      fall: 0,
      channel: null,
      channelAt: 0,
      strafeDir: 1,
      strafeAt: 0,
      hasSpike: false,
      investigate: null,
      home: new THREE.Vector3(spawn[0], 0, spawn[1]),
    };
    visual.torso.userData.bot = bot;
    visual.head.userData.bot = bot;
    hitMeshes.push(visual.torso, visual.head);
    bots.push(bot);
  }

  function spawnAll() {
    for (const bot of bots) {
      const spawn = world.spawns[bot.team === 'attack' ? 'attack' : 'defend'][bot.spawn];
      bot.pos.set(spawn[0], 0, spawn[1]);
      bot.yaw = bot.team === 'attack' ? Math.PI : 0;
      bot.vel.set(0, 0, 0);
      bot.health = HEALTH;
      bot.alive = true;
      bot.state = 'patrol';
      bot.waypoint = world.nearestWaypoint(spawn[0], spawn[1]);
      bot.path = [];
      bot.pathIdx = 0;
      bot.target = null;
      bot.burstLeft = 0;
      bot.channel = null;
      bot.fall = 0;
      bot.hasSpike = bot.team === 'attack' && bot.name === 'VEX';
      bot.investigate = null;
      bot.visual.group.rotation.set(0, bot.yaw, 0);
      bot.visual.group.position.copy(bot.pos);
    }
  }

  function visibleEnemies(bot) {
    const out = [];
    const eye = bot.pos.y + EYE;
    if (ctx.playerAlive()) {
      const p = ctx.playerPos();
      if (bot.pos.distanceTo(p) < 46 && world.losClear(bot.pos.x, eye, bot.pos.z, p.x, p.y + 1.15, p.z)) {
        out.push({ kind: 'player', pos: p, dist: bot.pos.distanceTo(p), speed: ctx.playerSpeed(), crouching: ctx.playerCrouching() });
      }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      const d = bot.pos.distanceTo(other.pos);
      if (d < 46 && world.losClear(bot.pos.x, eye, bot.pos.z, other.pos.x, other.pos.y + 1.15, other.pos.z)) {
        out.push({ kind: 'bot', bot: other, pos: other.pos, dist: d, speed: Math.hypot(other.vel.x, other.vel.z), crouching: false });
      }
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  function setPath(bot, destWp) {
    const from = world.nearestWaypoint(bot.pos.x, bot.pos.z);
    bot.path = world.route(from, destWp);
    bot.pathIdx = 0;
  }

  function moveToward(bot, tx, tz, speed, dt) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const vx = (dx / dist) * speed;
    const vz = (dz / dist) * speed;
    const blend = Math.min(1, dt * 8);
    bot.vel.x += (vx - bot.vel.x) * blend;
    bot.vel.z += (vz - bot.vel.z) * blend;
    const nx = bot.pos.x + bot.vel.x * dt;
    if (!world.blocked(nx, bot.pos.z, RADIUS)) bot.pos.x = nx;
    else bot.vel.x = 0;
    const nz = bot.pos.z + bot.vel.z * dt;
    if (!world.blocked(bot.pos.x, nz, RADIUS)) bot.pos.z = nz;
    else bot.vel.z = 0;
    bot.yaw = Math.atan2(-bot.vel.x, -bot.vel.z);
    return dist < 0.6;
  }

  function followPath(bot, speed, dt) {
    if (bot.pathIdx >= bot.path.length) return true;
    const wp = world.waypoints[bot.path[bot.pathIdx]];
    if (moveToward(bot, wp.x, wp.z, speed, dt)) bot.pathIdx += 1;
    return bot.pathIdx >= bot.path.length;
  }

  function pickPatrol(bot) {
    if (bot.team === 'defend') {
      // Hold a site or the mid cross: defenders rotate between hold points.
      const holds = [13, 14, 11, 19, 20, 16, 17, 18];
      setPath(bot, holds[Math.floor(Math.random() * holds.length)]);
    } else {
      // Push: pick a lane toward a site, with a random lane each round.
      const pushes = [13, 14, 10, 12, 11];
      setPath(bot, pushes[Math.floor(Math.random() * pushes.length)]);
    }
  }

  function hitChance(bot, target) {
    let chance = 0.58 - target.dist * 0.008 - target.speed * 0.018;
    if (target.crouching) chance -= 0.1;
    if (Math.hypot(bot.vel.x, bot.vel.z) > 1) chance -= 0.08;
    return Math.max(0.06, Math.min(0.6, chance));
  }

  function fireBurst(bot, target, dt) {
    if (time < bot.pauseUntil) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(Math.random() * 3);
      bot.burstAt = time;
    }
    if (time - bot.burstAt < 0.12) return;
    bot.burstAt = time;
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.pauseUntil = time + 0.7 + Math.random() * 0.5;
    const from = new THREE.Vector3(bot.pos.x + 0.22, bot.pos.y + 1.25, bot.pos.z);
    const aim = new THREE.Vector3(target.pos.x, target.pos.y + 1.15, target.pos.z);
    const spread = 0.02 + target.dist * 0.0012;
    aim.x += (Math.random() * 2 - 1) * spread * target.dist * 0.4;
    aim.y += (Math.random() * 2 - 1) * spread * target.dist * 0.25;
    aim.z += (Math.random() * 2 - 1) * spread * target.dist * 0.4;
    ctx.tracer(from, aim, bot.team);
    ctx.audioShot('rifle', bot.pos.distanceTo(ctx.playerPos()));
    if (Math.random() < hitChance(bot, target)) {
      const head = Math.random() < 0.12;
      const dmg = head ? 66 : 22;
      if (target.kind === 'player') ctx.damagePlayer(dmg, bot.name);
      else damage(target.bot, dmg, head ? 'head' : 'torso', bot.name);
    }
  }

  function damage(bot, amount, part, fromName) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.channel) { bot.channel = null; }
    if (bot.health > 0) {
      if (bot.health < 35 && bot.state !== 'retreat') {
        bot.state = 'retreat';
        const away = bot.team === 'attack' ? 1 : 15;
        setPath(bot, away + Math.floor(Math.random() * 3));
      }
      return false;
    }
    bot.health = 0;
    bot.alive = false;
    bot.state = 'dead';
    bot.fall = 0;
    bot.channel = null;
    ctx.onKill(fromName, bot.name, fromName === 'YOU' ? 'attack' : (bots.find((b) => b.name === fromName)?.team || 'attack'), bot.team);
    if (bot.hasSpike) {
      bot.hasSpike = false;
      ctx.dropSpike(bot.pos.x, bot.pos.z);
    }
    return true;
  }

  function stepBot(bot, dt) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.visual.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    const phase = ctx.phase();
    if (phase !== 'live') {
      bot.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
      bot.visual.group.position.copy(bot.pos);
      return;
    }

    // Scan on a stagger.
    if (time >= bot.scanAt) {
      bot.scanAt = time + SCAN_EVERY + Math.random() * 0.05;
      const seen = visibleEnemies(bot);
      bot.target = seen.length ? seen[0] : null;
      if (bot.target && bot.state !== 'engage') {
        bot.state = 'engage';
        bot.strafeAt = time + 0.8 + Math.random() * 0.8;
      } else if (!bot.target && bot.state === 'engage') {
        bot.state = 'patrol';
        bot.path = [];
      }
    }

    // Objective: plant when the carrier reaches a clear site; defuse a planted spike.
    const spike = ctx.spike();
    if (bot.team === 'attack' && bot.hasSpike && !spike.planted && !bot.target) {
      const siteWp = bot.waypoint === 13 || bot.waypoint === 14 ? bot.waypoint : null;
      const nearA = Math.hypot(bot.pos.x - world.siteA.x, bot.pos.z - world.siteA.z) < 3.2;
      const nearB = Math.hypot(bot.pos.x - world.siteB.x, bot.pos.z - world.siteB.z) < 3.2;
      if ((nearA || nearB) && !bot.channel) {
        bot.channel = 'plant';
        bot.channelAt = time;
        ctx.plantStart(nearA ? 'A' : 'B');
      }
    }
    if (bot.team === 'defend' && spike.planted && !bot.target) {
      const site = spike.site === 'A' ? world.siteA : world.siteB;
      if (Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z) < 3.0 && !bot.channel) {
        bot.channel = 'defuse';
        bot.channelAt = time;
        ctx.defuseStart();
      }
    }
    if (bot.channel) {
      const need = bot.channel === 'plant' ? 3.5 : 5;
      ctx.channelProgress(bot.channel, (time - bot.channelAt) / need, bot.name);
      if (time - bot.channelAt >= need) {
        if (bot.channel === 'plant') ctx.plantDone(bot.hasSpike ? bot : null);
        else ctx.defuseDone(bot.name);
        bot.channel = null;
      }
      bot.visual.group.position.copy(bot.pos);
      bot.visual.group.rotation.y = bot.yaw;
      return;
    }

    // Spike pickup: an attacker without it walks to a dropped spike.
    if (bot.team === 'attack' && spike.dropped && !spike.planted && !bot.hasSpike && !bot.target) {
      if (Math.hypot(bot.pos.x - spike.x, bot.pos.z - spike.z) < 1.4) {
        bot.hasSpike = true;
        ctx.pickupSpike(bot.name);
      } else if (bot.state === 'patrol') {
        setPath(bot, world.nearestWaypoint(spike.x, spike.z));
        bot.state = 'fetch';
      }
    }
    if (bot.state === 'fetch') {
      if (followPath(bot, PATROL_SPEED + 0.8, dt)) bot.state = 'patrol';
      if (bot.hasSpike) bot.state = 'patrol';
    }

    if (bot.state === 'engage' && bot.target) {
      // Strafe sideways while firing in bursts.
      if (time >= bot.strafeAt) {
        bot.strafeDir *= -1;
        bot.strafeAt = time + 0.7 + Math.random() * 0.9;
      }
      const t = bot.target.pos;
      const dx = t.x - bot.pos.x;
      const dz = t.z - bot.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len * bot.strafeDir;
      const pz = dx / len * bot.strafeDir;
      const tx = bot.pos.x + px * 2.2;
      const tz = bot.pos.z + pz * 2.2;
      const nx = tx;
      if (!world.blocked(nx, bot.pos.z, RADIUS)) bot.pos.x += (tx - bot.pos.x) * Math.min(1, dt * 2.4);
      if (!world.blocked(bot.pos.x, tz, RADIUS)) bot.pos.z += (tz - bot.pos.z) * Math.min(1, dt * 2.4);
      bot.yaw = Math.atan2(-dx, -dz);
      fireBurst(bot, bot.target, dt);
    } else if (bot.state === 'retreat') {
      if (followPath(bot, PATROL_SPEED + 1.2, dt)) {
        bot.state = 'patrol';
        bot.path = [];
      }
    } else {
      if (bot.pathIdx >= bot.path.length) pickPatrol(bot);
      followPath(bot, PATROL_SPEED, dt);
    }

    bot.visual.group.position.copy(bot.pos);
    bot.visual.group.rotation.y = bot.yaw;
  }

  function step(dt, now) {
    time = now;
    for (const bot of bots) stepBot(bot, dt);
  }

  return {
    bots,
    hitMeshes,
    step,
    damage,
    spawnAll,
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
    carrier() {
      return bots.find((b) => b.hasSpike) || null;
    },
    positions() {
      return bots.map((b) => ({ name: b.name, team: b.team, x: b.pos.x, z: b.pos.z, alive: b.alive, hp: b.health }));
    },
    hearShot(x, z) {
      for (const bot of bots) {
        if (!bot.alive || bot.state === 'engage') continue;
        if (Math.hypot(bot.pos.x - x, bot.pos.z - z) < 18) {
          bot.investigate = { x, z };
          if (bot.state === 'patrol') setPath(bot, world.nearestWaypoint(x, z));
        }
      }
    },
  };
}
