# Solmar Bay — Heat of the Coast

![gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/Richat1801/gta6-01-entry/rank.svg)
![reward](https://make.fun/badge/gta6-01/Richat1801/gta6-01-entry/reward.svg)

An original open-world crime game for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on [make.fun](https://make.fun). Referral code: `dss38k9p`.

## The game

**Solmar Bay — Heat of the Coast** is a sun-soaked modern seaside city you can explore
on foot and by car. Steal cars, outrun the Solmar Bay PD, and run five story jobs for
the fixer Rico Vane — from a first set of wheels to the Big Score at the Bay Bank.

- **Open world:** an 8×8-block procedural coastal city — roads, sidewalks, beach and sea,
  buildings of varied height and colour, streetlights, palms, a hotel, a bank, a marina pier.
- **On foot and driving:** third-person WASD + mouse-look walking (sprint, jump) and arcade
  driving. Press **E** to steal any of 14 parked cars (sedans, coupes, taxis, vans, trucks,
  sports cars) and drive off.
- **Traffic and pedestrians:** 10 AI cars looping the road grid (turning at intersections,
  stopping for the car ahead) and 26 walkers on the sidewalks who flee when scared.
- **Wanted system and police:** 1–5 stars that rise on crimes (stealing, hitting pedestrians,
  shooting) and decay when you stay hidden. Police cruisers chase and ram you; officers on
  foot close in and arrest you — get **BUSTED** and Rico bails you out.
- **Missions and story:** 5 chained jobs from Rico Vane — intro drive, pickup/delivery, a
  tail-the-courier chase, a pier shootout against the Coral Kings, and a bank finale with a
  getaway. Each pays cash; progress saves automatically.
- **Combat:** fists and a pistol, rival gang members who shoot back, health, muzzle flash,
  tracers and hit markers.
- **HUD:** cash, health, wanted stars, mission objective with distance, in-game clock, live
  canvas minimap (player, cars, police, pedestrians, mission marker), speed and car name.
- **Menus and save:** start screen, pause screen, busted/wasted screen, localStorage save
  (cash, mission progress, position).
- **Sound:** fully synthesised WebAudio — engine hum, police sirens, gunshots, pickup chimes
  and an ambient synthwave loop. No audio files.

## How to play

Serve `game/` with any static server and open `game/index.html` in desktop Chrome:

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080
```

No network is needed — every script is a file under `game/` (three.js 0.187.0 is vendored
as a single minified build under `game/vendor/three/`).

**Controls:** WASD move/drive · mouse look · Shift sprint · Space jump · E steal/exit car ·
click punch/shoot · 1 fists / 2 pistol · M next mission · P/Esc pause.

## Entry

`main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to the output directory
and writes `dossier.json` with `buildDossier` from `vendor/makefun-game.ts`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
