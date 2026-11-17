// Solmar Bay city builder: ground, roads, sidewalks, beach and sea, the
// 8x8 blocks of buildings, palms, streetlights and plaza props. Exports the
// colliders (building AABBs) the player, cars and AI all collide against,
// plus the road lines traffic drives on.

import * as THREE from 'three';
import { CONFIG, PALETTE, rand, randPick } from './config.js';

// Procedural window texture drawn on a canvas at runtime — no image files.
function makeWindowTexture(baseColor, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 6; col++) {
      const lit = Math.random() < litRatio;
      ctx.fillStyle = lit ? '#ffe9a8' : '#2c3e50';
      ctx.fillRect(8 + col * 20, 10 + row * 20, 12, 12);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm(height) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.palmTrunk, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: PALETTE.palmLeaf, roughness: 0.8 });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.24, height, 6),
    trunkMat,
  );
  trunk.position.y = height / 2;
  trunk.rotation.z = 0.08;
  group.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.9, height + 0.15, Math.sin(a) * 0.9);
    leaf.rotation.z = Math.PI / 2.4;
    leaf.rotation.y = -a;
    group.add(leaf);
  }
  return group;
}

function makeStreetlight() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.6, metalness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6), mat);
  pole.position.y = 2.7;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), mat);
  arm.position.set(0.8, 5.35, 0);
  group.add(arm);
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 0.9 }),
  );
  lamp.position.set(1.5, 5.3, 0);
  group.add(lamp);
  return group;
}

// Block centres: 8 x 8 grid from -182 to +182 on both axes.
export function blockCenter(bx, bz) {
  const half = CONFIG.cityHalf;
  const step = CONFIG.pitch;
  return { x: -half + step / 2 + bx * step, z: -half + step / 2 + bz * step };
}

// Road centre lines (world coordinates) on each axis.
export function roadLines() {
  const lines = [];
  for (let i = 0; i <= CONFIG.blocks; i++) {
    lines.push(-CONFIG.cityHalf + i * CONFIG.pitch);
  }
  return lines;
}

// The two park blocks, the plaza block and the docks block stay open (no buildings).
const OPEN_BLOCKS = new Set(['2,5', '5,2', '4,4', '0,7']);

