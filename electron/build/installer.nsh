; Script NSIS personalizado para GO Admin ERP.
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

; ===== Colores (manual de marca v2.0, sept. 2026) =====
; MUI_BGCOLOR pinta la cabecera y las páginas de bienvenida/final: es el
; «Fondo suave» de la paleta, el mismo con el que se generó
; installer-header.bmp para que el bitmap se funda con la cabecera.
; Formato RRGGBB, el que documenta Modern UI 2.
; Paleta: Azul GO 4361EE · Azul acción 3651D4 · Azul profundo 2A3EA8 ·
; Tinte GO EEF1FE · Tinta 0F172A · Pizarra 475569 · Fondo suave F8FAFF.
!define MUI_BGCOLOR "F8FAFF"
!define MUI_TEXTCOLOR "0F172A"
!define GOADMIN_COLOR_TINTA 0x0F172A
!define GOADMIN_COLOR_PIZARRA 0x475569

; ===== Textos (voz de marca: directa, tutea, sin exclamaciones vacías) =====
; productName sigue siendo «Go Admin ERP» (cambiarlo rompería actualizaciones
; y accesos directos), y electron-builder lo mete en `Name` y `BrandingText`
; DESPUÉS de este archivo, así que aquí no se pueden pisar. Lo que sí se puede:
;  - Las cadenas de Modern UI 2 (MUI_TEXT_* / MUI_UNTEXT_*): el archivo de
;    idioma las define con `!ifndef`, así que definirlas antes gana. Este
;    include se compila antes que MUI2.nsh y que MUI_LANGUAGE.
;  - El título de la ventana: atributo Caption/UninstallCaption (más abajo).
;  - El pie «Go Admin ERP x.y.z» (BrandingText): se reescribe al arrancar la
;    interfaz (GoAdminGuiInit, más abajo).
; Quedan con $(^Name) («Go Admin ERP») solo las cadenas del núcleo de NSIS
; que no pasan por MUI (p. ej. el texto de confirmación del desinstalador).
;
; Página de bienvenida: el instalador asistido de electron-builder no la
; trae; se añade con customWelcomePage para que la firma del sidebar
; (installer-sidebar.bmp) abra y cierre el asistente.
!define MUI_TEXT_WELCOME_INFO_TITLE "Instala GO Admin ERP"
!define MUI_TEXT_WELCOME_INFO_TEXT "Tu negocio, en un solo lugar.$\r$\n$\r$\nGO Admin ERP reúne ventas, inventario, caja, clientes y la impresión local de tu equipo en una sola aplicación.$\r$\n$\r$\nPulsa Siguiente para empezar."
!define MUI_TEXT_LICENSE_TITLE "Licencia"
!define MUI_TEXT_LICENSE_SUBTITLE "Lee los términos antes de instalar GO Admin ERP."
!define MUI_INNERTEXT_LICENSE_TOP "Usa la barra de desplazamiento para leer el resto del acuerdo."
!define MUI_INNERTEXT_LICENSE_BOTTOM "Si aceptas las condiciones, pulsa Acepto para continuar. Necesitas aceptarlas para instalar GO Admin ERP."
!define MUI_TEXT_DIRECTORY_TITLE "Carpeta de instalación"
!define MUI_TEXT_DIRECTORY_SUBTITLE "Elige dónde instalar GO Admin ERP."
!define MUI_DIRECTORYPAGE_TEXT_TOP "Si no tienes un motivo para cambiarla, deja la carpeta sugerida."
!define MUI_TEXT_INSTALLING_TITLE "Instalando"
!define MUI_TEXT_INSTALLING_SUBTITLE "Espera mientras GO Admin ERP se instala."
!define MUI_TEXT_FINISH_TITLE "Instalación completada"
!define MUI_TEXT_FINISH_SUBTITLE "GO Admin ERP se instaló correctamente."
!define MUI_TEXT_ABORT_TITLE "Instalación cancelada"
!define MUI_TEXT_ABORT_SUBTITLE "GO Admin ERP no se instaló."
!define MUI_TEXT_FINISH_INFO_TITLE "GO Admin ERP ya está instalado"
!define MUI_TEXT_FINISH_INFO_TEXT "Todo listo. Abre GO Admin ERP desde el acceso directo y entra con tu cuenta.$\r$\n$\r$\nEl agente de impresión arranca solo con Windows.$\r$\n$\r$\nPulsa Terminar para cerrar el asistente."
!define MUI_TEXT_FINISH_RUN "&Abrir GO Admin ERP"
!define MUI_TEXT_ABORTWARNING "¿Quieres salir sin instalar GO Admin ERP?"

