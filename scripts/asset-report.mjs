#!/usr/bin/env node
/**
 * Lists every asset in src/data/assets/manifest.json by status.
 *   npm run assets:report            # overview
 *   npm run assets:report -- --strict  # exit 1 if any placeholder remains (release gate)
 */
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../src/data/assets/manifest.json', import.meta.url), 'utf-8'));
const order = ['placeholder', 'wip', 'final'];
const groups = Object.fromEntries(order.map((s) => [s, []]));
for (const asset of manifest.assets) (groups[asset.status] ??= []).push(asset);

for (const status of order) {
  const list = groups[status];
  console.log(`\n${status.toUpperCase()} (${list.length})`);
  for (const a of list) {
    let size;
    if (a.kind === 'pixelart') {
      const doc = JSON.parse(readFileSync(new URL(`../src/data/art/${a.source}`, import.meta.url), 'utf-8'));
      size = `${doc.size[0]}x${doc.size[1]} x${Object.keys(doc.frames).length}f`;
    } else if (a.size) size = `${a.size[0]}x${a.size[1]}${a.frames ? ` x${a.frames}f` : ''}`;
    else size = `${a.rows?.[0]?.length}x${a.rows?.length}`;
    console.log(`  ${a.key.padEnd(18)} ${a.kind.padEnd(12)} ${String(size).padEnd(12)} ${a.usage}`);
  }
}

const placeholders = groups.placeholder.length;
console.log(`\n${manifest.assets.length} assets · ${placeholders} placeholder · ${groups.wip.length} wip · ${groups.final.length} final`);
if (process.argv.includes('--strict') && placeholders > 0) {
  console.error('Placeholder assets remain; not release-ready.');
  process.exit(1);
}
