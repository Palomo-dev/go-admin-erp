/**
 * Contrato de las migraciones de receta (docs/design/PRODUCTO-RECETAS-Y-SUBSECCIONES.md §2.3–§2.5).
 * Se aplicaron por el MCP y se probaron con DO … RAISE y begin … rollback
 * (receta compartida y por variante, merma, rinde, conversión faltante,
 * autorreferida, repetido, idempotencia, ida y vuelta de las 55 recetas activas).
 * Aquí se fija lo que no puede volver atrás al reescribir las funciones.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const M1 = 'supabase/migrations/20260928230000_receta_resolutor_unico.sql';
const M2 = 'supabase/migrations/20260928231000_producto_guardar_con_recetas.sql';
const sql1 = leer(M1);
const sql2 = leer(M2);
const M3 = 'supabase/migrations/20260928232000_receta_permisos_revoke_explicito.sql';
const sql3 = leer(M3);

/** Cuerpo de una función (desde su create hasta el siguiente create). */
function cuerpo(sql: string, nombre: string): string {
  const ini = sql.indexOf(`function public.${nombre}(`);
  expect(ini).toBeGreaterThan(-1);
  const fin = sql.indexOf('create or replace function', ini + 10);
  return sql.slice(ini, fin === -1 ? undefined : fin);
}

describe('un solo resolutor y un solo cálculo', () => {
  it('la variante sin receta propia usa la del padre; la propia gana', () => {
    const f = cuerpo(sql1, 'fn_receta_efectiva');
    expect(f).toContain('pr.product_id = p.id or (p.parent_product_id is not null and pr.product_id = p.parent_product_id)');
    expect(f).toContain('order by (pr.product_id = p.id) desc');
  });
  it('cantidad × producido ÷ rinde, merma sobre la neta y conversión a la unidad del ingrediente', () => {
    const f = cuerpo(sql1, 'fn_receta_int_calcular');
    expect(f).toContain("cantidad_neta := coalesce(nullif(v_l->>'quantity', '')::numeric, 0) * coalesce(p_cantidad, 0) / v_rinde");
    expect(f).toContain('cantidad_bruta := cantidad_neta / (1 - v_merma / 100)');
    expect(f).toContain('cantidad := cantidad_bruta * coalesce(factor, 1)');
    expect(f).toContain("when factor is null then 'conversion_faltante'");
  });
  it('al vender: sin el propio producto (F-68), sin opcionales y conversión obligatoria', () => {
    const f = cuerpo(sql1, 'fn_receta_int_expandir');
    expect(f).toContain('continue when v_l.ingredient_product_id = p_product_id');
    expect(f).toContain('continue when v_l.opcional');
    expect(f).toMatch(/v_l\.error = 'conversion_faltante' and v_l\.track_stock and p_estricto then\s+raise exception 'conversion_faltante'/);
    expect(f).toContain('not v_ef.al_producir');
  });
  it('decrement_stock_with_recipe y complete_production_order usan el mismo cálculo', () => {
    expect(cuerpo(sql1, 'decrement_stock_with_recipe')).toContain('fn_receta_int_expandir(p_organization_id, p_product_id, p_qty, true)');
    const prod = cuerpo(sql1, 'complete_production_order');
    expect(prod).toContain('fn_receta_int_calcular(v_order.organization_id, public.fn_receta_int_a_jsonb(v_order.recipe_id), p_produced_qty)');
    // El bug del factor reutilizado: ya no existe la variable.
    expect(prod).not.toContain('v_conv_factor');
  });
  it('la conversión busca la de la organización, luego la global y, si solo existe, la inversa', () => {
    const f = cuerpo(sql1, 'fn_receta_int_factor');
    expect(f).toContain('order by uc.organization_id nulls last');
    expect(f).toContain('select 1 / uc.factor');
  });
});

describe('merma y permiso de costos', () => {
  it('merma aditiva con default 0 y rango 0 ≤ merma < 100', () => {
    expect(sql1).toContain('add column if not exists waste_pct numeric(5,2) not null default 0');
    expect(sql1).toContain('check (waste_pct >= 0 and waste_pct < 100)');
  });
  it('inventory.costs.view se siembra solo a quien ya administra inventario', () => {
    expect(sql1).toContain("'inventory.costs.view'");
    expect(sql1).toMatch(/pm\.code = 'inventory_management'[\s\S]*role_permissions/);
    expect(cuerpo(sql1, 'fn_productos_permisos')).toContain("'costos', public.fn_receta_int_puede_ver_costos(p_org)");
  });
  it('el costo sin permiso devuelve las líneas sin importes', () => {
    const f = cuerpo(sql2, 'fn_receta_costo');
    expect(f).toContain("'costo_linea', case when v_ver then round(m.costo_linea, 4) end");
    expect(f).toContain("'costo_tanda', case when v_ver then");
    expect(f).toContain('sum(m.costo_linea) filter (where not m.opcional)');
  });
});

