// Solmar Bay — procedural coastal city: grid streets, tower blocks with lit
// windows, beach, ocean, palms, lamps and street props. All geometry is built
// from primitives with canvas textures generated at runtime; no image files.
import * as THREE from 'three';
import { CITY, makeRng, pick } from './config.js';

function windowTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 18) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? (rng() < 0.5 ? '#ffd98a' : '#bfe3ff') : '#1d2733';
      g.fillRect(x, y, 11, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2e3138'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f5c542'; g.fillRect(62, 0, 4, 128);
  g.fillStyle = '#e8e8e8';
  g.fillRect(4, 0, 3, 128); g.fillRect(121, 0, 3, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build the whole city into the scene. Returns { colliders, spawnPoints }. */
export function buildCity(scene) {
  const rng = makeRng(20261117);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'SolmarBayCity';

  // Sun + sky + fog.
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -240; sun.shadow.camera.right = 240;
  sun.shadow.camera.top = 240; sun.shadow.camera.bottom = -240;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9fd4ff, 0x3d5a3a, 1.1));
  scene.background = new THREE.Color(0x87c5e8);
  scene.fog = new THREE.Fog(0x9fd0e8, 260, 620);

  // Ground: grass-ish base, sand strip, ocean plane.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshStandardMaterial({ color: 0x6f9e5a, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -20);
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 34),
    new THREE.MeshStandardMaterial({ color: 0xe8d49a, roughness: 1 })
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.05, CITY.beachZ + 8);
  sand.receiveShadow = true;
  group.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 300),
    new THREE.MeshStandardMaterial({ color: 0x1e7fa8, roughness: 0.25, metalness: 0.1 })
  );
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, 0.02, CITY.oceanZ + 150);
  group.add(ocean);

  // Roads: dark strips with centre dashes, plus sidewalk borders.
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 });
  for (const l of CITY.roadLines) {
    for (const horizontal of [true, false]) {
      const len = CITY.half * 2 + 40;
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(horizontal ? len / 24 : 1, horizontal ? 1 : len / 24);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(horizontal ? len : 14, horizontal ? 14 : len),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(horizontal ? 0 : l, 0.08, horizontal ? l : 0);
      m.receiveShadow = true;
      group.add(m);
    }
  }
  // Ring highway around the city.
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x33363d, roughness: 0.9 });
  for (const [w, h, x, z] of [
    [CITY.half * 2 + 30, 16, 0, -CITY.half - 8],
    [CITY.half * 2 + 30, 16, 0, CITY.half + 8],
    [16, CITY.half * 2 + 30, -CITY.half - 8, 0],
    [16, CITY.half * 2 + 30, CITY.half + 8, 0],
  ]) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ringMat);
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.07, z);
    r.receiveShadow = true;
    group.add(r);
  }

  // Buildings: one or two towers per block. Blocks sit BETWEEN the roads
  // (centres offset by half a pitch), so every street stays a clear corridor.
  const palettes = ['#c98a5e', '#7fa8c9', '#b8b0a4', '#d9a05b', '#8fa98f', '#c97f7f', '#9a8fc9', '#e0d6c2'];
  const winTexes = palettes.map((p) => windowTexture(rng, p, 0.42));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let bi = -4; bi <= 3; bi++) {
    for (let bj = -4; bj <= 3; bj++) {
      const cx = (bi + 0.5) * CITY.pitch, cz = (bj + 0.5) * CITY.pitch;
      if (bi === 0 && bj === -1) continue; // park block: fountain plaza
      const dist = Math.hypot(cx, cz);
      const tall = dist < 90 ? 0.75 : 0.3;
      const count = rng() < 0.55 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const w = 16 + rng() * 14, d = 16 + rng() * 14;
        const h = (rng() < tall ? 26 + rng() * 42 : 9 + rng() * 18);
        const ox = count === 1 ? 0 : (k === 0 ? -11 : 11);
        const oz = count === 1 ? 0 : (k === 0 ? -9 : 9);
        const mat = new THREE.MeshStandardMaterial({ map: pick(rng, winTexes), roughness: 0.85 });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(cx + ox, h / 2, cz + oz);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        // Roof rim + rooftop box for skyline variety.
        const rim = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 1 }));
        rim.scale.set(w + 0.6, 0.8, d + 0.6);
        rim.position.set(cx + ox, h + 0.4, cz + oz);
        group.add(rim);
        colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2 });
      }
    }
  }

  // Park block fountain plaza (off the roads, at block centre 29,-29):
  // a round basin, a centre pillar and a water top.
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 1.2, 24),
    new THREE.MeshStandardMaterial({ color: 0x7fb2d9, roughness: 0.3 })
  );
  plaza.position.set(29, 0.6, -29); plaza.castShadow = true;
  group.add(plaza);
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.6, 3.4, 12),
    new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.9 })
  );
  pillar.position.set(29, 1.7, -29); pillar.castShadow = true;
  group.add(pillar);
  colliders.push({ minX: 22, maxX: 36, minZ: -36, maxZ: -22 });

  // Palm trees: trunk + crossed frond planes, scattered on sidewalks and beach.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f8f4e, roughness: 1, side: THREE.DoubleSide });
  function palm(x, z, s = 1) {
    const p = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.45 * s, 7 * s, 6), trunkMat);
    trunk.position.y = 3.5 * s; trunk.castShadow = true;
    p.add(trunk);
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(4.4 * s, 1.4 * s), frondMat);
      f.position.y = 7 * s;
      f.rotation.y = (i / 6) * Math.PI * 2;
      f.rotation.x = -0.5;
      f.translateZ(1.6 * s);
      p.add(f);
    }
    p.position.set(x, 0, z);
    group.add(p);
  }
  for (let i = 0; i < 46; i++) {
    const side = pick(rng, [-1, 1]);
    const along = -200 + rng() * 400;
    const line = pick(rng, CITY.roadLines);
    if (rng() < 0.5) palm(line + side * 10.5, along, 0.8 + rng() * 0.5);
    else palm(along, line + side * 10.5, 0.8 + rng() * 0.5);
  }
  for (let i = 0; i < 18; i++) palm(-210 + i * 24 + rng() * 8, CITY.beachZ + 6 + rng() * 14, 1 + rng() * 0.4);

  // Street lamps along the avenues.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.6, metalness: 0.5 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd76a, emissiveIntensity: 0.9 });
  for (const l of CITY.roadLines) {
    for (let v = -180; v <= 180; v += 58) {
      for (const [x, z] of [[l + 9, v + 4], [l - 9, v - 20]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampMat);
        pole.position.set(x, 3, z); pole.castShadow = true;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), bulbMat);
        bulb.position.set(x, 6.1, z);
        group.add(pole, bulb);
      }
    }
  }

  // Landmark: the Solmar Marina pier (mission site).
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 60),
    new THREE.MeshStandardMaterial({ color: 0x8a6b46, roughness: 1 }));
  pier.position.set(60, 0.6, CITY.beachZ + 26); pier.castShadow = true;
  group.add(pier);

  scene.add(group);
  return {
    colliders,
    spawnPoints: {
      plaza: new THREE.Vector3(0, 0, 24),
      marina: new THREE.Vector3(60, 0, CITY.beachZ - 6),
      garage: new THREE.Vector3(-58, 0, -104),
      warehouse: new THREE.Vector3(174, 0, 116),
      kiosk: new THREE.Vector3(-116, 0, CITY.beachZ - 4),
    },
  };
}
