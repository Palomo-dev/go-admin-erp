# Correcciones de Finanzas tras la auditoría del Contador: matriz

Base: `main` y proyecto `taqjemqjtumhwptchcxk`. Por orden del dueño el trabajo se hizo en `main`, sin rama ni PR,
y las migraciones se aplicaron en producción. `master` no se tocó.

Ninguna migración cambió asientos publicados ni saldos. Cada una se probó antes en una base local aislada.
Las pantallas tienen pruebas automáticas, pero **no se recorrieron en el navegador con sesión real**.

Estados: **Producción** = migración aplicada. **Código** = en `main` local, sin subir.

| # | Hallazgo | Evidencia revalidada | Corrección | Migración | Prueba | Estado |
|---|---|---|---|---|---|---|
| 1 | Reglas con cuentas inválidas | 377 de 1.632 reglas inexistentes en 29 empresas, y 72 de título en 30. Causa: la semilla corre antes que el plan | Disparador que valida la columna que cambia. Inventario con 420 propuestas y 29 pendientes. Sin cambios a reglas existentes | `20261107100000` | 79 casos en ensayo, 105 Jest | Producción y código |
| 2 | Categorías de impuestos | 33 sin cuenta y 0 `imp_*` | Padre no imputable. 8 subcategorías: 141 con cuenta y 123 exigidas al usar. Sin cuentas nuevas | `20261107101000` | Mismo ensayo | Producción y código |
| 3 | Conciliación | `difference` generada: ninguna conciliación se podía crear. Signo contrario entre base y pantalla | Sin escritura de la columna. Signo único. Cierre por RPC con motivo y usuario. Partidas pendientes sin ajuste a resultados | `20261107110000` | 126 casos en ensayo | Producción y código |
| 4 | Redondeos | La línea de mayor valor cambiaba sin rastro | Línea explícita con cuenta autorizada y traza. Sin cuenta: pendiente visible | `20261107120000` | 70 casos en ensayo | Producción y código |
| 5 | Reversas | Se perdía el tercero | Una sola implementación atómica e idempotente. Cuenta de título: reversa pendiente | `20261107121000` | Mismo ensayo, con concurrencia | Producción y código |
| 6 | Bandeja de pendientes | Sin pantalla, y el reintento duplicaba filas | Página, navegación y reintento por pendiente. Error distinto de vacío | `20261107111000`, `20261107112000` | 126 casos en ensayo, 193 Jest | Producción y código |
| 7 | Edades | Bandas no sumaban el total (faltaban 600.000 en el ensayo) | Mora y saldo al corte, bandas que suman, cruce con el mayor, anticipos aparte | `20261107130000` | 92 casos en ensayo | Producción y código |
| 8 | Estados | No estaban en `main`. PR #460 y #463 con conflicto, sin cerrar ni unir | Flujo indirecto, patrimonio, resultado por naturaleza, notas, certificación, libros, indicadores y presupuesto. Motor propio por asiento | `20261107140000` a `20261107143000` | 225 casos en ensayo, 826 Jest | Producción y código |
| 9 | Nómina y depreciación | Ceros con TODO, y 5195 es título en las 33 empresas | «Sin calcular» bloquea el cierre. Costo patronal a 5105. Línea recta idempotente; otros métodos cerrados | `20261107131000` a `20261107133000` | 92 casos en ensayo | Producción y código |

También en `main`: plan de cuentas con auxiliares en la fila (`20261106170000`, `20261106171500`) y cuentas automáticas
(`20261107150000` a `20261107152000`).

## Decisiones del Contador

### Urgentes

1. **Primera compra en 29 de 33 empresas.** En ensayo, el motor creó `14350101` y `1435010101`, cambió el mapeo de la sede
   y asentó en una cuenta de título. Hoy hay 0 compras, así que no ha ocurrido. Hay que definir el auxiliar antes de la primera compra.
2. **Aprobar las 420 propuestas de reglas**, regla por regla. Está relacionado con el punto 1.
3. **Categoría de flujo de cada cuenta.** Sin esto, el flujo de efectivo sale incompleto y lo dice en pantalla.

### Criterio contable

4. `4155` en `folio_item` (29 reglas): la configuración dice `4235` y el plan solo tiene `41559501`.
5. Empresas 333, 335, 338 y 339: asientos en `14350101` y configuración en `14350501`.
6. Saldo en libros de la conciliación: hoy es saldo inicial más conciliados, no el saldo del mayor.
7. Cierre de conciliación: ¿`finance.create` o `finance.approve`? ¿Exigir cerrar primero la anterior?
8. Reversas: confirmar que el auxiliar debe descender de la cuenta de título, y que el asiento original sigue en el mayor mientras tanto.
9. Redondeo: un total de 1.000,60 se contabiliza 1.001 sin línea, porque no hay residuo. ¿Debe dejar rastro?
10. Regla de retención en la fuente de nómina, abono del devengo (hoy todo a `25050501`) y destino del pago de aportes.
11. Confirmar 5105 para el costo patronal, y la primera cuota de depreciación (hoy el mes siguiente a la adquisición).
12. Políticas de intereses, impuestos y dividendos en el flujo, texto legal de la certificación y 4245/5310 como inversión.
13. Servicios: un producto de tipo servicio no usa `ventas_servicios`. Una línea manual de gasto sin cuenta cae en inventario.
14. El POS ignora la cuenta de producto y categoría. ¿Debe respetarla?

## Pendiente

- Periodos de nómina: **corregido el 2026-11-06.** Crear periodo usa `open`, las corridas usan `running` y el detalle ejecuta el cálculo real en lugar de simularlo. Sin recorrer con sesión real.
- `fn_reporte_estado_resultados`, `fn_saldos_cuentas` y `getIncomeStatement` no excluyen el asiento de cierre. Hoy no pesa:
  hay 0 cierres. Hay que corregirlo antes del primer cierre de año.
- Nada llama `fn_reintentar_fallos_asiento` y no existe cron: los rechazos se reintentan a mano desde la bandeja.
- `fn_redondeo_pendiente_registrar` inserta sin `on conflict`: un choque concurrente daría error en esa operación.
- `fn_void_purchase_invoice` y `assistant_void_purchase_invoice` siguen como reversas aparte.
- `fn_puc_migracion_revertir` falla sin mensaje claro si una reversa queda pendiente.
- Escritura directa a `accounting_rules`: sigue abierta por RLS para cualquier miembro, aunque el disparador valida las cuentas.
- Pasarelas, propinas y anticipos a proveedores: quedaron fuera del alcance de esta corrección.
- Sin construir: consignación, centro tributario, perfil tributario, borradores DIAN, tesorería consolidada corregida y dinero de terceros. Están en Figma.

## Verificación final sobre `main` completo

| Revisión | Resultado |
|---|---|
| TypeScript completo (14 GB) | 34 errores, 0 en los 140 archivos de `src` cambiados. 33 son de `.next-desktop` (generado y viejo) y 1 de `useConfiguracionState.ts` (octubre, sin tocar) |
| `next build` | Compila y genera 369 de 369 páginas, con `NEXT_SKIP_TYPECHECK=1`. Sin esa variable se detiene en esos errores previos |
| Pruebas automáticas | Por frente, en sus áreas: la última corrida dio 1.842 aprobadas y 2 fallos preexistentes. No se corrió la suite completa de una vez |
| Ensayos SQL aislados | 225, 138, 126, 92, 79 y 70 casos, todos aprobados |
| Navegador con sesión real | **No se hizo.** `.env.local` apunta al proyecto borrado |

La base de producción quedó adelante de la aplicación publicada: `master` sigue en `77fd6a604`.
