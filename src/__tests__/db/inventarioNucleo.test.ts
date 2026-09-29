/**
 * Contrato del núcleo de existencias (INVENTARIO-PLAN.md §5.1, bloque B0).
 *
 * Las migraciones se aplicaron por el MCP y se probaron en la base con
 * begin … rollback: ponderado 10×500 + 10×1.000 = 750 y avg_cost_after 750;
 * FEFO (vence antes primero, vencidos no); ajuste de salida sin stock → 23514;
 * venta sin stock permitida salvo `bloquear_venta_sin_stock`; seriales; lote y
 * sucursal ajenos rechazados; el mismo escenario de venta, NC, devolución, stock
 * masivo y compra dio el mismo saldo y costo que antes salvo la entrada de
 * ajuste (último costo → ponderado); un solo asiento por ajuste; reservas
 * idempotentes y liberadas exactas. Aquí se fija lo que no puede volver atrás.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const DIR = 'supabase/migrations';
const RB = 'supabase/rollbacks';
const M = {
  esquema: '20260929020000_inv_b0_1_esquema',
  permisos: '20260929020100_inv_b0_2_permisos',
  primitiva: '20260929020200_inv_b0_3_primitiva',
  escritores: '20260929020300_inv_b0_4_escritores_por_la_primitiva',
  reservas: '20260929020400_inv_b0_5_reservas',
  documentos: '20260929020500_inv_b0_6_documento_de_movimiento',
  asiento: '20260929020600_inv_b0_7_asiento_unico_ajuste',
  escala: '20260929020700_inv_b0_8_primitiva_escala',
} as const;

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const sql = (m: keyof typeof M) => leer(`${DIR}/${M[m]}.sql`);
/** Sin comentarios SQL, para no aprobar por lo que dice un comentario. */
const codigo = (m: keyof typeof M) => sql(m).replace(/--.*$/gm, '');

function cuerpo(texto: string, nombre: string): string {
  const ini = texto.indexOf(`function public.${nombre}(`);
  expect(ini).toBeGreaterThan(-1);
  const fin = texto.indexOf('create or replace function', ini + 10);
  return texto.slice(ini, fin === -1 ? undefined : fin);
}

describe('cada migración con su rollback', () => {
  test.each(Object.values(M))('%s', (base) => {
    expect(existsSync(join(process.cwd(), DIR, `${base}.sql`))).toBe(true);
    expect(existsSync(join(process.cwd(), RB, `${base}_rollback.sql`))).toBe(true);
  });
});

describe('la primitiva fn_inv_int_mover', () => {
  // La versión vigente es la de la migración 8 (escala); la 3 queda como historia.
  const mover = cuerpo(codigo('escala'), 'fn_inv_int_mover');
  const fila = cuerpo(codigo('escala'), 'fn_inv_int_mover_fila');

  test('valida sucursal, producto y lote de la organización', () => {
    expect(mover).toContain("raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501'");
    expect(mover).toContain("raise exception 'PRODUCTO_NO_ES_DE_LA_ORG' using errcode = '42501'");
    expect(mover).toMatch(/l\.product_id = p_product and l\.organization_id = p_org[\s\S]*lote_invalido/);
  });
  test('cantidad redondeada a la escala de la tabla antes de mover', () => {
    expect(mover).toContain('v_qty := round(p_qty, 3);');
    expect(fila).toContain('returning qty_on_hand, avg_cost into v_despues, v_prom;');
  });
  test('bloquea la fila y la crea sin onConflict por columnas', () => {
    expect(fila).toMatch(/lot_id is not distinct from p_lot\s+order by sl\.id limit 1\s+for update/);
    expect(fila).toContain('on conflict do nothing');
  });
  test('una sola regla de costo promedio', () => {
    expect(fila).toContain('public.fn_inv_int_costo_promedio(v_sl.qty_on_hand, v_sl.avg_cost, p_qty, v_costo)');
    const regla = cuerpo(codigo('primitiva'), 'fn_inv_int_costo_promedio');
    expect(regla).toContain('when coalesce(p_qty_antes, 0) <= 0 then coalesce(p_costo, 0)');
    expect(regla).toContain('(p_qty_antes * coalesce(p_prom_antes, 0) + p_qty * coalesce(p_costo, 0)) / (p_qty_antes + p_qty)');
  });
  test('negativos (P5): ventas según la organización; ajuste, traslado y pérdida bloquean', () => {
    expect(fila).toContain("not coalesce((public.fn_inventario_int_config(p_org)->>'bloquear_venta_sin_stock')::boolean, false)");
    expect(fila).toMatch(/when p_source in \('adjustment', 'transfer', 'transfer_out', 'loss'\)\s+then false/);
    expect(fila).toContain("raise exception 'stock_insuficiente' using errcode = '23514'");
  });
  test('FEFO: vence antes primero y los vencidos no, en la zona de la organización', () => {
    expect(mover).toContain('order by l.expiry_date asc nulls last, l.id');
    expect(mover).toContain('public.fn_timezone_for(p_org, p_branch)');
    expect(mover).toContain("coalesce((v_op->>'incluir_vencidos')::boolean, false)");
  });
  test('kardex con autor y costo tras el movimiento', () => {
    expect(fila).toContain('created_by, avg_cost_after');
    expect(fila).toContain('coalesce(auth.uid(), p_user), v_prom');
  });
  test('nadie fuera del servidor la ejecuta', () => {
    for (const m of ['primitiva', 'escala'] as const) {
      expect(codigo(m)).toMatch(/revoke all on function public\.fn_inv_int_mover\([^)]*\) from anon, public, authenticated/);
    }
  });
});

