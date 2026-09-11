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
| [F-01](F-01.md) | Duplicación de asientos por trigger CxC + trigger factura | Crítica | Mitigado (trigger deshabilitado, backfill hecho) | Fase 0 |
| [F-03](F-03.md) | Fallback de branch en fn_create_journal_entry | Alta | Corregido | Fase 0 |
| [F-08](F-08.md) | Aislamiento por sucursal en tablas financieras | Alta | Corregido (19 tablas) | Fase 1 |
| [F-09](F-09.md) | Credenciales Factus globales, no por organización | Alta | Documentado, sin implementar | Fase 1 |
| [F-10](F-10.md) | RLS faltante en credit_note_applications | Media | Corregido | Fase 1 |
| [F-11](F-11.md) | Funciones SECURITY DEFINER expuestas a anon | Alta | Parcial (103 triggers revocados, 223 pendientes) | Fase 1 |
| [F-11b](F-11b.md) | search_path mutable en funciones | Media | Pendiente (252 sin tocar) | Fase 1 |
| [F-12](F-12.md) | Políticas `TO public` deberían ser `TO authenticated` | Media | Corregido (49 de finanzas) | Fase 1 |
| [F-28](F-28.md) | Factus no persiste el número DIAN en invoice_sales.number | Alta | Documentado | Fase 2 |
| [F-29](F-29.md) | Reglas sale/created sin conditions → contado debitando Clientes | Alta | Corregido (reglas), pendiente contraasientos | Fase 0 |
| [F-30](F-30.md) | Libros contables sin auditoría | Alta | Documentado | Fase 2 |
| [F-31](F-31.md) | document_type NULL en 903 facturas por ruta activa | Alta | Documentado | Fase 2 |
| [F-32](F-32.md) | Asientos de factura no coinciden con el total (bug activo) | Crítica | Mitigado (script de detección), pendiente arreglo de fondo | Fase 3 |
| [F-33](F-33.md) | Dos organizaciones comparten cuenta y resolución DIAN en Factus | Bloqueante | Documentado | Fase 2 |
| [F-34](F-34.md) | Cola de facturación electrónica sin worker | Alta | Documentado | Fase 2 |
| [F-35](F-35.md) | Exposición de datos en repo público | Media | Documentado | Fase 2 |
| [F-36](F-36.md) | Stock sin costo: inventario y ventas contablemente mudos | Bloqueante | Documentado, arreglo en 3 partes | Fase 2 |

## Notas

- **F-37** se unificó en **F-36**: ambos eran el mismo bug (productos cargados sin costo). Ver nota al final de `F-36.md`.
- Hallazgos sin archivo propio (F-02, F-04 a F-07, F-13 a F-27) no se registraron en esta auditoría o se descartaron.
- `PROGRESS.md` queda congelado con su contenido histórico. La auditoría activa vive aquí.
