# ADR-CC-012 · Un asiento publicado no se edita ni se borra: se revierte

**Fecha:** 2026-09-23 · **Estado:** aplicada (`20260923223116`, `20260923223400`, `20260924030912`)
**Origen:** decisión del dueño sobre la recomendación de `docs/design/FINANZAS-CONTABILIDAD-FIGMA.md` (§«Decisiones del dueño»)

## Contexto

- `journal_entries` y `journal_lines` tenían una política `ALL` para
  `authenticated` por pertenencia: cualquier miembro podía editar o borrar por
  API asientos publicados, incluidos los 5.901 contra-asientos de la reversión
  histórica y todos los automáticos.
- El asiento manual se grababa desde el navegador en dos `insert`, sin
  transacción y sin mirar el periodo. Eliminar borraba físicamente.
- No había forma de revertir desde la aplicación: `fn_revertir_asiento` era solo
  de `service_role`.

## Decisión

1. **Permiso propio «Revertir asientos»** (`accounting.reverse`), resuelto en la
   base por `fn_tiene_permiso` a partir de la sesión. Por defecto lo tienen el
   rol «Admin de organización» y el cargo `CONTADOR` (también `finance.create`,
   para crear asientos manuales); un disparador lo concede a cada cargo
   `CONTADOR` nuevo.
2. **Inmutabilidad en dos capas**:
   - la API solo lee asientos: se quitaron las políticas de escritura y los
     privilegios `INSERT/UPDATE/DELETE` de `authenticated` y todo de `anon`;
   - un disparador impide a cualquier rol, incluido el dueño de la base, editar o
     borrar un asiento publicado o sus líneas. Vía de escape explícita para
     mantenimiento: `set local app.contabilidad_mantenimiento = 'on'`.
3. **Asiento manual por RPC**, una transacción:
   `fn_asiento_manual_crear` (cuentas de detalle activas, partida doble, sucursal
   de la organización, periodo abierto, `fact_key = manual:{uuid}`,
   `source = 'manual'`), `fn_asiento_manual_publicar` y
   `fn_asiento_manual_descartar` (solo borradores nunca publicados).
4. **Reversión con motivo**: `fn_revertir_asiento_manual(id, motivo)`.
   - Solo asientos manuales publicados. Los automáticos se revierten anulando su
     documento; un contra-asiento no se revierte.
   - Motivo obligatorio (mínimo 5 caracteres), guardado en
     `journal_reversals.motivo` con `created_by`.
   - Si el periodo del original está cerrado, el contra-asiento se fecha hoy; si
     también el actual está cerrado, se rechaza.
5. **Libro diario**: los contra-asientos siempre visibles, enlazados al original
   («Revertido» / «Reversión de #N»), filtro «Ocultar pares revertidos» apagado
   por defecto.
6. **Periodos**: `fn_is_period_open` también cierra por periodo trimestral o
   anual; los periodos mensuales ya no se solapan (F-70); la pantalla deja de
   enviar `annual` y `locked`, que el CHECK rechazaba.
7. **Informes**: suman en la base (`fn_saldos_cuentas`, `SECURITY INVOKER` con
   guarda de pertenencia); el padre suma su saldo propio y el de sus hijas; el
   balance general incluye el resultado del ejercicio sin cerrar (F-71).

## Verificación

- Como usuario autenticado (admin de su organización): `UPDATE`, `DELETE` e
  `INSERT` sobre un contra-asiento de hoy, uno de la reversión histórica (F-01),
  un asiento automático y sus líneas → `permission denied` en los ocho casos;
  la lectura sigue.
- Como dueño de la base: `UPDATE` de un automático y `DELETE` de líneas de un
  contra-asiento → `ASIENTO_PUBLICADO_INMUTABLE`.
- Org 149 (17 casos): crear, descuadrado, cuenta inexistente, organización ajena,
  motivo corto, revertir automático, revertir, dos veces, revertir el
  contra-asiento, motivo guardado, periodo cerrado → contra-asiento de hoy, crear
  en periodo cerrado, descartar y publicar borrador, descartar publicado,
  empleado sin permiso (revertir y crear) → todos con el resultado esperado.
- Una factura y un pago creados por un empleado siguen generando su devengo y
  su cobro: los disparadores escriben como `definer`.

## Consecuencias

- `assistant_void_purchase_invoice` (deshacer del GO Assistant) escribe asientos
  con la sesión del usuario; pasó a `definer` con guarda de pertenencia y
  comprobación de usuario, sin `anon`. Su cuerpo no cambió.
- Borrar una organización con asientos exige la vía de mantenimiento.
- Pendiente: cierre de periodo con checklist y asiento de cierre anual (B-6/B-7),
  anulación de ventas que devuelva costo y stock (F-73).
