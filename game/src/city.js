// Solmar Bay: procedural coastal city. One job: build the whole 8x8-block city
// (ground, roads, sidewalks, beach + sea, buildings, lights, palms) and hand back
// the colliders and spawn points the gameplay systems need.

import * as THREE from 'three';
import { CITY, PALETTE, rand, randInt, pick, roadCentres } from './config.js';

function makeWindowTexture(baseColor, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  const cols = 5, rows = 12;
  const cw = 128 / cols, ch = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = Math.random() < litRatio;
      g.fillStyle = lit ? '#ffe9a8' : '#20242e';
      g.fillRect(col * cw + 4, r * ch + 5, cw - 8, ch - 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm() {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 5.6, 6), trunkMat);
  trunk.position.y = 2.8;
  trunk.rotation.z = rand(-0.06, 0.06);
  palm.add(trunk);
  // Small drooping fronds held high, so the canopy reads above the player
  // instead of blocking the camera.
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palm });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.38, 2.0, 5), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.75, 5.9, Math.sin(a) * 0.75);
    leaf.rotation.z = Math.cos(a) * 1.25;
    leaf.rotation.x = -Math.sin(a) * 1.25;
    palm.add(leaf);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
  nuts.position.y = 5.5;
  palm.add(nuts);
  return palm;
}

export function buildCity(scene) {
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'SolmarBayCity';

  // Sky, fog, sun.
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 260, 620);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.0);
  sun.position.set(140, 220, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 600;
  scene.add(sun);

  // Base ground: warm scrub grass under the whole city.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Roads: dark strips along every road centre, both axes.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c84a });
  for (const c of roadCentres()) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(2 * CITY.half + CITY.roadWidth, CITY.roadWidth), roadMat);
      road.rotation.x = -Math.PI / 2;
      if (horizontal) road.rotation.z = Math.PI / 2;
      road.position.set(horizontal ? 0 : c, 0.02, horizontal ? c : 0);
      road.receiveShadow = true;
      group.add(road);
      // Centre dashes.
      for (let d = -CITY.half; d < CITY.half; d += 8) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.5), dashMat);
        dash.rotation.x = -Math.PI / 2;
        if (horizontal) dash.rotation.z = Math.PI / 2;
        dash.position.set(horizontal ? d : c, 0.04, horizontal ? c : d);
        group.add(dash);
      }
    }
  }

  // Sidewalks: pale frames around each block.
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const blockCentres = [];
  for (let i = 0; i < CITY.blocks; i++) blockCentres.push((i - 3.5) * CITY.pitch + CITY.pitch / 2);
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(CITY.blockSize + 4, CITY.blockSize + 4), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(bx, 0.03, bz);
      walk.receiveShadow = true;
      group.add(walk);
    }
  }

  // Buildings: 1-3 towers per block, window-textured, varied heights/colours.
  const textures = PALETTE.building.map((col) => {
    const hex = '#' + col.toString(16).padStart(6, '0');
    return makeWindowTexture(hex, 0.28);
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5a60 });
  let buildingCount = 0;
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      const n = randInt(1, 3);
      for (let k = 0; k < n; k++) {
        const w = rand(10, 18), d = rand(10, 18);
        const h = rand(9, 58);
        const ox = (k % 2 === 0 ? -1 : 1) * rand(4, 9);
        const oz = (k < 2 ? -1 : 1) * rand(4, 9);
        const cx = bx + ox, cz = bz + oz;
        if (Math.abs(cx) > CITY.half || Math.abs(cz) > CITY.half) continue;
        const mat = new THREE.MeshLambertMaterial({ map: pick(textures) });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(cx, h / 2 + 0.05, cz);
        tower.castShadow = true;
        tower.receiveShadow = true;
        group.add(tower);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.7, d + 0.6), roofMat);
        roof.position.set(cx, h + 0.4, cz);
        group.add(roof);
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        buildingCount++;
      }
    }
  }

  // Streetlights along the roads.
  const poleMat = new THREE.MeshLambertMaterial({ color: PALETTE.lightPole });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const c of roadCentres()) {
    for (let d = -CITY.half + 20; d < CITY.half; d += 52) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
      pole.position.set(c + CITY.roadWidth / 2 + 0.6, 3, d);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
      lamp.position.set(c + CITY.roadWidth / 2 + 0.6, 6.1, d);
      group.add(lamp);
    }
  }

  // Palms: a double row along the beach promenade, plus scattered ones.
  const palms = [];
  for (let z = -200; z <= 200; z += 26) {
    for (const px of [CITY.beachX + 6, CITY.beachX + 14]) {
      const palm = makePalm();
      palm.position.set(px, 0, z + rand(-4, 4));
      group.add(palm);
      palms.push(palm);
    }
  }
  for (let i = 0; i < 24; i++) {
    const palm = makePalm();
    palm.position.set(rand(-190, 190), 0, rand(-190, 190));
    group.add(palm);
    palms.push(palm);
  }

  // Beach: sand strip east of the city, then the sea.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.seaX - CITY.beachX, 560),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((CITY.beachX + CITY.seaX) / 2, 0.02, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const seaMat = new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.92 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(220, 760), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CITY.seaX + 110, 0.05, 0);
  group.add(sea);

  // Boardwalk pier reaching into the sea (mission 2 pickup spot).
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7b52 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 8), pierMat);
  pier.position.set(CITY.seaX + 28, 0.6, 60);
  pier.castShadow = true;
  group.add(pier);

  // Rico's garage + the warehouse district (mission landmarks).
  const garageMat = new THREE.MeshLambertMaterial({ color: 0xb03a2e });
  const garage = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 16), garageMat);
  garage.position.set(-150, 4, 130);
  garage.castShadow = true;
  group.add(garage);
  colliders.push({ minX: -162, maxX: -138, minZ: 122, maxZ: 138 });

  const warehouseMat = new THREE.MeshLambertMaterial({ color: 0x5d6d7e });
  const warehouse = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 20), warehouseMat);
  warehouse.position.set(150, 5, -150);
  warehouse.castShadow = true;
  group.add(warehouse);
  colliders.push({ minX: 135, maxX: 165, minZ: -160, maxZ: -140 });

  scene.add(group);

  const spawnPoints = {
    player: { x: -26, z: 26 },
    garage: { x: -150, z: 112 },
    pier: { x: CITY.seaX + 40, z: 60 },
    hotel: { x: 156, z: 156 },
    warehouse: { x: 150, z: -128 },
    hideout: { x: -156, z: -156 },
  };

  return {
    group,
    colliders,
    buildingCount,
    spawnPoints,
    sea,
    update(dt, time) {
      // Gentle sea shimmer.
      seaMat.opacity = 0.88 + Math.sin(time * 0.7) * 0.04;
    },
  };
}

// Circle-vs-AABB push-out used by player, cars and AI alike.
export function resolveColliderPush(x, z, radius, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 0.0001) { x = c.maxX + radius; continue; }
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * radius;
      z = cz + (dz / d) * radius;
    }
  }
  return { x, z };
}

export function insideCityBounds(x, z) {
  return Math.abs(x) < CITY.worldHalf && Math.abs(z) < CITY.worldHalf;
}
