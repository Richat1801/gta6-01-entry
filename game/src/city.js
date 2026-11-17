// Solmar Bay city builder: ground, roads, beach, sea, buildings, lights and palms.
// One job: turn the empty scene into the 8x8 coastal city and hand back its colliders.

import * as THREE from 'three';
import { WORLD, PALETTE, roadCenter, rand, randInt, pick } from './config.js';

function makeWindowTexture(baseColor, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 128, 256);
  const cols = 4;
  const rows = 10;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = Math.random() < litRatio;
      ctx.fillStyle = lit ? '#ffd98a' : '#22303e';
      ctx.fillRect(8 + col * 30, 10 + r * 24, 20, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildGround(scene) {
  // Land only: the ground stops at the sand so the sea stays visible.
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x8a9a6a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(530, 500), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(241, -0.05, 224);
  scene.add(ground);

  // City asphalt slab under the road grid.
  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.citySpan, WORLD.citySpan),
    new THREE.MeshLambertMaterial({ color: PALETTE.asphalt })
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.set(WORLD.citySpan / 2, 0, WORLD.citySpan / 2);
  scene.add(slab);

  // Road centre dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  for (let k = 0; k < WORLD.gridBlocks; k++) {
    const c = roadCenter(k);
    for (let t = 24; t < WORLD.citySpan - 8; t += 28) {
      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 6), dashMat);
      dashV.rotation.x = -Math.PI / 2;
      dashV.position.set(c, 0.02, t);
      scene.add(dashV);
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), dashMat);
      dashH.rotation.x = -Math.PI / 2;
      dashH.position.set(t, 0.02, c);
      scene.add(dashH);
    }
  }
}

function buildBeachAndSea(scene, seaMesh) {
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.seaStart - WORLD.beachStart + 8, WORLD.citySpan + 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((WORLD.beachStart + WORLD.seaStart) / 2, 0.01, WORLD.citySpan / 2);
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 760),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(WORLD.seaStart + 160, -0.4, WORLD.citySpan / 2);
  scene.add(sea);
  seaMesh.mesh = sea;
}

function buildBuildings(scene, colliders) {
  const geoCache = new Map();
  const downtown = { x: WORLD.citySpan / 2, z: WORLD.citySpan / 2 };
  const landmarkBlocks = new Set(['6,6', '3,3', '0,0']); // hotel, bank, safehouse plots
  for (let i = 0; i < WORLD.gridBlocks - 1; i++) {
    for (let j = 0; j < WORLD.gridBlocks - 1; j++) {
      if (landmarkBlocks.has(i + ',' + j)) continue;
      const bx0 = roadCenter(i) + WORLD.roadWidth / 2 + 2;
      const bz0 = roadCenter(j) + WORLD.roadWidth / 2 + 2;
      const bx1 = roadCenter(i + 1) - WORLD.roadWidth / 2 - 2;
      const bz1 = roadCenter(j + 1) - WORLD.roadWidth / 2 - 2;
      const cx = (bx0 + bx1) / 2;
      const cz = (bz0 + bz1) / 2;
      const distDowntown = Math.hypot(cx - downtown.x, cz - downtown.z);
      const tall = distDowntown < 130;
      const color = pick(PALETTE.building);
      const tex = makeWindowTexture(color, 0.35);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const count = tall ? 1 : randInt(1, 2);
      if (count === 1) {
        const w = bx1 - bx0 - rand(2, 8);
        const d = bz1 - bz0 - rand(2, 8);
        const h = tall ? rand(34, 62) : rand(10, 26);
        const key = `${Math.round(w)}x${Math.round(h)}x${Math.round(d)}`;
        if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
        const b = new THREE.Mesh(geoCache.get(key), mat);
        b.position.set(cx, h / 2, cz);
        scene.add(b);
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        if (tall && Math.random() < 0.6) {
          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(3, 3, 3),
            new THREE.MeshLambertMaterial({ color: 0x666666 })
          );
          roof.position.set(cx + w / 4, h + 1.5, cz);
          scene.add(roof);
        }
      } else {
        for (let q = 0; q < 2; q++) {
          const w = (bx1 - bx0) / 2 - 4;
          const d = bz1 - bz0 - 6;
          const h = rand(8, 18);
          const key = `s${Math.round(w)}x${Math.round(h)}x${Math.round(d)}`;
          if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
          const b = new THREE.Mesh(geoCache.get(key), mat);
          const x = bx0 + 2 + w / 2 + q * (w + 4);
          b.position.set(x, h / 2, cz);
          scene.add(b);
          colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        }
      }
      // Sidewalk slab for the block.
      const walk = new THREE.Mesh(
        new THREE.PlaneGeometry(bx1 - bx0 + 4, bz1 - bz0 + 4),
        new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk })
      );
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(cx, 0.015, cz);
      scene.add(walk);
    }
  }
}

