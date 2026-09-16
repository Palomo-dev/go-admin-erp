; Script NSIS personalizado para Go Admin ERP.
;
; electron-builder incluye este archivo dentro de su propio script y ofrece
; macros con un punto de inserción conocido. Solo se usan esas macros:
;   customInit               → al iniciar el instalador (.onInit)
;   customPageAfterChangeDir → páginas propias justo después de la de carpeta
;   customInstall            → al final de la sección de instalación
;   customUnInstall          → al final de la sección de desinstalación
; Antes había un "Page custom" suelto y una "Section -PostInstall": funcionaban
; por casualidad del orden de inclusión y el desinstalador no sabía nada de
; los accesos directos creados a mano.
;
; No redefinir MUI_ICON, MUI_UNICON, MUI_LANGUAGE, etc. (las define electron-builder).

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; ===== Colores de marca (azul GO Admin) =====
!define MUI_BGCOLOR "0xF0F4F8"
!define MUI_TEXTCOLOR "0x1A1A2E"

; ===== Textos =====
!define MUI_WELCOME_TITLE "Bienvenido al instalador de Go Admin ERP"
!define MUI_WELCOME_TEXT "Go Admin ERP es la plataforma de gestión empresarial todo-en-uno.$\n$\nIncluye POS, inventario, PMS, CRM, finanzas y agente de impresión local.$\n$\nHaz clic en Siguiente para continuar."

!define MUI_DIRECTORYPAGE_TEXT_TOP "Selecciona la carpeta donde instalar Go Admin ERP.$\n$\nSe recomienda mantener la ubicación predeterminada."

!define MUI_FINISH_TITLE "Go Admin ERP se ha instalado correctamente"
!define MUI_FINISH_TEXT "Go Admin ERP está listo para usarse.$\n$\nPuedes iniciar la aplicación desde el acceso directo."

; Clave de desinstalación que registra electron-builder (nombre = appId).
; La instalación 0.1.0 (perMachine + requireAdministrator) la dejó en HKLM;
; la actual (por usuario) vive en HKCU.
!define GOADMIN_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\io.goadmin.desktop"

; =============================================================================
; customInit: desinstalar una versión anterior instalada "para todos los
; usuarios" (build 0.1.0). El instalador actual es por usuario y sin UAC; si
; no se quita la per-machine quedarían dos copias en paralelo y el
; auto-update nunca alcanzaría a la vieja.
; =============================================================================
!macro customInit
  ReadRegStr $R0 HKLM "${GOADMIN_UNINSTALL_KEY}" "UninstallString"
  ${If} $R0 != ""
    ReadRegStr $R1 HKLM "${GOADMIN_UNINSTALL_KEY}" "InstallLocation"
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION \
      "Se encontró una versión anterior de Go Admin ERP instalada para todos los usuarios.$\n$\nSe desinstalará antes de continuar (Windows puede pedir permisos de administrador). Tu configuración e impresoras se conservan." \
      IDOK +2
    Abort
    ; _?= evita que el desinstalador se copie a %TEMP%, así ExecWait espera de verdad.
    ${If} $R1 != ""
      ExecWait '$R0 /S _?=$R1' $R2
      ; Con _?= el desinstalador no puede borrarse a sí mismo ni su carpeta.
      Delete "$R1\Uninstall Go Admin ERP.exe"
      RMDir "$R1"
    ${Else}
      ExecWait '$R0 /S' $R2
    ${EndIf}
    ; Si la clave sigue ahí, el usuario canceló el UAC o algo falló.
    ReadRegStr $R0 HKLM "${GOADMIN_UNINSTALL_KEY}" "UninstallString"
    ${If} $R0 != ""
      MessageBox MB_OK|MB_ICONSTOP "No se pudo desinstalar la versión anterior. Desinstálala desde Configuración > Aplicaciones y vuelve a ejecutar este instalador."
      Abort
    ${EndIf}
  ${EndIf}
!macroend

; =============================================================================
; Página de opciones (después de elegir carpeta)
; =============================================================================
; electron-builder compila este mismo script dos veces: instalador y
; desinstalador. En el desinstalador no hay páginas de instalación, y una
; función de instalación sin referenciar es error (warning 6010): por eso
; las funciones van dentro de !ifndef BUILD_UNINSTALLER.
!ifndef BUILD_UNINSTALLER
Var DesktopShortcutCheckbox
Var StartMenuCheckbox
Var CreateDesktopShortcut
Var CreateStartMenu