describe('los escritores SQL pasan por la primitiva con la misma firma', () => {
  const s = codigo('escritores');
  test.each([
    'decrement_stock_on_sale',
    'fn_stock_entrada',
    'fn_stock_entrada_devolucion',
    'fn_register_stock_entry',
    'fn_producto_int_ajustar_stock',
  ])('%s llama a fn_inv_int_mover y no escribe las tablas', (fn) => {
    const c = cuerpo(s, fn);
    expect(c).toContain('public.fn_inv_int_mover(');
    expect(c).not.toMatch(/(insert\s+into|update)\s+(public\.)?stock_(levels|movements)/i);
  });
  test('los parches de la definición viva comprueban md5 y un solo marcador', () => {
    expect(s).toContain("'fn_kardex_entrada_compra_int(integer,integer,text,text,jsonb,uuid,integer,boolean)', '699a85d347c44b8bf2ace653865d2e52'");
    expect(s).toContain("'fn_void_purchase_invoice(uuid,text,uuid)', '591e3b5cb61f430a4faf4fd39cf991de'");
    expect(s).toContain('El marcador de inicio no aparece exactamente una vez');
    expect(s).toContain('insert into private.respaldo_funciones');
  });
  test('fn_register_stock_entry: ponderado y permiso en servidor', () => {
    const c = cuerpo(s, 'fn_register_stock_entry');
    expect(c).toContain("jsonb_build_object('recalcular_costo', true, 'fefo', false)");
    expect(c).toContain("fn_inventario_exigir_permiso(v_organization_id, array['crear', 'editar_catalogo', 'ajustar'])");
  });
  test('internas sin EXECUTE para authenticated', () => {
    for (const f of ['fn_stock_entrada(', 'fn_stock_entrada_devolucion(', 'fn_producto_int_ajustar_stock(', 'fn_kardex_entrada_compra_int(']) {
      expect(s).toMatch(new RegExp(`revoke all on function public\\.${f.replace('(', '\\(')}[^)]*\\) from anon, public, authenticated`));
    }
  });
});

describe('permisos sin nombres de rol', () => {
  const s = codigo('permisos');
  test('fn_inventario_permisos resuelve con check_user_permission y el dueño', () => {
    const c = cuerpo(s, 'fn_inventario_permisos');
    expect(c).toContain('perform public.fn_assert_acceso_org(p_org)');
    expect(c).toContain("'ajustar', v_gestion or v_adjust");
    expect(c).toContain("'recibir', v_gestion or v_create");
    expect(c).not.toMatch(/role\s*(=|in)\s*\(?'/i);
  });
  test('exigir: 42501 sin_permiso', () => {
    expect(cuerpo(s, 'fn_inventario_exigir_permiso')).toContain("raise exception 'sin_permiso' using errcode = '42501'");
  });
  test('revoke a anon y public en la misma migración', () => {
    for (const f of ['fn_inventario_permisos', 'fn_inventario_exigir_permiso', 'fn_inventario_config', 'fn_inventario_config_guardar']) {
      expect(s).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from anon, public`));
    }
  });
});

describe('reservas registradas por documento', () => {
  const s = codigo('reservas');
  test('RLS de solo lectura en stock_reservations', () => {
    expect(s).toContain('alter table public.stock_reservations enable row level security');
    expect(s).toMatch(/create policy stock_reservations_select on public\.stock_reservations\s+for select to authenticated/);
    expect(s).toContain('revoke insert, update, delete, truncate on table public.stock_reservations from authenticated');
  });
  test('la receta se expande con el resolutor único y se libera lo reservado', () => {
    expect(cuerpo(s, 'fn_inv_int_expandir_items')).toContain('public.fn_receta_int_expandir(');
    expect(cuerpo(s, 'fn_inv_int_liberar')).toContain('from public.stock_reservations r');
  });
  test('release_stock_for_order exige pertenencia', () => {
    expect(cuerpo(s, 'release_stock_for_order')).toContain('perform public.fn_assert_acceso_org(v_order.organization_id)');
  });
  test('la reversión del folio entra al costo de salida', () => {
    const c = cuerpo(s, 'fn_inv_reversion_entrada');
    expect(c).toContain("sm.source in ('folio_item', 'room_consumption')");
    expect(c).toContain("if p_source is distinct from 'folio_item_reversal'");
  });
});

describe('documentos y asiento', () => {
  test('fn_inv_documentos exige ver y limita a 500', () => {
    const c = cuerpo(codigo('documentos'), 'fn_inv_documentos');
    expect(c).toContain("fn_inventario_exigir_permiso(p_org, array['ver'])");
    expect(c).toContain('jsonb_array_length(p_refs) > 500');
  });
  test('P4: el movimiento de un ajuste de ganancia o pérdida no asienta', () => {
    const s = sql('asiento');
    expect(s).toContain("AND ia.type IN (''gain'', ''loss'')");
    expect(s).toContain("md5(v_def) <> '69a391b031b1b5d2fac0a13e1bd757b7'");
  });
});

describe('esquema aditivo', () => {
  const s = codigo('esquema');
  test('columnas NULL-ables o con default, sin DROP', () => {
    expect(s).toContain('add column if not exists created_by uuid default auth.uid()');
    expect(s).toContain('add column if not exists avg_cost_after numeric');
    expect(s).toContain('add column if not exists track_lots boolean not null default false');
    expect(s).toContain('create unique index if not exists lots_org_product_code_key');
    expect(s).not.toMatch(/\bdrop\s+(column|table)\b/i);
  });
});
