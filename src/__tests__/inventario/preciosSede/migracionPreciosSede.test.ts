/**
 * Contrato de la migración de precios y costos por sede
 * (docs/inventario/PRECIOS-POR-SEDE.md). La resolución se probó contra la base
 * real con SELECT (paridad 3 000/3 000 con fn_pos_precio_base_vigente sin
 * filas de sede; prioridad sede → general → padre con filas simuladas); aquí
 * se fija lo que no puede perderse al editar el archivo.
 */
import fs from 'fs';
import path from 'path';

const raiz = process.cwd();
const NOMBRE = '20261005230615_precios_y_costos_por_sede';
const sql = fs.readFileSync(path.join(raiz, `supabase/migrations/${NOMBRE}.sql`), 'utf8');
const rollback = fs.readFileSync(path.join(raiz, `supabase/rollbacks/${NOMBRE}_rollback.sql`), 'utf8');
/** Sin comentarios de línea: lo que de verdad ejecuta la base. */
const codigo = sql.replace(/--[^\n]*/g, '');

function cuerpo(fn: string): string {
  const i = codigo.search(new RegExp(`create or replace function public\\.${fn}\\(`, 'i'));
  expect(i).toBeGreaterThanOrEqual(0);
  const resto = codigo.slice(i);
  const delim = /\$(function)?\$/.exec(resto)!;
  const ini = resto.indexOf(delim[0]) + delim[0].length;
  return resto.slice(ini, resto.indexOf(delim[0], ini));
}
function cabecera(fn: string): string {
  const i = codigo.search(new RegExp(`create or replace function public\\.${fn}\\(`, 'i'));
  return codigo.slice(i, codigo.indexOf('$', i));
}

describe('aditiva: el precio/costo general no se toca', () => {
  it('no altera product_prices ni product_costs (sus lectores y escritores siguen intactos)', () => {
    expect(codigo).not.toMatch(/alter\s+table\s+(if\s+exists\s+)?public\.product_(prices|costs)\b/i);
    expect(codigo).not.toMatch(/(update|delete\s+from|insert\s+into)\s+public\.product_(prices|costs)\b/i);
  });

  it('no hay UNIQUE por (product_id, effective_from): dos sedes pueden fijar en el mismo instante', () => {
    expect(codigo).not.toMatch(/unique[^;]*\(\s*product_id\s*,\s*effective_from\s*\)/i);
    expect(codigo).toMatch(/create unique index if not exists product_branch_prices_una_abierta\s+on public\.product_branch_prices \(product_id, branch_id\) where effective_to is null/);
    expect(codigo).toMatch(/create unique index if not exists product_branch_costs_una_abierta\s+on public\.product_branch_costs \(product_id, branch_id\) where effective_to is null/);
  });

  it('índices para el vigente por (producto, sede, desde)', () => {
    expect(codigo).toMatch(/on public\.product_branch_prices \(product_id, branch_id, effective_from desc\)/);
    expect(codigo).toMatch(/on public\.product_branch_costs \(product_id, branch_id, effective_from desc\)/);
  });

  it('sin DELETE ni DROP dentro de cuerpos de función', () => {
    for (const m of codigo.matchAll(/as \$\$([\s\S]*?)\$\$|AS \$function\$([\s\S]*?)\$function\$/g)) {
      const b = m[1] ?? m[2];
      expect(b).not.toMatch(/\bdelete\s+from\b/i);
      expect(b).not.toMatch(/\bdrop\s+(table|function|index)\b/i);
    }
  });
});

