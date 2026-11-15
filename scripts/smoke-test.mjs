#!/usr/bin/env node
/**
 * Browser smoke test: boots the production build in Chromium at several screen sizes and
 * checks that the game starts, scales correctly, accepts input and logs no errors.
 *
 * Usage:
 *   npm run build && npm run smoke            # serves ./dist on a free port
 *   npm run smoke -- --url http://localhost:5173   # test a running dev server
 *   npm run smoke -- --shots                  # also save screenshots to ./screenshots
 *
 * Requires the `playwright` package (npm i -D playwright && npx playwright install chromium).
 */

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const saveShots = args.includes('--shots');

const BASE_W = 480;
const BASE_H = 270;

/** Screen setups worth guarding: common desktop, Windows 125%, laptop, phones. */
const VIEWPORTS = [
  { name: 'desktop-1080p', width: 1920, height: 1080, dpr: 1, locale: 'ko-KR', expectInteger: true, expectDevScale: 4 },
  { name: 'win-125pct', width: 1536, height: 864, dpr: 1.25, locale: 'en-US', expectInteger: true, expectDevScale: 4 },
  { name: 'laptop-1366', width: 1366, height: 768, dpr: 1, locale: 'ko-KR', expectInteger: false },
  { name: 'phone-landscape', width: 844, height: 390, dpr: 3, locale: 'ko-KR', touch: true, expectInteger: true, expectDevScale: 4 },
  { name: 'phone-portrait', width: 390, height: 844, dpr: 3, locale: 'en-US', touch: true, expectInteger: false },
];

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

async function serveDist() {
  const root = resolve('dist');
  if (!existsSync(join(root, 'index.html'))) {
    console.error('dist/ not found. Run `npm run build` first or pass --url.');
    process.exit(2);
  }
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = join(root, path === '/' ? 'index.html' : path);
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}/`, close: () => server.close() };
}

const failures = [];
const check = (cond, label, detail = '') => {
  if (cond) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label} ${detail}`);
    failures.push(label);
  }
};

async function waitForScene(page, key, timeout = 15000) {
  await page.waitForFunction(
    (k) => {
      const app = window.__unclaimed;
      return Boolean(app && app.game.scene.isActive(k));
    },
    key,
    { timeout },
  );
}