Function ShowOptionsPage
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 28u "Opciones de instalación"
  Pop $0
  CreateFont $1 "Segoe UI" 14 700
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 0x1E3A8A transparent

  ${NSD_CreateLabel} 0 32u 100% 16u "Personaliza cómo quieres acceder a Go Admin ERP:"
  Pop $0
  CreateFont $1 "Segoe UI" 9 400
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 0x333333 transparent

  ${NSD_CreateCheckbox} 10u 58u 100% 14u "&Crear acceso directo en el Escritorio"
  Pop $DesktopShortcutCheckbox
  CreateFont $1 "Segoe UI" 9 400
  SendMessage $DesktopShortcutCheckbox ${WM_SETFONT} $1 0
  SetCtlColors $DesktopShortcutCheckbox 0x1A1A2E transparent
  ${NSD_Check} $DesktopShortcutCheckbox
  StrCpy $CreateDesktopShortcut 1

  ${NSD_CreateLabel} 20u 72u 100% 12u "Acceso rápido desde el escritorio de Windows"
  Pop $0
  CreateFont $1 "Segoe UI" 8 400
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 0x666666 transparent

  ${NSD_CreateCheckbox} 10u 90u 100% 14u "&Crear acceso en el Menú de Inicio"
  Pop $StartMenuCheckbox
  CreateFont $1 "Segoe UI" 9 400
  SendMessage $StartMenuCheckbox ${WM_SETFONT} $1 0
  SetCtlColors $StartMenuCheckbox 0x1A1A2E transparent
  ${NSD_Check} $StartMenuCheckbox
  StrCpy $CreateStartMenu 1

  ${NSD_CreateLabel} 20u 104u 100% 12u "Aparece en el Menú Inicio de Windows"
  Pop $0
  CreateFont $1 "Segoe UI" 8 400
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 0x666666 transparent

  ${NSD_CreateHLine} 0 124u 100% 1u
  Pop $0

  ${NSD_CreateLabel} 0 132u 100% 24u "El agente de impresión se inicia automáticamente con Windows$\npara que las impresoras estén siempre listas."
  Pop $0
  CreateFont $1 "Segoe UI" 8 400
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 0x666666 transparent

  nsDialogs::Show
FunctionEnd

Function LeaveOptionsPage
  ${NSD_GetState} $DesktopShortcutCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $CreateDesktopShortcut 1
  ${Else}
    StrCpy $CreateDesktopShortcut 0
  ${EndIf}

  ${NSD_GetState} $StartMenuCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $CreateStartMenu 1
  ${Else}
    StrCpy $CreateStartMenu 0
  ${EndIf}
FunctionEnd

!endif

!macro customPageAfterChangeDir
  Page custom ShowOptionsPage LeaveOptionsPage
!macroend

; =============================================================================
; Accesos directos. El icono sale del propio ejecutable (índice 0):
; $INSTDIR\resources\build\icon.ico NO existe en la instalación (el .ico
; desempaquetado queda en resources\app.asar.unpacked\build\icon.ico), así
; que los accesos salían con el icono genérico de Windows.
; =============================================================================
!macro customInstall
  ${If} $CreateDesktopShortcut == 1
    CreateShortCut "$DESKTOP\Go Admin ERP.lnk" "$INSTDIR\Go Admin ERP.exe" "" "$INSTDIR\Go Admin ERP.exe" 0
  ${EndIf}

  ${If} $CreateStartMenu == 1
    CreateDirectory "$SMPROGRAMS\Go Admin ERP"
    CreateShortCut "$SMPROGRAMS\Go Admin ERP\Go Admin ERP.lnk" "$INSTDIR\Go Admin ERP.exe" "" "$INSTDIR\Go Admin ERP.exe" 0
  ${EndIf}
!macroend

; Antes los accesos quedaban huérfanos al desinstalar: electron-builder solo
; borra los que crea él.
!macro customUnInstall
  Delete "$DESKTOP\Go Admin ERP.lnk"
  Delete "$SMPROGRAMS\Go Admin ERP\Go Admin ERP.lnk"
  RMDir "$SMPROGRAMS\Go Admin ERP"
!macroend