describe('multi-tenant', () => {
  it('trigger de coherencia: producto, sede y proveedor de la organización de la fila', () => {
    const b = cuerpo('fn_producto_sede_tg_coherencia');
    expect(b).toMatch(/p\.id = new\.product_id and p\.organization_id = new\.organization_id/);
    expect(b).toMatch(/b\.id = new\.branch_id and b\.organization_id = new\.organization_id/);
    expect(b).toMatch(/s\.id = v_supplier and s\.organization_id = new\.organization_id/);
    expect(codigo).toMatch(/before insert or update of organization_id, branch_id, product_id on public\.product_branch_prices/);
    expect(codigo).toMatch(/before insert or update of organization_id, branch_id, product_id, supplier_id on public\.product_branch_costs/);
  });

  it('RLS: lectura solo para miembros ACTIVOS; sin escritura directa ni acceso anon', () => {
    for (const t of ['product_branch_prices', 'product_branch_costs']) {
      expect(codigo).toContain(`alter table public.${t}`);
      expect(codigo).toMatch(new RegExp(`create policy ${t}_miembros_select on public\\.${t}\\s+for select to authenticated`));
      expect(codigo).toMatch(new RegExp(`revoke all on table public\\.${t}\\s+from public, anon;`));
      expect(codigo).toMatch(new RegExp(`revoke insert, update, delete, truncate, references, trigger on table public\\.${t}\\s+from authenticated;`));
      expect(codigo).not.toMatch(new RegExp(`create policy \\w+ on public\\.${t}\\s+for (insert|update|delete|all)`));
    }
    expect((codigo.match(/om\.is_active\)\)/g) ?? []).length).toBe(2);
  });

  it('la RPC de escritura exige permiso y rechaza el lote entero ante un dato ajeno (42501)', () => {
    const b = cuerpo('fn_productos_sede_fijar');
    expect(b).toMatch(/fn_productos_exigir_permiso\(p_organization_id,\s+array\['inventory\.edit', 'product_management', 'inventory_management'\]\)/);
    for (const motivo of ['sucursal_de_otra_organizacion', 'producto_de_otra_organizacion', 'proveedor_de_otra_organizacion']) {
      expect(b).toMatch(new RegExp(`'${motivo}' using errcode = '42501'`));
    }
    expect(b).toContain("'desde_en_el_pasado'");
    expect(b).toMatch(/for update;/);
    expect(cabecera('fn_productos_sede_fijar')).toMatch(/security definer\s+set search_path = public, pg_temp/);
    expect(codigo).toMatch(/revoke all on function public\.fn_productos_sede_fijar\([^)]*\) from public, anon;/);
  });

  it('las auxiliares de escritura no se exponen (ni a authenticated)', () => {
    expect(codigo).toMatch(/revoke all on function public\.fn_producto_sede_int_fijar_precio\([^)]*\) from public, anon, authenticated;/);
    expect(codigo).toMatch(/revoke all on function public\.fn_producto_sede_int_fijar_costo\([^)]*\) from public, anon, authenticated;/);
  });
});

