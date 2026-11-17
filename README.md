![gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/Richat1801/gta6-01-entry/rank.svg)
![reward](https://make.fun/badge/gta6-01/Richat1801/gta6-01-entry/reward.svg)

# Solmar Bay — Heat of the Coast

An original open-world crime game for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) — a sun-soaked modern seaside city you explore on foot and by car, with traffic, pedestrians, a wanted level and police who respond, five chained story missions, combat, a HUD with a live minimap, and a save that persists between sessions.

Referral code: `dss38k9p`

## Play it

Serve `game/` with any static file server and open `game/index.html` in desktop Chrome:

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080
```

No build step, no network requests — every script, the vendored three.js build and all sounds are local. All audio is synthesized with WebAudio; there are no audio files.

## The game

- **Solmar Bay** — an 8×8-block procedural coastal city: roads, sidewalks, beach and sea, towers of varied height and colour, parks, a plaza fountain, palms, streetlights and the South Docks.
- **On foot and driving** — third-person WASD + mouse-look walking (sprint, jump) and 14 stealable parked cars in four models with arcade handling. Press `E` to steal or exit a car.
- **Traffic and pedestrians** — 10 AI cars driving the road grid (turning at intersections, slowing for traffic) and 26 sidewalk walkers who flee from gunfire and speeding cars.
- **Wanted 1–5 stars and police** — stealing, hitting pedestrians and shooting raise the heat; cruisers chase and ram, officers run you down and arrest you (BUSTED). Stay quiet and hidden and the stars fade.
- **Five story missions from fixer Rico Vane** — First Wheels, The Pickup, Hot Pursuit, Dockside Shootout and the Bay Heist — with on-screen objectives, ground markers, sky beacons and cash rewards.
- **Combat** — fists (`F`) and pistol (`1`, click to shoot), a rival gang that shoots back, health, muzzle flash, tracers and hit markers.
- **HUD** — cash, health, wanted stars, clock, mission objective, speed, and a live canvas minimap (player, cars, police, rivals, mission marker).
- **Screens and save** — start screen, pause screen, busted screen; cash, mission progress and position autosave to localStorage and can be continued.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse | Look (click to lock) |
| E | Steal car / exit car |
| 1 | Draw / holster pistol |
| Click | Shoot |
| F | Punch |
| Shift | Sprint |
| Space | Jump |
| P | Pause |
| M | Mute |

## How it is built

- `game/index.html` — the page, HUD and screens; a single import map for three.js.
- `game/src/config.js` — tuning, city layout, places and the five mission definitions.
- `game/src/city.js` — the procedural city: ground, roads, beach, sea, buildings, palms, parks, docks.
- `game/src/vehicles.js` — car models, parked cars, traffic AI and arcade driving.
- `game/src/pedestrians.js` — sidewalk walkers and flee behaviour.
- `game/src/police.js` — wanted system, cruisers and arresting officers.
- `game/src/missions.js` — the chained Rico Vane story missions.
- `game/src/combat.js` — pistol, punch, rival gang AI, tracers and muzzle flash.
- `game/src/hud.js` — HUD, messages, screens and the live minimap.
- `game/src/audio.js` — synthesized WebAudio: engine, sirens, gunshots, chimes, music loop.
- `game/src/save.js` — localStorage save / load.
- `game/src/input.js` — keyboard, mouse-look and action presses.
- `game/src/main.js` — renderer, player, camera, game loop and screenshot staging.
- `game/vendor/three/three.module.min.js` — three.js 0.187.0, vendored minified build.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with `buildDossier` from `vendor/makefun-game.ts`.

## License

MIT — see [LICENSE](LICENSE). All city, character, vehicle, story and sound design is original; nothing is taken from any commercial game.