export function buildCity(scene) {
  const colliders = [];
  const windowTextures = PALETTE.buildings.map((c) => {
    const hex = '#' + c.toString(16).padStart(6, '0');
    return makeWindowTexture(hex, 0.22);
  });

  // --- Ground: big asphalt slab under the whole city grid ---
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(CONFIG.cityHalf * 2 + 24, 1, CONFIG.cityHalf * 2 + 24),
    new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.95 }),
  );
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Sidewalk slabs per block (raised 0.12, lighter) ---
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 0.9 });
  for (let bx = 0; bx < CONFIG.blocks; bx++) {
    for (let bz = 0; bz < CONFIG.blocks; bz++) {
      const c = blockCenter(bx, bz);
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(CONFIG.blockSize + 4, 0.24, CONFIG.blockSize + 4),
        sidewalkMat,
      );
      slab.position.set(c.x, 0.12, c.z);
      slab.receiveShadow = true;
      scene.add(slab);
    }
  }

  // --- Road centre dashes ---
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf5e9c8, roughness: 0.8 });
  const lines = roadLines();
  for (const lx of lines) {
    for (let z = -CONFIG.cityHalf + 8; z < CONFIG.cityHalf - 4; z += 12) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 4), dashMat);
      dash.position.set(lx, 0.06, z);
      scene.add(dash);
    }
    for (let x = -CONFIG.cityHalf + 8; x < CONFIG.cityHalf - 4; x += 12) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(4, 0.05, 0.5), dashMat);
      dash.position.set(x, 0.06, lx);
      scene.add(dash);
    }
  }

  // --- Beach sand strip and sea, east of the city ---
  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(CONFIG.beachEnd - CONFIG.beachStart, 0.5, CONFIG.cityHalf * 2 + 40),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
  );
  sand.position.set((CONFIG.beachStart + CONFIG.beachEnd) / 2, 0.1, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.seaEnd - CONFIG.seaStart, CONFIG.cityHalf * 2 + 600),
    new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.25, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set((CONFIG.seaStart + CONFIG.seaEnd) / 2, 0.05, 0);
  scene.add(sea);

  // Boardwalk strip between city and sand
  const boardwalk = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.3, CONFIG.cityHalf * 2 + 20),
    new THREE.MeshStandardMaterial({ color: 0xb98a5e, roughness: 0.9 }),
  );
  boardwalk.position.set(CONFIG.beachStart - 2, 0.15, 0);
  scene.add(boardwalk);

  // --- Buildings: 1-3 towers per block, varied height and colour ---
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a5f68, roughness: 0.9 });
  for (let bx = 0; bx < CONFIG.blocks; bx++) {
    for (let bz = 0; bz < CONFIG.blocks; bz++) {
      if (OPEN_BLOCKS.has(`${bx},${bz}`)) continue;
      const c = blockCenter(bx, bz);
      const count = Math.random() < 0.45 ? 1 : 2;
      for (let k = 0; k < count; k++) {
        const w = rand(12, 20);
        const d = rand(12, 20);
        const h = rand(9, 58);
        const ox = count === 1 ? 0 : (k === 0 ? -9 : 9);
        const oz = count === 1 ? 0 : (k === 0 ? 9 : -9);
        const texIndex = Math.floor(Math.random() * windowTextures.length);
        const mat = new THREE.MeshStandardMaterial({
          map: windowTextures[texIndex],
          roughness: 0.85,
        });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(c.x + ox, h / 2 + 0.24, c.z + oz);
        tower.castShadow = true;
        tower.receiveShadow = true;
        scene.add(tower);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), roofMat);
        roof.position.set(c.x + ox, h + 0.6, c.z + oz);
        scene.add(roof);
        // Rooftop AC box on tall towers
        if (h > 30) {
          const ac = new THREE.Mesh(
            new THREE.BoxGeometry(3, 1.6, 3),
            new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.8 }),
          );
          ac.position.set(c.x + ox + 3, h + 1.6, c.z + oz - 3);
          scene.add(ac);
        }
        colliders.push({
          minX: c.x + ox - w / 2, maxX: c.x + ox + w / 2,
          minZ: c.z + oz - d / 2, maxZ: c.z + oz + d / 2,
        });
      }
    }
  }

  // --- Parks: grass, palms, benches ---
  const grassMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 1 });
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 });
  for (const key of ['2,5', '5,2']) {
    const [bx, bz] = key.split(',').map(Number);
    const c = blockCenter(bx, bz);
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(38, 0.3, 38), grassMat);
    lawn.position.set(c.x, 0.28, c.z);
    lawn.receiveShadow = true;
    scene.add(lawn);
    for (let i = 0; i < 5; i++) {
      const palm = makePalm(rand(4, 6.5));
      palm.position.set(c.x + rand(-16, 16), 0.4, c.z + rand(-16, 16));
      scene.add(palm);
    }
    for (let i = 0; i < 3; i++) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.8), benchMat);
      bench.position.set(c.x + rand(-14, 14), 0.7, c.z + rand(-14, 14));
      bench.rotation.y = rand(0, Math.PI);
      scene.add(bench);
    }
  }

  // --- Palms Plaza (4,4): fountain + palms ---
  {
    const c = blockCenter(4, 4);
    const plazaMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.9 });
    const plaza = new THREE.Mesh(new THREE.BoxGeometry(40, 0.3, 40), plazaMat);
    plaza.position.set(c.x, 0.28, c.z);
    scene.add(plaza);
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 5.6, 1.1, 20),
      new THREE.MeshStandardMaterial({ color: 0x9fb8c8, roughness: 0.4 }),
    );
    fountain.position.set(c.x, 0.9, c.z);
    scene.add(fountain);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 4.4, 0.3, 20),
      new THREE.MeshStandardMaterial({ color: 0x2e8fb8, roughness: 0.2 }),
    );
    water.position.set(c.x, 1.4, c.z);
    scene.add(water);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const palm = makePalm(rand(4.5, 6));
      palm.position.set(c.x + Math.cos(a) * 15, 0.4, c.z + Math.sin(a) * 15);
      scene.add(palm);
    }
  }

  // --- Beach palms, umbrellas and streetlights along the boardwalk ---
  const umbrellaMat = new THREE.MeshStandardMaterial({ color: 0xe85d75, roughness: 0.8 });
  for (let z = -180; z <= 180; z += 36) {
    const palm = makePalm(rand(5, 7));
    palm.position.set(CONFIG.beachStart + 12, 0.35, z + rand(-6, 6));
    scene.add(palm);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e8 }),
    );
    pole.position.set(CONFIG.beachStart + 20, 1.5, z + 12);
    scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.9, 8), umbrellaMat);
    top.position.set(CONFIG.beachStart + 20, 2.9, z + 12);
    scene.add(top);
  }
  for (const lx of lines) {
    for (let z = -CONFIG.cityHalf + 26; z < CONFIG.cityHalf; z += 52) {
      const light = makeStreetlight();
      light.position.set(lx + 7, 0, z);
      light.rotation.y = Math.PI / 2;
      scene.add(light);
    }
  }

  // --- Docks yard at the south edge (block 0,7): concrete slab, crates, containers ---
  {
    const c = blockCenter(0, 7);
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(40, 0.3, 40),
      new THREE.MeshStandardMaterial({ color: 0x7a7f88, roughness: 0.95 }),
    );
    slab.position.set(c.x, 0.28, c.z);
    slab.receiveShadow = true;
    scene.add(slab);
  }
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xa8763e, roughness: 0.9 });
  const containerMat = new THREE.MeshStandardMaterial({ color: 0x3e6fa8, roughness: 0.7 });
  for (let i = 0; i < 6; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), crateMat);
    crate.position.set(-196 + i * 5, 1.4, 186 + (i % 2) * 4);
    crate.rotation.y = rand(0, 0.8);
    crate.castShadow = true;
    scene.add(crate);
    colliders.push({
      minX: crate.position.x - 1.4, maxX: crate.position.x + 1.4,
      minZ: crate.position.z - 1.4, maxZ: crate.position.z + 1.4,
    });
  }
  for (let i = 0; i < 3; i++) {
    const cont = new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 2.6), containerMat);
    cont.position.set(-190 + i * 12, 1.5, 198);
    cont.castShadow = true;
    scene.add(cont);
    colliders.push({
      minX: cont.position.x - 4.2, maxX: cont.position.x + 4.2,
      minZ: cont.position.z - 1.5, maxZ: cont.position.z + 1.5,
    });
  }

  return { colliders, roadLines: lines };
}

// Circle-vs-AABB push-out used by the player, cars and AI. Returns the
// corrected position (mutates nothing) and whether a collision happened.
export function resolveCircleCollision(x, z, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - radius;
        else if (m === pr) x = c.maxX + radius;
        else if (m === pt) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    }
  }
  return { x, z, hit };
}

// True when a point is on a road (within half the road width of a road line).
export function isOnRoad(x, z) {
  const half = CONFIG.roadWidth / 2 + 1;
  const lines = roadLines();
  for (const l of lines) {
    if (Math.abs(x - l) < half || Math.abs(z - l) < half) return true;
  }
  return false;
}
