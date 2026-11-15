// Длинная проверка защиты хранилища: много запусков оболочки с настоящим прогрессом.
// Считает, сколько раз вместо прогресса показан первый экран (должно быть 0) и сколько раз сработала защита.
//
//   xvfb-run -a node soak.js cold 300      — холодные запуски (программу открыли и закрыли)
//   xvfb-run -a node soak.js reload 500    — перезагрузки страницы подряд
//   … --provoke  — в начало файла добавляется раннее обращение к хранилищу. На маленькой пробной странице оно
//                  давало пустое хранилище примерно в 2 % запусков; в оболочке за 400 запусков сбой не случился ни разу
const path = require('path'), fs = require('fs'), os = require('os');
const { execFileSync } = require('child_process');
const pw = require(path.join(__dirname, '..', 'tests', 'node_modules', 'playwright'));
const ROOT = path.join(__dirname, '..', '..');
const mode = process.argv[2] || 'cold', N = +process.argv[3] || 200;
const TMP = fs.mkdtempSync(path.join(os.homedir(), '.cache', 'shell-soak-'));
const file = path.join(TMP, 'app', 'english-words.html'), profile = path.join(TMP, 'profile');
fs.mkdirSync(path.dirname(file), { recursive: true });
const latest = fs.readdirSync(path.join(ROOT, 'versions')).filter(f => /^english-words-v[\d.]+\.html$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).pop();
const unsafe = process.argv.includes('--provoke');
const cfg = path.join(TMP, 'cfg.json'); fs.writeFileSync(cfg, JSON.stringify(Object.assign({ sources: [{ url: 'http://127.0.0.1:9/{file}' }] }, {})));
execFileSync('python3', [path.join(__dirname, 'build.py'), path.join(ROOT, 'versions', latest), file, '--config', cfg]);
if (unsafe) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('<head>', '<head><script>try{localStorage.getItem("x")}catch(e){}</script>'));
const open = async () => {
  const ctx = await pw.chromium.launchPersistentContext(profile, { headless: false, viewport: null, args: ['--app=file://' + file, '--no-first-run'] });
  const p = ctx.pages()[0] || await ctx.waitForEvent('page');
  return { ctx, p };
};
const ready = p => p.waitForFunction(() => document.getElementById('shell-recovery') || (window.__shell && __shell.info().running && window.__w3k && document.getElementById('app').children.length), null, { timeout: 20000 });
const look = p => p.evaluate(() => ({ recovery: !!document.getElementById('shell-recovery'), first: !!document.querySelector('[data-act=first-start]'), words: window.__w3k ? Object.keys(__w3k.S.p).length : -1, hits: __shell._state().guard.hits }));
(async () => {
  let { ctx, p } = await open(); await ready(p);
  await p.evaluate(() => { __w3k.guard = 0; }); await p.click('[data-act=first-start]');
  for (let k = 0; k < 10; k++) await p.click('[data-act=sort-learn]');
  await new Promise(r => setTimeout(r, 1500));
  let first = 0, recovery = 0, hits = 0; const t = Date.now();
  for (let n = 1; n <= N; n++) {
    if (mode === 'cold') { await ctx.close(); ({ ctx, p } = await open()); } else await p.reload();
    await ready(p);
    const s = await look(p);
    if (s.recovery) recovery++; else if (s.first || s.words < 10) first++;
    hits = s.hits;
  }
  await ctx.close(); fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`${unsafe ? 'с провокацией сбоя, ' : ''}${mode === 'cold' ? 'холодных запусков' : 'перезагрузок'}: ${N}; первый экран вместо прогресса: ${first}; экран восстановления: ${recovery}; защита сработала и исправила сама: ${hits} раз  [${Math.round((Date.now() - t) / 1000)} c]`);
  process.exit(first || recovery ? 1 : 0);
})().catch(e => { console.error(String(e && e.stack || e).slice(0, 400)); process.exit(2); });
