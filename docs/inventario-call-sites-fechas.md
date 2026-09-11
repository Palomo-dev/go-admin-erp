# Inventario de call-sites de fechas — P2-7

> Generado el 2026-09-11. Total: **1082 matches** en **475 archivos**.
> Patrones buscados: `toISOString().split('T')`, `toISOString().slice(0,10)`,
> `formatDate(`, `parseLocalDate(`, `.toLocaleDateString(`, `.toLocaleTimeString(`.

## Conteo por modulo

| Modulo | Archivos | Matches | Prioridad |
|--------|----------|---------|-----------|
| finanzas | 83 | 277 | 1 |
| services (lib) | 57 | 153 | 1 |
| app (routes) | 60 | 130 | 2 |
| inventario | 32 | 64 | 3 |
| pms | 23 | 61 | 4 |
| gym | 26 | 55 | 5 |
| hrm | 22 | 54 | 5 |
| pos | 26 | 49 | 1 (parcialmente migrado) |
| crm | 28 | 36 | 6 |
| notificaciones | 11 | 24 | 7 |
| parking | 15 | 21 | 4 |
| clientes | 7 | 20 | 6 |
| integraciones | 14 | 19 | 7 |
| api | 11 | 18 | 2 |
| transporte | 9 | 17 | 8 |
| chat | 9 | 14 | 7 |
| organization | 7 | 11 | 7 |
| inicio | 6 | 8 | 2 |
| pm | 5 | 8 | 4 |
| app-layout | 4 | 6 | 2 |
| profile | 1 | 5 | 7 |
| subscription | 2 | 4 | 7 |
| timeline | 2 | 3 | 7 |
| admin | 2 | 2 | 9 |
| reportes | 2 | 2 | 8 |
| shared | 1 | 2 | 9 |
| voice | 1 | 2 | 7 |
| hooks | 1 | 2 | 9 |
| jobs | 2 | 2 | 7 |
| calendario | 1 | 1 | 9 |
| configuracion | 1 | 1 | 9 |
| context | 1 | 1 | 9 |
| utils | 1 | 1 | 9 |
| otros | 2 | 9 | 9 |

## Plan de migracion por modulo (orden de impacto de negocio)

1. **POS reportes** (pos/reportes, pos/cajas) — ya parcialmente migrado
2. **Finanzas dashboards** (finanzas/contabilidad, finanzas/cuentas-por-cobrar, cuentas-por-pagar)
3. **Inicio** (inicio/dashboard, KPIs)
4. **Inventario** (inventario/garantias, inventario/movimientos)
5. **PMS** (pms, parking)
6. **HRM** (hrm/nomina, hrm/prestamos, hrm/compensacion)
7. **CRM** (crm/pipeline, crm/oportunidades, crm/campanas)
8. **Transporte** (transporte/rutas, transporte/tracking)
9. **Gym** (gym/memberships, gym/classes)

## Distincion critica: timestamptz vs date

Antes de migrar cada call-site, consultar `information_schema.columns` para
determinar si la columna de origen es `timestamptz` (convertir con
`formatDateInTz`) o `date` (no convertir, usar `formatPlainDate`).

Confundir estos dos casos es exactamente lo que produjo el bug original.

## Regla por PR

- Un PR por modulo.
- Con cada modulo migrado, anadir su ruta al bloque `overrides` de
  `.eslintrc.json` con `error`.
- Anadir un test por modulo con `TZ=UTC` y `TZ=America/Bogota`.
