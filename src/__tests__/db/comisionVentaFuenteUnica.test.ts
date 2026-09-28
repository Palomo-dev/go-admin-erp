// ============================================================================
// Comisión de la venta: una sola fuente de verdad (2026-09-28)
// ============================================================================
// `fn_create_commission_on_sale` insertaba `payee_id = salesperson_id::text` en
// una columna uuid (42804: el cobro del POS con vendedor fallaba entero) y
// calculaba siempre por porcentaje (monto fijo 5.000 → 5.000 %). Como disparaba
// antes del paso 6 de pos_checkout_v1, la RPC —que sí conoce el método— omitía
// la suya. La prueba de comportamiento se hizo con `DO … RAISE EXCEPTION` sobre
// pos_checkout_v1 (monto fijo → 5.000, porcentaje 10 % de 34.000 → 3.400, venta
// sin RPC → respaldo diferido al commit, factura cobrada después → sin doble).
//
// Esta red es estática sobre el `.sql`: guarda la FORMA que evita reincidir.
// ============================================================================

import { readFileSync } from 'fs';
import { join } from 'path';

const MIG = join(process.cwd(), 'supabase/migrations/20260928170000_comisiones_una_sola_fuente_por_venta.sql');
const ROLLBACK = join(process.cwd(), 'supabase/rollbacks/20260928170000_comisiones_una_sola_fuente_por_venta_rollback.sql');

const sql = readFileSync(MIG, 'utf8');
/** Solo código: sin comentarios de línea (el encabezado cita el cast roto a propósito). */
const code = sql
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');

function cuerpo(nombre: string): string {
  const ini = code.indexOf(`create or replace function public.${nombre}()`);
  expect(ini).toBeGreaterThanOrEqual(0);
  const fin = code.indexOf('$function$;', ini);
  return code.slice(ini, fin);
}

describe('comisión de la venta — una sola fuente de verdad', () => {
  it('el disparador de la venta es diferido: la RPC que conoce el método va primero', () => {
    expect(code).toMatch(/create constraint trigger trg_create_commission_on_sale\s+after insert or update of status on public\.sales\s+deferrable initially deferred/);
  });

  it.each(['fn_create_commission_on_sale', 'fn_create_commission_on_invoice_sale'])('%s: payee_id sin cast a text', (fn) => {
    const body = cuerpo(fn);
    expect(body).not.toMatch(/salesperson_id::text/);
  });

  it.each(['fn_create_commission_on_sale', 'fn_create_commission_on_invoice_sale'])('%s: respeta el monto fijo', (fn) => {
    const body = cuerpo(fn);
    expect(body).toMatch(/= 'fixed_amount' then/);
    // El porcentaje solo en la rama else, nunca incondicional.
    expect(body).toMatch(/else round\(v_base \* [\w.]+commission_rate \/ 100\.0, 2\)/);
  });

  it('la venta no devenga si ya la devengó la RPC o su factura', () => {
    const body = cuerpo('fn_create_commission_on_sale');
    expect(body).toMatch(/c\.source_type = 'sale' and c\.source_id = v_sale\.id::text/);
    expect(body).toMatch(/c\.source_type = 'invoice_sale' and c\.source_id in \(/);
    // Relee la fila: el NEW de un disparador diferido puede estar viejo.
    expect(body).toMatch(/select \* into v_sale from public\.sales where id = NEW\.id/);
  });

  it('la factura no devenga si ya existe la de su venta (cobro posterior de una deuda del POS)', () => {
    const body = cuerpo('fn_create_commission_on_invoice_sale');
    expect(body).toMatch(/c\.source_type = 'sale' and c\.source_id = NEW\.sale_id::text/);
    expect(body).not.toMatch(/'USD'/);
  });

  it('un fallo al devengar no tumba la venta ni el cobro', () => {
    for (const fn of ['fn_create_commission_on_sale', 'fn_create_commission_on_invoice_sale']) {
      expect(cuerpo(fn)).toMatch(/exception when others then\s+raise warning/);
    }
  });

  it('tiene rollback que restaura el disparador no diferido', () => {
    const rb = readFileSync(ROLLBACK, 'utf8');
    expect(rb).toMatch(/create trigger trg_create_commission_on_sale/);
  });
});
