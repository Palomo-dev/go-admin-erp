/**
 * Contrato de las migraciones del bloque B4 del inventario (seriales,
 * garantías y trazabilidad; docs/implementacion/INVENTARIO-PLAN.md §5.5).
 *
 * Se aplicaron por el MCP y se probaron en la base con DO … RAISE dentro de
 * `begin … rollback` (sin dejar datos): ciclo completo de un reclamo
 * (crear → segundo reclamo rechazado por reclamo_abierto → aprobar → RMA →
 * resolver con reemplazo: la unidad nueva vendida con garantía desde hoy y la
 * reclamada en RMA); disparador de garantía (venta el 20 a las 03:00 UTC →
 * garantía desde el 19 en Bogotá; vuelta a bodega → sin fechas). Aquí se fija
 * lo que no puede volver atrás.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const MIGRACIONES = [
  '20260929040000_inv_b4_seriales_unicos_por_organizacion',
  '20260929040100_inv_b4_garantias_reinicio_en_bodega',
  '20260929040200_inv_b4_garantia_desde_la_venta',
  '20260929040300_inv_b4_garantias_esquema',
  '20260929040400_inv_b4_seriales_listado_detalle',
  '20260929040500_inv_b4_garantias_funciones',
  '20260929040600_inv_b4_trazabilidad',
  '20260929040700_inv_b4_permisos_y_documentos_del_nucleo',
  '20260929040710_inv_b4_documento_compra_legado',
  '20260929040720_inv_b4_trigger_reclamos_search_path',
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

describe('B4: toda migración tiene su rollback', () => {
  it.each(MIGRACIONES)('%s', (m) => {
    expect(existsSync(join(RAIZ, 'supabase/rollbacks', `${m}_rollback.sql`))).toBe(true);
  });
});

describe('B4: funciones con elevación', () => {
  it('todas fijan search_path', () => {
    const sinRuta = todas.filter((f) => /security definer/i.test(f.cuerpo) && !/set search_path to 'public', 'pg_temp'/i.test(f.cuerpo));
    expect(sinRuta.map((f) => f.nombre)).toEqual([]);
  });

  const publicas = todas.filter((f) => /security definer/i.test(f.cuerpo) && !/returns trigger/i.test(f.cuerpo) && !/_int_/.test(f.nombre));

  it('hay funciones públicas que revisar', () => {
    expect(new Set(publicas.map((f) => f.nombre)).size).toBe(12);
  });

  it.each(publicas.map((f) => [f.nombre, f] as const))('%s: comprueba organización y permiso antes de leer o escribir', (_n, f) => {
    expect(f.cuerpo).toMatch(/perform public\.(fn_seriales_int_exigir|fn_assert_acceso_org|fn_productos_exigir_permiso)\(p_org/);
  });

  it.each(publicas.map((f) => [f.nombre, f] as const))('%s: revoke … from public, anon en la misma migración', (_n, f) => {
    expect(sql[f.m]).toMatch(new RegExp(`revoke all on function public\\.${f.nombre}\\([^)]*\\) from public, anon`));
  });

  const internas = todas.filter((f) => /_int_/.test(f.nombre));
  it.each(internas.map((f) => [f.nombre, f] as const))('%s (interna): sin EXECUTE para authenticated', (_n, f) => {
    expect(sql[f.m]).toMatch(new RegExp(`revoke all on function public\\.${f.nombre}(\\([^)]*\\))? from public, anon, authenticated`));
  });

  it('las escrituras de garantías exigen el permiso de gestionar', () => {
    for (const nombre of ['fn_garantia_crear', 'fn_garantia_cambiar_estado', 'fn_garantia_enviar_rma', 'fn_garantia_resolver']) {
      const f = todas.find((x) => x.nombre === nombre);
      expect(f?.cuerpo).toMatch(/fn_seriales_int_exigir\(p_org, true\)/);
    }
  });

  it('permisos y documentos salen del núcleo (B0): sin reglas propias', () => {
    const m = sinComentarios(sql['20260929040700_inv_b4_permisos_y_documentos_del_nucleo']);
    expect(m).toMatch(/perform public\.fn_inventario_exigir_permiso\(p_org,\s+case when p_gestionar then array\['garantias'\] else array\['ver'\] end\)/);
    expect(m).toMatch(/v := public\.fn_inventario_permisos\(p_org\)/);
    expect(m).toMatch(/public\.fn_documento_de_movimiento\(p_org, v_source, p_id, null\)/);
  });

  it('ninguna usa CURRENT_DATE (es el día del servidor, no el de la organización)', () => {
    expect(todas.filter((f) => /\bcurrent_date\b/i.test(f.cuerpo)).map((f) => f.nombre)).toEqual([]);
  });
});

describe('B4: sin mover stock (plan §5.12)', () => {
  it.each(MIGRACIONES)('%s no escribe stock_levels ni stock_movements', (m) => {
    const limpio = sinComentarios(sql[m]).toLowerCase();
    expect(limpio).not.toMatch(/(insert\s+into|update|delete\s+from)\s+public\.stock_(levels|movements)/);
  });

  it('el reemplazo deja anotado el contrato para el núcleo (stock_pendiente)', () => {
    expect(sql['20260929040500_inv_b4_garantias_funciones']).toMatch(/'stock_pendiente', jsonb_build_object\(/);
    expect(sql['20260929040500_inv_b4_garantias_funciones']).toMatch(/'origen', 'warranty_replacement'/);
  });
});

describe('B4: P8 y P9', () => {
  it('P8 fase 1: índice único (organization_id, serial) sin retirar el global', () => {
    const m = sinComentarios(sql['20260929040000_inv_b4_seriales_unicos_por_organizacion']);
    expect(m).toMatch(/create unique index if not exists serial_numbers_org_serial_key\s+on public\.serial_numbers \(organization_id, serial\)/);
    expect(m).not.toMatch(/drop (constraint|index)[^;]*serial_numbers_serial_key/i);
  });

  it('P9: solo seriales en bodega de las orgs 133 y 143, con rastro y conteo', () => {
    const m = sinComentarios(sql['20260929040100_inv_b4_garantias_reinicio_en_bodega']);
    const actualizacion = m.slice(m.indexOf('update public.serial_numbers'));
    expect(actualizacion).toMatch(/organization_id in \(133, 143\)/);
    expect(actualizacion).toMatch(/status = 'in_stock'/);
    expect(m).toMatch(/'warranty_reset'/);
    expect(m).toMatch(/'warranty_start_anterior', sn\.warranty_start/);
    expect(m).toMatch(/raise exception 'P9: conteo inesperado/);
  });

  it('P9: el rollback restaura desde el rastro y desactiva el disparador mientras tanto', () => {
    const r = leer('supabase/rollbacks/20260929040100_inv_b4_garantias_reinicio_en_bodega_rollback.sql');
    expect(r).toMatch(/metadata->>'warranty_start_anterior'/);
    expect(r).toMatch(/disable trigger trg_serial_garantia_desde_venta/);
    expect(r).toMatch(/enable trigger trg_serial_garantia_desde_venta/);
  });

  it('la garantía empieza con la venta: disparador BEFORE sobre estado y fecha de venta', () => {
    const m = sinComentarios(sql['20260929040200_inv_b4_garantia_desde_la_venta']);
    expect(m).toMatch(/before insert or update of status, sale_date, warranty_months, warranty_start, warranty_end/);
    expect(m).toMatch(/new\.status in \('in_stock', 'reserved', 'in_transit'\)[\s\S]*new\.warranty_start := null/);
    expect(m).toMatch(/at time zone coalesce\(v_zona, 'America\/Bogota'\)/);
  });
});

describe('B4: warranty_claims solo se escribe por RPC', () => {
  const m = sinComentarios(sql['20260929040300_inv_b4_garantias_esquema']);
  it('lectura para miembros activos con (select auth.uid())', () => {
    expect(m).toMatch(/create policy warranty_claims_lectura_miembros on public\.warranty_claims\s+for select to authenticated/);
    expect(m).toMatch(/om\.user_id = \(select auth\.uid\(\)\)/);
    expect(m).toMatch(/om\.is_active = true/);
  });
  it('se quitan la política FOR ALL y los GRANT de escritura', () => {
    expect(m).toMatch(/drop policy if exists warranty_claims_insert_update_delete_policy/);
    expect(m).toMatch(/revoke all on table public\.warranty_claims from anon/);
    expect(m).toMatch(/revoke insert, update, delete, truncate, references, trigger on table public\.warranty_claims from authenticated/);
  });
  it('CHECK de estado y un solo reclamo abierto por serial', () => {
    expect(m).toMatch(/warranty_claims_status_check[\s\S]*'pending', 'approved', 'in_process', 'resolved', 'rejected', 'cancelled'/);
    expect(m).toMatch(/warranty_claims_un_abierto_por_serial[\s\S]*where status in \('pending', 'approved', 'in_process'\)/);
  });
});
