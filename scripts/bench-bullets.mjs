#!/usr/bin/env node
/**
 * Bullet stress benchmark: boots the production build, opens a battle and floods the
 * battle box with pooled bullets at increasing densities. For each level it reports the
 * steady-state number of live bullets, frame-time percentiles, the cost of
 * BulletSystem.update per frame, and the pool size (to confirm sprites are reused,
 * not leaked).
 *
 * Numbers from headless Chromium are a lower bound: it renders WebGL in software
 * (SwiftShader), so a real browser with a GPU is considerably faster. The script fails
 * only on correctness problems (errors, pool leaks, bullets left alive after clear),
 * never on a frame-rate threshold.
 *
 * Usage:  npm run build && npm run bench
 */

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };

async function serveDist() {
  const root = resolve('dist');
  if (!existsSync(join(root, 'index.html'))) {
    console.error('dist/ not found. Run `npm run build` first.');
    process.exit(2);
  }
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = join(root, path === '/' ? 'index.html' : path);
    if (!file.startsWith(root)) return void res.writeHead(403).end();
    try {
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

/** Spiral volleys of `amount` slow bullets every 100 ms for 4 s: steady state ≈ amount × 40. */
const LEVELS = [
  { name: 'typical boss', amount: 2 },
  { name: 'heavy', amount: 6 },
  { name: 'stress', amount: 13 },
  { name: 'extreme', amount: 25 },
  { name: 'absurd', amount: 50 },
];

const server = await serveDist();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const wait = (ms) => page.waitForTimeout(ms);
const failures = [];

try {
  await page.goto(server.url);
  await page.waitForFunction(() => window.__unclaimed?.game.scene.isActive('Menu'), null, { timeout: 20000 });
  await wait(800);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('KeyZ');
    await wait(350);
  }
  await page.keyboard.type('bench');
  await page.keyboard.press('Enter');
  await wait(400);
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => window.__unclaimed.game.scene.isActive('World'), null, { timeout: 10000 });
  await wait(600);

  await page.evaluate(() => {
    const w = window.__unclaimed.game.scene.getScene('World');
    w.scene.launch('Battle', { enemies: ['earbuds'], canFlee: true, returnTo: 'World', onEnd: () => {} });
    w.scene.sleep();
  });
  await page.waitForFunction(() => window.__unclaimed.game.scene.isActive('Battle'), null, { timeout: 10000 });
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate(() => window.__unclaimed.game.scene.getScene('Battle').commands?.enabled)) break;
    await page.keyboard.press('KeyZ');
    await wait(250);
  }

  // Drive the bullet system directly (outside the dodge turn) so the load is controlled.
  await page.evaluate(() => {
    const b = window.__unclaimed.game.scene.getScene('Battle');
    const stats = { updates: 0, cost: 0, frames: [] };
    window.__bench = stats;
    let last = performance.now();
    const frame = (now) => {
      stats.frames.push(now - last);
      last = now;
      window.__benchRaf = requestAnimationFrame(frame);
    };
    window.__benchRaf = requestAnimationFrame(frame);
    b.sys.events.on('postupdate', (_t, delta) => {
      if (!window.__benchOn) return;
      const t0 = performance.now();
      b.bullets.update(delta, { box: b.box.rect, soul: { x: -9999, y: -9999 }, enemy: { x: 240, y: 60 }, rng: Math.random }, 0);
      stats.cost += performance.now() - t0;
      stats.updates++;
    });
  });

  console.log('\nBullet stress (headless Chromium, software WebGL: treat as a lower bound)\n');
  console.log('level          live  pool   fps  p50ms  p95ms  update ms/frame');
  for (const level of LEVELS) {
    await page.evaluate((amount) => {
      const b = window.__unclaimed.game.scene.getScene('Battle');
      b.bullets.start([
        {
          owner: 0,
          pattern: {
            duration: 60000,
            emitters: [
              {
                type: 'spiral',
                from: [0.5, 0.5],
                interval: 100,
                amount,
                rotate: 37,
                bullet: { frame: 'dot', radius: 2, speed: 14, lifetime: 4000 },
              },
            ],
          },
        },
      ]);
      window.__benchOn = true;
    }, level.amount);
    await wait(4500); // reach steady state (lifetime 4 s)
    await page.evaluate(() => {
      window.__bench.frames = [];
      window.__bench.cost = 0;
      window.__bench.updates = 0;
    });
    await wait(3000);
    const r = await page.evaluate(() => {
      const b = window.__unclaimed.game.scene.getScene('Battle');
      const f = [...window.__bench.frames].sort((a, c) => a - c);
      const pct = (p) => f[Math.min(f.length - 1, Math.floor(f.length * p))] ?? 0;
      return {
        live: b.bullets.activeCount,
        pool: b.bullets.poolSize,
        fps: window.__unclaimed.game.loop.actualFps,
        p50: pct(0.5),
        p95: pct(0.95),
        cost: window.__bench.cost / Math.max(1, window.__bench.updates),
      };
    });
    console.log(
      `${level.name.padEnd(13)} ${String(r.live).padStart(5)} ${String(r.pool).padStart(5)} ${r.fps.toFixed(0).padStart(5)} ${r.p50.toFixed(1).padStart(6)} ${r.p95.toFixed(1).padStart(6)}  ${r.cost.toFixed(2).padStart(8)}`,
    );
    if (r.pool > r.live * 1.6 + 64) failures.push(`${level.name}: pool ${r.pool} much larger than live ${r.live} (leak?)`);
  }

  // Clear: every bullet goes back to the pool, and the pool stays the same size on reuse.
  const after = await page.evaluate(async () => {
    const b = window.__unclaimed.game.scene.getScene('Battle');
    b.bullets.stop();
    b.bullets.clear();
    const cleared = b.bullets.activeCount;
    const pool = b.bullets.poolSize;
    window.__benchOn = false;
    cancelAnimationFrame(window.__benchRaf);
    const visible = b.children.list.flatMap((c) => c.list ?? [c]).filter((s) => s.texture?.key === 'bullets' && s.visible).length;
    return { cleared, pool, visible };
  });
  console.log(`\nafter clear: live ${after.cleared}, visible bullet sprites ${after.visible}, pool ${after.pool}`);
  if (after.cleared !== 0) failures.push(`bullets still alive after clear: ${after.cleared}`);
  if (after.visible !== 0) failures.push(`bullet sprites still visible after clear: ${after.visible}`);
} catch (e) {
  failures.push(`benchmark crashed: ${e.stack ?? e}`);
} finally {
  await browser.close();
  server.close();
}

if (errors.length) failures.push(...errors.map((e) => `page error: ${e}`));
if (failures.length) {
  console.log('\nFAILED');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nbench ok (no errors, no leaks)');
