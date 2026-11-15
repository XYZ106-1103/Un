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
 *  4. Damaged storage: bad checksum, newer save version, truncated save with a good
 *     backup, garbage settings/meta → boots, reports, recovers, loads.
 *  5. Device profiles (iPhone, Pixel, iPad, Galaxy Tab; Chromium with each device's
 *     viewport, pixel ratio, user agent and touch): fit, no scrolling, tap to start.
 *  6. Chapter 1, two routes from the forest entrance: "return" (Mitt joins, valve puzzle,
 *     shop, Brolly praised → tether phase → rain → spared, mitten given back, ending) and
 *     "clear" (hollow world: name plates, closed shop, Mitt stays behind, Brolly cleared,
 *     ending, title loses its tag).
 *  7. Runtime crash notice: an injected error pauses the game behind a notice once;
 *     "keep playing" resumes it.
 *
 * Usage:
 *   npm run build && npm run smoke                   # serves ./dist on a free port
 *   npm run smoke -- --url http://localhost:5173     # test a running dev server
 *   npm run smoke -- --shots                         # save screenshots to ./screenshots
 *   npm run smoke -- --only damaged,devices          # run some sections (layout, desktop,
 *                                                    # phone, chapter1, damaged, devices, crash)
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
  // The receipt ghost was cleared after that save: Ledger "wrote it in ink" and notices.
  const undo = await h.W(() => ({
    flag: window.__unclaimed.core.session.state.flags.meta_undo,
    notices: window.__unclaimed.core.meta.data.undoNotices,
    line: window.__unclaimed.game.scene.getScene('World').dialogue.chars.map((c) => c.ch).join(''),
  }));
  check(undo.flag === 'receipt' && undo.notices === 1, 'loading a save made before a CLEAR is remembered (meta)', JSON.stringify(undo));
  check(undo.line.includes('잠깐만요'), 'Ledger reacts to the undo on arrival', undo.line.slice(0, 30));
  await h.idle();

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
  // Find SETTINGS by its label, not its position (the pause menu grows with the game).
  const settingsRow = await h.W(() => window.__unclaimed.game.scene.getScene('World').ui.top.menu.items.findIndex((i) => i.label === '설정'));
  check(settingsRow >= 0, 'pause menu has a SETTINGS entry');
  for (let i = 0; i < settingsRow; i++) await h.press('ArrowDown', 120);
  await h.press('KeyZ', 300);
  for (let i = 0; i < 5; i++) await h.press('ArrowDown', 100);
  await h.press('ArrowRight', 200);
  const mode = await h.W(() => JSON.parse(localStorage.getItem('unclaimed:settings') ?? '{}').data?.scaleMode ?? null);
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

// ── 4. Damaged storage ────────────────────────────────────────────────────────

