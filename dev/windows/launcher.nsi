; Запускалка «3000 слов» для Windows.
; Сама ничего не устанавливает: находит Microsoft Edge (или Google Chrome) и открывает
; english-words.html из своей папки отдельным окном без адресной строки и вкладок.
; Прогресс лежит в отдельном профиле: %LOCALAPPDATA%\Words3000\Profile — обновление
; и переустановка программы его не трогают.

Unicode true
!include "LogicLib.nsh"

!ifndef VERSION
  !define VERSION "0.0"
!endif
!define APP_NAME "3000 слов"
!define APP_ID   "Words3000"

Name "${APP_NAME}"
OutFile "${OUTFILE}"
Icon "icon.ico"
RequestExecutionLevel user
SilentInstall silent
ManifestDPIAware true
SetCompressor lzma

VIProductVersion "${VERSION}.0.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "${APP_NAME} — английский каждый день"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" ""

Var Browser
Var Page
Var Url

; Берёт путь из реестра (App Paths) и запоминает его, если такой файл существует.
!macro TryReg ROOT VIEW EXE
  ${If} $Browser == ""
    SetRegView ${VIEW}
    ReadRegStr $0 ${ROOT} "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\${EXE}" ""
    ${If} $0 != ""
      StrCpy $1 $0 1
      ${If} $1 == '"'          ; путь в кавычках
        StrCpy $0 $0 -1 1
      ${EndIf}
      ${If} ${FileExists} "$0"
        StrCpy $Browser $0
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
!macro TryFile PATH
  ${If} $Browser == ""
  ${AndIf} ${FileExists} "${PATH}"
    StrCpy $Browser "${PATH}"
  ${EndIf}
!macroend

Function FindBrowser
  StrCpy $Browser ""
  ; Microsoft Edge есть в каждой Windows 10 и 11
  !insertmacro TryReg HKLM 64 "msedge.exe"
  !insertmacro TryReg HKLM 32 "msedge.exe"
  !insertmacro TryReg HKCU 64 "msedge.exe"
  !insertmacro TryFile "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
  !insertmacro TryFile "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe"
  ; запасной вариант — Google Chrome
  !insertmacro TryReg HKLM 64 "chrome.exe"
  !insertmacro TryReg HKLM 32 "chrome.exe"
  !insertmacro TryReg HKCU 64 "chrome.exe"
  !insertmacro TryFile "$PROGRAMFILES64\Google\Chrome\Application\chrome.exe"
  !insertmacro TryFile "$PROGRAMFILES32\Google\Chrome\Application\chrome.exe"
  !insertmacro TryFile "$LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  SetRegView lastused
FunctionEnd

; $Page → $Url:  C:\Users\Имя Фамилия\...\english-words.html
;              → file:///C:/Users/%D0%98%D0%BC%D1%8F%20.../english-words.html
; Всё, кроме латинских букв, цифр и - . _ ~ / :, записывается как %XX в UTF-8:
; с русскими буквами «как есть» браузер адрес из командной строки не открывает (проверено).
Function MakeUrl
  StrCpy $Url "file:///"
  StrCpy $R8 $Page
  StrLen $R1 $R8
  IntOp $R1 $R1 * 3
  IntOp $R1 $R1 + 4
  System::Alloc $R1
  Pop $R2
  System::Call 'kernel32::WideCharToMultiByte(i 65001, i 0, w R8, i -1, p R2, i R1, p 0, p 0) i .R3'
  StrCpy $R4 0
  ${Do}
    IntOp $R5 $R2 + $R4
    System::Call '*$R5(&i1 .R6)'
    IntOp $R6 $R6 & 0xFF
    ${If} $R6 == 0
    ${OrIf} $R4 >= $R3
      ${ExitDo}
    ${EndIf}
    ${If} $R6 == 92                       ; \ → /
      StrCpy $R7 "/"
    ${ElseIf} $R6 >= 97
    ${AndIf} $R6 <= 122                   ; a-z
      IntFmt $R7 "%c" $R6
    ${ElseIf} $R6 >= 64
    ${AndIf} $R6 <= 90                    ; @ A-Z
      IntFmt $R7 "%c" $R6
    ${ElseIf} $R6 >= 45
    ${AndIf} $R6 <= 58                    ; - . / 0-9 :
      IntFmt $R7 "%c" $R6
    ${ElseIf} $R6 == 95                   ; _
    ${OrIf} $R6 == 126                    ; ~
      IntFmt $R7 "%c" $R6
    ${Else}
      IntFmt $R7 "%%%02X" $R6
    ${EndIf}
    StrCpy $Url "$Url$R7"
    IntOp $R4 $R4 + 1
  ${Loop}
  System::Free $R2
FunctionEnd

Section
  StrCpy $Page "$EXEDIR\english-words.html"
  ${IfNot} ${FileExists} "$Page"
    MessageBox MB_ICONSTOP "Не найден файл приложения:$\n$Page$\n$\nУстановите программу заново."
    Quit
  ${EndIf}

  Call FindBrowser
  ${If} $Browser == ""
    MessageBox MB_ICONINFORMATION "Не найден Microsoft Edge или Google Chrome.$\n$\nПриложение откроется в обычной вкладке$\nбраузера по умолчанию.$\nПрогресс там хранится отдельно."
    ExecShell "open" "$Page"
    Quit
  ${EndIf}

  Call MakeUrl

  CreateDirectory "$LOCALAPPDATA\${APP_ID}\Profile"
  Exec '"$Browser" --app="$Url" --user-data-dir="$LOCALAPPDATA\${APP_ID}\Profile" --no-first-run --no-default-browser-check --window-size=1180,820'
SectionEnd
