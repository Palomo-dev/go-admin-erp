/**
 * La 1305 siempre con tercero (Contador, 2026-11-25).
 *
 * El recibo acredita la 1305 con el tercero con el que la factura que cancela
 * está en el libro; ninguna línea de la 1305 se guarda sin tercero; y lo
 * anterior se corrige con ajustes (fact_key recaudo_1305_tercero:<línea>) sin
 * tocar los asientos originales. El rollback borra exactamente esos ajustes.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '..', '..', '..');
const BASE = '20261126000000_recaudo_1305_tercero';

const leer = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

describe('recaudo 1305 con tercero', () => {
  const sql = leer(`supabase/migrations/${BASE}.sql`);
  const rollback = leer(`supabase/rollbacks/${BASE}_rollback.sql`);
  const disparador = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_trg_tercero_linea_asiento'),
    sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_trg_1305_exige_tercero'),
  );

  test('el recibo, su anulación y el reintegro de una devolución reciben tercero en la 1305', () => {
    expect(disparador).toContain("v_source in ('payments', 'reversal', 'returns'");
    expect(disparador).toContain('fn_tercero_cartera_de_asiento(v_source, v_source_id, v_org, new.account_code)');
    // Va antes de la rama del anticipo y de la lista de documentos, que no conocían 'payments'.
    expect(disparador.indexOf("v_source in ('payments', 'reversal'")).toBeLessThan(
      disparador.indexOf("v_source = 'web_order_advance'"),
    );
  });

  test('el tercero del recibo es el que ya lleva el devengo de la factura, y si no, la regla del devengo', () => {
    const factura = sql.slice(
      sql.indexOf('FUNCTION public.fn_tercero_cartera_factura'),
      sql.indexOf('FUNCTION public.fn_tercero_cartera_cxc'),
    );
    const libro = factura.indexOf("'accrual:sale:' || v_sale::text");
    const regla = factura.indexOf("fn_tercero_de_documento('venta', p_invoice)");
    expect(libro).toBeGreaterThan(0);
    expect(regla).toBeGreaterThan(libro);
    expect(sql).toContain("fn_tercero_cartera_factura(v_doc::uuid)");
  });

  test('la restricción rechaza la 1305 sin tercero y corre después de quien lo pone', () => {
    expect(sql).toContain("raise exception 'TERCERO_REQUERIDO_1305");
    expect(sql).toContain("new.account_code not like '1305%'");
    expect(sql).toContain('CREATE TRIGGER zzz_trg_1305_exige_tercero');
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF account_code, tercero_nit ON public.journal_lines');
    // Los BEFORE corren en orden alfabético: después de trg_tercero_linea_asiento y de zz_trg_puc_linea_solo_movimiento.
    expect('zzz_trg_1305_exige_tercero' > 'zz_trg_puc_linea_solo_movimiento').toBe(true);
    expect('zzz_trg_1305_exige_tercero' > 'trg_tercero_linea_asiento').toBe(true);
    // La restricción se crea después de los ajustes.
    expect(sql.indexOf('CREATE TRIGGER zzz_trg_1305_exige_tercero')).toBeGreaterThan(sql.indexOf('DO $ajustes$'));
  });

  test('los ajustes no editan originales, son idempotentes y llevan la nota del Contador', () => {
    const ajustes = sql.slice(sql.indexOf('DO $ajustes$'), sql.indexOf('$ajustes$;'));
    expect(ajustes).toContain("'recaudo_1305_tercero:' || v_l.lid::text");
    expect(ajustes).toContain("a.fact_key = 'recaudo_1305_tercero:' || l.id::text");
    expect(ajustes).toContain("'Asignación de tercero a recaudo 1305 · '");
    expect(ajustes).toContain("e.entry_date >= '2026-01-01' and e.entry_date < '2027-01-01'");
    expect(ajustes).toContain("fn_tomar_consecutivo_comprobante(v_l.org, 'nota_contable', 'NA')");
    expect(ajustes).not.toMatch(/update\s+public\.journal_(entries|lines)/i);
    expect(ajustes).not.toMatch(/delete\s+from/i);
    // Sin cliente identificable no se fuerza.
    expect(ajustes).toContain('continue;');
  });

  test('el rollback borra exactamente los ajustes y devuelve el disparador anterior', () => {
    expect(rollback).toContain("e.fact_key like 'recaudo_1305_tercero:%'");
    expect(rollback).toContain("set_config('app.contabilidad_mantenimiento', 'on', true)");
    expect(rollback).toContain('DROP TRIGGER IF EXISTS zzz_trg_1305_exige_tercero');
    expect(rollback).toContain("fn_tercero_de_documento('venta', v_factura)");
    expect(rollback).not.toContain('fn_tercero_cartera_de_asiento(v_source');
  });

  test('las funciones nuevas nacen cerradas a anon y a authenticated', () => {
    for (const f of [
      'fn_tercero_cliente(integer, uuid)',
      'fn_tercero_cartera_venta(integer, uuid)',
      'fn_tercero_cartera_factura(uuid)',
      'fn_tercero_cartera_cxc(uuid)',
      'fn_tercero_reserva(uuid)',
      'fn_tercero_de_pago(uuid)',
      'fn_tercero_cartera_de_asiento(text, text, integer, text, integer)',
      'fn_trg_1305_exige_tercero()',
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`);
    }
  });
});
