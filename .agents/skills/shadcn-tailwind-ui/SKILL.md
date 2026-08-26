---
name: shadcn-tailwind-ui
description: Usar SIEMPRE al construir o modificar interfaces con shadcn/ui, Radix UI o Tailwind CSS — componentes, formularios, layouts, tablas de datos, modales, dashboards. Aplica incluso si el usuario solo pide "un formulario" o "una tabla" sin mencionar las librerías explícitamente, si el proyecto ya las usa.
---

# shadcn/ui + Radix UI + Tailwind CSS

## Principios
- Usa componentes de shadcn/ui ya instalados en el proyecto (`components/ui/`)
  antes de crear un componente custom desde cero — revisa esa carpeta primero.
- Los primitivos de Radix (`@radix-ui/react-*`) ya manejan accesibilidad
  (focus trap, aria roles, teclado) — no reimplementes esa lógica a mano encima.
- Tailwind: usa las clases y tokens de diseño ya definidos en `tailwind.config` 
  (colores, spacing, radius) en vez de valores arbitrarios (`bg-[#1a2b3c]`) salvo
  necesidad puntual justificada.

## Formularios
- Usa `react-hook-form` + `zod` (patrón estándar con shadcn) para validación,
  con los componentes `Form`, `FormField`, `FormMessage` de shadcn en vez de
  manejar el estado de errores a mano.
- Estados de carga/disabled explícitos en botones de submit — evita doble envío.

## Tablas de datos (común en ERP/CRM)
- Para tablas con muchas filas/columnas, usa TanStack Table (`@tanstack/react-table`)
  integrado con el componente `Table` de shadcn, no una tabla HTML plana si hay
  ordenamiento, filtros o paginación.
- Paginación server-side cuando el dataset puede crecer (clientes, transacciones,
  productos) — no traigas miles de filas al cliente para paginar en memoria.

## Consistencia visual
- Antes de crear un componente nuevo, revisa si ya existe un patrón similar en el
  proyecto (mismo tipo de card, modal, badge) y reutiliza esa convención de
  spacing/tipografía en vez de inventar una nueva.
- Modo oscuro: si el proyecto lo soporta, usa las variables CSS de shadcn
  (`bg-background`, `text-foreground`, etc.) en vez de colores fijos de Tailwind
  (`bg-white`), para que el componente responda automáticamente al tema.

## Multi-tenant / white-label (si aplica a Go Admin)
- Si el ERP soporta personalización de marca por tenant, usa las variables CSS
  configurables (colores primarios vía CSS variables) en vez de hardcodear el
  color de marca en cada componente.

## Antes de dar por terminado un componente
- [ ] Accesible con teclado (tab, enter, escape en modales/dropdowns) — Radix lo
      da por defecto, no lo rompas con overrides custom.
- [ ] Responsive: probado en mobile width, no solo desktop (relevante si esta UI
      también se usa dentro de Capacitor/React Native webview).
- [ ] Estados de loading/empty/error explícitos, no solo el estado feliz con datos.
