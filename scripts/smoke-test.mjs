#!/usr/bin/env node
/**
 * Browser smoke test: boots the production build in Chromium and plays through the game.
 *
 *  1. Layout at five screen setups (scale, centring, integer scaling, no errors).
 *  2. Desktop journey: new game → name → intro → inspect → map change → meet Ledger
 *     (choice) → save → pause menu → battle won by ACT + LET GO → battle won by CLEAR →
 *     game over → retry from save → reload page → CONTINUE → settings persistence →
 *     map round trips without listener growth.
 *  3. Phone journey (touch): menus by tapping, name entry, dialogue by tapping,
 *     walking with the on-screen d-pad.
 *
 * Usage:
 *   npm run build && npm run smoke                   # serves ./dist on a free port
 *   npm run smoke -- --url http://localhost:5173     # test a running dev server
 *   npm run smoke -- --shots                         # save screenshots to ./screenshots
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

const VIEWPORTS = [
  { name: 'desktop-1080p', width: 1920, height: 1080, dpr: 1, locale: 'ko-KR', expectInteger: true, expectDevScale: 4 },
  { name: 'win-125pct', width: 1536, height: 864, dpr: 1.25, locale: 'en-US', expectInteger: true, expectDevScale: 4 },
  { name: 'laptop-1366', width: 1366, height: 768, dpr: 1, locale: 'ko-KR', expectInteger: false },
  { name: 'phone-landscape', width: 844, height: 390, dpr: 3, locale: 'ko-KR', touch: true, expectInteger: true, expectDevScale: 4 },
  { name: 'phone-portrait', width: 390, height: 844, dpr: 3, locale: 'en-US', touch: true, expectInteger: false },
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };

async function serveDist() {
  const root = resolve('dist');
  if (!existsSync(join(root, 'index.html'))) {
    console.error('dist/ not found. Run `npm run build` first or pass --url.');
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

const failures = [];
const check = (cond, label, detail = '') => {
  if (cond) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label} ${detail}`);
    failures.push(label);
  }
};

/** Page helpers bound to one page. */
function helpers(page, shotPrefix) {
  const W = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const press = async (key, ms = 160) => {
    await page.keyboard.press(key);
    await wait(ms);
  };
  const isActive = (key) => W((k) => window.__unclaimed.game.scene.isActive(k), key);
  const waitScene = (key, timeout = 10000) =>
    page.waitForFunction((k) => window.__unclaimed?.game.scene.isActive(k), key, { timeout });
  const world = () =>
    W(() => {
      const s = window.__unclaimed.game.scene.getScene('World');
      if (!s || !s.player || !s.sys.isActive()) return null;
      return { x: s.player.x, y: s.player.y, busy: s.busy, map: s.map.id, ui: s.ui.size, facing: s.player.facing };
    });
  const state = () => W(() => JSON.parse(JSON.stringify(window.__unclaimed.core.session?.state ?? null)));
  const shot = async (name) => {
    if (saveShots) await page.screenshot({ path: `screenshots/${shotPrefix}-${name}.png` });
  };
  async function advanceWhile(cond, max = 40, ms = 260) {
    for (let i = 0; i < max; i++) {
      if (!(await cond())) return true;
      await press('KeyZ', ms);
    }
    return !(await cond());
  }
  const idle = async () => advanceWhile(async () => (await world())?.busy === true, 40, 280);
  async function walkTo(tx, ty, timeout = 7000) {
    const t0 = Date.now();
    const held = new Set();
    const set = async (k, on) => {
      if (on && !held.has(k)) {
        await page.keyboard.down(k);
        held.add(k);
      } else if (!on && held.has(k)) {
        await page.keyboard.up(k);
        held.delete(k);
      }
    };
    while (Date.now() - t0 < timeout) {
      const p = await world();
      if (!p || p.busy) break;
      const dx = tx * 16 + 8 - p.x;
      const dy = ty * 16 + 14 - p.y;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) break;
      const horiz = Math.abs(dx) >= 3 && (Math.abs(dx) > Math.abs(dy) || Math.abs(dy) < 3);
      await set('ArrowRight', horiz && dx > 0);
      await set('ArrowLeft', horiz && dx < 0);
      await set('ArrowDown', !horiz && dy > 0);
      await set('ArrowUp', !horiz && dy < 0);
      await wait(40);
    }
    for (const k of [...held]) await page.keyboard.up(k);
    await wait(150);
    return world();
  }
  async function tapGame(x, y) {
    const r = await W(() => {
      const b = document.querySelector('#game-stage canvas').getBoundingClientRect();
      return { left: b.left, top: b.top, w: b.width, h: b.height };
    });
    await page.touchscreen.tap(r.left + (x / BASE_W) * r.w, r.top + (y / BASE_H) * r.h);
    await wait(200);
  }
  return { W, wait, press, isActive, waitScene, world, state, shot, advanceWhile, idle, walkTo, tapGame };
}

