# Solmar Bay — Heat of the Coast

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Bounty: gta6-01](https://img.shields.io/badge/make.fun-gta6--01-blue)](https://make.fun/bounty/gta6-01)
[![Prize: $1,666](https://img.shields.io/badge/prize-%241%2C666-green)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the
[make.fun "Make GTA 6" bounty (gta6-01)](https://make.fun/bounty/gta6-01):
a sun-soaked coastal city to explore on foot and by car, cars to steal,
traffic and pedestrians, a 1–5 star wanted system with police cruisers and
officers who chase and arrest, five chained story missions for fixer
Rico Vane, pistol and fist combat against a rival gang, a HUD with a live
minimap, and a save that survives between sessions.

Everything is original — the city of Solmar Bay, its characters, story,
vehicles, art and synthesized sounds are all its own. Nothing is taken
from any commercial game.

## Play

Serve `game/` with any static server and open `index.html` in desktop
Chrome. No network request is made at play time; three.js is vendored
under `game/vendor/three/`.

- **WASD** move / drive · **Mouse drag** look · **Wheel** zoom
- **Click** shoot · **F** punch · **R** reload · **E** steal / enter a car
- **SHIFT** run / boost · **SPACE** handbrake · **ESC** pause · **M** mute

## The city

8×8 blocks of procedural coastline: a beach and marina in the south-west,
a downtown of towers in the middle, 14 stealable parked cars, 10 traffic
cars looping the blocks, 26 pedestrians on the sidewalks, and the Solmar
Bay PD answering every crime with up to 5 wanted stars.

## The story

1. **Marina Pickup** — collect Rico's package at the docks (+$150)
2. **Coast Run** — drive it downtown before the buyer walks (+$250)
3. **Harbor Heat** — settle the Dagger crew at the marina (+$400)
4. **Downtown Getaway** — steal the gold Sirocco and lose the cops (+$600)
5. **Bay Kingpin** — end Marlo Kane at the warehouse (+$1,000)

Progress saves automatically (mission, cash, health, position) and the
title screen offers **Continue** to pick up exactly where you left off.

## Layout

- `game/index.html` — page, HUD, screens, import map
- `game/src/config.js` — constants and helpers
- `game/src/city.js` — procedural city, beach, marina, colliders
- `game/src/vehicles.js` — parked cars, traffic AI, driving
- `game/src/pedestrians.js` — sidewalk walkers
- `game/src/police.js` — wanted system, cruisers, arresting officers
- `game/src/combat.js` — pistol, punch, rival-gang AI
- `game/src/missions.js` — the five Rico Vane missions
- `game/src/hud.js` — HUD, minimap, screens
- `game/src/audio.js` — synthesized WebAudio sound
- `game/src/save.js` — localStorage save / continue
- `game/src/main.js` — game loop and wiring
- `game/vendor/three/` — three.js 0.187.0 (MIT)

## Handing in

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json` with the
vendored `vendor/makefun-game.ts` library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node cli/makefun.mjs check --kit <kit> --repo .
```

## License

MIT — see [LICENSE](LICENSE).
