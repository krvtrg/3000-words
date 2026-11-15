#!/usr/bin/env python3
"""Собирает один HTML-файл из template.html + app.css + app.js + data/words.json.

Результат:
  <корень>/english-words.html                 — актуальная версия
  <корень>/versions/english-words-v<N>.html   — копия этой версии (старые не трогаются)

Корень — папка двумя уровнями выше этого файла (dev/src/build.py).

Уже выпущенную версию скрипт не перезаписывает: перед изменениями поднимите VERSION.
Во время работы над ещё не выпущенной версией — python3 build.py --force
"""
import json, pathlib, sys

VERSION = '1.2'   # менять при каждом изменении приложения

src = pathlib.Path(__file__).parent
words = json.loads((src / 'data' / 'words.json').read_text(encoding='utf-8'))
html = (src / 'template.html').read_text(encoding='utf-8')
html = html.replace('/*__CSS__*/', (src / 'app.css').read_text(encoding='utf-8'))
assert all('|' not in en and '\n' not in en + ru for en, ru in words)
packed = json.dumps('\n'.join(f'{en}|{ru}' for en, ru in words), ensure_ascii=False).replace('</', '<\\/')
html = html.replace('/*__WORDS__*/""', packed)
html = html.replace('/*__JS__*/', (src / 'app.js').read_text(encoding='utf-8'))
html = html.replace('__VERSION__', VERSION)
root = src.parent.parent
out = root / 'english-words.html'
vdir = root / 'versions'; vdir.mkdir(exist_ok=True)
vfile = vdir / f'english-words-v{VERSION}.html'
if vfile.exists() and vfile.read_text(encoding='utf-8') != html and '--force' not in sys.argv:
    sys.exit(f'Версия {VERSION} уже существует и отличается от новой сборки. '
             f'Поднимите VERSION в build.py (или запустите с --force, если версия ещё не выпущена).')
out.write_text(html, encoding='utf-8')
vfile.write_text(html, encoding='utf-8')
print(f'{out} — версия {VERSION}, {len(words)} слов, {out.stat().st_size/1024:.0f} КБ')
