; Custom NSIS installer script for pilotstack

!macro customHeader
  !system "echo 'pilotstack Installer'"
!macroend

!macro customInit
  ; Check for minimum Windows version (Windows 10 or later)
  ${If} ${AtMostWin8.1}
    MessageBox MB_OK|MB_ICONEXCLAMATION "pilotstack requires Windows 10 or later."
    Abort
  ${EndIf}
!macroend

!macro customInstall
  ; Register URL protocol handler
  WriteRegStr SHCTX "Software\Classes\pilotstack" "" "URL:pilotstack Protocol"
  WriteRegStr SHCTX "Software\Classes\pilotstack" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\pilotstack\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\pilotstack\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  
  ; Add to Windows Firewall exceptions (for auto-update)
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="pilotstack" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes'
!macroend

!macro customUnInstall
  ; Remove URL protocol handler
  DeleteRegKey SHCTX "Software\Classes\pilotstack"
  
  ; Remove firewall rule
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="pilotstack"'
!macroend

!macro customRemoveFiles
  ; Clean up additional files if needed
  RMDir /r "$INSTDIR\resources\app.asar.unpacked"
!macroend

