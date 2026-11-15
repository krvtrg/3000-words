#!/bin/bash
# Проверка установщика под Wine (эмулятор Windows): установка, запуск, обновление, удаление.
# Нужны: wine, wine32, xvfb, nsis. Запуск: ./check-installer.sh   (около 30 секунд)
# Настоящего Edge под Wine нет, поэтому вместо него ставится «подделка», которая записывает,
# с какими параметрами её запустили. Работу самого окна проверяет appmode-test.js.
set -u
here="$(cd "$(dirname "$0")" && pwd)"; root="$(cd "$here/../.." && pwd)"
setup="$root/3000-words-setup.exe"
work="$HOME/.cache/words3000-wine"; rm -rf "$work"; mkdir -p "$work"
export WINEPREFIX="$work/prefix" WINEDEBUG=-all WINEDLLOVERRIDES="mscoree,mshtml=" LC_ALL=C.UTF-8
C="$WINEPREFIX/drive_c"; U="$C/users/$USER"; P="$U/AppData/Local/Programs/Words3000"; D="$U/AppData/Local/Words3000"
ok=0; bad=0
check(){ if eval "$1"; then ok=$((ok+1)); echo "  ✓ $2"; else bad=$((bad+1)); echo "  ✗ $2"; fi; }
w(){ xvfb-run -a wine "$@" >/dev/null 2>&1 </dev/null; wineserver -w; }
reg(){ grep -A12 'Uninstall\\\\Words3000\]' "$WINEPREFIX/user.reg" 2>/dev/null; }

echo "Подготовка Wine"; xvfb-run -a wineboot -i >/dev/null 2>&1; wineserver -w
cat > "$work/fake.nsi" <<'N'
Unicode true
SilentInstall silent
OutFile "fake.exe"
RequestExecutionLevel user
Section
  FileOpen $0 "C:\cmdline.txt" w
  FileWriteUTF16LE $0 "$CMDLINE"
  FileClose $0
SectionEnd
N
(cd "$work" && makensis -V1 fake.nsi)
mkdir -p "$C/Program Files (x86)/Microsoft/Edge/Application"; cp "$work/fake.exe" "$C/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

echo "Установка"
w "$setup" /S
check '[ -f "$P/Words3000.exe" ] && [ -f "$P/uninstall.exe" ] && [ -f "$P/icon.ico" ]' "файлы программы на месте"
check 'cmp -s "$P/english-words.html" "$root/english-words.html"' "установлена текущая версия приложения"
check '[ -f "$U/Desktop/3000 слов.lnk" ]' "ярлык на рабочем столе"
check '[ -f "$U/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/3000 слов.lnk" ]' "ярлык в меню «Пуск»"
check 'reg | grep -q "DisplayVersion"' "запись в списке установленных программ"

echo "Запуск"
w "$P/Words3000.exe"
cmd="$(iconv -f utf-16le -t utf8 "$C/cmdline.txt" 2>/dev/null)"; rm -f "$C/cmdline.txt"
check '[[ "$cmd" == *"msedge.exe"* ]]' "найден и запущен Edge"
check '[[ "$cmd" == *"--app=\"file:///C:/users/$USER/AppData/Local/Programs/Words3000/english-words.html\""* ]]' "открывается отдельным окном (--app) нужный файл"
check '[[ "$cmd" == *"--user-data-dir=\"C:\\users\\$USER\\AppData\\Local\\Words3000\\Profile\""* ]]' "свой профиль для прогресса"
check '[ -d "$D/Profile" ]' "папка профиля создана"

echo "Путь с русскими буквами, пробелами, % и #"
X="$C/Users/Иван Петров/Мои программы 100% #1"; mkdir -p "$X"; cp "$P"/* "$X/"
w "$X/Words3000.exe"
url="$(iconv -f utf-16le -t utf8 "$C/cmdline.txt" 2>/dev/null | sed 's/.*--app="\([^"]*\)".*/\1/')"; rm -f "$C/cmdline.txt"
check '! echo "$url" | LC_ALL=C grep -q "[^ -~]"' "в адресе только латиница и %XX"
check '[ "$(python3 -c "import sys,urllib.parse;print(urllib.parse.unquote(sys.argv[1]))" "$url")" = "file:///C:/Users/Иван Петров/Мои программы 100% #1/english-words.html" ]' "адрес соответствует папке"

echo "Обновление (установка поверх)"
echo "прогресс" > "$D/Profile/marker.txt"; echo "старая версия" > "$P/english-words.html"
w "$setup" /S
check 'cmp -s "$P/english-words.html" "$root/english-words.html"' "файл приложения заменён новым"
check '[ "$(cat "$D/Profile/marker.txt" 2>/dev/null)" = "прогресс" ]' "профиль с прогрессом не тронут"

echo "Обновление с настоящего установщика 1.2 (обычная версия → программа с автообновлением)"
ver="$(sed -n "s/^VERSION = '\([0-9.]*\)'.*/\1/p" "$here/../src/build.py")"
w "$root/versions/3000-words-setup-1.2.exe" /S
check 'cmp -s "$P/english-words.html" "$root/versions/english-words-v1.2.html"' "установщик 1.2 поставил версию 1.2"
w "$setup" /S
check 'cmp -s "$P/english-words.html" "$root/english-words.html"' "поверх 1.2 встала текущая программа"
check 'reg | grep DisplayVersion | grep -q "\"$ver\""' "в списке программ версия $ver"
check '[ "$(cat "$D/Profile/marker.txt" 2>/dev/null)" = "прогресс" ]' "профиль с прогрессом не тронут"

echo "Удаление"
w "$P/uninstall.exe" /S; sleep 2; wineserver -w
check '[ ! -e "$P" ]' "папка программы удалена"
check '[ ! -e "$U/Desktop/3000 слов.lnk" ] && [ ! -e "$U/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/3000 слов.lnk" ]' "ярлыки удалены"
check '! reg | grep -q DisplayVersion' "запись из списка программ удалена"
check '[ -f "$D/Profile/marker.txt" ]' "прогресс при тихом удалении остаётся"

rm -rf "$work"
echo; echo "Итого: $ok прошло, $bad не прошло"; [ "$bad" = 0 ]
