# Reportes de Finanzas consolidados en el módulo Reportes

Fecha: 2026-11-07. Orden del dueño: Finanzas no tiene reportes propios; todos viven en `/app/reportes`.
Diseño: Figma, página «14 Reportes», sección «24. Reportes que salen de Finanzas».
Política fijada en `src/lib/navigation/__tests__/reportesSoloEnReportes.test.ts`.

Cifras comparadas en solo lectura en las organizaciones 333, 335, 338 y 339, del 2026-01-01 al
2026-11-07. Sin escrituras en la base. Sin recorrido en el navegador con sesión real.

## Inventario

| Página vieja (`/app/finanzas/…`) | Fuente | Destino en Reportes | ¿Mismas cifras? |
|---|---|---|---|
| `contabilidad/estado-resultados` | `fn_estado_resultado_integral` (auditada) | `contabilidad/estado-resultados`: la vista principal usa el componente auditado; siguen Por cuenta, Por sucursal, Por centro y Tendencia | Sí, las 4 organizaciones |
| `contabilidad/balance-general` | `getBalanceSheet` → `fn_saldos_cuentas` | `contabilidad/balance-general`, con el componente de Finanzas | **No.** `fn_reporte_balance_general` usa `entry_date <= p_as_of` y corta a medianoche UTC: pierde casi todo el día de corte (org 333: activos 203.484.727 frente a 203.504.727; org 338: 188.040 frente a 200.276). Se conserva la versión de Finanzas |
| `contabilidad/balance-comprobacion` | `fn_saldos_cuentas` | `contabilidad/balance-prueba` | Sí en totales |
| `informes/presupuesto-real` | `fn_reporte_presupuesto_vs_real` | `contabilidad/presupuesto-vs-real` | Sí, misma RPC |
| `reportes/cartera-edades` | `fn_reporte_cxc_aging` / `fn_reporte_cxp_aging` | `finanzas/cxc-aging` (o `cxp-aging` con `?tipo=cxp`) | Sí |
| `informes/flujo-efectivo` | `fn_estado_flujos_efectivo` (auditada) | Nuevo `estado-flujos-efectivo`. El `flujo-efectivo` existente es «Cobros y pagos», no un gemelo | — |
| `informes/cambios-patrimonio`, `notas`, `certificacion`, `indicadores`, `libros` | RPC auditadas | Nuevos `cambios-patrimonio`, `notas-estados`, `certificacion-estados`, `indicadores-financieros`, `libros-contables` | Sin gemelo |
| `contabilidad/libro-diario` | `fn_libro_diario` | Nuevo `libro-diario` | Sí frente a `fn_libro_lineas` |
| `contabilidad/auxiliar-tercero` | `fn_auxiliar_tercero_detalle` | Nuevo `auxiliar-tercero` | Sí en totales |
| `contabilidad/mayor-contable` | `getLedger` | Nuevo `mayor-cuenta`, conserva `?cuenta=` | No comparable |
| `reporte-categorias` | `cash_movements` + `bank_transactions` | Nuevo `finanzas/categorias-tesoreria`, paginado (la pantalla vieja cortaba en 1.000 filas sin avisar) | — |
| `reportes` | `ReportesPage` | `/app/reportes/finanzas` | — |

## Cómo funciona

- El catálogo admite un componente propio por reporte. Los nueve informes contables nuevos son «sin tabla»:
  no entran en cierres, envíos programados, documentos ni en el asistente (400 `REPORTE_SIN_TABLA`).
- El visor pasa periodo y sucursal al componente de Finanzas, que oculta su cabecera y sus fechas.
  Ningún cálculo se duplicó ni cambió.
- Las URL viejas redirigen en el servidor y conservan `desde`/`hasta`, `sucursal` y `cuenta`
  (`src/lib/services/reportes/redireccionesFinanzas.ts`).
- El menú de Finanzas ya no lista reportes; la página de Contabilidad muestra una tarjeta «Reportes
  contables».

## Pendiente

- **Corte del balance general en Reportes:** propuesta sin aplicar en
  `supabase/migrations/PROPUESTA_NO_APLICAR_20261107_balance_general_corte_zona.sql.txt`. Hasta aplicarla,
  cierres y asistente reciben el balance sin el día de corte.
- **Cálculos duplicados que siguen** (mismas cifras hoy): `fn_libro_diario` / `fn_libro_lineas`,
  `fn_saldos_cuentas` / `fn_reporte_balance_prueba`, `getBalanceSheet` / `fn_reporte_balance_general`,
  `fn_reporte_estado_resultados` / `fn_estado_resultado_integral` (la segunda excluye el asiento de
  cierre; la primera no).
- Se perdió el selector de nivel PUC del balance de comprobación viejo.
- El filtro «comparativo» del visor no afecta la vista principal de estado de resultados ni del
  balance: esos componentes tienen su propio «año anterior».
- Para el Contador: si los informes nuevos deben entrar en los cierres, hace falta su versión tabular.

## Actualización 2026-11-07

El corte del balance general quedó aplicado como `20261107230000_balance_general_corte_zona`, con
orden del dueño. Org 338 al 2026-11-07: activos 200.276, igual que la pantalla de Finanzas.
Cierres y asistente ya reciben el día de corte completo.
