# Marca en el instalador y en las pantallas propias del Desktop

Aplicación del manual de marca v2.0 (sept. 2026) al instalador de Windows y a
las pantallas que el Desktop dibuja por sí mismo: barra de aplicación, splash y
pantalla sin conexión. Fecha: 2026-09-21. Versión afectada: la siguiente a la
0.2.2.

## Qué cambió

| Pieza | Antes | Ahora |
| --- | --- | --- |
| `electron/build/icon.ico`, `icon.png` | Isotipo con degradado y sombra, 256 px | Isotipo plano del manual, 1024 px; `.ico` con 16, 20, 24, 32, 40, 48, 64, 128 (BMP 32 bpp) y 256 (PNG). El anterior queda en `icon.legacy.ico` como referencia. |
| `installer-header.bmp` | 164×314 (tamaño del sidebar, NSIS lo reescalaba: se veía pixelado) | 150×57, 24 bits, fondo suave con la firma (isotipo + «GO Admin») en Tinta. |
| `installer-sidebar.bmp` | 150×314, texto pixelado | 164×314, 24 bits, azul GO con la variante negativa del isotipo, «GO Admin» y «Tu negocio, en un solo lugar.». |
| Textos del instalador | «Go Admin ERP», usted, defines que MUI2 no lee (`MUI_WELCOME_TITLE`) | «GO Admin ERP», tuteo, cadenas reales de Modern UI 2 (`MUI_TEXT_*`, `MUI_UNTEXT_*`), página de bienvenida nueva, título de ventana y pie con «GO Admin ERP». |
| Colores del instalador | `MUI_BGCOLOR 0xF0F4F8`, texto `0x1A1A2E`, azul `#1E3A8A` | Fondo suave `F8FAFF`, Tinta `0F172A`, Pizarra `475569`. |
| Accesos directos | «Go Admin ERP.lnk» | «GO Admin ERP.lnk» (se borra el antiguo antes de crear el nuevo; el desinstalador borra los dos). `shortcutName` y `uninstallDisplayName` en «GO Admin ERP». |
| `license.txt` | «Go Admin ERP», «GO Admin», sin BOM (la página de licencia mostraba «TÃ©rminos») | «GO Admin ERP», «GO Admin S.A.S.», UTF-8 con BOM. El contenido legal no cambia. |
| Barra de aplicación (`src/renderer/toolbar`) | «GO Admin» en texto, azul `#2563eb` | Firma: isotipo 20 px + «GO Admin» (GO 700, Admin 500); Azul GO para marca y progreso, Azul acción para botones y foco. |
| Splash y pantalla sin conexión (`mainWindow.ts`) | «GO Admin ERP» en texto, azul `#3b82f6`, emoji 📶 | Firma con isotipo, paleta del manual, icono SVG, botón Azul acción → Azul profundo al pasar. |
| `copyright` del `.exe` | «GO Admin» | «GO Admin S.A.S.» |

**No cambia** (romperían actualizaciones, accesos directos y la carpeta de
instalación): `productName: Go Admin ERP`, `appId: io.goadmin.desktop`, el
nombre del ejecutable `Go Admin ERP.exe`, la carpeta `%LOCALAPPDATA%\Programs\Go
Admin ERP` ni `artifactName`.

## Especificación aplicada

Paleta: Azul GO `#4361EE` (identidad), Azul acción `#3651D4` (interacción),
Azul profundo `#2A3EA8` (hover, texto azul sobre claro), Tinte GO `#EEF1FE`,
Tinta `#0F172A` (titulares), Pizarra `#475569` (lectura), Blanco, Fondo suave
`#F8FAFF`. Funcionales: `#16A34A`, `#F59E0B`, `#DC2626`, `#0EA5E9`.

Isotipo: cuadrado de lado *x*, radio de esquina 0,29·*x*, «GO» en Inter 700
centrado ópticamente con ancho del grupo ≈ 0,52·*x*; azul GO con «GO» en blanco,
o variante negativa (cuadrado blanco, «GO» azul). Firma: isotipo + «GO Admin»
(GO 700, Admin 500), separación *x*/3, altura de mayúsculas ≈ 0,60·*x*.

Desviaciones deliberadas, todas documentadas en el propio código:

- **Icono de sistema a 16, 20, 24 y 32 px**: el grupo «GO» se abre a 0,72 /
  0,66 / 0,62 / 0,58·*x* y se engrosa el trazo hasta 0,12 px finales. A 0,52·*x*
  las letras a 16 px miden 4 px de alto y no se leen. A partir de 40 px se
  respeta el 0,52.
- **Texto de estados en la barra** (`En línea`, `Sin conexión`): el verde y el
  ámbar del manual no llegan al contraste 4,5:1 que el propio manual exige a 12
  px sobre fondo claro, así que el texto usa tonos más oscuros (`#15803D`,
  `#B91C1C`, `#92400E`) y el punto y el fondo de la pastilla llevan el color
  exacto. Blanco sobre Azul GO da 5,0:1 y sobre Azul acción 6,3:1.
- **Tipografía**: Inter no se puede empaquetar en las pantallas propias sin
  tocar `scripts/copy-renderer.js` (solo copia html/css/svg/png) y la CSP de la
  barra (no tiene `font-src`); el splash y la pantalla sin conexión son `data:`
  URLs de origen opaco y tampoco pueden cargar archivos. Se usa
  `font-family: Inter, "Segoe UI", system-ui`: Inter si está instalada en el
  equipo, Segoe UI si no. Los diálogos del instalador (NSIS) solo pueden usar
  fuentes instaladas: Segoe UI. **Las imágenes** (icono, BMP, `brand-mark.png`)
  sí van en Inter, renderizadas desde los TTF de `electron/build/brand/`.
