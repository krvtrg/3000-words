/* Оболочка «3000 слов».
 *
 * Сама ничего не показывает: выбирает версию приложения и запускает её в этом же окне.
 *   — встроенная версия лежит прямо в этом файле (работает без интернета);
 *   — новые версии скачиваются в фоне, сверяются по контрольной сумме и включаются при следующем запуске
 *     (список версий с контрольными суммами берётся только с GitHub, сами файлы — ещё и с зеркала);
 *   — если новая версия не запустилась, оболочка возвращает предыдущую и больше эту версию не берёт;
 *   — можно закрепить любую версию (use), автообновление на это время приостановлено.
 *
 * Где что хранится:
 *   localStorage «words3000:v1»     — прогресс (его читают и пишут сами версии приложения);
 *   localStorage «words3000:shell»  — отметка «это настоящее хранилище» (см. guard ниже);
 *   IndexedDB «words3000-shell»     — всё остальное: состояние оболочки, скачанные версии, копии прогресса.
 *
 * Зачем guard. Chromium изредка отдаёт странице, открытой как файл, пустой localStorage, если обратиться
 * к нему в первые мгновения после открытия. Данные при этом целы, но страница их не видит, а всё записанное
 * в таком сеансе пропадает. Поэтому оболочка: 1) не трогает localStorage первые 150 мс; 2) проверяет отметку:
 * если отметка когда-то ставилась (это записано в IndexedDB), а сейчас её нет, приложение не запускается —
 * страница перезагружается; после трёх неудач показывается экран восстановления.
 */