!define MUI_UNTEXT_WELCOME_INFO_TITLE "Desinstalar GO Admin ERP"
!define MUI_UNTEXT_WELCOME_INFO_TEXT "Este asistente quita GO Admin ERP de tu equipo.$\r$\n$\r$\nCierra GO Admin ERP antes de continuar.$\r$\n$\r$\nPulsa Siguiente para continuar."
!define MUI_UNTEXT_CONFIRM_TITLE "Desinstalar GO Admin ERP"
!define MUI_UNTEXT_CONFIRM_SUBTITLE "Quita GO Admin ERP de tu equipo."
!define MUI_UNTEXT_UNINSTALLING_TITLE "Desinstalando"
!define MUI_UNTEXT_UNINSTALLING_SUBTITLE "Espera mientras GO Admin ERP se desinstala."
!define MUI_UNTEXT_FINISH_TITLE "Desinstalación completada"
!define MUI_UNTEXT_FINISH_SUBTITLE "GO Admin ERP se desinstaló correctamente."
!define MUI_UNTEXT_ABORT_TITLE "Desinstalación cancelada"
!define MUI_UNTEXT_ABORT_SUBTITLE "GO Admin ERP sigue instalado."
!define MUI_UNTEXT_FINISH_INFO_TITLE "GO Admin ERP se ha desinstalado"
!define MUI_UNTEXT_FINISH_INFO_TEXT "GO Admin ERP ya no está en tu equipo.$\r$\n$\r$\nPulsa Terminar para cerrar el asistente."
!define MUI_UNTEXT_ABORTWARNING "¿Quieres salir sin desinstalar GO Admin ERP?"

; Título de la ventana: por defecto es $(^SetupCaption) = «Instalación de
; $(^Name)» y NSIS lo vuelve a poner en cada cambio de página, así que un
; WM_SETTEXT al arrancar no sirve; el atributo Caption sí (electron-builder
; no lo define, solo Name).
Caption "Instalación de GO Admin ERP"
UninstallCaption "Desinstalación de GO Admin ERP"

; Pie de página «Go Admin ERP x.y.z» (BrandingText): electron-builder lo
; fija después de este archivo, así que se reescribe el control (1028 en el
; diálogo exterior; 1256 es su sombra en algunos temas) al crear la ventana.
!ifndef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_GUIINIT GoAdminGuiInit
  Function GoAdminGuiInit
    GetDlgItem $0 $HWNDPARENT 1028
    SendMessage $0 ${WM_SETTEXT} 0 "STR:GO Admin ERP ${VERSION}"
    GetDlgItem $0 $HWNDPARENT 1256
    SendMessage $0 ${WM_SETTEXT} 0 "STR:GO Admin ERP ${VERSION}"
  FunctionEnd
!else
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.GoAdminGuiInit
  Function un.GoAdminGuiInit
    GetDlgItem $0 $HWNDPARENT 1028
    SendMessage $0 ${WM_SETTEXT} 0 "STR:GO Admin ERP ${VERSION}"
    GetDlgItem $0 $HWNDPARENT 1256
    SendMessage $0 ${WM_SETTEXT} 0 "STR:GO Admin ERP ${VERSION}"
  FunctionEnd
!endif

