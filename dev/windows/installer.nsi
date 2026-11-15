; Установщик «3000 слов» для Windows. Ставится для текущего пользователя, права администратора не нужны.
;   Программа:  %LOCALAPPDATA%\Programs\Words3000   (заменяется при обновлении)
;   Прогресс:   %LOCALAPPDATA%\Words3000\Profile    (установщик его не трогает)

Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"

!define APP_NAME "3000 слов"
!define APP_ID   "Words3000"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"

Name "${APP_NAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP_ID}"
InstallDirRegKey HKCU "Software\${APP_ID}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ManifestDPIAware true
BrandingText "${APP_NAME} ${VERSION}"

VIProductVersion "${VERSION}.0.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "Установка программы «${APP_NAME}»"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" ""

!define MUI_ICON   "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_WELCOMEPAGE_TITLE "Установка «${APP_NAME}» ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "3000 частых английских слов — понемногу каждый день.$\r$\n$\r$\nПрограмма установится только для вас, права администратора не нужны. Она открывается отдельным окном и работает без интернета.$\r$\n$\r$\nЕсли программа уже установлена, она обновится, а прогресс сохранится."
!define MUI_FINISHPAGE_TITLE "Готово"
!define MUI_FINISHPAGE_TEXT "Ярлык «${APP_NAME}» добавлен на рабочий стол и в меню «Пуск»."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_ID}.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Запустить «${APP_NAME}»"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"

Section "Install"
  SetOutPath "$INSTDIR"
  File "/oname=english-words.html" "${HTML}"
  File "/oname=${APP_ID}.exe" "${LAUNCHER}"
  File "icon.ico"
  WriteUninstaller "$INSTDIR\uninstall.exe"

  CreateShortCut "$SMPROGRAMS\${APP_NAME}.lnk" "$INSTDIR\${APP_ID}.exe" "" "$INSTDIR\icon.ico" 0 "" "" "${APP_NAME} — английский каждый день"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk"    "$INSTDIR\${APP_ID}.exe" "" "$INSTDIR\icon.ico" 0 "" "" "${APP_NAME} — английский каждый день"

  WriteRegStr HKCU "Software\${APP_ID}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\${APP_ID}" "Version" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" ${SIZE_KB}
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\english-words.html"
  Delete "$INSTDIR\${APP_ID}.exe"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\${APP_NAME}.lnk"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\${APP_ID}"

  ; Прогресс по умолчанию остаётся: при тихом удалении и при ответе «Нет».
  IfSilent done
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Удалить также сохранённый прогресс обучения?$\r$\n$\r$\nЕсли собираетесь установить программу снова, выберите «Нет»." IDNO done
  RMDir /r "$LOCALAPPDATA\${APP_ID}"
  done:
SectionEnd
