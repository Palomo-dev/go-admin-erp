/**
 * Contrato de las migraciones del bloque B1 del inventario (Stock, Movimientos,
 * Kardex y Lotes; docs/implementacion/INVENTARIO-PLAN.md §5.2).
 *
 * Se aplicaron por el MCP y se probaron en la base con DO … RAISE (sin dejar
 * datos): entrada de 5 uds a 1.000 sobre 24 a 0 → ajuste AJ-… aplicado, un solo
 * asiento del documento, kardex con origen `adjustment`, saldo corrido y costo
 * promedio 172,41; salida mayor que la existencia → 23514 stock_insuficiente;
 * lote nuevo con 12 uds → aparece en Lotes, en Stock y en el LotPicker; ajustar
 * el lote a 10 → salida de 2; código repetido → 23505; eliminar un lote con
 * existencias → 23514. Un cajero (solo inventory.view) lista pero registrar y el
 * mínimo dan 42501; otra organización y anon → 42501. `fn_kardex_descuadres`
 * sumado en todas las organizaciones = 4.899 pares (D2).
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const MIGRACIONES = [
  '20260929100000_inv_b1_1_stock_listado',
  '20260929100100_inv_b1_2_movimientos_kardex',
  '20260929100200_inv_b1_3_registrar_movimiento',
  '20260929100300_inv_b1_4_lotes',
  '20260929100400_inv_b1_5_registrar_por_el_ajuste',
] as const;
type Migracion = (typeof MIGRACIONES)[number];
const sql = Object.fromEntries(MIGRACIONES.map((m) => [m, leer(`supabase/migrations/${m}.sql`)])) as Record<Migracion, string>;
const sinComentarios = (s: string) => s.replace(/--.*$/gm, '');

function funciones(texto: string): { nombre: string; cuerpo: string }[] {
  const limpio = sinComentarios(texto);
  const re = /create or replace function public\.(\w+)\(/g;
  const inicios = [...limpio.matchAll(re)].map((m) => ({ nombre: m[1], i: m.index ?? 0 }));
  return inicios.map((f, k) => ({ nombre: f.nombre, cuerpo: limpio.slice(f.i, inicios[k + 1]?.i ?? undefined) }));
}

const todas = MIGRACIONES.flatMap((m) => funciones(sql[m]).map((f) => ({ m, ...f })));
const ultima = (nombre: string) => [...todas].reverse().find((f) => f.nombre === nombre);

describe('B1: toda migración tiene su rollback', () => {
  it.each(MIGRACIONES)('%s', (m) => {
    expect(existsSync(join(RAIZ, 'supabase/rollbacks', `${m}_rollback.sql`))).toBe(true);
  });
});

describe('B1: funciones con elevación', () => {
  it('todas son SECURITY DEFINER con search_path fijo', () => {
    const malas = todas.filter((f) => !/security definer/i.test(f.cuerpo) || !/set search_path = public, pg_temp/i.test(f.cuerpo));
    expect(malas.map((f) => f.nombre)).toEqual([]);
  });

  const publicas = todas.filter((f) => !/_int_/.test(f.nombre));

  it.each(publicas.map((f) => [`${f.m} · ${f.nombre}`, f] as const))('%s: exige permiso de inventario antes de leer o escribir', (_n, f) => {
    expect(f.cuerpo).toMatch(/perform public\.fn_inventario_exigir_permiso\((p_org|v_org), array\[/);
  });

  it.each(publicas.map((f) => [`${f.m} · ${f.nombre}`, f] as const))('%s: revoke … from anon, public en la misma migración', (_n, f) => {
    expect(sql[f.m]).toMatch(new RegExp(`revoke all on function public\\.${f.nombre}\\([^)]*\\) from anon, public`));
  });

  const internas = todas.filter((f) => /_int_/.test(f.nombre));
  it.each(internas.map((f) => [f.nombre, f] as const))('%s (interna): sin EXECUTE para authenticated', (_n, f) => {
    expect(sql[f.m]).toMatch(new RegExp(`revoke all on function public\\.${f.nombre}\\([^)]*\\) from anon, public, authenticated`));
  });

  it('las lecturas exigen `ver` y las escrituras su permiso', () => {
    for (const n of ['fn_stock_listado', 'fn_movimientos_listado', 'fn_kardex_saldo_corrido', 'fn_kardex_descuadres', 'fn_lotes_listado', 'fn_lotes_de_producto']) {
      expect(ultima(n)?.cuerpo).toMatch(/fn_inventario_exigir_permiso\(p_org, array\['ver'\]\)/);
    }
    expect(ultima('fn_stock_registrar_movimiento')?.cuerpo).toMatch(/array\['ajustar'\]/);
    expect(ultima('fn_lote_ajustar')?.cuerpo).toMatch(/array\['ajustar'\]/);
    expect(ultima('fn_lote_eliminar')?.cuerpo).toMatch(/array\['eliminar'\]/);
    expect(ultima('fn_lote_guardar')?.cuerpo).toMatch(/array\['crear', 'editar_catalogo'\]/);
    expect(ultima('update_product_min_stock')?.cuerpo).toMatch(/array\['ajustar', 'editar_catalogo'\]/);
  });
});

describe('B1: el stock solo se mueve por la primitiva o por el documento de ajuste', () => {
  it('ninguna función de B1 escribe stock_movements', () => {
    const escriben = todas.filter((f) => /insert into public\.stock_movements|update public\.stock_movements|delete from public\.stock_movements/i.test(f.cuerpo));
    expect(escriben.map((f) => f.nombre)).toEqual([]);
  });

  it('ninguna función de B1 cambia cantidades de stock_levels (solo el mínimo o filas en 0)', () => {
    const cambian = todas.filter((f) => /update public\.stock_levels[\s\S]{0,120}qty_on_hand/i.test(f.cuerpo));
    expect(cambian.map((f) => f.nombre)).toEqual([]);
  });

  it('registrar entrada/salida es fachada de fn_ajuste_guardar + fn_ajuste_aplicar (regla dura 7)', () => {
    const f = ultima('fn_stock_registrar_movimiento')!;
    expect(f.m).toBe('20260929100400_inv_b1_5_registrar_por_el_ajuste');
    expect(f.cuerpo).toMatch(/public\.fn_ajuste_guardar\(p_org/);
    expect(f.cuerpo).toMatch(/public\.fn_ajuste_aplicar\(p_org/);
    expect(f.cuerpo).not.toMatch(/insert into public\.inventory_adjustments/);
  });

  it('lotes: la cantidad entra o sale por fn_stock_registrar_movimiento', () => {
    expect(ultima('fn_lote_guardar')?.cuerpo).toMatch(/public\.fn_stock_registrar_movimiento\(/);
    expect(ultima('fn_lote_ajustar')?.cuerpo).toMatch(/public\.fn_stock_registrar_movimiento\(/);
  });

  it('eliminar un lote exige que no tenga existencias ni historia', () => {
    const f = ultima('fn_lote_eliminar')!.cuerpo;
    expect(f).toMatch(/lote_con_existencias/);
    expect(f).toMatch(/lote_con_movimientos/);
    expect(f).toMatch(/from public\.stock_movements sm where sm\.lot_id = p_lot/);
  });
});

describe('B1: cálculos en el servidor', () => {
  it('disponible = existencia − reservado y P1 (el padre no suma su fila propia)', () => {
    const f = ultima('fn_stock_listado')!.cuerpo;
    expect(f).toMatch(/x\.existencia - x\.reservado as disponible/);
    expect(f).toMatch(/filter \(where m\.aparte\), 0\) as sin_asignar/);
  });

  it('el saldo corrido cubre toda la historia del alcance, no solo el período', () => {
    const f = ultima('fn_kardex_saldo_corrido')!.cuerpo;
    expect(f).toMatch(/over \(partition by sm\.product_id order by sm\.created_at, sm\.id\) as saldo/);
    // El período se aplica DESPUÉS de la ventana.
    expect(f.indexOf('as saldo')).toBeLessThan(f.indexOf('q.desde_ts is null or base.created_at'));
  });

  it('las fechas del filtro son días de la organización', () => {
    const f = ultima('fn_inv_int_filtro_movimientos')!.cuerpo;
    expect(f).toMatch(/fn_timezone_for\(p_org, null\)/);
    expect(f).toMatch(/\(hasta_dia \+ 1\)::timestamp at time zone v_tz/);
  });

  it('los costos solo salen con el permiso `costos`', () => {
    for (const n of ['fn_stock_listado', 'fn_movimientos_listado', 'fn_kardex_saldo_corrido', 'fn_lotes_listado']) {
      expect(ultima(n)?.cuerpo).toMatch(/->>'costos'\)::boolean/);
    }
  });
});
