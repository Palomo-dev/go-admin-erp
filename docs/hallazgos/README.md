# Hallazgos de auditoría — Finanzas

Índice de hallazgos de la auditoría del módulo Finanzas de GO Admin ERP.
Cada hallazgo vive en su propio archivo (`F-XX.md`), editable sin tocar
nada más y con diff limpio en git.

Reglas de contenido: solo IDs numéricos de organización (`org 120`), nunca
nombres de clientes ni NITs. El paquete del contador (que sí los lleva)
vive fuera del repo, en `docs/auditoria-finanzas/` (ignorado por `.gitignore`).

## Índice

| ID | Título | Severidad | Estado | Fase |
|---|---|---|---|---|
| [F-01](F-01.md) | Duplicación de asientos por trigger CxC + trigger factura | Crítica | Corregido (1.278 contra-asientos, 2026-09-23) | Fase 0 |
| [F-02](F-02.md) | Reglas contables ambiguas y huérfanas | Alta | Parcial (8 reglas huérfanas pendientes) | Fase 3a |
| [F-03](F-03.md) | Fallback de branch en fn_create_journal_entry | Alta | Corregido | Fase 0 |
| [F-04](F-04.md) | Número de factura no único | Bloqueante | Documentado | Fase 3a |
| [F-05](F-05.md) | Estado y saldo de factura contradictorios | Alta | Documentado | Fase 0 |
| [F-06](F-06.md) | Vocabulario polimórfico sin normalizar | Media (deuda) | Documentado | Fase 3c |
| [F-07](F-07.md) | Tablas sin FK y columnas heredadas | Media (deuda) | Documentado | Fase 3c |
| [F-08](F-08.md) | Aislamiento por sucursal en tablas financieras | Alta | Corregido (19 tablas) | Fase 1 |
| [F-09](F-09.md) | Credenciales Factus globales, no por organización | Alta | Documentado, sin implementar | Fase 1 |
| [F-10](F-10.md) | RLS faltante en credit_note_applications | Media | Corregido | Fase 1 |
| [F-11](F-11.md) | Funciones SECURITY DEFINER expuestas a anon | Alta | Parcial (103 triggers revocados, 223 pendientes) | Fase 1 |
| [F-11b](F-11b.md) | search_path mutable en funciones | Media | Pendiente (252 sin tocar) | Fase 1 |
| [F-12](F-12.md) | Políticas `TO public` deberían ser `TO authenticated` | Media | Corregido (49 de finanzas) | Fase 1 |
| [F-13](F-13.md) | 62 FK de finanzas sin índice | Media | Documentado | Fase 3b |
| [F-14](F-14.md) | 86 políticas re-evalúan auth.uid() por fila | Media | Documentado | Fase 3b |
| [F-15](F-15.md) | Índices duplicados | Baja (limpieza) | Documentado | Fase 3b |
| [F-16](F-16.md) | Registro de pago: 3 escrituras sueltas sin transacción | Crítica | Documentado | Fase 3a |
| [F-17](F-17.md) | Mismo patrón en transferencias, cotizaciones, notas crédito | Crítica | Documentado | Fase 3a |
| [F-18](F-18.md) | Consultas sin organization_id | Alta | Documentado | Fase 3a |
| [F-19](F-19.md) | Reportes descargan todas las journal_lines al navegador | Alta | Documentado | Fase 3b |
| [F-20](F-20.md) | Errores convertidos en ceros en reportes | Media | Documentado | Fase 3b |
| [F-21](F-21.md) | Tres convenciones de servicios; cartera vencida con dos definiciones | Media | Documentado | Fase 3b |
| [F-22](F-22.md) | NuevaFacturaForm: 1.526 líneas, 32 useState | Media (deuda) | Documentado | Fase 3c |
| [F-23](F-23.md) | Tablas sin paginación en servidor | Media (deuda) | Documentado | Fase 3c |
| [F-24](F-24.md) | Reportes sin estado de error | Media (deuda) | Documentado | Fase 3c |
| [F-25](F-25.md) | Inconsistencias de UI: estados, toasts, formatCurrency | Baja (deuda) | Documentado | Fase 3c |
| [F-26](F-26.md) | Sin react-hook-form/zod; htmlFor inexistentes; sin borrador | Baja (deuda) | Documentado | Fase 3c |
| [F-27](F-27.md) | Carga en cascada en DetalleFactura; móvil desigual | Baja (deuda) | Documentado | Fase 3c |
| [F-28](F-28.md) | Factus no persiste el número DIAN en invoice_sales.number | Alta | Documentado | Fase 2 |
| [F-29](F-29.md) | Reglas sale/created sin conditions → contado debitando Clientes | Alta | Corregido (ADR-CC-001 + contra-asientos, 2026-09-23) | Fase 0 |
| [F-30](F-30.md) | Libros contables sin auditoría | Alta | Documentado | Fase 2 |
| [F-31](F-31.md) | document_type NULL en facturas por 4 rutas activas | Alta | Documentado | Fase 2 |
| [F-32](F-32.md) | Asientos de factura no coinciden con el total (bug activo) | Crítica | Absorbido en F-16/F-17 | Fase 3a |
| [F-33](F-33.md) | Dos organizaciones comparten cuenta y resolución DIAN en Factus | Bloqueante (fact. elec.) | Documentado | Fase 2 |
| [F-34](F-34.md) | Cola de facturación electrónica sin worker | Alta | Documentado | Fase 2 |
| [F-35](F-35.md) | Exposición de datos en repo público | Media | Documentado | Fase 2 |
| [F-36](F-36.md) | Stock sin costo: inventario y ventas contablemente mudos | Bloqueante | Documentado, arreglo en 3 partes | Fase 2 |
| [F-37](F-37.md) | Ventas sin costo (unificado en F-36) | Bloqueante | Unificado en F-36 | Fase 2 |
| [F-38](F-38.md) | Carga masiva de inventario no deja rastro (sin stock_movements) | Bloqueante | Documentado | Fase 2 |
| [F-39](F-39.md) | Fuga cross-tenant en políticas sin filtro de organización | Alta | Documentado | Fase 2 |
| [F-40](F-40.md) | ImportLeadsCsv inserta columna GENERADA y no setea customer_type | Media | Documentado | Fase 2 |
| [F-41](F-41.md) | stock_levels y stock_movements son dos fuentes de verdad que ya divergieron | Alta (deuda estructural) | Documentado | Fase 3c |
| [F-42](F-42.md) | La tasa de impuesto no se persiste en la línea de factura | Bloqueante | Corregido (normalización en la base, 2026-09-23) | Fase 3a |
| [F-43](F-43.md) | tax_account_mapping es tabla muerta y apunta a cuentas inexistentes | Baja (deuda) | Documentado (marcada OBSOLETA) | Fase 3c |
| [F-44](F-44.md) | Bug de copiar-pegar en fn_recalc_invoice_totals (rama de compras) | Media | Corregido (preventivo; era inalcanzable) | Fase 3b |
| [F-45](F-45.md) | fn_create_journal_entry invierte el IVA en ventas | Crítica | Corregido (2026-09-19) · histórico neutralizado (2026-09-23) | Fase 3a |
| [F-46](F-46.md) | is_default sin poblar en 70 de 71 orgs | Media | Corregido en producto (tarifa por defecto explícita) | Fase 3a |
| [F-47](F-47.md) | fn_create_journal_entry ejecutable por anon y authenticated | Alta | Corregido (solo service_role, 2026-09-23) | Fase 1 |
| [F-48](F-48.md) | Doble asiento POS por sales e invoice_sales | Crítica | Corregido (2.310 duplicados neutralizados, 2026-09-23) | Fase 3a |
| [F-49](F-49.md) | Factura en draft con asiento posted | Alta | Corregido (allow-list + disparo al emitir) | Fase 3a |
| [F-50](F-50.md) | tax_code inconsistente entre rutas | Media | Corregido (tax_code derivado en la base) | Fase 3a |
| [F-51](F-51.md) | Divergencia de redondeo de 1 centavo entre rutas | Baja | Corregido (un solo redondeo) | Fase 3b |
| [F-52](F-52.md) | La ruta POS ignoraba contado frente a crédito | Crítica | Corregido y verificado (20260919235511) | Fase 3a |
| [F-53](F-53.md) | 19 RPC `fn_reporte_*` legibles con la sola clave anon: fuga entre inquilinos | Crítica | Corregido y verificado (2026-09-22) | Seguridad |
| [F-54](F-54.md) | Facturas sin impuesto por falta de configuración, sin aviso | Crítica | Corregido en producto; configuración por org pendiente | Cierre contable |
| [F-55](F-55.md) | Devengo de contado + cobro duplicaban el activo | Crítica | Corregido (2026-09-23) | Cierre contable |
| [F-56](F-56.md) | La nota crédito perdía su IVA en la cabecera | Alta | Corregido (2026-09-23) | Cierre contable |
| [F-57](F-57.md) | Asientos cuyo documento no existe o está roto | Media | Abierto: auditoría manual | Cierre contable |

## Notas

- **F-32** se absorbió en **F-16/F-17**: la race condition desaparece cuando la creación de factura pase a RPC transaccional.
- **F-37** se unificó en **F-36**: ambos eran el mismo bug (productos cargados sin costo).
- **F-01/F-29/F-45/F-48/F-49 (contraasientos):** aplicados el 2026-09-23 con contra-asientos exactos, sin borrar nada. El reset con `DELETE` (opción b) quedó sin efecto. Procedimiento en `docs/procedimientos/reversion-asientos-duplicados.md`; reporte en `docs/reportes/cierre-contable-2026-09-23.md`.
- **Numeración:** un prompt anterior llamó «F-53» al problema de impuestos; F-53 es la fuga de `fn_reporte_*`. El de impuestos es **F-54**.
- `PROGRESS.md` queda congelado con su contenido histórico. La auditoría activa vive aquí.