(function () {
  'use strict';
  var CFG = /*__CONFIG__*/{};
  var KEY = 'words3000:v1', MARK = 'words3000:shell', DB = 'words3000-shell';
  var T = CFG.timing || {};          // в тестах времена короче
  var SAFE_MS = T.safe != null ? T.safe : 150, HEALTH_MS = T.health || 4000, CHECK_DELAY = T.checkDelay || 1500, RECHECK_MS = 6 * 3600e3, MIRROR_MS = T.mirror || 4000, NET_MS = T.net || 10000;
  var T0 = performance.now();
  var st = null, degraded = false, running = null, listeners = [], idleResolve, checking = null;
  var builtinEl = document.getElementById('builtin');
  var builtinHtml = null;
  try { builtinHtml = JSON.parse(builtinEl.textContent); } catch (e) { builtinHtml = null; }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function cmp(a, b) {
    var x = String(a).split('.'), y = String(b).split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (+x[i] || 0) - (+y[i] || 0); if (d) return d < 0 ? -1 : 1; }
    return 0;
  }
  function isVer(v) { return typeof v === 'string' && /^\d+(\.\d+){0,3}$/.test(v); }

  /* ---------- IndexedDB ---------- */
  var dbp = null;
  function db() {
    return dbp || (dbp = new Promise(function (res, rej) {
      var to = setTimeout(function () { rej(new Error('IndexedDB не ответил')); }, 2500);
      try {
        var r = indexedDB.open(DB, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { clearTimeout(to); res(r.result); };
        r.onerror = function () { clearTimeout(to); rej(r.error || new Error('IndexedDB недоступен')); };
      } catch (e) { clearTimeout(to); rej(e); }
    }));
  }
  function get(k) {
    return db().then(function (d) { return new Promise(function (res, rej) {
      var q = d.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = function () { res(q.result === undefined ? null : q.result); }; q.onerror = function () { rej(q.error); };
    }); });
  }
  function put(k, v) {
    return db().then(function (d) { return new Promise(function (res, rej) {
      var t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k);
      t.oncomplete = function () { res(); }; t.onerror = t.onabort = function () { rej(t.error || new Error('запись не удалась')); };
    }); });
  }
  function del(k) {
    return db().then(function (d) { return new Promise(function (res) {
      var t = d.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = t.onerror = t.onabort = function () { res(); };
    }); });
  }
  function save() { return degraded ? Promise.resolve() : put('state', st).catch(function () {}); }
  function defaults() {
    return { v: 1, current: null, prev: null, pinned: null, pending: null, auto: true, have: {}, bad: {}, fail: {},
      manifest: null, lastCheck: 0, lastError: null, marked: false, firstChecked: false, guard: { tries: 0, hits: 0 },
      run: null, notice: null, backups: [], mirror: null };
  }

  /* ---------- localStorage (только после SAFE_MS) ---------- */
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return undefined; } }   // undefined = хранилище недоступно
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return window.localStorage.getItem(k) === v; } catch (e) { return false; } }

  /* ---------- какие версии есть ---------- */
  function entry(v) {
    var list = st.manifest && st.manifest.versions || [];
    for (var i = 0; i < list.length; i++) if (list[i].v === v) return list[i];
    return v === CFG.builtin ? { v: v, date: CFG.builtinDate || '', notes: '', data: CFG.data || 1 } : null;
  }
  function available(v) { return v === CFG.builtin ? builtinHtml !== null : !!st.have[v]; }
  function newestLocal() {                       // самая новая из тех, что можно запустить без сети
    var best = CFG.builtin;
    Object.keys(st.have).forEach(function (v) { if (!st.bad[v] && cmp(v, best) > 0) best = v; });
    return best;
  }
  function newestKnown() {
    var best = newestLocal();
    (st.manifest && st.manifest.versions || []).forEach(function (e) { if (!st.bad[e.v] && cmp(e.v, best) > 0) best = e.v; });
    return best;
  }
  function html(v) { return v === CFG.builtin && builtinHtml !== null ? Promise.resolve(builtinHtml) : get('html:' + v); }

  /* ---------- выбор версии при запуске ---------- */
  function judgeLastRun() {
    var r = st.run; st.run = null;
    if (!r || r.ok || r.v === CFG.builtin) return;
    st.fail[r.v] = (st.fail[r.v] || 0) + 1;
    if (st.fail[r.v] >= 2) rollback(r.v);
  }
  function rollback(v) {
    st.bad[v] = Date.now();
    if (st.pinned === v) st.pinned = null;
    if (st.pending === v) st.pending = null;
    if (st.current === v) st.current = st.prev && st.prev !== v && available(st.prev) && !st.bad[st.prev] ? st.prev : null;
    st.prev = null;
    st.notice = { failed: v, to: st.pinned || st.current || CFG.builtin, t: Date.now() };
  }
  function choose() {
    var b = CFG.builtin, activated = null;
    if (st.pending) {
      var p = st.pending; st.pending = null;
      if (!st.pinned && st.auto && available(p) && !st.bad[p] && cmp(p, st.current || b) > 0) {
        st.prev = st.current || b; st.current = p; activated = p;
        st.notice = { from: st.prev, to: p, t: Date.now() };
      }
    }
    if (st.current && (st.bad[st.current] || !available(st.current))) st.current = null;
    if (st.current && cmp(b, st.current) >= 0) st.current = null;       // установщик принёс версию не старее скачанной
    if (st.pinned && !available(st.pinned)) st.pinned = null;
    return { v: st.pinned || st.current || b, activated: activated };
  }

  /* ---------- копии прогресса ---------- */
  var backupSeq = 0;
  function backup(reason, forVersion, data) {
    if (degraded || typeof data !== 'string' || !data) return Promise.resolve();
    var id = 'backup:' + Date.now() + '-' + (backupSeq++);
    st.backups.push({ id: id, t: Date.now(), reason: reason, v: forVersion, from: running || st.prev || CFG.builtin, len: data.length });
    var drop = st.backups.length > 5 ? st.backups.splice(0, st.backups.length - 5) : [];
    return put(id, data).then(function () { return Promise.all(drop.map(function (b) { return del(b.id); })); }).catch(function () {});
  }
  var lastMirrored = null;
  function mirror() {                              // текущая копия прогресса во втором хранилище
    if (degraded) return;
    var cur = lsGet(KEY);
    if (typeof cur !== 'string' || !cur || cur === lastMirrored) return;
    var prevLen = st.mirror ? st.mirror.len : 0, keep = Promise.resolve();
    if (prevLen > 1000 && cur.length < prevLen / 2) {             // прогресс резко уменьшился (сброс, загрузка чужого файла): прежний — в копию
      keep = lastMirrored !== null ? backup('перед резким уменьшением', running, lastMirrored)
        : get('mirror').then(function (old) { return backup('перед резким уменьшением', running, old); }).catch(function () {});
    }
    lastMirrored = cur;
    st.mirror = { t: Date.now(), len: cur.length, v: running };
    keep.then(function () { return put('mirror', cur); }).then(save).catch(function () {});
  }

  /* ---------- сеть ---------- */
  function fetchBytes(src, file) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, NET_MS);
    var opt = { cache: 'no-store', credentials: 'omit' };
    if (ctl) opt.signal = ctl.signal;
    if (src.headers) opt.headers = src.headers;
    return fetch(src.url.replace('{file}', file), opt).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (b) { clearTimeout(timer); return b; }, function (e) { clearTimeout(timer); throw e; });
  }
  function decode(buf) { return new TextDecoder('utf-8').decode(buf); }
  function sha256(buf) {
    return crypto.subtle.digest('SHA-256', buf).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    });
  }
  function cleanManifest(m) {
    if (!m || typeof m !== 'object' || !Array.isArray(m.versions) || !isVer(m.latest)) throw new Error('список версий повреждён');
    var out = [];
    m.versions.forEach(function (e) {
      if (!e || !isVer(e.v) || typeof e.file !== 'string' || !/^[\w.-]+$/.test(e.file) || !/^[0-9a-f]{64}$/.test(e.sha256 || '') || !(e.size > 0)) return;
      out.push({ v: e.v, file: e.file, sha256: e.sha256, size: +e.size, date: String(e.date || '').slice(0, 10), notes: String(e.notes || '').slice(0, 300),
        data: +e.data || 1, shell: +e.shell || 1, known: String(e.known || '').slice(0, 200) });
    });
    if (!out.some(function (e) { return e.v === m.latest; })) throw new Error('в списке версий нет последней');
    out.sort(function (a, b) { return cmp(b.v, a.v); });
    return { t: Date.now(), latest: m.latest, versions: out };
  }
  function eachSource(fn, forManifest) {           // пробует источники по очереди, пока один не сработает
    var list = CFG.sources.filter(function (s) { return !(forManifest && s.filesOnly); });
    var i = 0, lastErr = new Error('нет источников');
    function next() {
      if (i >= list.length) return Promise.reject(lastErr);
      var s = list[i++];
      return fn(s).catch(function (e) { lastErr = e; return next(); });
    }
    return next();
  }
  function download(e) {
    if (!(window.crypto && crypto.subtle)) return Promise.reject(new Error('нельзя проверить контрольную сумму'));
    return eachSource(function (s) {
      return fetchBytes(s, e.file).then(function (buf) {
        if (buf.byteLength !== e.size) throw new Error('размер файла не совпал');
        return sha256(buf).then(function (h) { if (h !== e.sha256) throw new Error('контрольная сумма не совпала'); return decode(buf); });
      });
    }).then(function (text) {
      return put('html:' + e.v, text).then(function () { st.have[e.v] = { t: Date.now(), size: e.size, sha256: e.sha256 }; return prune(); });
    });
  }
  function prune() {                               // лишние скачанные версии не копим
    var keep = {}; [st.current, st.prev, st.pinned, st.pending, running].forEach(function (v) { if (v) keep[v] = 1; });
    var extra = Object.keys(st.have).filter(function (v) { return !keep[v]; }).sort(function (a, b) { return st.have[a].t - st.have[b].t; });
    var drop = extra.slice(0, Math.max(0, extra.length - 2));
    drop.forEach(function (v) { delete st.have[v]; });
    return Promise.all(drop.map(function (v) { return del('html:' + v); }));
  }
  function check() {                               // спросить список версий; если есть новее — скачать на следующий запуск
    if (degraded) return Promise.resolve(info());
    if (checking) return checking;
    checking = eachSource(function (s) { return fetchBytes(s, CFG.manifest).then(function (b) { return cleanManifest(JSON.parse(decode(b))); }); }, true)
      .then(function (m) {
        st.manifest = m; st.lastCheck = Date.now(); st.lastError = null;
        var e = entry(m.latest), cur = st.current || CFG.builtin;
        if (!e || st.pinned || !st.auto || st.bad[e.v] || cmp(e.v, cur) <= 0 || e.shell > CFG.shell) return;
        return (st.have[e.v] ? Promise.resolve() : download(e)).then(function () { if (st.auto && !st.pinned) st.pending = e.v; });   // пока качалось, настройку могли сменить
      })
      .catch(function (e) { st.lastError = { t: Date.now(), msg: String(e && e.message || e) }; })
      .then(function () { checking = null; return save(); }).then(function () { emit(); return info(); });
    return checking;
  }

  /* ---------- то, чем пользуется приложение и полоска ---------- */
  function info() {
    if (degraded || !st) return { shell: CFG.shell, degraded: true, running: running || CFG.builtin, builtin: CFG.builtin, versions: [] };
    var seen = {}, list = [];
    (st.manifest && st.manifest.versions || []).forEach(function (e) { seen[e.v] = 1; list.push(e); });
    if (!seen[CFG.builtin]) list.push(entry(CFG.builtin));
    list.sort(function (a, b) { return cmp(b.v, a.v); });
    var latest = newestKnown();
    return {
      shell: CFG.shell, degraded: false, running: running, builtin: CFG.builtin, latest: latest, pinned: st.pinned, auto: st.auto, home: CFG.home || '',
      pending: st.pending, lastCheck: st.lastCheck, lastError: st.lastError, checking: !!checking,
      versions: list.map(function (e) {
        return { v: e.v, date: e.date, notes: e.notes, known: e.known || '', running: e.v === running, latest: e.v === latest,
          downloaded: available(e.v), failed: !!st.bad[e.v], data: e.data || 1, needsProgram: (e.shell || 1) > CFG.shell };
      }),
      backups: st.backups.map(function (b) { return { id: b.id, t: b.t, reason: b.reason, v: b.v, from: b.from }; })
    };
  }
  function emit() { listeners.slice().forEach(function (f) { try { f(info()); } catch (e) {} }); }
  function reload() { setTimeout(function () { location.reload(); }, 60); }
  function use(v) {
    if (degraded) return Promise.reject(new Error('Выбор версии недоступен: хранилище браузера закрыто'));
    var e = entry(v), now = entry(running);
    if (!e) return Promise.reject(new Error('Такой версии нет в списке'));
    if (v === running) return Promise.resolve(info());
    if (now && (e.data || 1) < (now.data || 1)) return Promise.reject(new Error('Версия ' + v + ' не умеет читать прогресс, сохранённый версией ' + running));
    if (e.shell && e.shell > CFG.shell) return Promise.reject(new Error('Для версии ' + v + ' нужно установить новую программу'));
    return (available(v) ? Promise.resolve() : download(e).catch(function (err) {
      throw new Error('Не удалось скачать версию ' + v + ': ' + (navigator.onLine === false ? 'нет интернета' : String(err && err.message || err)));
    })).then(function () { return backup('перед переходом на ' + v, v, lsGet(KEY)); }).then(function () {
      delete st.bad[v]; st.fail[v] = 0; st.notice = null;
      if (cmp(v, newestKnown()) >= 0) { st.pinned = null; st.prev = running; st.current = v === CFG.builtin ? null : v; }   // самая новая — это не закрепление
      else st.pinned = v;
      return save();
    }).then(function () { reload(); return info(); });
  }
  function useLatest() {
    if (degraded) return Promise.reject(new Error('Выбор версии недоступен: хранилище браузера закрыто'));
    var v = newestLocal();
    return backup('перед возвратом к последней', v, lsGet(KEY)).then(function () {
      st.pinned = null; st.notice = null; st.current = v === CFG.builtin ? null : v;
      return save();
    }).then(function () { reload(); return info(); });
  }
  function setAuto(on) { if (degraded) return Promise.resolve(info()); st.auto = !!on; if (!on) st.pending = null; return save().then(function () { emit(); if (on) setTimeout(check, 0); return info(); }); }
  function restoreBackup(id) {
    if (degraded) return Promise.reject(new Error('Копии недоступны'));
    return get(id).then(function (data) {
      if (typeof data !== 'string' || !data) throw new Error('Копия не найдена');
      return backup('перед восстановлением копии', running, lsGet(KEY)).then(function () {
        if (!lsSet(KEY, data)) throw new Error('Не удалось записать прогресс');
        lastMirrored = null; return save();
      });
    }).then(function () { reload(); });
  }
  var api = window.__shell = {
    version: CFG.shell, info: info, use: use, useLatest: useLatest, check: check, setAuto: setAuto, restoreBackup: restoreBackup,
    on: function (f) { listeners.push(f); }, off: function (f) { listeners = listeners.filter(function (x) { return x !== f; }); },
    idle: new Promise(function (r) { idleResolve = r; }),     // для тестов: первая фоновая проверка закончилась
    _state: function () { return st; }
  };

  /* ---------- собственные элементы оболочки: полоска, заметка, экран восстановления ---------- */
  var FONT = 'font:500 14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;';
  function el(tag, css, text) { var e = document.createElement(tag); e.setAttribute('style', css); if (text) e.textContent = text; return e; }
  function button(text, css, fn) { var b = el('button', FONT + 'cursor:pointer;border-radius:8px;padding:6px 12px;' + css, text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function showBar(v) {                            // для версий, в которых нет своего раздела выбора версии
    var bar = el('div', FONT + 'display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:center;padding:6px 12px;background:#1E6B59;color:#fff;position:relative;z-index:2147483000');
    bar.id = 'shell-bar'; bar.setAttribute('role', 'status');
    bar.appendChild(el('span', '', 'Вы пользуетесь версией ' + v + '. Автообновление приостановлено.'));
    bar.appendChild(button('Вернуться к последней', 'border:1px solid rgba(255,255,255,.7);background:transparent;color:#fff', function () { useLatest().catch(function () {}); }));
    document.body.insertBefore(bar, document.body.firstChild);
  }
  function showToast(text) {
    var low = window.innerWidth >= 760 ? 24 : 84;      // на узком экране внизу панель разделов
    var t = el('div', FONT + 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(' + low + 'px + env(safe-area-inset-bottom,0px));max-width:min(92vw,460px);display:flex;gap:12px;align-items:center;' +
      'padding:10px 12px 10px 16px;border-radius:12px;background:#1C1B19;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25);z-index:2147483000');
    t.id = 'shell-toast'; t.setAttribute('role', 'status');
    t.appendChild(el('span', '', text));
    t.appendChild(button('Понятно', 'border:0;background:rgba(255,255,255,.16);color:#fff;white-space:nowrap', function () { t.remove(); }));
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 12000);
  }
  function fmt(t) { var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function recoveryScreen() {
    return get('mirror').catch(function () { return null; }).then(function (copy) {
      var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('style', 'background:' + (dark ? '#121412' : '#F5F3EE'));
      var box = el('main', FONT + 'max-width:520px;margin:12vh auto 0;padding:24px;color:' + (dark ? '#ECEAE3' : '#1C1B19'));
      box.id = 'shell-recovery';
      box.appendChild(el('h1', 'font-size:22px;margin:0 0 12px', 'Сохранённый прогресс не открылся'));
      box.appendChild(el('p', 'margin:0 0 20px;font-size:15px', 'Браузер не отдал программе сохранённые данные. Обычно они целы и появляются после повторного запуска: закройте программу и откройте её снова.'));
      var row = el('div', 'display:flex;flex-direction:column;gap:10px');
      var main = 'border:0;background:#1E6B59;color:#fff;padding:12px 16px;font-size:15px', alt = 'border:1px solid ' + (dark ? '#2E332F' : '#C9C4B6') + ';background:transparent;color:inherit;padding:12px 16px;font-size:15px';
      row.appendChild(button('Попробовать ещё раз', main, function () { st.guard.tries = 2; save().then(reload); }));
      if (typeof copy === 'string' && copy && st.mirror) row.appendChild(button('Восстановить из копии от ' + fmt(st.mirror.t), alt, function () {
        if (lsSet(KEY, copy) && lsSet(MARK, '1')) { st.guard.tries = 0; save().then(reload); }
        else alert('Не удалось записать данные. Закройте программу и откройте её снова.');
      }));
      row.appendChild(button('Продолжить без прогресса', alt, function () {
        if (!confirm('Программа откроется как новая. Если прежние данные позже появятся, они останутся на месте. Продолжить?')) return;
        if (lsSet(MARK, '1')) st.marked = true; box.remove(); launch().catch(function () { if (!running) runPlain(); });
      }));
      box.appendChild(row);
      document.body.appendChild(box);
    });
  }

  /* ---------- запуск версии ---------- */
  function start(target) {
    var v = target.v;
    return html(v).then(function (text) {
      if (typeof text !== 'string' || text.length < 1000) {       // скачанная версия пропала из хранилища
        if (v === CFG.builtin) throw new Error('встроенная версия повреждена');
        delete st.have[v]; if (st.pinned === v) st.pinned = null; if (st.current === v) st.current = null;
        return save().then(function () { return start({ v: CFG.builtin }); });
      }
      var before = Promise.resolve();
      if (target.activated) before = backup('перед обновлением до ' + v, v, lsGet(KEY));
      st.run = { v: v, ok: false, t: Date.now() };
      return before.then(save).then(function () {
        running = v;
        document.open(); document.write(text); document.close();
        afterStart(v);
      });
    });
  }
  function rendered() { var a = document.getElementById('app'); return !!(a && a.children.length); }
  function afterStart(v) {
    var began = Date.now();
    (function wait() {
      if (rendered()) return healthy(v);
      if (Date.now() - began < HEALTH_MS) return setTimeout(wait, 50);
      if (v === CFG.builtin) return background();                 // встроенную откатывать некуда
      rollback(v); st.run = null;                                 // не запустилась: возвращаем предыдущую сразу
      save().then(function () { location.reload(); });
    })();
  }
  function healthy(v) {
    st.run.ok = true; st.fail[v] = 0;
    var n = st.notice; st.notice = null;
    save();
    try {
      if (st.pinned === v && cmp(v, CFG.aware) < 0) showBar(v);
      if (n && n.failed) showToast('Версия ' + n.failed + ' не запустилась. Работает версия ' + v + '.');
      else if (n && n.to === v) showToast('Приложение обновлено до версии ' + v + '.');
    } catch (e) {}
    background();
  }
  function background() {
    mirror();
    setInterval(mirror, MIRROR_MS);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') mirror(); });
    window.addEventListener('pagehide', mirror);
    setTimeout(function () { check().then(idleResolve, idleResolve); }, CHECK_DELAY);
    setInterval(function () { if (Date.now() - st.lastCheck > RECHECK_MS) check(); }, 600e3);
  }
  function runPlain() {                            // хранилища недоступны: просто встроенная версия, без обновлений
    degraded = true; running = CFG.builtin; idleResolve();
    if (builtinHtml === null) return;
    document.open(); document.write(builtinHtml); document.close();
  }

  /* ---------- порядок запуска ---------- */
  get('state').then(function (s) {
    st = defaults(); if (s && typeof s === 'object') Object.keys(s).forEach(function (k) { st[k] = s[k]; });
    return sleep(Math.max(0, SAFE_MS - (performance.now() - T0)));
  }).then(function () {
    var mark = lsGet(MARK), progress = lsGet(KEY);
    if (mark === undefined) return runPlain();                    // localStorage закрыт (например, окно предпросмотра)
    if (mark || progress) {                                       // хранилище настоящее: в нём видна отметка или сам прогресс
      if (!mark) lsSet(MARK, '1');
      st.marked = true;
    } else if (st.marked) {                                       // отметка была, а сейчас пусто: это не то хранилище
      st.guard.hits++;
      if (st.guard.tries < 3) { st.guard.tries++; return save().then(function () { return sleep(200 * st.guard.tries); }).then(function () { location.reload(); }); }
      return save().then(recoveryScreen);
    } else if (!st.firstChecked) {                                // самый первый запуск и пусто: один раз перепроверяем
      st.firstChecked = true;
      return save().then(function () { return sleep(250); }).then(function () { location.reload(); });
    } else if (lsSet(MARK, '1')) st.marked = true;                // действительно новая установка
    return launch();
  }).catch(function () {
    if (running) return;
    setTimeout(runPlain, Math.max(0, SAFE_MS - (performance.now() - T0)));
  });
  function launch() {
    st.firstChecked = true; st.guard.tries = 0;
    judgeLastRun();
    return start(choose());
  }
})();
