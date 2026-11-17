// Solmar Bay — Heat of the Coast: the entrypoint that hands the game in.
//
// Copies game/ and screenshots/ from this repository into the output directory
// (MAKEFUN_OUTPUT_DIR outside the grader, /output inside it) and writes
// /output/dossier.json with buildDossier from vendor/makefun-game.ts.
// Node 22, standard library only, no network, deterministic: two runs write
// the same bytes.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function main() {
  const gameDir = join(repoRoot, 'game');
  const shotsDir = join(repoRoot, 'screenshots');
  if (!existsSync(join(gameDir, 'index.html'))) {
    fail('game/index.html is missing: nothing to hand in');
  }
  if (!existsSync(shotsDir)) {
    fail('screenshots/ is missing: the entry needs 3 or 4 screenshots');
  }

  // Start from a clean output directory so a second run cannot leave stale files.
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);

  const indexBytes = readFileSync(join(outputDir, 'game', 'index.html')).length;
  console.log(`main.ts: wrote ${outputDir} (game/index.html ${indexBytes} bytes, dossier.json ${dossier.length} bytes)`);
}

main();
