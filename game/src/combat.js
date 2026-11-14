// Combat: the player's hitscan shots, tracers, and the frag grenade. A shot is one ray
// from the camera: world geometry stops it, a bot torso or head takes it (head shots
// hurt more), and a tracer line shows where it went. The grenade is a small physics
// body: gravity, a bounce off the world, a 1.6 s fuse, then area damage.
import * as THREE from 'three';

const TRACER_LIFE = 0.09;
const MAX_TRACERS = 24;

export function createCombat(scene, world, ctx) {
  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  const tracers = [];
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a'), transparent: true, opacity: 0.9 });
  const tracerGeo = new THREE.BoxGeometry(0.012, 0.012, 1);
  const muzzleLocal = new THREE.Vector3(0.22, -0.17, -0.95);
  const grenades = [];
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#232830'), roughness: 0.5, metalness: 0.5 });
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const flashLight = new THREE.PointLight(new THREE.Color('#ffb45e'), 0, 14);
  scene.add(flashLight);
  let flashLeft = 0;

  function addTracer(from, to, color = '#ffd27a') {
    let line = tracers.find((t) => t.life <= 0);
    if (!line) {
      if (tracers.length >= MAX_TRACERS) return;
      const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
      mesh.material.color.set(color);
      scene.add(mesh);
      line = { mesh, life: 0 };
      tracers.push(line);
    }
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const len = from.distanceTo(to);
    line.mesh.position.copy(mid);
    line.mesh.scale.set(1, 1, Math.max(0.1, len));
    line.mesh.lookAt(to);
    line.mesh.material.opacity = 0.85;
    line.life = TRACER_LIFE;
  }

  // One player shot. Returns 'head' | 'torso' | 'wall' | 'none', and reports the kill.
  function shoot(camera, weapon, spread, random) {
    if (!weapon.takeRound()) return 'empty';
    camera.getWorldDirection(direction);
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
    direction.normalize();
    const pellets = weapon.def.pellets || 1;
    let result = 'none';
    const shootables = world.shootables.concat(ctx.botHitMeshes());
    for (let p = 0; p < pellets; p += 1) {
      const dir = direction.clone();
      if (pellets > 1) {
        dir.x += (random() * 2 - 1) * 0.02;
        dir.y += (random() * 2 - 1) * 0.02;
        dir.z += (random() * 2 - 1) * 0.02;
        dir.normalize();
      }
      raycaster.set(camera.position, dir);
      raycaster.far = weapon.def.range;
      const hit = raycaster.intersectObjects(shootables, false)[0];
      // The tracer starts at the muzzle in camera space, never against the lens.
      const from = camera.localToWorld(muzzleLocal.clone());
      if (!hit) {
        const end = camera.position.clone().add(dir.clone().multiplyScalar(weapon.def.range));
        addTracer(from, end);
        continue;
      }
      addTracer(from, hit.point);
      const obj = hit.object;
      if (obj.userData.bot) {
        const bot = obj.userData.bot;
        const part = obj.userData.part || 'torso';
        const dmg = weapon.def.damage * (part === 'head' ? weapon.def.headMult : 1);
        const killed = ctx.damageBot(bot, dmg, part, 'YOU');
        result = killed ? 'kill' : part;
      } else {
        result = result === 'none' ? 'wall' : result;
      }
    }
    weapon.pullTrigger();
    return result;
  }

  function throwGrenade(from, dir) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.position.copy(from);
    scene.add(mesh);
    grenades.push({
      mesh,
      vel: dir.clone().multiplyScalar(13).add(new THREE.Vector3(0, 4.5, 0)),
      fuse: 1.6,
    });
  }

  function explode(g) {
    scene.remove(g.mesh);
    flashLight.position.copy(g.mesh.position).add(new THREE.Vector3(0, 0.6, 0));
    flashLight.intensity = 60;
    flashLeft = 0.18;
    ctx.audioExplosion();
    const center = g.mesh.position;
    // Player: falloff by distance, half through armor is handled by player.damage.
    const p = ctx.playerPos();
    const pd = Math.hypot(p.x - center.x, p.z - center.z);
    if (ctx.playerAlive() && pd < 6.5) {
      const dmg = 120 * Math.max(0.25, 1 - pd / 6.5);
      if (ctx.damagePlayer(dmg, 'FRAG')) ctx.onKill('FRAG', 'YOU', 'attack', 'attack');
    }
    for (const bot of ctx.bots()) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.pos.x - center.x, bot.pos.z - center.z);
      if (d < 6.5) {
        const dmg = 120 * Math.max(0.25, 1 - d / 6.5);
        ctx.damageBot(bot, dmg, 'torso', 'FRAG');
      }
    }
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / TRACER_LIFE) * 0.85;
        if (t.life <= 0) t.mesh.visible = false;
      } else {
        t.mesh.visible = false;
      }
    }
    if (flashLeft > 0) {
      flashLeft -= dt;
      flashLight.intensity = Math.max(0, flashLeft / 0.18) * 60;
      if (flashLeft <= 0) flashLight.intensity = 0;
    }
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      const next = g.mesh.position.clone().addScaledVector(g.vel, dt);
      // Cheap bounce: test the next position against the world blockers as a point.
      if (world.blocked(next.x, next.z, 0.1) || next.y < 0.09) {
        if (next.y < 0.09) { next.y = 0.09; g.vel.y = Math.abs(g.vel.y) * 0.35; }
        else { g.vel.x *= -0.4; g.vel.z *= -0.4; }
        g.vel.multiplyScalar(0.7);
      }
      g.mesh.position.copy(next);
      if (g.fuse <= 0) {
        explode(g);
        grenades.splice(i, 1);
      }
    }
  }

  return { shoot, throwGrenade, addTracer, step };
}
