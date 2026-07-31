; Script NSIS personalizado para Go Admin ERP
; No redefinir MUI_ICON, MUI_UNICON, MUI_LANGUAGE, etc. (electron-builder las define automáticamente)

; ===== Includes necesarios =====
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; ===== Colores de marca (azul GO Admin) =====
!define MUI_BGCOLOR "0xF0F4F8"
!define MUI_TEXTCOLOR "0x1A1A2E"

; ===== Textos personalizados =====
!define MUI_WELCOME_TITLE "Bienvenido al instalador de Go Admin ERP"
!define MUI_WELCOME_TEXT "Go Admin ERP es la plataforma de gestión empresarial todo-en-uno.$\n$\nIncluye POS, inventario, PMS, CRM, finanzas y agente de impresión local.$\n$\nHaz clic en Siguiente para continuar."

!define MUI_DIRECTORYPAGE_TEXT_TOP "Selecciona la carpeta donde instalar Go Admin ERP.$\n$\nSe recomienda mantener la ubicación predeterminada."

!define MUI_FINISH_TITLE "Go Admin ERP se ha instalado correctamente"
!define MUI_FINISH_TEXT "Go Admin ERP está listo para usarse.$\n$\nPuedes iniciar la aplicación desde el acceso directo."

; ===== Variables para página de opciones =====
Var DesktopShortcutCheckbox
Var StartMenuCheckbox
Var CreateDesktopShortcut
Var CreateStartMenu

; ===== Página personalizada: opciones de acceso =====
Function ShowOptionsPage
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ; Título de la página
  ${NSD_CreateLabel} 0 0 100% 28u "Opciones de instalación"
  Pop $0
  CreateFont $1 "Segoe UI" 14 700
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 0x1E3A8A transparent

  ; Descripción
  ${NSD_CreateLabel} 0 32u 100% 16u "Personaliza cómo quieres acceder a Go Admin ERP:"
  Pop $0
  CreateFont $1 "Segoe UI" 9 400
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 0x333333 transparent

  ; Checkbox: acceso en escritorio (marcado por defecto)
  ${NSD_CreateCheckbox} 10u 58u 100% 14u "&Crear acceso directo en el Escritorio"
  Pop $DesktopShortcutCheckbox
  CreateFont $1 "Segoe UI" 9 400
  SendMessage $DesktopShortcutCheckbox ${WM_SETFONT} $1 0
  SetCtlColors $DesktopShortcutCheckbox 0x1A1A2E transparent
  ${NSD_Check} $DesktopShortcutCheckbox
  StrCpy $CreateDesktopShortcut 1

  ; Subtexto para escritorio
  ${NSD_CreateLabel} 20u 72u 100% 12u "Acceso rápido desde el escritorio de Windows"
  Pop $0
  CreateFont $1 "Segoe UI" 8 400
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 0x666666 transparent

  ; Checkbox: acceso en menú inicio (marcado por defecto)
  ${NSD_CreateCheckbox} 10u 90u 100% 14u "&Crear acceso en el Menú de Inicio"
  Pop $StartMenuCheckbox
  CreateFont $1 "Segoe UI" 9 400
  SendMessage $StartMenuCheckbox ${WM_SETFONT} $1 0
  SetCtlColors $StartMenuCheckbox 0x1A1A2E transparent
  ${NSD_Check} $StartMenuCheckbox
  StrCpy $CreateStartMenu 1

  ; Subtexto para menú inicio
  ${NSD_CreateLabel} 20u 104u 100% 12u "Aparece en el Menú Inicio de Windows"
  Pop $0
  CreateFont $1 "Segoe UI" 8 400
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 0x666666 transparent

  ; Línea separadora
  ${NSD_CreateHLine} 0 124u 100% 1u
  Pop $0

  ; Nota informativa
  ${NSD_CreateLabel} 0 132u 100% 24u "El agente de impresión se inicia automáticamente con Windows$\npara que las impresoras estén siempre listas."
  Pop $0
  CreateFont $1 "Segoe UI" 8 400
  SendMessage $0 ${WM_SETFONT} $1 0
  SetCtlColors $0 0x666666 transparent

  nsDialogs::Show
FunctionEnd

Function LeaveOptionsPage
  ; Leer estado de checkbox escritorio
  ${NSD_GetState} $DesktopShortcutCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $CreateDesktopShortcut 1
  ${Else}
    StrCpy $CreateDesktopShortcut 0
  ${EndIf}

  ; Leer estado de checkbox menú inicio
  ${NSD_GetState} $StartMenuCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $CreateStartMenu 1
  ${Else}
    StrCpy $CreateStartMenu 0
  ${EndIf}
FunctionEnd

; ===== Insertar página de opciones (aparece después de directorio) =====
Page custom ShowOptionsPage LeaveOptionsPage

; ===== Crear accesos según selección del usuario =====
Section -PostInstall
  ; Acceso en escritorio
  ${If} $CreateDesktopShortcut == 1
    CreateShortCut "$DESKTOP\Go Admin ERP.lnk" "$INSTDIR\Go Admin ERP.exe" "" "$INSTDIR\resources\build\icon.ico" 0
  ${EndIf}

  ; Acceso en menú inicio
  ${If} $CreateStartMenu == 1
    CreateDirectory "$SMPROGRAMS\Go Admin ERP"
    CreateShortCut "$SMPROGRAMS\Go Admin ERP\Go Admin ERP.lnk" "$INSTDIR\Go Admin ERP.exe" "" "$INSTDIR\resources\build\icon.ico" 0
  ${EndIf}
SectionEnd