describe('guardado: una RPC transaccional e idempotente', () => {
  const guardar = cuerpo(sql2, 'fn_producto_guardar');
  it('la idempotencia va después del permiso y antes de validar (un reintento no choca con sku_duplicado)', () => {
    const permiso = guardar.indexOf('fn_productos_exigir_permiso');
    const idem = guardar.indexOf('insert into public.product_save_requests');
    const sku = guardar.indexOf("raise exception 'sku_duplicado'");
    expect(permiso).toBeGreaterThan(-1);
    expect(idem).toBeGreaterThan(permiso);
    expect(sku).toBeGreaterThan(idem);
    expect(guardar).toContain("return v_prev || jsonb_build_object('repetido', true)");
  });
  it('las variantes devuelven su clave y la receta de una variante nueva se ubica por ella', () => {
    expect(guardar).toContain("'clave', nullif(v_x->>'clave', '')");
    expect(guardar).toContain("where x->>'clave' = v_rec->'destino'->>'variante'");
    expect(guardar).toContain("raise exception 'receta_variante_desconocida'");
  });
  it('apagar o no enviar una receta desactiva; nunca borra', () => {
    const bloque = guardar.slice(guardar.indexOf("jsonb_typeof(p_payload->'receta') = 'object'"));
    expect(bloque).toContain('set is_active = false');
    expect(bloque.slice(0, bloque.indexOf('-- Modificadores'))).not.toMatch(/delete from public\.product_recipes/);
  });
  it('«Al producir» es production_type = preparation y exige inventario', () => {
    expect(guardar).toContain("case when v_rc->>'modo' = 'al_producir' then 'preparation' else 'composite' end");
    expect(guardar).toContain("raise exception 'receta_al_producir_sin_inventario'");
  });
  it('una versión nueva solo si la receta cambió', () => {
    const f = cuerpo(sql2, 'fn_receta_int_guardar_version');
    expect(f).toContain("if v_viejo = v_nuevo then");
    expect(f).toContain("'cambio', false");
    expect(f).toContain('coalesce(max(r.version), 0) + 1');
    expect(f).toContain("raise exception 'receta_autorreferida'");
    expect(f).toContain("raise exception 'receta_ingrediente_repetido'");
  });
});

describe('seguridad y rollback', () => {
  const definer = (sql: string) =>
    // Solo la cabecera (hasta «as $»): no confundir con la función siguiente.
    [...sql.matchAll(/create or replace function public\.(\w+)\(((?!\bas \$)[\s\S])*?security definer/g)].map((m) => m[1]);
  it('toda función con elevación revoca anon (fn_productos_permisos, en la migración de revoke explícito)', () => {
    const conRevoke = (sql: string, nombre: string) =>
      new RegExp(`revoke all on function public\\.${nombre}\\([^)]*\\) from public, anon`).test(sql);
    for (const sql of [sql1, sql2]) {
      for (const nombre of definer(sql)) {
        expect(conRevoke(sql, nombre) || conRevoke(sql3, nombre)).toBe(true);
      }
    }
    expect(conRevoke(sql3, 'fn_productos_permisos')).toBe(true);
  });
  it('las RPC públicas verifican la organización', () => {
    for (const f of ['fn_receta_costo', 'fn_receta_necesidades', 'fn_producto_recetas_para_formulario', 'fn_receta_expandir']) {
      expect(cuerpo(sql2, f)).toContain('fn_assert_acceso_org');
    }
    expect(cuerpo(sql2, 'fn_receta_guardar')).toContain('fn_productos_exigir_permiso');
  });
  it('la interna de versiones no es invocable desde el navegador', () => {
    expect(sql2).toContain('revoke all on function public.fn_receta_int_guardar_version(integer, integer, jsonb) from public, anon, authenticated');
  });
  it('cada migración deja su rollback', () => {
    for (const m of [M1, M2, M3]) {
      const rb = m.replace('supabase/migrations/', 'supabase/rollbacks/').replace('.sql', '_rollback.sql');
      expect(existsSync(join(process.cwd(), rb))).toBe(true);
    }
  });
  it('detecta las funciones con elevación de cada migración', () => {
    expect(definer(sql1)).toEqual(['fn_receta_int_puede_ver_costos', 'fn_productos_permisos']);
    expect(definer(sql2)).toEqual([
      'fn_receta_int_guardar_version',
      'fn_receta_guardar',
      'fn_producto_recetas_para_formulario',
      'fn_receta_costo',
      'fn_receta_necesidades',
      'fn_receta_expandir',
      'fn_producto_guardar',
    ]);
  });
});