describe('resolución', () => {
  it('las funciones de lectura son SECURITY INVOKER (aplican la RLS de quien llama) y no anon', () => {
    for (const fn of ['fn_precios_vigentes_lote', 'fn_costos_vigentes_lote', 'fn_precio_vigente', 'fn_costo_vigente']) {
      expect(cabecera(fn)).toMatch(/stable\s+security invoker/);
      expect(codigo).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`));
    }
  });

  it('orden: sede (1) → general (2) → padre sede (3) → padre general (4); padre solo con p_heredar_padre (false por defecto)', () => {
    for (const fn of ['fn_precios_vigentes_lote', 'fn_costos_vigentes_lote']) {
      const b = cuerpo(fn);
      expect(b).toMatch(/'sede'::text as origen[\s\S]*'general'[\s\S]*'padre_sede'[\s\S]*'padre_general'/);
      expect(b).toMatch(/order by c\.prioridad, c\.desde desc, c\.origen_id desc\s+limit 1/);
      expect((b.match(/where p_heredar_padre/g) ?? []).length).toBe(2);
      expect(b).toMatch(/p\.organization_id = p_organization_id/);
      expect(cabecera(fn)).toMatch(/p_heredar_padre boolean default false/);
    }
  });

  it('vigencia: effective_from <= instante < effective_to (la misma de fn_pos_precio_base_vigente)', () => {
    const b = cuerpo('fn_precios_vigentes_lote');
    expect((b.match(/effective_from <= prm\.t and \((bp|pp)\.effective_to is null or (bp|pp)\.effective_to > prm\.t\)/g) ?? []).length).toBe(4);
  });

  it('la versión de un producto delega en el lote (una sola regla)', () => {
    expect(cuerpo('fn_precio_vigente')).toContain('public.fn_precios_vigentes_lote(');
    expect(cuerpo('fn_costo_vigente')).toContain('public.fn_costos_vigentes_lote(');
  });
});

describe('recetas', () => {
  it('costo teórico por sede = Σ cantidad bruta (regla de fn_receta_int_calcular) × costo vigente del insumo en la sede', () => {
    const b = cuerpo('fn_receta_costo_teorico_sede');
    expect(b).toContain('from public.fn_receta_int_calcular(p_organization_id, v_rec, v_rinde) c');
    expect(b).toMatch(/left join lateral public\.fn_costos_vigentes_lote\(p_organization_id, p_branch_id, array\[c\.ingredient_product_id\], v_at\)/);
    expect(b).toMatch(/k\.cantidad \* k\.costo_unitario/);
    expect(b).toContain('fn_assert_acceso_org(p_organization_id)');
    expect(b).toContain("'sucursal_invalida'");
    expect(b).toContain('fn_receta_int_puede_ver_costos(p_organization_id)');
    expect(b).not.toMatch(/stock_levels/);
  });

  it('fn_receta_costo y fn_costo_unitario_producto pasan a fn_costo_vigente de la sede (sin tocar el promedio)', () => {
    expect(cuerpo('fn_receta_costo')).toContain('public.fn_costo_vigente(c.ingredient_product_id, p_branch_id, now()) as vigente');
    expect(cuerpo('fn_receta_costo')).not.toContain('from public.product_costs');
    expect(cuerpo('fn_costo_unitario_producto')).toContain('v_costo := public.fn_costo_vigente(p_product_id, p_branch_id, now());');
    expect(cuerpo('fn_costo_unitario_producto')).toMatch(/SELECT avg_cost INTO v_costo/);
  });
});

describe('POS: validación en el servidor', () => {
  it('sin sede es la regla de hoy; con sede, fn_precio_vigente sin herencia; offline acepta también el general', () => {
    const i = codigo.indexOf('p_branch_id integer, p_aceptar_general boolean)');
    expect(i).toBeGreaterThan(0);
    const b = codigo.slice(i, codigo.indexOf('$function$;', codigo.indexOf('$function$', i) + 10));
    expect(b).toMatch(/case when p_branch_id is null\s+then public\.fn_pos_precio_base_vigente\(v_product, v_momento\)\s+else public\.fn_precio_vigente\(v_product, p_branch_id, v_momento\) end/);
    expect(b).toMatch(/if p_aceptar_general and p_branch_id is not null then/);
  });

  it('la firma de 5 argumentos es un envoltorio sin sede ni tolerancia', () => {
    expect(codigo).toContain('perform public.fn_pos_validar_linea_venta(p_org, p_actor, p_item, p_created_at, p_autorizacion, null::integer, false);');
    expect(codigo).toMatch(/revoke all on function public\.fn_pos_validar_linea_venta\(integer, uuid, jsonb, timestamp with time zone, jsonb, integer, boolean\) from public, anon, authenticated;/);
    expect(codigo).toMatch(/revoke all on function public\.fn_pos_validar_linea_venta\(integer, uuid, jsonb, timestamp with time zone, jsonb\) from public, anon, authenticated;/);
  });

  it('pos_checkout_v1 se parchea con guarda md5 (idempotente y falla cerrada) y la sede sale del servidor', () => {
    expect(codigo).toContain("if v_md5 = '32a99ca1eb51eb44e28a2ed851157094' then");
    expect(codigo).toContain("if v_md5 is distinct from '8580166ba442c69ad9757f75f613c24d' then");
    expect(codigo).toContain("p_envelope->'discount_authorization', v_branch, v_sin_conexion)$n1$ || chr(59)");
    expect(codigo).toContain('coalesce((select s.branch_id from public.sales s where s.id = v_sale_id), v_branch), false)$n2$ || chr(59)');
  });
});

describe('rollback', () => {
  it('existe, avisa que no restaura datos y deshace en orden', () => {
    expect(rollback).toMatch(/NO RESTAURA DATOS/);
    const iPos = rollback.indexOf('pos_checkout_v1(jsonb)');
    const iDrop7 = rollback.indexOf('drop function if exists public.fn_pos_validar_linea_venta(integer, uuid, jsonb, timestamp with time zone, jsonb, integer, boolean)');
    const iCosto = rollback.indexOf('CREATE OR REPLACE FUNCTION public.fn_costo_unitario_producto');
    const iDropVig = rollback.indexOf('drop function if exists public.fn_costo_vigente');
    expect(iPos).toBeGreaterThan(0);
    expect(iDrop7).toBeGreaterThan(iPos);
    expect(iDropVig).toBeGreaterThan(iCosto);
    expect(rollback).toContain('drop table if exists public.product_branch_prices;');
    expect(rollback).toContain('drop table if exists public.product_branch_costs;');
  });
});