function buildStreetlights(scene) {
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2f3336 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let i = 0; i < WORLD.gridBlocks; i++) {
    for (let j = 0; j < WORLD.gridBlocks; j++) {
      if ((i + j) % 2 === 1) continue;
      const x = roadCenter(i) + WORLD.roadWidth / 2 + 1;
      const z = roadCenter(j) + WORLD.roadWidth / 2 + 1;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
      pole.position.set(x, 3, z);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bulbMat);
      bulb.position.set(x, 6.1, z);
      scene.add(bulb);
    }
  }
}

function buildPalms(scene, colliders) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b42 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e5f });
  for (let z = 20; z < WORLD.citySpan; z += 34) {
    const x = rand(WORLD.beachStart + 8, WORLD.seaStart - 14);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat);
    trunk.position.set(x, 3.5, z);
    trunk.rotation.z = rand(-0.12, 0.12);
    scene.add(trunk);
    for (let l = 0; l < 5; l++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
      const a = (l / 5) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.2, 7.2, z + Math.sin(a) * 1.2);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      scene.add(leaf);
    }
    colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
  }
  // A few palms on the main boulevard too.
  for (let k = 0; k < WORLD.gridBlocks; k++) {
    const z = roadCenter(k) + 11;
    const x = 120;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 6), trunkMat);
    trunk.position.set(x, 3, z);
    scene.add(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), leafMat);
    top.position.set(x, 6.6, z);
    scene.add(top);
  }
}

function buildLandmarks(scene, colliders) {
  // Solmar Hotel — tall glass tower at the delivery point.
  const hotel = new THREE.Mesh(
    new THREE.BoxGeometry(26, 54, 22),
    new THREE.MeshLambertMaterial({ map: makeWindowTexture(0x7fb3c8, 0.6) })
  );
  hotel.position.set(372, 27, 372);
  scene.add(hotel);
  colliders.push({ minX: 359, maxX: 385, minZ: 361, maxZ: 383 });
  // Bay Bank — marble block with columns.
  const bank = new THREE.Mesh(
    new THREE.BoxGeometry(24, 16, 20),
    new THREE.MeshLambertMaterial({ color: 0xe8e0cc })
  );
  bank.position.set(204, 8, 204);
  scene.add(bank);
  colliders.push({ minX: 192, maxX: 216, minZ: 194, maxZ: 214 });
  // Marina pier jutting into the sea.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(60, 1.2, 10),
    new THREE.MeshLambertMaterial({ color: 0x9a7b52 })
  );
  pier.position.set(520, 0.6, 400);
  scene.add(pier);
  // Safehouse — small coral house.
  const safe = new THREE.Mesh(
    new THREE.BoxGeometry(12, 7, 10),
    new THREE.MeshLambertMaterial({ color: 0xd96a5f })
  );
  safe.position.set(36, 3.5, 36);
  scene.add(safe);
  colliders.push({ minX: 30, maxX: 42, minZ: 31, maxZ: 41 });
}

/** Build the whole city into the scene; returns { colliders, seaMesh }. */
export function buildCity(scene) {
  const colliders = [];
  const seaMesh = { mesh: null };
  buildGround(scene);
  buildBeachAndSea(scene, seaMesh);
  buildBuildings(scene, colliders);
  buildStreetlights(scene);
  buildPalms(scene, colliders);
  buildLandmarks(scene, colliders);
  return { colliders, seaMesh };
}

/** Push a circle (x,z,r) out of every building AABB it overlaps; returns true on hit. */
export function resolveBuildingCollision(colliders, pos, radius) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        pos.x += radius;
      }
    }
  }
  return hit;
}