async function damagedStorage(browser, url) {
  console.log('\n[damaged storage]');
  const { context, page, errors } = await newContext(browser, VIEWPORTS[0]);
  const h = helpers(page, 'damaged');
  await page.goto(url);
  await h.waitScene('Menu', 15000);
  await h.wait(800);
  await h.press('KeyZ', 500);
  await h.press('KeyZ', 300);
  await h.press('KeyZ', 300);
  await page.keyboard.type('Rin');
  await page.keyboard.press('Enter');
  await h.wait(300);
  await h.press('KeyZ', 300);
  await h.waitScene('World', 8000);
  await h.wait(500);
  // Make real saves to damage: slot 2 (future version) and slot 3 (main damaged, backup good).
  await h.W(() => {
    const { saves, session } = window.__unclaimed.core;
    saves.save(2, session.state);
    saves.save(3, session.state);
    const good = localStorage.getItem('unclaimed:save.3');
    localStorage.setItem('unclaimed:save.3.bak', good);
    localStorage.setItem('unclaimed:save.3', good.slice(0, Math.floor(good.length / 2)));
    const future = JSON.parse(localStorage.getItem('unclaimed:save.2'));
    future.version = 99;
    localStorage.setItem('unclaimed:save.2', JSON.stringify(future));
    localStorage.setItem('unclaimed:save.1', '{"format":"unclaimed-save","version":1,"checksum":"00000000","data":{"name":"x"}}');
    localStorage.removeItem('unclaimed:save.1.auto');
    localStorage.setItem('unclaimed:save.1.auto', '\u0000\u0001garbage');
    localStorage.setItem('unclaimed:settings', '[1,2');
    localStorage.setItem('unclaimed:meta', '{"format":"unclaimed-save","version":1,"checksum":"bad","data":5}');
  });
  await page.reload();
  await h.waitScene('Menu', 15000);
  check(true, 'boots to the title with every store damaged');
  const s = await h.W(() => {
    const { saves, settings } = window.__unclaimed.core;
    return {
      summaries: saves.summaries().map((x) => ({ slot: x.slot, status: x.status, recovered: x.recovered ?? false })),
      master: settings.get('masterVolume'),
      lang: settings.get('language'),
    };
  });
  const by = Object.fromEntries(s.summaries.map((x) => [x.slot, x]));
  check(by[1]?.status === 'corrupt', 'bad checksum slot reports damaged', JSON.stringify(by[1]));
  check(by[2]?.status === 'future-version', 'newer-version slot is reported, not loaded', JSON.stringify(by[2]));
  check(by[3]?.status === 'ok' && by[3]?.recovered === true, 'damaged slot recovers from its backup', JSON.stringify(by[3]));
  check(s.master === 0.8 && s.lang === 'auto', 'damaged settings fall back to defaults', JSON.stringify(s));
  await h.press('KeyZ', 500);
  const menu = await h.W(() => window.__unclaimed.game.scene.getScene('Menu').menu?.items?.map((i) => !i.disabled));
  check(menu?.[1] === true, 'CONTINUE is offered (a recoverable save exists)', JSON.stringify(menu));
  await h.press('KeyZ', 400); // CONTINUE is preselected when a save exists
  const slots = await h.W(() => {
    const ui = window.__unclaimed.game.scene.getScene('Menu').ui;
    return ui.top?.menu?.items?.map((i) => ({ label: i.label, disabled: Boolean(i.disabled) }));
  });
  check(slots?.[0]?.disabled && slots?.[1]?.disabled && !slots?.[2]?.disabled, 'damaged slots cannot be loaded', JSON.stringify(slots));
  await h.shot('slots');
  await h.press('KeyZ', 400); // slot 3 is preselected (last used)
  await h.waitScene('World', 8000);
  const name = (await h.state())?.name;
  check(name === 'Rin', 'the recovered save loads into the world', name);
  const raw1 = await h.W(() => localStorage.getItem('unclaimed:save.1'));
  check(raw1 !== null, 'damaged data stays in place after loading another slot (read-only load)');
  check(errors.length === 0, 'no console errors with damaged storage', errors.join(' | '));
  await context.close();
}

// ── 5. Device profiles ────────────────────────────────────────────────────────