- **`$(^Name)` en NSIS** sigue siendo «Go Admin ERP» (sale de `productName`):
  solo asoma en cadenas del núcleo de NSIS que no pasan por Modern UI (p. ej.
  «Se desinstalará Go Admin ERP de su ordenador» en la confirmación del
  desinstalador). Todo lo que pasa por MUI2 (títulos, subtítulos, textos de
  licencia, bienvenida y final), el título de la ventana y el pie dicen «GO
  Admin ERP».

## Cómo funciona el instalador ahora

- Nuestro `build/installer.nsh` se compila **antes** que `MUI2.nsh` y que
  `MUI_LANGUAGE`, por eso:
  - los `!define MUI_TEXT_…` / `MUI_UNTEXT_…` ganan al archivo de idioma (que
    los define con `!ifndef`);
  - `Caption` y `UninstallCaption` fijan el título de la ventana (NSIS lo
    reescribe en cada página, un `WM_SETTEXT` al arrancar no sirve);
  - el pie «Go Admin ERP 0.2.x» es `BrandingText`, que electron-builder fija
    después: se reescribe el control 1028/1256 en `MUI_CUSTOMFUNCTION_GUIINIT`.
- Página de bienvenida: el instalador asistido de electron-builder no la trae;
  se añade con `customWelcomePage` (con `skipPageIfUpdated`, como licencia y
  carpeta) para que el sidebar abra y cierre el asistente.
- `MUI_BGCOLOR F8FAFF` pinta cabecera, bienvenida y final; el header BMP se
  generó con ese mismo fondo para fundirse con la cabecera.
- Accesos directos: en una **actualización silenciosa** (`/S` lanzada por la
  app) la página de opciones no se muestra, `customInstall` no crea nada y el
  acceso «Go Admin ERP.lnk» existente sigue funcionando con la grafía vieja
  hasta que el usuario reinstale a mano. NTFS no distingue mayúsculas: por eso
  se borra el `.lnk` antiguo antes de crear el nuevo.

## Regenerar los assets

```bash
cd electron
python build/brand/generate-assets.py            # icon.png, icon.ico, los dos BMP y brand-mark.png
python build/brand/generate-assets.py --preview  # además build/brand/preview.png (hoja de contacto)
```

Requiere Python 3 y Pillow (`pip install pillow`). Las fuentes están en
`electron/build/brand/Inter-{400,500,600,700}.ttf` (extraídas del manual). El
script escribe el `.ico` a mano con `struct` para mantener el formato del
anterior (BMP 32 bpp con máscara AND hasta 128 px, PNG a 256 px) y valida que
los BMP salgan a 24 bits sin compresión, que es lo que exige NSIS.

Después de regenerar: `npm run build` (copia `brand-mark.png` a `dist/`) y
`npx electron-builder --win`.

## Verificación hecha

- `npx tsc -p . --noEmit` limpio; `npm run build` OK; `npx electron-builder
  --win --dir` OK; `npx electron-builder --win` OK (instalador NSIS completo,
  sin avisos de makensis).
- `.ico` leído con GDI+ (`New-Object System.Drawing.Icon(path, n, n)`) a 16,
  20, 24, 32, 48, 64, 128; GDI+ ignora la entrada PNG de 256 igual que con el
  `.ico` anterior (el shell de Windows sí la usa). BMP comprobados con Pillow y
  GDI+: `150×57 Format24bppRgb` y `164×314 Format24bppRgb`.
- Capturas en `docs/desktop/evidencia/marca/` (barra clara/oscura, splash
  claro/oscuro, pantalla sin conexión clara/oscura, hoja de contacto de los
  assets) y en `docs/desktop/evidencia/instalador/` (bienvenida, licencia,
  modo de instalación y carpeta del instalador real, tomadas del `.exe` y
  canceladas antes de instalar).

### Ver el instalador sin instalar

```bash
cd electron && npx electron-builder --win --config.directories.output=release-brand
release-brand\GoAdminERP-Setup-<versión>.exe
```

Avanza con «Siguiente» hasta la página de opciones y pulsa «Cancelar»: hasta
ahí no se escribe nada. La página «Instalando» y la de final solo se ven
instalando de verdad (o actualizando una instalación existente). Borra
`release-brand/` al terminar. Las capturas de esta ronda se tomaron con un
script PowerShell temporal (`Start-Process` + `CopyFromScreen` sobre el
rectángulo DWM de la ventana, `SendKeys {ENTER}` tres veces y `Kill` antes de
llegar a «Instalar»); no se dejó en el repositorio.

## Pendiente de limpieza en la máquina de trabajo

Al cerrar la ronda quedaron `electron/release-brand{,2,3}/win-unpacked/resources/app.asar`
(tres archivos, no versionados) bloqueados por otro proceso de la máquina; todo lo
demás de esas carpetas se borró. Cuando se libere el bloqueo:
`Remove-Item -Recurse -Force electronelease-brand*`. No hay que commitearlos.

## Nota sobre el arranque en desarrollo (no es de esta ronda)

`npx electron .` en esta máquina termina solo a los 6-11 s, sin excepción de
JavaScript ni `app.quit()` (comprobado con la versión de `mainWindow.ts` de
`main` antes de tocarla). No afecta al paquete y queda fuera de esta tarea; las
capturas de las pantallas propias se hicieron renderizando el HTML que genera
`mainWindow.ts` en un Electron mínimo con `capturePage`.
