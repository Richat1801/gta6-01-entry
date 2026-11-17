// Solmar Bay — the procedural coastal city: 8x8 blocks, beach, marina, downtown.
// One job: build the static world and hand back its colliders, road loops,
// parked-car spots and the named places missions use.
// Buildings sit INSIDE their block (inset from the block edge) so none ever
// lands on a road. Every collider is an XZ axis-aligned box.

import * as THREE from 'three';
import { WORLD, mulberry32, pick } from './config.js';

const PALETTE = {
  road: 0x2e3138,
  sidewalk: 0x8f8a80,
  sand: 0xe8d5a4,
  water: 0x1e6f8e,
  grass: 0x5d8a4a,
  building: [0xd8cfc0, 0xb8a88f, 0x9fb4c0, 0xc9b8a3, 0xa8b8c8, 0xd0b8a0, 0x8fa3b0],
  downtown: [0x6a7d90, 0x7d8ea0, 0x5d6d7d, 0x8a9aa8],
  roof: [0x6b5d4f, 0x7a6a58, 0x5d6b5a],
};

export function buildCity(scene) {
  const rng = mulberry32(20261117);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'SolmarBayCity';

  const addCollider = (cx, cz, w, d) => {
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  };

  // --- Ground: grass base, road grid, sidewalks, beach sand, sea ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 320, WORLD.half * 2 + 320),
    new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 60);
  ground.receiveShadow = true;
  group.add(ground);

  const roadMat = new THREE.MeshStandardMaterial({ color: PALETTE.road, roughness: 0.95 });
  const walkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
  for (let i = 0; i <= WORLD.blocks; i++) {
    const c = WORLD.roadCenter(i);
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.road, WORLD.half * 2), roadMat);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(c, 0, 0);
    vRoad.receiveShadow = true;
    group.add(vRoad);
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2, WORLD.road), roadMat);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0, c);
    hRoad.receiveShadow = true;
    group.add(hRoad);
  }
  // Road centre dashes (thin pale strips along each road centreline).
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d2a0 });
  for (let i = 0; i <= WORLD.blocks; i++) {
    const c = WORLD.roadCenter(i);
    for (let d = -WORLD.half + 8; d < WORLD.half - 8; d += 12) {
      const dv = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), dashMat);
      dv.rotation.x = -Math.PI / 2; dv.position.set(c, 0.02, d); group.add(dv);
      const dh = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
      dh.rotation.x = -Math.PI / 2; dh.position.set(d, 0.02, c); group.add(dh);
    }
  }

  // --- Beach sand strip and sea, south of the city (z beyond +half) ---
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 120, WORLD.sandEnd - WORLD.beachStart),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, (WORLD.beachStart + WORLD.sandEnd) / 2);
  sand.receiveShadow = true;
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 320),
    new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.25, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.0, WORLD.waterStart + 160);
  group.add(sea);

  // Beach props: umbrellas and a lifeguard tower, all south of the roads.
  const umbrellaColors = [0xe85d3d, 0x3d8fe8, 0xf2c14e, 0x7bc47f];
  for (let i = 0; i < 7; i++) {
    const ux = -160 + i * 52 + rng() * 20;
    const uz = 218 + rng() * 16;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    pole.position.set(ux, 1.3, uz);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.0, 8),
      new THREE.MeshStandardMaterial({ color: umbrellaColors[i % 4], roughness: 0.8 }));
    top.position.set(ux, 3.0, uz);
    group.add(top);
  }

  // --- Buildings: one to four per block, inset 5 units from the block edge ---
  const boxGeoCache = new Map();
  function box(w, h, d, color) {
    const key = w + 'x' + h + 'x' + d + ':' + color;
    if (!boxGeoCache.has(key)) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
      m.castShadow = true; m.receiveShadow = true;
      boxGeoCache.set(key, m);
    }
    const mesh = boxGeoCache.get(key).clone();
    mesh.material = boxGeoCache.get(key).material;
    return mesh;
  }
  function windowsFor(mesh, w, h, d, floors) {
    const winMat = new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.3, metalness: 0.4, emissive: 0x1a2028, emissiveIntensity: 0.4 });
    const rows = Math.max(1, Math.floor(floors));
    for (let r = 0; r < rows; r++) {
      const y = -h / 2 + 2.2 + r * 3.0;
      if (y > h / 2 - 1.2) break;
      const cols = Math.max(1, Math.floor(w / 4));
      for (let c = 0; c < cols; c++) {
        const x = -w / 2 + 2 + c * 4;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.8), winMat);
        win.position.set(x, y, d / 2 + 0.03);
        mesh.add(win);
        const win2 = win.clone();
        win2.position.z = -d / 2 - 0.03;
        win2.rotation.y = Math.PI;
        mesh.add(win2);
      }
    }
  }

  const downtown = [];
  for (let bx = 0; bx < WORLD.blocks; bx++) {
    for (let bz = 0; bz < WORLD.blocks; bz++) {
      const cx = WORLD.blockCenter(bx);
      const cz = WORLD.blockCenter(bz);
      const isDowntown = Math.abs(bx - 3.5) <= 1.5 && Math.abs(bz - 3.5) <= 1.5;
      const isMarinaBlock = bx <= 1 && bz >= 6;
      if (isMarinaBlock) continue; // marina quarter stays low: docks, warehouses, open lots
      const count = isDowntown ? 1 : (rng() < 0.5 ? 2 : 1);
      if (count === 1) {
        const w = 16 + rng() * 8, d = 16 + rng() * 8;
        const h = isDowntown ? 34 + rng() * 42 : 7 + rng() * 12;
        const color = pick(rng, isDowntown ? PALETTE.downtown : PALETTE.building);
        const b = box(w, h, d, color);
        b.position.set(cx, h / 2, cz);
        windowsFor(b, w, h, d, h / 3);
        group.add(b);
        addCollider(cx, cz, w, d);
        if (isDowntown) downtown.push({ x: cx, z: cz, h });
      } else {
        for (let k = 0; k < 2; k++) {
          const ox = (k === 0 ? -8 : 8) + (rng() - 0.5) * 4;
          const oz = (rng() - 0.5) * 12;
          const w = 12 + rng() * 4, d = 12 + rng() * 6;
          const h = 6 + rng() * 9;
          const b = box(w, h, d, pick(rng, PALETTE.building));
          b.position.set(cx + ox, h / 2, cz + oz);
          windowsFor(b, w, h, d, h / 3);
          group.add(b);
          addCollider(cx + ox, cz + oz, w, d);
        }
      }
      // A tree or two on quiet blocks.
      if (!isDowntown && rng() < 0.6) {
        const tx = cx + (rng() - 0.5) * 24, tz = cz + (rng() - 0.5) * 24;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6),
          new THREE.MeshStandardMaterial({ color: 0x6b4a2f }));
        trunk.position.set(tx, 1.2, tz); trunk.castShadow = true;
        const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x4a7a35, roughness: 1 }));
        crown.position.set(tx, 3.6, tz); crown.castShadow = true;
        group.add(trunk); group.add(crown);
      }
    }
  }

  // --- Marina quarter (south-west): piers, boats, warehouse, docks ---
  const marina = { x: -168, z: 214 };
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 1 });
  for (let p = 0; p < 3; p++) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 34), pierMat);
    pier.position.set(-188 + p * 18, 0.6, 232);
    pier.castShadow = true; pier.receiveShadow = true;
    group.add(pier);
  }
  const boatColors = [0xe8e8e8, 0x3d6fb0, 0xc0503c, 0xe8c84a];
  const boats = [];
  for (let b = 0; b < 6; b++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 9),
      new THREE.MeshStandardMaterial({ color: boatColors[b % 4], roughness: 0.5 }));
    hull.position.y = 0.7;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 3.4),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
    cabin.position.set(0, 1.9, -0.5);
    boat.add(hull); boat.add(cabin);
    boat.position.set(-188 + (b % 3) * 18 + (b % 2 ? 5 : -5), 0.1, 226 + Math.floor(b / 3) * 14);
    boat.rotation.y = (rng() - 0.5) * 0.3;
    group.add(boat);
    boats.push(boat);
  }
  // Marina warehouse (mission 5 finale) and Rico's garage (mission hub).
  // Both sit fully inside their blocks, clear of the roads.
  const warehouse = box(26, 10, 18, 0x7a6a58);
  warehouse.position.set(-170, 5, 175);
  group.add(warehouse);
  addCollider(-170, 175, 26, 18);
  const garage = box(20, 7, 14, 0x4a6a8a);
  garage.position.set(-120, 3.5, 170);
  group.add(garage);
  addCollider(-120, 170, 20, 14);
  // Garage sign: a gold roof box so the hub reads from the street.
  const sign = new THREE.Mesh(new THREE.BoxGeometry(16, 1.6, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x8a6a00, emissiveIntensity: 0.5 }));
  sign.position.set(-120, 7.6, 162);
  group.add(sign);

  // --- Street lamps along the roads ---
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.5 });
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd970, emissiveIntensity: 0.9 });
  for (let i = 0; i <= WORLD.blocks; i += 2) {
    for (let j = -3; j <= 3; j += 2) {
      const lx = WORLD.roadCenter(i) + 8;
      const lz = j * 50;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6, 6), lampMat);
      pole.position.set(lx, 3, lz);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampHeadMat);
      head.position.set(lx, 6.1, lz);
      group.add(pole); group.add(head);
    }
  }

  scene.add(group);

  // --- Road loops for traffic: one rectangular loop around a block ---
  const roadLoops = [];
  for (let bx = 0; bx < WORLD.blocks; bx++) {
    for (let bz = 0; bz < WORLD.blocks; bz++) {
      const cx = WORLD.blockCenter(bx), cz = WORLD.blockCenter(bz);
      const x0 = cx - 25, x1 = cx + 25, z0 = cz - 25, z1 = cz + 25;
      roadLoops.push([
        { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
      ]);
    }
  }

  // --- Parked-car spots: on road shoulders, aligned with the road ---
  const parkedSpots = [];
  const spotDefs = [
    { x: -192, z: -120, yaw: 0 }, { x: -192, z: -40, yaw: 0 }, { x: -192, z: 60, yaw: 0 },
    { x: -142, z: -170, yaw: Math.PI / 2 }, { x: -42, z: -170, yaw: Math.PI / 2 },
    { x: 58, z: -170, yaw: Math.PI / 2 }, { x: 158, z: -170, yaw: Math.PI / 2 },
    { x: 192, z: -80, yaw: 0 }, { x: 192, z: 20, yaw: 0 }, { x: 192, z: 120, yaw: 0 },
    { x: -92, z: 192, yaw: Math.PI / 2 }, { x: 8, z: 192, yaw: Math.PI / 2 },
    { x: 108, z: 192, yaw: Math.PI / 2 }, { x: -142, z: 20, yaw: Math.PI / 2 },
  ];
  for (const s of spotDefs) parkedSpots.push({ x: s.x, z: s.z, yaw: s.yaw });

  return {
    colliders,
    roadLoops,
    parkedSpots,
    downtown,
    marina: { x: marina.x, z: marina.z },
    warehouse: { x: -170, z: 175 },
    garage: { x: -120, z: 154 },
    beach: { x: 40, z: 226 },
    spawn: { x: -140, z: 150, yaw: Math.PI * 0.75 },
    targetCarSpot: { x: 58, z: -170, yaw: Math.PI / 2 },
  };
}

// Circle (player or car) vs building AABBs: push the circle out. Returns
// true when a collision happened.
export function resolveCollisions(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = pos.x - c.minX, pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}

export function insideCity(x, z) {
  return x > -WORLD.half - 30 && x < WORLD.half + 30 && z > -WORLD.half - 30 && z < WORLD.waterStart + 120;
}