async function run() {
  const external = argValue('--url');
  const server = external ? null : await serveDist();
  const url = external ?? server.url;
  console.log(`smoke test against ${url}`);
  if (saveShots) await mkdir('screenshots', { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n[${vp.name}] ${vp.width}x${vp.height} @${vp.dpr}x ${vp.locale}`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
        locale: vp.locale,
        hasTouch: Boolean(vp.touch),
        isMobile: Boolean(vp.touch),
      });
      const page = await context.newPage();
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(String(err)));

      await page.goto(url);
      await waitForScene(page, 'Title');
      check(true, 'reaches title screen');

      const layout = await page.evaluate(() => {
        const canvas = document.querySelector('#game-stage canvas');
        const r = canvas.getBoundingClientRect();
        return {
          w: r.width,
          h: r.height,
          left: r.left,
          top: r.top,
          internalW: canvas.width,
          internalH: canvas.height,
          vw: window.innerWidth,
          vh: window.innerHeight,
          dpr: window.devicePixelRatio,
          renderer: window.__unclaimed.game.renderer.type === 1 ? 'canvas' : 'webgl',
        };
      });
      const devScale = (layout.w * layout.dpr) / BASE_W;
      check(layout.internalW === BASE_W && layout.internalH === BASE_H, 'native 480x270 backbuffer', JSON.stringify(layout));
      check(layout.w <= layout.vw + 0.01 && layout.h <= layout.vh + 0.01, 'canvas fits viewport', JSON.stringify(layout));
      check(Math.abs(layout.w / layout.h - BASE_W / BASE_H) < 0.01, 'aspect ratio preserved');
      check(
        Math.abs(layout.left - (layout.vw - layout.w) / 2) <= 1 && Math.abs(layout.top - (layout.vh - layout.h) / 2) <= 1,
        'canvas centred',
      );
      const isInteger = Math.abs(devScale - Math.round(devScale)) < 0.001;
      check(isInteger === vp.expectInteger, `integer device scale = ${vp.expectInteger}`, `got ${devScale.toFixed(3)}`);
      if (vp.expectDevScale) check(Math.round(devScale) === vp.expectDevScale, `device scale ${vp.expectDevScale}x`, `got ${devScale}`);
      console.log(`  info renderer=${layout.renderer} css=${layout.w.toFixed(1)}x${layout.h.toFixed(1)} devScale=${devScale.toFixed(3)}`);

      await page.waitForTimeout(1300); // fade-in done and the blinking prompt in its visible phase
      if (saveShots) await page.screenshot({ path: `screenshots/${vp.name}-title.png` });

      // Start: keyboard on desktop, tap on touch devices.
      if (vp.touch) await page.touchscreen.tap(vp.width / 2, vp.height / 2);
      else await page.keyboard.press('KeyZ');
      await waitForScene(page, 'DevRoom', 5000);
      check(true, 'start input opens the PHASE 1 room');
      await page.waitForTimeout(500);

      if (!vp.touch) {
        const before = await page.evaluate(() => {
          const p = window.__unclaimed.game.scene.getScene('DevRoom').children.list.find((c) => c.type === 'Sprite');
          return { x: p.x, y: p.y };
        });
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(400);
        await page.keyboard.up('ArrowRight');
        const after = await page.evaluate(() => {
          const p = window.__unclaimed.game.scene.getScene('DevRoom').children.list.find((c) => c.type === 'Sprite');
          return { x: p.x, y: p.y };
        });
        check(after.x > before.x + 10, 'arrow key moves the player', `${before.x} -> ${after.x}`);

        const modeBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('unclaimed:settings') ?? 'null')?.data?.scaleMode ?? 'auto');
        await page.keyboard.press('KeyC');
        await page.waitForTimeout(100);
        const modeAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('unclaimed:settings') ?? 'null')?.data?.scaleMode);
        check(modeAfter && modeAfter !== modeBefore, 'C cycles and persists scale mode', `${modeBefore} -> ${modeAfter}`);
        // Restore so later viewports start from auto.
        await page.evaluate(() => localStorage.clear());

        await page.keyboard.press('F3');
        await page.waitForTimeout(300);
        if (saveShots) await page.screenshot({ path: `screenshots/${vp.name}-devroom-debug.png` });
        await page.keyboard.press('F3');

        await page.keyboard.press('KeyX');
        await waitForScene(page, 'Title', 5000);
        check(true, 'cancel returns to title');

        if (vp.name === 'desktop-1080p') {
          // Leak guard: scene round trips must not accumulate listeners or game objects.
          const probe = () =>
            page.evaluate(() => {
              const app = window.__unclaimed;
              const events = app.core.events;
              const title = app.game.scene.getScene('Title');
              return {
                settings: events.listenerCount('settings:changed'),
                display: events.listenerCount('display:changed'),
                keydown: title.input.keyboard.listenerCount('keydown'),
                objects: title.children.list.length,
              };
            });
          await page.waitForTimeout(800);
          const first = await probe();
          for (let i = 0; i < 5; i++) {
            await page.keyboard.press('KeyZ');
            await waitForScene(page, 'DevRoom', 5000);
            await page.waitForTimeout(450);
            await page.keyboard.press('KeyX');
            await waitForScene(page, 'Title', 5000);
            await page.waitForTimeout(800);
          }
          const after = await probe();
          check(JSON.stringify(first) === JSON.stringify(after), 'no listener/object growth after 5 scene round trips', `${JSON.stringify(first)} -> ${JSON.stringify(after)}`);
        }
      } else {
        // Hold to walk toward the finger (right side of the screen).
        const before = await page.evaluate(() => window.__unclaimed.game.scene.getScene('DevRoom').children.list.find((c) => c.type === 'Sprite').x);
        const cdp = await context.newCDPSession(page);
        const pt = { x: Math.round(vp.width * 0.9), y: Math.round(vp.height / 2) };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
        await page.waitForTimeout(500);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const after = await page.evaluate(() => window.__unclaimed.game.scene.getScene('DevRoom').children.list.find((c) => c.type === 'Sprite').x);
        check(after > before + 5, 'touch-and-hold moves the player', `${before} -> ${after}`);
        if (saveShots) await page.screenshot({ path: `screenshots/${vp.name}-devroom.png` });
      }

      check(errors.length === 0, 'no console errors', errors.join(' | '));
      await context.close();
    }
  } finally {
    await browser.close();
    server?.close();
  }

  console.log(failures.length === 0 ? '\nSMOKE TEST PASSED' : `\nSMOKE TEST FAILED (${failures.length}): ${failures.join('; ')}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
