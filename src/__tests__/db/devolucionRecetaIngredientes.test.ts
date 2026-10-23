/**
 * Contrato de la devolución de un producto con receta.
 * La venta descuenta ingredientes y la devolución repone esas salidas, no la
 * receta vigente. La proporción, el cambio de receta y la idempotencia se
 * probaron con begin/rollback contra la base antes de aplicar el backfill.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const migrations = join(process.cwd(), 'supabase', 'migrations');
const archivo = readdirSync(migrations).find((nombre) => nombre.endsWith('_devolucion_receta_ingredientes.sql'));
const sql = archivo ? readFileSync(join(migrations, archivo), 'utf8') : '';

function cuerpo(nombre: string): string {
  const ini = sql.indexOf(`function public.${nombre}(`);
  const fin = sql.indexOf('create or replace function', ini + 10);
  return sql.slice(ini, fin === -1 ? undefined : fin);
}

describe('devolución con receta: repone lo consumido', () => {
  it('la migración y su rollback quedan versionados', () => {
    expect(archivo).toBe('20261023102907_devolucion_receta_ingredientes.sql');
    expect(existsSync(join(process.cwd(), 'supabase', 'rollbacks', '20261023102907_devolucion_receta_ingredientes_rollback.sql'))).toBe(true);
  });

  it('guarda la receta de la venta una sola vez', () => {
    expect(sql).toContain('add column if not exists recipe_id integer');
    expect(sql).toContain('on delete set null');
    expect(sql).toContain('and si.recipe_id is null');
  });

  it('la venta sigue el mismo cálculo y marca qué producto se vendió', () => {
    const venta = cuerpo('decrement_stock_with_recipe');
    expect(venta).toContain('fn_receta_int_expandir(p_organization_id, p_product_id, p_qty, true)');
    expect(venta).toContain("concat('Ingrediente de receta: '");
    expect(venta).toContain("' | vendido:'");
  });

  it('la reposición usa la salida real, su costo y la proporción, no la receta vigente', () => {
    const helper = cuerpo('fn_devolucion_reponer_ingredientes');
    expect(helper).toContain('fn_stock_entrada_devolucion');
    expect(helper).toContain("sm.note like 'Ingrediente de receta:%'");
    expect(helper).toContain('round(v_out.qty * p_return_qty / v_total, 3)');
    expect(helper).toContain('v_out.unit_cost');
    expect(helper).toContain("'| salida:'");
    expect(helper).toContain("' | linea:'");
    expect(helper).not.toContain('fn_receta_efectiva');
    expect(helper).not.toContain('fn_receta_int_expandir');
  });

  it('respeta affects_inventory y los seriales que vuelven, y no reescribe procesar_devolucion', () => {
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.procesar_devolucion\s*\(/i);
    expect(sql).toContain("coalesce((v_linea->>'affects_inventory')::boolean, false)");
    expect(sql).toContain("d.value = 'in_stock'");
    expect(sql).toContain("(v_linea->>''track_stock'')::boolean and v_entra > 0");
    expect(sql).toContain('fn_membresias_revertir_linea');
  });

  it('la función que mueve stock no queda ejecutable por anon ni authenticated', () => {
    const helper = cuerpo('fn_devolucion_reponer_ingredientes');
    expect(helper).toContain('security definer');
    expect(helper).toContain("set search_path to 'public', 'pg_temp'");
    expect(sql).toContain(
      'revoke all on function public.fn_devolucion_reponer_ingredientes(integer, integer, uuid, uuid, integer, numeric, numeric, integer, uuid) from public, anon, authenticated',
    );
  });

  it('el backfill solo toma la devolución ya procesada que no repuso y exige que cuadre', () => {
    expect(sql).toContain('rr.affects_inventory');
    expect(sql).toContain("coalesce(p.sale_mode, 'unit') = 'unit'");
    expect(sql).toContain('coalesce(p.track_serial, false) = false');
    expect(sql).toContain("sm.note not like '%| vendido:%'");
    expect(sql).toContain('La vista previa del backfill no coincide');
    expect(sql).toContain('v_despues is distinct from v_antes + v_entradas');
  });
});