async function newContext(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    hasTouch: Boolean(vp.touch),
    isMobile: Boolean(vp.touch),
    locale: vp.locale,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return { context, page, errors };
}

// ── 1. Layout ─────────────────────────────────────────────────────────────────

async function layoutChecks(browser, url) {
  for (const vp of VIEWPORTS) {
    console.log(`\n[layout ${vp.name}] ${vp.width}x${vp.height} @${vp.dpr}x ${vp.locale}`);
    const { context, page, errors } = await newContext(browser, vp);
    const h = helpers(page, vp.name);
    await page.goto(url);
    await h.waitScene('Menu', 15000);
    check(true, 'reaches title screen');
    const layout = await h.W(() => {
      const c = document.querySelector('#game-stage canvas');
      const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, left: r.left, top: r.top, iw: c.width, ih: c.height, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio };
    });
    const devScale = (layout.w * layout.dpr) / BASE_W;
    check(layout.iw === BASE_W && layout.ih === BASE_H, 'native 480x270 backbuffer');
    check(layout.w <= layout.vw + 0.01 && layout.h <= layout.vh + 0.01, 'canvas fits viewport');
    check(Math.abs(layout.w / layout.h - BASE_W / BASE_H) < 0.01, 'aspect ratio preserved');
    check(Math.abs(layout.left - (layout.vw - layout.w) / 2) <= 1 && Math.abs(layout.top - (layout.vh - layout.h) / 2) <= 1, 'canvas centred');
    const isInteger = Math.abs(devScale - Math.round(devScale)) < 0.001;
    check(isInteger === vp.expectInteger, `integer device scale = ${vp.expectInteger}`, `got ${devScale.toFixed(3)}`);
    if (vp.expectDevScale) check(Math.round(devScale) === vp.expectDevScale, `device scale ${vp.expectDevScale}x`);
    await h.wait(1300);
    await h.shot('title');
    if (vp.touch) await h.tapGame(240, 200);
    else await h.press('KeyZ', 500);
    const menuOpen = await h.W(() => window.__unclaimed.game.scene.getScene('Menu').menu !== null);
    check(menuOpen, 'start input opens the main menu');
    await h.shot('menu');
    check(errors.length === 0, 'no console errors', errors.join(' | '));
    await context.close();
  }
}

// ── 2. Desktop journey ────────────────────────────────────────────────────────