; Página de bienvenida (ver arriba). skipPageIfUpdated: en una actualización
; lanzada por la propia app no se muestra, igual que licencia y carpeta.
!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME
!macroend

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
      "Hay una versión anterior de GO Admin ERP instalada para todos los usuarios.$\n$\nSe desinstalará antes de continuar (Windows puede pedir permisos de administrador). Tu configuración e impresoras se conservan." \
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
      MessageBox MB_OK|MB_ICONSTOP "No se pudo quitar la versión anterior. Desinstálala desde Configuración > Aplicaciones y vuelve a ejecutar este instalador."
      Abort
    ${EndIf}
  ${EndIf}
  ; Accesos directos huérfanos "para todos los usuarios" (build 0.1.0) cuyo
  ; destino ya no existe. Windows agrupa la app en la barra de tareas por su
  ; AppUserModelId (io.goadmin.desktop) y toma el icono del acceso directo del
  ; menú Inicio que lo declara: si ese .lnk apunta a un .exe borrado, la barra
  ; muestra una hoja en blanco en vez del logo aunque la app esté bien
  ; instalada. Borrado en el mejor esfuerzo: sin permisos de administrador no
  ; se puede y no pasa nada (Delete no falla).
  SetShellVarContext all
  IfFileExists "$PROGRAMFILES64\Go Admin ERP\Go Admin Desktop\Go Admin ERP.exe" +4 0
    Delete "$SMPROGRAMS\Go Admin ERP\Go Admin ERP.lnk"
    RMDir "$SMPROGRAMS\Go Admin ERP"
    Delete "$DESKTOP\Go Admin ERP.lnk"
  SetShellVarContext current
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
  SetCtlColors $0 ${GOADMIN_COLOR_TINTA} transparent

  ${NSD_CreateLabel} 0 32u 100% 16u "Elige cómo quieres abrir GO Admin ERP:"
  Pop $0
  CreateFont $1 "Segoe UI" 9 400
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 ${GOADMIN_COLOR_PIZARRA} transparent

  ${NSD_CreateCheckbox} 10u 58u 100% 14u "&Crear acceso directo en el Escritorio"
  Pop $DesktopShortcutCheckbox
  CreateFont $1 "Segoe UI" 9 400
  SendMessage $DesktopShortcutCheckbox ${WM_SETFONT} $1 0
  SetCtlColors $DesktopShortcutCheckbox ${GOADMIN_COLOR_TINTA} transparent
  ${NSD_Check} $DesktopShortcutCheckbox
  StrCpy $CreateDesktopShortcut 1

  ${NSD_CreateLabel} 20u 72u 100% 12u "Acceso rápido desde el escritorio de Windows"
  Pop $0
  CreateFont $1 "Segoe UI" 8 400
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 ${GOADMIN_COLOR_PIZARRA} transparent

  ${NSD_CreateCheckbox} 10u 90u 100% 14u "&Crear acceso en el Menú de Inicio"
  Pop $StartMenuCheckbox
  CreateFont $1 "Segoe UI" 9 400
  SendMessage $StartMenuCheckbox ${WM_SETFONT} $1 0
  SetCtlColors $StartMenuCheckbox ${GOADMIN_COLOR_TINTA} transparent
  ${NSD_Check} $StartMenuCheckbox
  StrCpy $CreateStartMenu 1

  ${NSD_CreateLabel} 20u 104u 100% 12u "Aparece en el Menú Inicio de Windows"
  Pop $0
  CreateFont $1 "Segoe UI" 8 400
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 ${GOADMIN_COLOR_PIZARRA} transparent

  ${NSD_CreateHLine} 0 124u 100% 1u
  Pop $0

  ${NSD_CreateLabel} 0 132u 100% 24u "El agente de impresión arranca solo con Windows$\npara que tus impresoras estén siempre listas."
  Pop $0
  CreateFont $1 "Segoe UI" 8 400
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 ${GOADMIN_COLOR_PIZARRA} transparent

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
; Nombre de los accesos directos (manual de marca: «GO Admin ERP»). Los
; instaladores anteriores a 0.2.3 los creaban como «Go Admin ERP.lnk». En
; NTFS ambos nombres son el MISMO archivo (sin distinción de mayúsculas) y
; CreateShortCut sobre uno existente conserva la grafía vieja, así que se
; borra el antiguo antes de crear el nuevo. El ejecutable, la carpeta de
; instalación y productName no cambian: los .lnk viejos siguen funcionando.
!define GOADMIN_LNK "GO Admin ERP.lnk"
!define GOADMIN_LNK_LEGACY "Go Admin ERP.lnk"
!define GOADMIN_SM_DIR "GO Admin ERP"
!define GOADMIN_SM_DIR_LEGACY "Go Admin ERP"

!macro customInstall
  ${If} $CreateDesktopShortcut == 1
    Delete "$DESKTOP\${GOADMIN_LNK_LEGACY}"
    CreateShortCut "$DESKTOP\${GOADMIN_LNK}" "$INSTDIR\Go Admin ERP.exe" "" "$INSTDIR\Go Admin ERP.exe" 0
  ${EndIf}

  ${If} $CreateStartMenu == 1
    Delete "$SMPROGRAMS\${GOADMIN_SM_DIR_LEGACY}\${GOADMIN_LNK_LEGACY}"
    RMDir "$SMPROGRAMS\${GOADMIN_SM_DIR_LEGACY}"
    CreateDirectory "$SMPROGRAMS\${GOADMIN_SM_DIR}"
    CreateShortCut "$SMPROGRAMS\${GOADMIN_SM_DIR}\${GOADMIN_LNK}" "$INSTDIR\Go Admin ERP.exe" "" "$INSTDIR\Go Admin ERP.exe" 0
  ${EndIf}
!macroend

; Antes los accesos quedaban huérfanos al desinstalar: electron-builder solo
; borra los que crea él. Se borran el nombre nuevo y el antiguo.
!macro customUnInstall
  Delete "$DESKTOP\${GOADMIN_LNK}"
  Delete "$DESKTOP\${GOADMIN_LNK_LEGACY}"
  Delete "$SMPROGRAMS\${GOADMIN_SM_DIR}\${GOADMIN_LNK}"
  Delete "$SMPROGRAMS\${GOADMIN_SM_DIR_LEGACY}\${GOADMIN_LNK_LEGACY}"
  RMDir "$SMPROGRAMS\${GOADMIN_SM_DIR}"
  RMDir "$SMPROGRAMS\${GOADMIN_SM_DIR_LEGACY}"
!macroend
