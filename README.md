[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Richat1801/gta6-01-entry/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Richat1801/gta6-01-entry/reward.svg)](https://make.fun/bounty/gta6-01)

# Solmar Bay — Heat of the Coast

An original open-world crime game built for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01).
Explore the sun-soaked coastal city of **Solmar Bay** on foot and by car: steal cars, outrun the
SBPD, run five story missions for fixer Rico Vane, and build your name — or get busted trying.

## Play

Serve `game/` with any static server and open `game/index.html` in desktop Chrome. No network
needed at runtime — three.js is vendored under `game/vendor/three/`.

- **WASD** move / drive · **SHIFT** sprint / boost · **E** steal / exit car
- **SPACE** jump / handbrake · **Mouse** aim, **click** shoot · **F** punch
- **R** restart mission · **ESC** pause · **M** mute

## What's inside

- A procedural coastal city: grid streets, tower blocks, beach, ocean, marina pier, palms, lamps
- Traffic cars and pedestrians with simple AI; parked cars you can steal (press E)
- Wanted system (1–5 stars) with SBPD cruisers that chase and ram, and officers on foot
- 5 chained story missions with dialogue, markers, timers and cash rewards
- Combat: pistol with tracers, melee, rival-gang enemies, particles
- HUD with health, cash, wanted stars, clock, speed and a live canvas minimap
- Start screen, pause, and autosave / continue via localStorage
- All sound synthesized with WebAudio (engine, sirens, gunshots, skids) — no audio files

## Build / verify

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node /path/to/kit/cli/makefun.mjs check --kit /path/to/kit --repo .
```

`main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to the output
directory and writes `dossier.json` with `buildDossier` from `vendor/makefun-game.ts`.

## License

MIT — see [LICENSE](LICENSE).
