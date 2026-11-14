// SANDLINE YARD: a dusk desert freight yard, 44 x 34 m, built from boxes. Two bomb
// sites (A west, B east), three lanes (A long, mid, B long), crates to crouch behind and
// containers for full cover. Every box is a collider for the player and a surface a
// bullet stops on. The waypoint graph is the bots' map: they patrol, push and hold on it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const W = 44;
const D = 34;

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(23,27,34,0.55)';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(4, 4, 120, 120);
  g.fillStyle = color;
  g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.04,
    });
  }
  const siteAMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.85 });
  const siteBMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.85 });

  const colliders = [];
  const shootables = [];
  // 2D blockers for ground bots: {minX,maxX,minZ,maxZ} of every box tall enough to stop a bot.
  const blockers = [];

  function box(w, h, d, x, y, z, material, block = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material] || material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    if (block) blockers.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: y + h / 2 });
    return mesh;
  }

  // Floor and perimeter walls (walls block, floor does not).
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.4, D + 0.4), materials.sand);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3().setFromObject(floor));
  shootables.push(floor);
  box(0.5, 4.6, D + 0.4, -W / 2 - 0.25, 2.3, 0, 'surface');
  box(0.5, 4.6, D + 0.4, W / 2 + 0.25, 2.3, 0, 'surface');
  box(W + 0.4, 4.6, 0.5, 0, 2.3, -D / 2 - 0.25, 'surface');
  box(W + 0.4, 4.6, 0.5, 0, 2.3, D / 2 + 0.25, 'surface');

  // Site pads: a low rust pad for A, a teal pad for B, with a floating letter board.
  function sitePad(cx, cz, mat, letter, color) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(7, 0.12, 7), mat);
    pad.position.set(cx, 0.06, cz);
    pad.receiveShadow = true;
    group.add(pad);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: letterTexture(letter, color), transparent: true, side: THREE.DoubleSide }),
    );
    board.position.set(cx, 4.4, cz);
    group.add(board);
    return { x: cx, z: cz, radius: 3.6 };
  }
  const siteA = sitePad(-16, -9, siteAMat, 'A', '#e0533d');
  const siteB = sitePad(16, -9, siteBMat, 'B', '#3fb8a6');

  // Mid: two containers with a gap (mid doors) and a central pillar for the cross.
  box(6.0, 2.6, 2.4, -5.2, 1.3, 0, 'rust');
  box(6.0, 2.6, 2.4, 5.2, 1.3, 0, 'rust');
  box(1.8, 4.2, 1.8, 0, 2.1, -1.5, 'hairline');
  box(2.2, 1.0, 2.2, -1.4, 0.5, 4.6, 'sand');
  box(2.2, 1.0, 2.2, 1.4, 0.5, -5.4, 'sand');

  // A long (west lane): staggered cover so every corner has a fight.
  box(1.2, 2.4, 5.0, -13, 1.2, 6, 'surface');
  box(4.4, 1.0, 1.2, -17.5, 0.5, 1.5, 'sand');
  box(1.2, 1.0, 3.4, -19.5, 0.5, -4.5, 'sand');
  box(3.0, 1.8, 1.2, -11, 0.9, -5.5, 'hairline');
  box(1.2, 1.0, 1.2, -13.5, 0.5, -9.5, 'sand');
  box(2.4, 2.6, 2.4, -19, 1.3, -12.5, 'rust');
  // B long (east lane), mirrored in spirit, not in copy.
  box(1.2, 2.4, 5.0, 13, 1.2, 6, 'surface');
  box(4.4, 1.0, 1.2, 17.5, 0.5, 1.5, 'sand');
  box(1.2, 1.0, 3.4, 19.5, 0.5, -4.5, 'sand');
  box(3.0, 1.8, 1.2, 11, 0.9, -5.5, 'hairline');
  box(1.2, 1.0, 1.2, 13.5, 0.5, -9.5, 'sand');
  box(2.4, 2.6, 2.4, 19, 1.3, -12.5, 'rust');

  // Defender back line and attacker spawn cover.
  box(5.0, 1.0, 1.2, -8, 0.5, -13.5, 'hairline');
  box(5.0, 1.0, 1.2, 8, 0.5, -13.5, 'hairline');
  box(4.0, 1.0, 1.2, -6, 0.5, 13.5, 'sand');
  box(4.0, 1.0, 1.2, 6, 0.5, 13.5, 'sand');
  box(1.2, 1.8, 1.2, 0, 0.9, 11, 'hairline');

  // A low sun disc on the western horizon, beyond the wall: pure backdrop, no collision.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(5, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), fog: false }),
  );
  sun.position.set(-60, 7, -18);
  sun.lookAt(0, 4, 0);
  scene.add(sun);

  // Dusk light: a warm low key from the west, a cool fill, and a sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8fa3c0'), new THREE.Color(PALETTE.sand), 0.85);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.4);
  key.position.set(-24, 12, 6);
  key.target.position.set(4, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5f7ea8'), 0.5);
  fill.position.set(14, 10, 12);
  scene.add(fill);

  // Waypoints: the bots' map. Links are bidirectional; bots walk edges, never through walls.
  const waypoints = [
    { x: -18, z: 13 }, { x: 0, z: 13 }, { x: 18, z: 13 }, // attacker spawn line
    { x: -14, z: 7 }, { x: 0, z: 8 }, { x: 14, z: 7 }, // attacker mid
    { x: -18, z: 2 }, { x: -9, z: 3 }, { x: 9, z: 3 }, { x: 18, z: 2 }, // lanes
    { x: -16, z: -5 }, { x: 0, z: -5 }, { x: 16, z: -5 }, // mid doors / site approach
    { x: -16, z: -9 }, { x: 16, z: -9 }, // sites A / B
    { x: -19, z: -14 }, { x: -8, z: -14 }, { x: 8, z: -14 }, { x: 19, z: -14 }, // defender back
    { x: -3.4, z: -8 }, { x: 3.4, z: -8 }, // mid cross cover
    { x: -9, z: -11 }, { x: 9, z: -11 }, // site holds
    { x: 0, z: 0 }, // mid gap
  ];
  const links = [
    [0, 3], [1, 4], [2, 5], [3, 4], [4, 5], [0, 1], [1, 2],
    [3, 6], [4, 7], [4, 8], [5, 9], [6, 10], [7, 10], [7, 11], [8, 11], [8, 12], [9, 12],
    [10, 13], [11, 13], [11, 14], [12, 14], [10, 15], [13, 15], [13, 20], [14, 17], [14, 21],
    [15, 16], [16, 17], [17, 18], [11, 19], [11, 20], [13, 19], [14, 20],
    [7, 23], [8, 23], [19, 23], [20, 23], [23, 11],
  ];
  const adjacency = waypoints.map(() => []);
  for (const [a, b] of links) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  function nearestWaypoint(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < waypoints.length; i += 1) {
      const d = (waypoints[i].x - x) ** 2 + (waypoints[i].z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Breadth-first route on the waypoint graph.
  function route(from, to) {
    if (from === to) return [to];
    const prev = new Array(waypoints.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length) {
      const cur = queue.shift();
      for (const next of adjacency[cur]) {
        if (prev[next] !== -1) continue;
        prev[next] = cur;
        if (next === to) {
          const path = [to];
          let node = to;
          while (node !== from) { node = prev[node]; path.unshift(node); }
          return path;
        }
        queue.push(next);
      }
    }
    return [to];
  }

  // 2D circle-vs-blocker test for ground movement (bots and the spike carrier check).
  function blocked(x, z, r) {
    if (x < -W / 2 + r || x > W / 2 - r || z < -D / 2 + r || z > D / 2 - r) return true;
    for (const b of blockers) {
      if (b.top < 0.3) continue;
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  }

  const raycaster = new THREE.Raycaster();
  const losFrom = new THREE.Vector3();
  const losTo = new THREE.Vector3();
  const losDir = new THREE.Vector3();
  // Line of sight between two eye-height points, against world geometry only.
  function losClear(ax, ay, az, bx, by, bz) {
    losFrom.set(ax, ay, az);
    losTo.set(bx, by, bz);
    losDir.copy(losTo).sub(losFrom);
    const dist = losDir.length();
    if (dist < 0.01) return true;
    losDir.normalize();
    raycaster.set(losFrom, losDir);
    raycaster.far = dist;
    return raycaster.intersectObjects(shootables, false).length === 0;
  }

  return {
    colliders,
    shootables,
    blockers,
    siteA,
    siteB,
    waypoints,
    adjacency,
    nearestWaypoint,
    route,
    blocked,
    losClear,
    spawns: {
      attack: [[-4, 14], [0, 14.5], [4, 14]],
      defend: [[-8, -14.5], [0, -15], [8, -14.5]],
    },
    bounds: { W, D },
  };
}
