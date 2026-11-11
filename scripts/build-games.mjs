// Builds the Cocos project headlessly with Cocos Creator 3.8.x, post-processes the web build and
// publishes it for every game slug.  Usage: node scripts/build-games.mjs [--skip-build]
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(import.meta.dirname, '..');
const project = path.join(root, 'cocos');
const outDir = path.join(project, 'build', 'player');
const slugs = ['lucky-wheel'];
const creatorDir = process.env.COCOS_CREATOR_DIR || 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8';
const exe = path.join(creatorDir, 'CocosCreator.exe');
const skip = process.argv.includes('--skip-build');

const sceneMeta = JSON.parse(fs.readFileSync(path.join(project, 'assets/scenes/player.scene.meta'), 'utf8'));

async function build() {
  if (!fs.existsSync(exe)) throw new Error(`Cocos Creator not found at ${exe} (set COCOS_CREATOR_DIR)`);
  fs.rmSync(outDir, { recursive: true, force: true });
  const logFile = path.join(os.tmpdir(), 'cocos-build.log');
  fs.writeFileSync(logFile, '');
  const args = ['--project', project, '--build', `platform=web-mobile;debug=false;startScene=${sceneMeta.uuid};outputName=player;md5Cache=false;sourceMaps=false`];
  const logFd = fs.openSync(logFile, 'a');
  const child = spawn(exe, args, { stdio: ['ignore', logFd, logFd], windowsHide: true });
  console.log('Cocos Creator build started (about 1-2 minutes)...');
  const started = Date.now();
  await new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const log = fs.readFileSync(logFile, 'utf8');
      const done = /build Task \(player\) Finished/.test(log);
      const failed = /build Task \(player\) Failed|Build failed|build failed/i.test(log);
      if (done || failed || child.exitCode !== null || Date.now() - started > 8 * 60_000) {
        clearInterval(timer);
        try { execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ }
        if (done) resolve();
        else reject(new Error(`Build did not finish successfully. See ${logFile}\n` + log.split('\n').filter(l => /error/i.test(l)).slice(-12).join('\n')));
      }
    }, 2000);
  });
  console.log(`Build finished in ${Math.round((Date.now() - started) / 1000)}s`);
}

function patch() {
  // 1. no Cocos splash screen / logo
  const sp = path.join(outDir, 'src/settings.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  s.splashScreen = { ...s.splashScreen, totalTime: 0, logo: { type: 'none' }, background: { type: 'color', color: { x: 0.055, y: 0.047, z: 0.118, w: 1 } }, watermarkLocation: 'default', autoFit: true };
  fs.writeFileSync(sp, JSON.stringify(s));
  // 2. page chrome
  const hp = path.join(outDir, 'index.html');
  let html = fs.readFileSync(hp, 'utf8');
  html = html.replace(/<title>.*?<\/title>/, '<title>Game</title>')
    .replace('<meta name="viewport"', '<meta name="theme-color" content="#0e0c1e"/>\n  <meta name="viewport"');
  fs.writeFileSync(hp, html);
  const cp = path.join(outDir, 'style.css');
  fs.writeFileSync(cp, fs.readFileSync(cp, 'utf8').replace('background-color: #333;', 'background-color: #0e0c1e;'));
}

function publish() {
  const games = path.join(root, 'server/public/games');
  for (const slug of slugs) {
    const dest = path.join(games, slug);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(outDir, dest, { recursive: true });
  }
  console.log('Published build for:', slugs.join(', '));
}

if (!skip) await build();
if (!fs.existsSync(outDir)) throw new Error('No build output at ' + outDir);
patch();
publish();
