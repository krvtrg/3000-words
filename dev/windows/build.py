#!/usr/bin/env python3
"""Собирает установщик для Windows из готового файла программы <корень>/english-words.html
(оболочка со встроенной версией приложения; её собирает ../src/build.py).

Нужен NSIS (в Debian/Ubuntu: sudo apt install nsis). Запуск: python3 build.py
Результат:
  <корень>/3000-words-setup.exe                  — установщик последней версии
  <корень>/versions/3000-words-setup-<N>.exe     — он же с номером версии (старые не трогаются)

Версия берётся из ../src/build.py. Сначала соберите само приложение: cd ../src && python3 build.py
Новый установщик нужен, когда меняется оболочка; новые версии приложения программа скачивает сама.
"""
import pathlib, re, shutil, subprocess, sys, tempfile

here = pathlib.Path(__file__).resolve().parent
root = here.parent.parent
version = re.search(r"^VERSION = '([\d.]+)'", (here.parent / 'src' / 'build.py').read_text(encoding='utf-8'), re.M).group(1)
html = root / 'english-words.html'
# в установщик должен попасть ровно тот файл, который получается при сборке этой версии
if subprocess.run([sys.executable, str(here.parent / 'src' / 'build.py'), '--check']).returncode:
    sys.exit('Сначала соберите приложение: cd ../src && python3 build.py')
vfile = root / 'versions' / f'3000-words-setup-{version}.exe'
if vfile.exists() and '--force' not in sys.argv:
    sys.exit(f'Установщик версии {version} уже существует. Поднимите VERSION в ../src/build.py (или запустите с --force).')

def nsis(script, **defs):
    cmd = ['makensis', '-V2', '-INPUTCHARSET', 'UTF8'] + [f'-D{k}={v}' for k, v in defs.items()] + [script]
    subprocess.run(cmd, cwd=here, check=True)

with tempfile.TemporaryDirectory() as tmp:
    tmp = pathlib.Path(tmp)
    launcher, setup = tmp / 'Words3000.exe', tmp / f'3000-words-setup-{version}.exe'
    nsis('launcher.nsi', VERSION=version, OUTFILE=launcher)
    size_kb = (html.stat().st_size + launcher.stat().st_size + (here / 'icon.ico').stat().st_size) // 1024 + 100
    nsis('installer.nsi', VERSION=version, OUTFILE=setup, HTML=html, LAUNCHER=launcher, SIZE_KB=size_kb)
    shutil.copyfile(setup, vfile)
    shutil.copyfile(setup, root / '3000-words-setup.exe')
print(f'{root / "3000-words-setup.exe"} — версия {version}, {vfile.stat().st_size/1024:.0f} КБ')
