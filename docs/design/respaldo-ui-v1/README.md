# Respaldo de la UI v1 — el shell antes del rediseño

Capturas del shell (sidebar, header, menús) tal como estaba el **2026-09-23**,
antes de aplicar los tokens de Figma y el shell nuevo. Son la referencia visual
«por si algo»: para comparar, no para implementar.

## Cómo recuperar el código viejo

El código exacto de esta versión está en el tag de git **`respaldo/ui-v1`**.

```bash
# Ver un archivo tal como estaba
git show respaldo/ui-v1:src/components/app-layout/AppLayout.tsx

# Restaurar un archivo concreto en el árbol de trabajo
git checkout respaldo/ui-v1 -- src/components/app-layout/Sidebar/SidebarNavigation.tsx

# Comparar lo nuevo con lo viejo
git diff respaldo/ui-v1 -- src/components/app-layout/
```

Los componentes viejos **no se copian a una carpeta aparte**: dos copias del mismo
componente se separan en semanas y cualquier import a la vieja la mantiene viva
sin que nadie lo note. Se quedan en su sitio marcados `@deprecated` hasta que el
último que los usa migra, y entonces se borran. El tag es el respaldo exacto.

## Las capturas

| Archivo | Qué muestra |
|---|---|
| `01-escritorio-colapsado-submenu-claro.png` | Rail colapsado + panel de submenú de Finanzas |
| `02-escritorio-expandido-submenu-claro.png` | Sidebar expandido + panel de submenú |
| `03-escritorio-colapsado-sin-panel-claro.png` | Rail colapsado, panel cerrado (pestaña para reabrir) |
| `04-escritorio-selector-sucursal.png` | Selector de sucursal del header abierto |
| `05-escritorio-notificaciones.png` | Campana abierta (Notificaciones / Mías / Todas) |
| `06-escritorio-menu-perfil.png` | Menú de perfil del header |
| `08-escritorio-colapsado-oscuro.png` | Rail colapsado en modo oscuro |
| `09-escritorio-expandido-submenu-oscuro.png` | Expandido + panel en modo oscuro |
| `10-movil-pantalla.png` | Móvil 390 px: header de dos filas |
| `11-movil-menu-abierto.png` | Móvil: drawer abierto con acordeones |

No hay captura del Ctrl+K: su animación de entrada deja el contenido
transparente para el rasterizador. Su diseño está en el código del tag.

Las mismas diez capturas están en Figma, página **99 Descartes**, sección
«UI v1 — shell antes del rediseño (2026-09-23)».

## Datos anonimizados

El repositorio es público. Antes de cada captura se sustituyeron en la propia
página los nombres de organización por los ficticios del archivo de Figma
(`Mi empresa S.A.S.`, `Comercial Andina S.A.S.`…), los correos por
`usuario@ejemplo.com`, el texto de las notificaciones por texto de ejemplo, y se
ocultaron los logos de organización. Se hicieron a 1440 × 900 (escritorio) y
390 × 844 (móvil) con `html2canvas`, así que algunos textos de campos de
formulario salen recortados en su línea base: es un defecto de la captura, no de
la interfaz.