async function desktopJourney(browser, url) {
  const vp = VIEWPORTS[0];
  console.log('\n[journey desktop]');
  const { context, page, errors } = await newContext(browser, vp);
  const h = helpers(page, 'journey');
  await page.goto(url);
  await h.waitScene('Menu', 15000);
  await h.wait(900);
  await h.press('KeyZ', 500); // open menu
  await h.press('KeyZ', 350); // NEW GAME
  await h.press('KeyZ', 350); // slot 1
  await page.keyboard.type('하늘');
  await page.keyboard.press('Enter');
  await h.wait(350);
  await h.shot('name-confirm');
  await h.press('KeyZ', 300); // yes
  await h.waitScene('World', 8000);
  check(true, 'new game starts the world');
  await h.wait(900);
  await h.shot('intro');
  await h.idle();
  let s = await h.state();
  check(s?.name === '하늘' && s?.flags.intro_done === true, 'intro script ran and set its flag');
  check(JSON.stringify(s?.inventory) === JSON.stringify(['left-mitten', 'lint-candy']), 'starting items');

  // Secret: inspect the pile three times.
  await h.walkTo(4, 5);
  await h.press('ArrowUp', 120);
  for (let i = 0; i < 3; i++) {
    await h.press('KeyZ', 300);
    await h.idle();
  }
  s = await h.state();
  check(s.buttons === 3 && s.flags.pile_done === true, 'third inspection reveals the hidden buttons');

  // Map transition through a 1-tile door (corner assist).
  await h.walkTo(16, 6);
  await h.walkTo(17, 6, 2500);
  await h.wait(1300);
  check((await h.world())?.map === 'sorting-room', 'door leads to the sorting room');
  check((await h.W(() => window.__unclaimed.core.saves.summary(1).kind)) === 'auto', 'map change autosaves');

  // Meeting Ledger: trigger, dialogue with portrait, choice.
  await h.walkTo(4, 6, 3000);
  await h.wait(600);
  await h.advanceWhile(async () => !(await h.W(() => !!window.__unclaimed.game.scene.getScene('World').dialogue.choice)), 25, 420);
  await h.shot('ledger-choice');
  const faceShown = await h.W(() => window.__unclaimed.game.scene.getScene('World').dialogue.portrait.visible);
  check(faceShown, 'speaker portrait is shown');
  await h.press('ArrowDown', 150);
  await h.press('KeyZ', 300);
  await h.idle();
  s = await h.state();
  check(s.flags.met_ledger === true && s.relations.ledger === 1, 'choice outcome recorded (flag + relation)');

  // Save at the stamp desk.
  await h.walkTo(13, 5);
  await h.press('ArrowUp', 120);
  await h.press('KeyZ', 400);
  await h.advanceWhile(async () => (await h.world())?.ui === 0, 10, 400);
  await h.shot('save-panel');
  await h.press('KeyZ', 400);
  await h.press('KeyZ', 400);
  await h.idle();
  check((await h.W(() => window.__unclaimed.core.saves.summary(1).kind)) === 'manual', 'stamp desk writes a manual save');

  // Pause menu: pocket, status.
  await h.press('KeyC', 300);
  await h.press('KeyZ', 300);
  await h.shot('pocket');
  const pocketItems = await h.W(() => {
    const ui = window.__unclaimed.game.scene.getScene('World').ui;
    return ui.size;
  });
  check(pocketItems === 1, 'pause menu opens');
  await h.press('KeyX', 200);
  await h.press('KeyX', 200);
  await h.press('KeyX', 200);
  check((await h.world())?.ui === 0, 'pause menu closes');

  // Battle 1: ACT twice, then LET GO.
  await h.walkTo(13, 8);
  await h.walkTo(19, 8);
  await h.walkTo(24, 8);
  await h.walkTo(25, 8, 2500);
  await h.wait(1300);
  check((await h.world())?.map === 'umbrella-path', 'exit unlocked after meeting Ledger');
  await h.shot('umbrella-path');
  await h.walkTo(6, 3, 3000);
  // The ambush line plays first, then the battle starts.
  for (let i = 0; i < 10 && !(await h.isActive('Battle')); i++) await h.press('KeyZ', 400);
  await h.waitScene('Battle', 10000);
  check(true, 'trigger starts a battle');
  const battle = () =>
    h.W(() => {
      const b = window.__unclaimed.game.scene.getScene('Battle');
      const e = b.model?.enemies.map((x) => ({ id: x.def.id, status: x.status, vars: x.vars, hp: x.hp }));
      return { commands: b.commands?.enabled, dodging: b.dodging, enemies: e };
    });
  const toCommands = async () => {
    for (let i = 0; i < 90; i++) {
      const b = await battle();
      if (b.commands) return true;
      if (!b.dodging) await h.press('KeyZ', 220);
      else await h.wait(250);
    }
    return false;
  };
  // Select by setting the cursor through the scene (deterministic), then confirm with Z.
  const chooseCommand = async (index) => {
    await h.W((i) => {
      const c = window.__unclaimed.game.scene.getScene('Battle').commands;
      c.index = i;
      c.draw();
    }, index);
    await h.press('KeyZ', 300);
  };
  const chooseFromList = async (index) => {
    await h.W((i) => window.__unclaimed.game.scene.getScene('Battle').focus.select(i, true), index);
    await h.press('KeyZ', 300);
  };
  check(await toCommands(), 'battle reaches command selection');
  await h.shot('battle-commands');
  for (let round = 0; round < 2; round++) {
    await chooseCommand(1); // ACT
    if (round === 0) await h.shot('battle-acts');
    await chooseFromList(1); // 풀어주기
    let sawDodge = false;
    for (let i = 0; i < 40 && !sawDodge; i++) {
      sawDodge = (await battle()).dodging;
      if (!sawDodge) await h.press('KeyZ', 230);
    }
    if (round === 0) {
      check(sawDodge, 'enemy turn: bullet pattern runs');
      await h.wait(1200);
      await h.shot('battle-dodge');
      const bullets = await h.W(() => window.__unclaimed.game.scene.getScene('Battle').bullets.activeCount);
      check(bullets > 0, 'bullets are spawned from the pool', `active=${bullets}`);
    }
    await toCommands();
  }
  const tangle = (await battle()).enemies[0].vars.tangle;
  check(tangle === 0, 'ACT changed the enemy state', `tangle=${tangle}`);
  await chooseCommand(3); // LET GO
  await chooseFromList(0); // 놓아주기
  for (let i = 0; i < 14 && (await h.isActive('Battle')); i++) await h.press('KeyZ', 380);
  await h.wait(700);
  await h.idle();
  s = await h.state();
  check(s.flags.last_battle === 'spared' && s.encounters.earbuds?.spared === 1, 'LET GO spares the enemy and the world remembers');

  // Battle 2 (started by script command): CLEAR the receipt ghost.
  await h.W(() => {
    const w = window.__unclaimed.game.scene.getScene('World');
    // Full HP so this check doesn't depend on how many hits the previous fight landed.
    window.__unclaimed.core.session.state.hp = window.__unclaimed.core.session.state.maxHp;
    w.busy = true;
    void w.command({ do: 'battle', enemies: ['receipt'] }).then(() => {
      w.busy = false;
    });
  });
  await h.waitScene('Battle', 10000);
  for (let round = 0; round < 8; round++) {
    if (!(await toCommands())) break;
    await chooseCommand(0); // CLEAR
    await h.wait(400); // the meter sweeps; press near the centre
    if (round === 0) await h.shot('attack-meter');
    await h.press('KeyZ', 1300);
    const b = await battle();
    if (round === 0) {
      for (let i = 0; i < 20 && !(await battle()).dodging; i++) await h.press('KeyZ', 230);
      await h.wait(2500);
      await h.shot('receipt-dodge');
    }
    if (process.env.SMOKE_DEBUG) console.log('    clear round', round, JSON.stringify(b));
    if (b.enemies[0].status === 'cleared') break;
  }
  check((await battle()).enemies[0].status === 'cleared', 'CLEAR attacks reduce HP until the enemy is cleared');
  for (let i = 0; i < 14 && (await h.isActive('Battle')); i++) await h.press('KeyZ', 380);
  await h.wait(800);
  s = await h.state();
  check(s.encounters.receipt?.cleared === 1, 'clearing is recorded');

  // Ledger reacts to what you did (world remembers choices).
  await h.walkTo(1, 3, 6000);
  await h.walkTo(0, 3, 2500);
  await h.wait(1300);
  await h.walkTo(11, 8, 6000);
  await h.walkTo(11, 5, 3000);
  await h.press('ArrowUp', 120);
  if (process.env.SMOKE_DEBUG) console.log('    before ledger', JSON.stringify(await h.world()));
  await h.press('KeyZ', 400);
  const ledgerLine = await h.W(() => window.__unclaimed.game.scene.getScene('World').dialogue.chars.map((c) => c.ch).join(''));
  check(ledgerLine.includes('정중히') || ledgerLine.includes('놓아주셨'), 'Ledger mentions the spared earbuds', ledgerLine.slice(0, 40));
  await h.idle();

  // Defeat → game over → retry from the manual save.
  await h.W(() => {
    const w = window.__unclaimed.game.scene.getScene('World');
    window.__unclaimed.core.session.state.hp = 1;
    w.busy = true;
    void w.command({ do: 'battle', enemies: ['earbuds'] });
  });
  await h.waitScene('Battle', 10000);
  for (let i = 0; i < 40 && !(await h.isActive('GameOver')); i++) {
    const b = await battle().catch(() => ({ commands: false }));
    if (b.commands) {
      await chooseCommand(1);
      await chooseFromList(0); // check: costs the turn, then the enemy attacks
    } else await h.press('KeyZ', 300);
  }
  await h.waitScene('GameOver', 15000);
  check(true, 'losing all HP leads to game over');
  await h.wait(1600);
  await h.shot('gameover');
  await h.press('KeyZ', 300);
  await h.waitScene('World', 6000);
  await h.wait(600);
  s = await h.state();
  check(s.location.map === 'sorting-room' && s.hp === s.maxHp, 'retry restores the last manual save');

  // Reload → CONTINUE.
  await page.reload();
  await h.waitScene('Menu', 15000);
  await h.wait(900);
  await h.press('KeyZ', 500);
  const cursor = await h.W(() => window.__unclaimed.game.scene.getScene('Menu').menu.index);
  check(cursor === 1, 'CONTINUE is preselected when a save exists');
  await h.press('KeyZ', 350);
  await h.press('KeyZ', 350);
  await h.waitScene('World', 8000);
  await h.wait(600);
  s = await h.state();
  check(s?.name === '하늘' && s.location.map === 'sorting-room' && s.flags.met_ledger === true, 'CONTINUE restores the saved game');

  // Map round trips must not accumulate listeners.
  const probe = () =>
    h.W(() => {
      const app = window.__unclaimed;
      return { settings: app.core.events.listenerCount('settings:changed'), display: app.core.events.listenerCount('display:changed'), objects: app.game.scene.getScene('World').children.list.length };
    });
  await h.walkTo(1, 6, 6000);
  const before = await probe();
  for (let i = 0; i < 3; i++) {
    await h.walkTo(0, 6, 2500);
    await h.wait(1300);
    await h.walkTo(17, 6, 3000);
    await h.wait(1300);
  }
  const after = await probe();
  check(JSON.stringify(before) === JSON.stringify(after), 'no listener/object growth after map round trips', `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

  // Settings: change the scale mode in the pause menu and check it persists.
  await h.press('KeyC', 300);
  await h.press('ArrowDown', 120);
  await h.press('ArrowDown', 120);
  await h.press('KeyZ', 300);
  for (let i = 0; i < 5; i++) await h.press('ArrowDown', 100);
  await h.press('ArrowRight', 200);
  const mode = await h.W(() => JSON.parse(localStorage.getItem('unclaimed:settings')).data.scaleMode);
  check(mode === 'pixel-perfect', 'settings change persists to storage', mode);
  await h.shot('settings');

  check(errors.length === 0, 'no console errors during the journey', errors.join(' | '));
  await context.close();
}

// ── 3. Phone journey ──────────────────────────────────────────────────────────

async function phoneJourney(browser, url) {
  const vp = VIEWPORTS[3];
  console.log('\n[journey phone]');
  const { context, page, errors } = await newContext(browser, vp);
  const h = helpers(page, 'phone');
  await page.goto(url);
  await h.waitScene('Menu', 15000);
  await h.wait(900);
  await h.tapGame(240, 200); // open menu
  await h.wait(400);
  await h.tapGame(240, 175); // NEW GAME row (selected → confirm)
  await h.wait(300);
  await h.tapGame(150, 104); // slot 1 row (selected → confirm)
  await h.wait(300);
  await page.keyboard.type('Mina');
  await page.keyboard.press('Enter');
  await h.wait(300);
  await h.tapGame(200, 141); // "Yes" (preselected) → confirm
  await h.waitScene('World', 8000);
  check(true, 'menus can be driven by touch');
  await h.wait(900);
  for (let i = 0; i < 20 && (await h.world())?.busy; i++) await h.tapGame(240, 135);
  check((await h.world())?.busy === false, 'dialogue advances by tapping');
  const touchVisible = await h.W(() => window.__unclaimed.core.touch.visible);
  check(touchVisible, 'touch controls are shown in the world');
  await h.shot('world-touch');
  const x0 = (await h.world()).x;
  const r = await h.W(() => {
    const b = document.querySelector('#game-stage canvas').getBoundingClientRect();
    return { left: b.left, top: b.top, w: b.width, h: b.height };
  });
  const cdp = await context.newCDPSession(page);
  const pt = { x: Math.round(r.left + ((18 + 44 + 11) / BASE_W) * r.w), y: Math.round(r.top + ((BASE_H - 82 + 22 + 11) / BASE_H) * r.h) };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  await h.wait(600);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const x1 = (await h.world()).x;
  check(x1 > x0 + 10, 'holding the d-pad walks the player', `${x0} -> ${x1}`);
  check(errors.length === 0, 'no console errors on phone', errors.join(' | '));
  await context.close();
}

async function run() {
  const external = argValue('--url');
  const server = external ? null : await serveDist();
  const url = external ?? server.url;
  console.log(`smoke test against ${url}`);
  if (saveShots) await mkdir('screenshots', { recursive: true });
  const browser = await chromium.launch();
  try {
    await layoutChecks(browser, url);
    await desktopJourney(browser, url);
    await phoneJourney(browser, url);
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