async function deviceProfiles(browser, url) {
  const { devices } = require('playwright');
  const names = ['iPhone 15', 'iPhone 15 landscape', 'Pixel 7', 'Pixel 7 landscape', 'iPad Mini landscape', 'Galaxy Tab S9 landscape'];
  for (const name of names) {
    const d = devices[name];
    if (!d) {
      check(false, `device profile "${name}" exists`);
      continue;
    }
    console.log(`\n[device ${name}] ${d.viewport.width}x${d.viewport.height} @${d.deviceScaleFactor}x (Chromium with this device's UA/viewport/touch)`);
    const context = await browser.newContext({ ...d, locale: 'ko-KR' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    const h = helpers(page, `device-${name.replace(/\s+/g, '-')}`);
    await page.goto(url);
    await h.waitScene('Menu', 15000);
    const l = await h.W(() => {
      const r = document.querySelector('#game-stage canvas').getBoundingClientRect();
      return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, sx: document.documentElement.scrollWidth, sy: document.documentElement.scrollHeight };
    });
    check(l.w <= l.vw + 0.01 && l.h <= l.vh + 0.01, 'canvas fits the screen', JSON.stringify(l));
    check(l.sx <= l.vw + 1 && l.sy <= l.vh + 1, 'no page scrolling', JSON.stringify(l));
    check(l.w >= Math.min(l.vw, (l.vh * BASE_W) / BASE_H) * 0.8, 'canvas uses most of the screen', JSON.stringify(l));
    await h.wait(900);
    await h.tapGame(240, 200);
    const open = await h.W(() => window.__unclaimed.game.scene.getScene('Menu').menu !== null);
    check(open, 'tap opens the main menu');
    await h.shot('menu');
    check(errors.length === 0, 'no console errors', errors.join(' | '));
    await context.close();
  }
}

// ── 6. Chapter 1: both ends of the moral spectrum ─────────────────────────────
// Starts each route at the forest entrance with chapter 0 already played (chapter 0 is
// covered by the desktop journey) and random encounters off, so runs are deterministic.

async function chapterOne(browser, url) {
  for (const route of ['return', 'clear']) {
    console.log(`\n[chapter 1: ${route} route]`);
    const { context, page, errors } = await newContext(browser, VIEWPORTS[0]);
    const h = helpers(page, `ch1-${route}`);
    const W = h.W;
    const choiceOpen = () => W(() => !!window.__unclaimed.game.scene.getScene('World').dialogue.choice);
    const untilChoice = async (max = 40) => {
      for (let i = 0; i < max; i++) {
        if (await choiceOpen()) return true;
        if (!(await h.world())?.busy) return false;
        await h.press('KeyZ', 300);
      }
      return false;
    };
    const idle = async (max = 40) => {
      for (let i = 0; i < max; i++) {
        const w = await h.world();
        if (!w || (!w.busy && w.ui === 0) || (await choiceOpen())) return;
        await h.press('KeyZ', 260);
      }
    };
    const battle = () =>
      W(() => {
        const b = window.__unclaimed.game.scene.getScene('Battle');
        return {
          commands: b.commands?.enabled,
          dodging: b.dodging,
          soul: b.soul?.mode,
          enemies: b.model?.enemies.map((e) => ({ id: e.def.id, status: e.status, vars: e.vars, hp: e.hp })),
        };
      });
    const toCommands = async () => {
      for (let i = 0; i < 120; i++) {
        if (!(await h.isActive('Battle'))) return false;
        const b = await battle();
        if (b.commands) return true;
        if (!b.dodging) await h.press('KeyZ', 220);
        else await h.wait(250);
      }
      return false;
    };
    const command = async (i) => {
      await W((i) => {
        const c = window.__unclaimed.game.scene.getScene('Battle').commands;
        c.index = i;
        c.draw();
      }, i);
      await h.press('KeyZ', 300);
    };
    const pick = async (i) => {
      await W((i) => window.__unclaimed.game.scene.getScene('Battle').focus.select(i, true), i);
      await h.press('KeyZ', 300);
    };
    const act = async (id) => {
      await command(1);
      const i = await W((id) => {
        const b = window.__unclaimed.game.scene.getScene('Battle');
        return b.model.acts(b.model.active[0]).findIndex((a) => a.act.id === id);
      }, id);
      check(i >= 0, `ACT "${id}" is available`);
      await pick(Math.max(0, i));
    };

    await page.goto(url);
    await h.waitScene('Menu', 15000);
    await h.wait(800);
    await h.press('KeyZ', 500);
    await h.press('KeyZ', 300);
    await h.press('KeyZ', 300);
    await page.keyboard.type('하늘');
    await page.keyboard.press('Enter');
    await h.wait(300);
    await h.press('KeyZ', 1500);
    await h.waitScene('World', 8000);
    await h.wait(700);
    await idle();
    await W((route) => {
      const s = window.__unclaimed.core.session.state;
      Object.assign(s.flags, { met_ledger: true, 'trigger:sorting-room.meet': true, 'trigger:umbrella-path.ambush': true });
      s.buttons = 30;
      s.maxHp = 99;
      s.hp = 99;
      if (route === 'return') {
        s.stats.spared = 1;
        s.encounters.earbuds = { met: 1, spared: 1, cleared: 0 };
      } else {
        s.stats.cleared = 4;
        s.stats.spared = 0;
        s.encounters.earbuds = { met: 1, spared: 0, cleared: 2 };
        s.encounters.receipt = { met: 1, spared: 0, cleared: 2 };
      }
      const w = window.__unclaimed.game.scene.getScene('World');
      w.checkEncounter = () => false;
      w.scene.restart({ map: 'forest-1', spawn: 'from-path' });
    }, route);
    await h.wait(1500);
    await W(() => {
      window.__unclaimed.game.scene.getScene('World').checkEncounter = () => false;
    });
    await idle();
    check((await h.world())?.map === 'forest-1', 'forest entrance loads');
    const hollow = await W(() => ({ filter: window.__unclaimed.game.scene.getScene('World').dialogue.nameFilter !== null }));
    check(hollow.filter === (route === 'clear'), `world ${route === 'clear' ? 'is' : 'is not'} hollow (name plates)`, JSON.stringify(hollow));

    // Mitt.
    await h.walkTo(11, 5);
    await h.wait(500);
    check(await untilChoice(), 'meeting Mitt offers a choice');
    if (route === 'clear') {
      const plate = await W(() => window.__unclaimed.game.scene.getScene('World').dialogue.nameText?.text ?? null);
      check(plate?.includes('물품'), 'hollow world shows "(물품)" name plates', String(plate));
    }
    await h.shot('mitt');
    await h.press('ArrowDown', 120);
    await h.press('KeyZ', 300); // show the mitten
    await untilChoice();
    await h.press('KeyZ', 300); // come with me
    await idle();
    let s = await h.state();
    check(s.flags.follower === 'mitt', 'Mitt follows the player', String(s.flags.follower));
    await h.walkTo(20, 5);
    await h.walkTo(29, 5, 4000);
    await h.wait(1300);
    check((await h.world())?.map === 'forest-2', 'forest 2 loads');

    if (route === 'return') {
      // Valve puzzle: red + gold open, blue stays shut; then fill the tank and the can.
      await h.walkTo(6, 4);
      await h.press('ArrowUp');
      await h.press('KeyZ', 300);
      await idle();
      for (const vx of [6, 12]) {
        await h.walkTo(vx, 6);
        await h.press('ArrowDown');
        await h.press('KeyZ', 300);
        await idle();
      }
      await h.walkTo(6, 4);
      await h.press('ArrowUp');
      await h.press('KeyZ', 300);
      await idle(30);
      await h.walkTo(9, 4);
      await h.walkTo(9, 2);
      await h.press('ArrowLeft');
      await h.press('KeyZ', 300);
      await idle();
      await h.walkTo(9, 4);
      await h.walkTo(7, 4);
      await h.press('ArrowUp');
      await h.press('KeyZ', 300);
      await idle();
      s = await h.state();
      check(s.flags.tank_full === true, 'valve puzzle fills the tank');
      check(s.inventory.includes('watering-can-full'), 'watering can filled', JSON.stringify(s.inventory));
      // Shop.
      await h.walkTo(18, 4);
      await h.press('ArrowUp');
      await h.press('KeyZ', 300);
      for (let i = 0; i < 10 && (await h.world()).ui === 0; i++) await h.press('KeyZ', 300);
      check((await h.world()).ui > 0, 'shop opens');
      await h.shot('shop');
      const before = (await h.state()).buttons;
      await W(() => window.__unclaimed.game.scene.getScene('World').ui.top.menu.select(0, true));
      await h.press('KeyZ', 300);
      await h.press('KeyX', 300);
      await idle();
      s = await h.state();
      check(s.buttons < before, 'buying spends buttons', `${before} -> ${s.buttons}`);
    } else {
      const keeper = await W(() => window.__unclaimed.game.scene.getScene('World').npcs.some((n) => n.def.id === 'hoopstud'));
      check(keeper === false, 'shopkeepers are gone from a hollow forest', String(keeper));
      await h.walkTo(18, 4);
      await h.press('ArrowUp');
      await h.press('KeyZ', 300);
      await h.wait(300);
      check((await h.world()).ui === 0, 'the closed stall does not open a shop');
      await idle();
    }

    await h.walkTo(26, 5);
    await h.walkTo(27, 5, 3000);
    await h.wait(1300);
    check((await h.world())?.map === 'forest-3', 'forest 3 loads');
    await idle();
    s = await h.state();
    if (route === 'clear') check(s.flags.mitt_left === true && !s.flags.follower, 'Mitt stays behind in a hollow world', JSON.stringify({ left: s.flags.mitt_left, f: s.flags.follower }));
    else check(s.flags.follower === 'mitt', 'Mitt is still with the player');

    // Sir Brolly.
    await h.walkTo(9, 5, 4000);
    await h.wait(500);
    for (let i = 0; i < 30 && !(await h.isActive('Battle')); i++) await h.press('KeyZ', 350);
    check(await h.isActive('Battle'), 'boss battle starts');
    await h.wait(900);
    check(await toCommands(), 'boss battle reaches commands');
    if (route === 'return') {
      await act('praise');
      await toCommands();
      await act('praise');
      await toCommands();
      check((await battle()).enemies[0].vars.phase === 1, 'praise twice opens the canopy (phase 2)', JSON.stringify((await battle()).enemies[0].vars));
      await act('shelter');
      for (let i = 0; i < 40 && !(await battle()).dodging; i++) await h.press('KeyZ', 230);
      await h.wait(1200);
      check((await battle()).soul === 'tether', 'phase 2 swings the soul on a tether');
      await h.shot('tether');
      await toCommands();
      await act('rain');
      await toCommands();
      const vars = (await battle()).enemies[0].vars;
      check(vars.rained >= 1, 'watering the canopy makes it rain', JSON.stringify(vars));
      await command(3);
      await pick(0);
    } else {
      for (let round = 0; round < 20; round++) {
        if (!(await toCommands())) break;
        await command(0);
        await h.wait(400);
        await h.press('KeyZ', 1300);
        if ((await battle()).enemies?.[0]?.status === 'cleared') break;
      }
      check((await battle()).enemies?.[0]?.status === 'cleared', 'CLEAR wins the boss battle');
    }
    for (let i = 0; i < 20 && (await h.isActive('Battle')); i++) await h.press('KeyZ', 350);
    await h.wait(800);
    await idle(30);
    s = await h.state();
    if (route === 'return') check(s.flags.brolly_spared === true && s.flags.brolly_rain === true, 'Brolly spared in the rain');
    else check(s.flags.brolly_cleared === true, 'Brolly cleared and removed');

    // The grove and the ending.
    await h.walkTo(19, 5, 6000);
    await h.walkTo(20, 5, 3000);
    await h.wait(600);
    if (route === 'return') {
      await untilChoice();
      await h.press('KeyZ', 300);
      await untilChoice();
      await h.press('KeyZ', 300);
      await untilChoice();
      await h.press('KeyZ', 300);
    }
    for (let i = 0; i < 25 && !(await h.isActive('Ending')); i++) await h.press('KeyZ', 350);
    check(await h.isActive('Ending'), 'chapter ending plays');
    await h.wait(4000);
    await h.shot('ending');
    const meta = await W(() => ({ last: window.__unclaimed.core.meta.lastEnding }));
    check(meta.last === route, `"${route}" ending is remembered across saves`, JSON.stringify(meta));
    // Pages advance with Z; holding Z speeds up the credits; Z on the final line exits.
    let sawCredits = false;
    for (let i = 0; i < 120 && !(await h.isActive('Menu')); i++) {
      const stage = await W(() => window.__unclaimed.game.scene.getScene('Ending').stage);
      if (stage === 'credits') {
        sawCredits = true;
        await page.keyboard.down('KeyZ');
        await h.wait(500);
        continue;
      }
      await page.keyboard.up('KeyZ');
      if (stage === 'final') await h.wait(1600);
      await h.press('KeyZ', 500);
    }
    await page.keyboard.up('KeyZ');
    check(sawCredits, 'credits roll after the ending pages');
    check(await h.isActive('Menu'), 'ending returns to the title');
    await h.wait(1500);
    const tag = await W(() => window.__unclaimed.game.scene.getScene('Menu').tag?.visible);
    check(tag === (route !== 'clear'), `title ${route === 'clear' ? 'loses' : 'keeps'} the claim tag`, String(tag));
    await h.shot('title-after');
    check(errors.length === 0, 'no console errors in chapter 1', errors.join(' | '));
    await context.close();
  }
}

// ── 7. Runtime crash notice ───────────────────────────────────────────────────

async function crashNotice(browser, url) {
  console.log('\n[crash notice]');
  const { context, page, errors } = await newContext(browser, VIEWPORTS[0]);
  const h = helpers(page, 'crash');
  await page.goto(url);
  await h.waitScene('Menu', 15000);
  await h.wait(500);
  await h.W(() => setTimeout(() => {
    throw new Error('smoke: injected crash');
  }));
  await h.wait(300);
  const overlay = await h.W(() => {
    const el = document.querySelector('.runtime-error');
    return el ? { text: el.textContent, focused: document.activeElement?.tagName, sleeping: window.__unclaimed.game.loop.running === false || window.__unclaimed.game.loop.sleeping === true } : null;
  });
  check(overlay !== null, 'an uncaught error shows the crash notice');
  check(overlay?.text.includes('smoke: injected crash'), 'the notice includes the error message');
  check(overlay?.sleeping, 'the game loop pauses behind the notice', JSON.stringify(overlay));
  await h.shot('notice');
  await h.W(() => {
    void Promise.reject(new Error('smoke: second error'));
  });
  await h.wait(200);
  check((await h.W(() => document.querySelectorAll('.runtime-error').length)) === 1, 'a second error does not stack another notice');
  await page.keyboard.press('Tab'); // reload → keep playing
  await page.keyboard.press('Enter');
  await h.wait(300);
  const after = await h.W(() => ({ gone: !document.querySelector('.runtime-error'), frame: window.__unclaimed.game.loop.frame }));
  await h.wait(300);
  const frame2 = await h.W(() => window.__unclaimed.game.loop.frame);
  check(after.gone, 'keep playing (keyboard) closes the notice');
  check(frame2 > after.frame, 'the game loop resumes', `${after.frame} -> ${frame2}`);
  const unexpected = errors.filter((e) => !e.includes('smoke:') && !e.includes('[ErrorOverlay]'));
  check(unexpected.length === 0, 'no other console errors', unexpected.join(' | '));
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
    const sections = { layout: layoutChecks, desktop: desktopJourney, phone: phoneJourney, chapter1: chapterOne, damaged: damagedStorage, devices: deviceProfiles, crash: crashNotice };
    const only = argValue('--only')?.split(',');
    for (const [name, fn] of Object.entries(sections)) if (!only || only.includes(name)) await fn(browser, url);
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
