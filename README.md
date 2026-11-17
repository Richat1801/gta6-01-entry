# Solmar Bay — Heat of the Coast

![gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/Richat1801/gta6-01-entry/rank.svg)
![reward](https://make.fun/badge/gta6-01/Richat1801/gta6-01-entry/reward.svg)

An original open-world crime game built for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01)
on make.fun. Referral code: `dss38k9p`.

## The game

Solmar Bay is a sun-soaked modern seaside city — eight by eight blocks of towers,
roads, sidewalks, palms and a beach that runs into the sea. You arrive with $250 and
a name nobody knows. Fixer **Rico Vane** has five jobs for you: prove you can drive,
run a package down the coast against the clock, tail a rival crew's runner, clear out
their warehouse in a shootout, and pull off one last escape with the whole police
department on your tail.

- **On foot and by car** — third-person WASD + mouse-look walking (sprint, jump) and
  arcade driving. Press **E** to steal any of the 14 parked cars around the city.
- **A living city** — traffic AI driving the road grid, 26 pedestrians on the sidewalks
  who flee gunfire and speeding cars, streetlights, palms, beach and sea.
- **Wanted 1–5 stars** — stealing, speeding into pedestrians and shooting raise the heat.
  Police cruisers chase and ram; officers chase on foot and arrest you. Lay low and the
  stars cool off — or get **BUSTED** and pay the fine.
- **5 chained story missions** from Rico Vane, with gold beacon markers, on-screen
  objectives, timers and cash rewards.
- **Combat** — fists and a pistol, rival Shark Boys gang members who shoot back, muzzle
  flash, tracers and hit markers.
- **HUD** — cash, health, wanted stars, mission objective with distance, in-game clock,
  speedometer, and a live canvas minimap (player, traffic, police, mission marker).
- **Menus & save** — start screen, pause screen, busted screen; cash, mission progress,
  health and position save to localStorage automatically.
- **Sound** — fully synthesised WebAudio: engine hum, two-tone sirens, gunshots, pickup
  chimes and an ambient coastal music loop. No audio files.

## Play it

Serve `game/` with any static HTTP server and open `game/index.html` in desktop Chrome.
Everything loads from local files — no network requests, no external fonts, images or audio.

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080/
```

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse | Look (click the game to lock the pointer) |
| SHIFT | Sprint |
| SPACE | Jump |
| E | Steal / exit car |
| 1 / 2 | Fists / pistol |
| Click | Punch / shoot |
| P / Esc | Pause (saves automatically) |

## Tech

- [three.js](https://threejs.org/) 0.187.0, vendored as a minified build under
  `game/vendor/three/` — the only library. Everything else is original code written
  for this entry, split into one-job modules under `game/src/` (`config`, `city`,
  `vehicles`, `pedestrians`, `police`, `missions`, `combat`, `hud`, `audio`, `save`,
  `input`, `main`).
- `main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to the output
  directory and writes `dossier.json` with `buildDossier` from `vendor/makefun-game.ts`.

## Screenshots

1. `1-chase.jpg` — high-speed police chase at 3 wanted stars.
2. `2-start.jpg` — the start screen over the city.
3. `3-mission.jpg` — the warehouse shootout, mission 4 in progress.
4. `4-city.jpg` — on foot downtown with traffic and pedestrians.

## License

MIT — see [LICENSE](LICENSE). All city, characters, vehicles, names, story, art and
sounds are original work made for this entry.
