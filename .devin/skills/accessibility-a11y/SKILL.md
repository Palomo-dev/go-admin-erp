---
name: accessibility-a11y
description: Usar SIEMPRE al construir o revisar interfaces de usuario (Next.js, React, shadcn/ui, apps móviles) para asegurar que sean utilizables con teclado, lectores de pantalla, y cumplan contraste adecuado. Aplica a formularios, modales, tablas, navegación, y cualquier componente interactivo nuevo.
---

# Accesibilidad (a11y)

## Principios base
- Todo elemento interactivo debe ser operable solo con teclado: `Tab` para
  navegar, `Enter`/`Space` para activar, `Escape` para cerrar modales/dropdowns.
  Radix UI (base de shadcn) ya maneja esto por defecto — no lo rompas con
  overrides de eventos custom que quiten ese comportamiento.
- Contraste de color: texto normal mínimo 4.5:1, texto grande mínimo 3:1 (WCAG AA).
  Verifica especialmente combinaciones de marca/tema oscuro custom, no solo los
  colores por defecto de shadcn.
- Nunca comuniques información solo con color (ej. "rojo = error, verde = éxito"
  sin ícono o texto adicional) — usuarios con daltonismo no lo perciben.

## Formularios
- Todo `<input>` con su `<label>` asociado (via `htmlFor`/`id`, que es lo que ya
  hace el componente `Form` de shadcn si se usa correctamente).
- Mensajes de error asociados al campo vía `aria-describedby`, no solo mostrados
  visualmente cerca sin relación semántica.
- Foco automático al primer campo con error al fallar la validación de un
  formulario largo.

## Modales y overlays
- Focus trap dentro del modal mientras está abierto (Radix Dialog ya lo hace).
- Al cerrar, el foco vuelve al elemento que abrió el modal, no se pierde en el
  body.
- `aria-label`/`aria-labelledby` en el modal para que un lector de pantalla anuncie
  de qué trata.

## Imágenes e íconos
- `alt` descriptivo en imágenes con significado; `alt=""` (vacío, no ausente) en
  imágenes puramente decorativas para que lectores de pantalla las ignoren.
- Íconos usados como único contenido de un botón (ej. botón de solo ícono de
  "eliminar") necesitan `aria-label` — un ícono solo no es accesible por sí mismo.

## Tablas de datos
- Headers de columna con `<th scope="col">` correctos (o el equivalente semántico
  del componente Table usado) para que un lector de pantalla anuncie a qué
  columna pertenece cada celda.

## Verificación rápida
- Navega el flujo completo (no solo un componente aislado) usando solo teclado,
  sin mouse, antes de dar por terminada una feature de UI compleja.
- Usa el checker de contraste automático de las devtools del navegador o axe
  DevTools para detectar problemas obvios antes de revisión manual.
