/**
 * Contrato de las migraciones de B5 (INVENTARIO-PLAN.md §5.6). Se aplicaron por
 * el MCP y se probaron en transacción deshecha (orden con ingrediente en otra
 * unidad y merma, fallo tardío que no deja la orden completada, costo real del
 * terminado, costo de receta vs. venta, otra organización, anon). Aquí se fija
 * lo que no puede volver atrás.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const M = (n: string) => `supabase/migrations/${n}.sql`;
const R = (n: string) => `supabase/rollbacks/${n}_rollback.sql`;
const NOMBRES = [
  '20260929150000_inv_b5_1_esquema',
  '20260929150100_inv_b5_2_produccion',
  '20260929150150_inv_b5_2b_produccion_lectura',
  '20260929150200_inv_b5_3_recetas',
  '20260929150250_inv_b5_3b_producto_produccion',
];
const esquema = leer(M(NOMBRES[0]));
const produccion = leer(M(NOMBRES[1]));
const lectura = leer(M(NOMBRES[2]));
const recetas = leer(M(NOMBRES[3]));
const pestana = leer(M(NOMBRES[4]));
const todo = [esquema, produccion, lectura, recetas, pestana].join('\n');

function cuerpo(sql: string, nombre: string): string {
  const ini = sql.search(new RegExp(`function public\\.${nombre}\\(`));
  expect(ini).toBeGreaterThan(-1);
  const fin = sql.indexOf('create or replace function', ini + 10);
  return sql.slice(ini, fin === -1 ? undefined : fin);
}

describe('cada migración con su reversión', () => {
  it.each(NOMBRES)('%s', (n) => {
    expect(existsSync(join(process.cwd(), M(n)))).toBe(true);
    expect(existsSync(join(process.cwd(), R(n)))).toBe(true);
  });
  it('la reversión de producción devuelve la versión anterior de complete_production_order', () => {
    const r = leer(R(NOMBRES[1]));
    expect(r).toContain('drop function if exists public.complete_production_order(integer, numeric, uuid, boolean, text)');
    expect(r).toContain('create or replace function public.complete_production_order(p_order_id integer, p_produced_qty numeric, p_updated_by uuid default null::uuid)');
  });
});

describe('completar pasa por la primitiva del núcleo, en una transacción', () => {
  const f = cuerpo(produccion, 'complete_production_order');
  it('SECURITY DEFINER, search_path fijo y permiso producir con la organización de la orden', () => {
    expect(f).toContain('security definer');
    expect(f).toContain("set search_path to 'public', 'pg_temp'");
    expect(f).toContain("fn_inventario_exigir_permiso(v_o.organization_id, array['producir'])");
    expect(f).toContain('for update');
  });
  it('consumos y terminado solo por fn_inv_int_mover (nada de escribir stock a mano)', () => {
    expect(f).not.toMatch(/insert into (public\.)?stock_(levels|movements)/);
    expect(f).not.toMatch(/update (public\.)?stock_levels/);
    expect(f.match(/fn_inv_int_mover\(/g)?.length).toBe(2);
    expect(f).toContain("'out',");
    expect(f).toContain("jsonb_build_object('recalcular_costo', true)");
  });
  it('costo real del terminado = Σ consumos ÷ producido', () => {
    expect(f).toContain('v_unit := v_total / v_qty');
    expect(f).toContain('total_cost = round(v_total, 4), unit_cost = round(v_unit, 4)');
  });
  it('mismo cálculo de la venta: fn_receta_int_calcular con la versión de la orden (conversiones y merma)', () => {
    expect(f).toContain('fn_receta_int_calcular(v_o.organization_id, v_receta, v_qty)');
    expect(f).toContain('fn_receta_int_a_jsonb(v_o.recipe_id)');
    expect(f).toContain("raise exception 'conversion_faltante'");
  });
  it('faltantes solo con confirmación, límite del 150 % y decimales del producto', () => {
    expect(f).toContain("raise exception 'faltante_sin_confirmar' using errcode = '23514'");
    expect(f).toContain('v_qty > v_o.qty_to_produce * 1.5');
    expect(f).toContain("raise exception 'cantidad_decimales'");
  });
  it('idempotente por clave', () => {
    expect(f).toContain("v_o.status = 'completed' and v_clave is not null and v_o.complete_key = v_clave");
  });
});

describe('todas las RPC públicas: DEFINER, pertenencia y sin anon', () => {
  const publicas: [string, string][] = [
    [produccion, 'fn_produccion_necesidades'],
    [produccion, 'fn_produccion_guardar'],
    [produccion, 'fn_produccion_cambiar_estado'],
    [lectura, 'fn_produccion_listado'],
    [lectura, 'fn_produccion_detalle'],
    [recetas, 'fn_recetas_listado'],
    [recetas, 'fn_receta_versiones'],
    [recetas, 'fn_receta_desactivar'],
    [recetas, 'fn_receta_reactivar'],
    [pestana, 'fn_producto_produccion_resumen'],
    [pestana, 'fn_producto_distribucion'],
  ];
  it.each(publicas)('%#', (sql, nombre) => {
    const f = cuerpo(sql, nombre);
    expect(f).toContain('security definer');
    expect(f).toMatch(/fn_inventario_exigir_permiso|fn_productos_exigir_permiso|fn_receta_guardar/);
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${nombre}\\([^)]*\\) from public, anon`));
  });
  it('las internas no se exponen a authenticated', () => {
    for (const n of ['fn_produccion_int_nombre', 'fn_produccion_int_decimales', 'fn_produccion_int_necesidades']) {
      expect(produccion).toMatch(new RegExp(`revoke all on function public\\.${n}\\([^)]*\\) from public, anon, authenticated`));
    }
    expect(lectura).toMatch(/revoke all on function public\.fn_produccion_int_fila\([^)]*\) from public, anon, authenticated/);
  });
});

describe('guardia: órdenes y recetas no se escriben desde el navegador', () => {
  it('rechaza authenticated/anon directo en las cuatro tablas', () => {
    expect(esquema).toContain("if current_user not in ('authenticated', 'anon') then");
    for (const tabla of ['production_orders', 'production_order_consumptions', 'product_recipes', 'recipe_ingredients']) {
      expect(esquema).toMatch(new RegExp(`before insert or update or delete on public\\.${tabla}\\s+for each row execute function public\\.fn_produccion_int_guardia\\(\\)`));
    }
  });
  it('columnas nuevas aditivas (NULL-ables o con default)', () => {
    expect(esquema).not.toMatch(/add column if not exists [^,;]*not null/i);
    expect(esquema).not.toMatch(/drop column/i);
  });
});

describe('costo de recetas: una sola fuente', () => {
  it('el listado y las necesidades usan fn_receta_costo (el mismo costo que la venta)', () => {
    expect(cuerpo(recetas, 'fn_recetas_listado')).toContain("fn_receta_costo(p_org, v_branch, jsonb_build_object('recipe_id', r.id))");
    expect(cuerpo(produccion, 'fn_produccion_int_necesidades')).toContain("fn_receta_costo(p_org, p_branch, jsonb_build_object('recipe_id', p_recipe))");
  });
  it('reactivar crea una versión nueva por fn_receta_guardar (las versiones no se editan)', () => {
    expect(cuerpo(recetas, 'fn_receta_reactivar')).toContain("fn_receta_guardar(p_org, (v_r->>'product_id')::integer, v_r - 'recipe_id')");
  });
});

it('ningún nombre de organización cliente en los comentarios (repositorio público)', () => {
  expect(todo).not.toMatch(/Pepe|S\.A\.S\./);
});
