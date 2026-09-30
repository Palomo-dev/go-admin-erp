/**
 * Variantes de un padre eliminado (docs/inventario/VARIANTES-HUERFANAS.md).
 *
 * Contrato de las migraciones 20260930233000–20260930233200 y de las piezas de
 * TypeScript que dependen de ellas. Todo se probó antes en la base con
 * DO … RAISE (sin dejar datos) y después de aplicar:
 *   · eliminar un padre (UPDATE directo, fn_producto_cambiar_estado y acción
 *     masiva) da de baja sus variantes vivas y guarda su estado; restaurarlo
 *     devuelve cada una a su estado exacto y deja fuera las que ya estaban
 *     eliminadas; revivir o crear una variante bajo un padre eliminado → 23514;
 *   · la acción masiva devuelve el mismo resumen (actualizados 5, seleccionados 3,
 *     variantes 2 para 2 padres + 1 variante elegida);
 *   · la limpieza dio de baja 1.195 variantes en 9 organizaciones y dejó 889 con
 *     inventario u otra referencia abierta; su rollback las devolvió con el mismo
 *     status y updated_at (0 filas distintas) y los md5 de las seis funciones
 *     volvieron a los originales;
 *   · inicio de la org 137 (admin simulado): agotados 226 → 0, coherente con la
 *     lista de Productos con «Sin stock».
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { EMBED_ESTADO_PADRE, PREDICADO_SQL_PADRE_VIGENTE, padreEliminado } from '@/lib/inventario/variantesHuerfanas';
import { codigoErrorRpc } from '@/lib/services/productosImportService';
import { CODIGOS_ERROR_PRODUCTO, aErrorProducto } from '@/lib/services/productoService';

jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/--.*$/gm, '');

const CASCADA = '20260930233000_inv_variantes_baja_en_cascada';
const LECTURAS = '20260930233100_inv_variantes_huerfanas_lecturas';
const LIMPIEZA = '20260930233200_inv_variantes_huerfanas_limpieza';
const mig = (m: string) => leer(`supabase/migrations/${m}.sql`);
const rb = (m: string) => leer(`supabase/rollbacks/${m}_rollback.sql`);

/** Bloques `do $parche$` → firma, md5 esperados y fragmentos. */
function parches(texto: string) {
  return [...texto.matchAll(/do \$parche\$([\s\S]*?)\$parche\$;/g)].map((m) => {
    const b = m[1];
    return {
      firma: b.match(/'public\.([^']+)'::regprocedure/)?.[1] ?? '',
      yaAplicado: b.match(/if v_md5 = '([0-9a-f]{32})' then/)?.[1] ?? '',
      desde: b.match(/if v_md5 <> '([0-9a-f]{32})' then\s+raise exception '[^']*cambió/)?.[1] ?? '',
      hasta: [...b.matchAll(/if v_md5 <> '([0-9a-f]{32})' then/g)].pop()?.[1] ?? '',
      viejo: b.match(/v_old text := \$frag\$([\s\S]*?)\$frag\$;/)?.[1] ?? '',
      nuevo: b.match(/v_new text := \$frag\$([\s\S]*?)\$frag\$;/)?.[1] ?? '',
    };
  });
}

describe('1/3 cascada: un solo punto por el que pasan todos los caminos de borrado', () => {
  const sql = sinComentarios(mig(CASCADA));

  it('disparador AFTER UPDATE OF status que solo se activa al eliminar o restaurar', () => {
    expect(sql).toMatch(/create trigger trg_producto_baja_variantes\s+after update of status on public\.products\s+for each row\s+when \(old\.status is distinct from new\.status and \(new\.status = 'deleted' or old\.status = 'deleted'\)\)/);
  });

  it('al eliminar: da de baja las variantes vivas de la misma organización y guarda su estado previo', () => {
    expect(sql).toMatch(/where v\.parent_product_id = new\.id\s+and v\.organization_id = new\.organization_id\s+and coalesce\(v\.status, 'active'\) <> 'deleted'/);
    expect(sql).toMatch(/returning v\.id, previas\.status as status_previo, previas\.updated_at as updated_at_previo/);
    expect(sql).toMatch(/insert into private\.inv_variantes_baja_en_cascada[\s\S]*'cascada'/);
  });

  it('al restaurar: vuelven solo las que cayeron con el padre, a su estado exacto', () => {
    expect(sql).toMatch(/elsif old\.status = 'deleted' then[\s\S]*delete from private\.inv_variantes_baja_en_cascada r\s+where r\.parent_id = new\.id/);
    expect(sql).toMatch(/set status = r\.status_previo, updated_at = now\(\)[\s\S]*and v\.status = 'deleted'/);
  });

  it('guarda BEFORE: crear, revivir o mover una variante viva bajo un padre eliminado falla con 23514', () => {
    expect(sql).toMatch(/before insert or update of status, parent_product_id on public\.products/);
    expect(sql).toMatch(/raise exception 'variante_padre_eliminado' using errcode = '23514'/);
    // Cambiar entre estados vivos se permite (no bloquea a las huérfanas con stock).
    expect(sql).toMatch(/old\.parent_product_id is not distinct from new\.parent_product_id\s+and coalesce\(old\.status, 'active'\) <> 'deleted' then\s+return new;/);
  });

  it('las dos funciones son SECURITY DEFINER con search_path fijo y sin EXECUTE para nadie', () => {
    for (const fn of ['fn_producto_int_baja_variantes', 'fn_producto_int_variante_padre_vigente']) {
      expect(sql).toMatch(new RegExp(`function public\\.${fn}\\(\\)\\s+returns trigger\\s+language plpgsql\\s+security definer\\s+set search_path = public, pg_temp`));
      expect(sql).toContain(`revoke all on function public.${fn}() from public, anon, authenticated;`);
    }
    expect(sql).toContain('revoke all on private.inv_variantes_baja_en_cascada from public, anon, authenticated;');
  });

  it('acción masiva: al eliminar deja las variantes del padre al disparador y cuenta igual', () => {
    const [p] = parches(mig(CASCADA));
    expect(p.firma).toBe('fn_productos_estado_masivo(integer,integer[],text)');
    expect(p.desde).toBe('2313276899bfe5433ff3b7d5d453e44e');
    expect(p.hasta).toBe('5a07af394490108d83143753c749aa25');
    // coalesce: un padre tiene parent_product_id NULL y sin él quedaba fuera del UPDATE.
    expect(p.nuevo).toContain("and not (p_status = 'deleted' and coalesce(parent_product_id = any(v_ids), false));");
    expect(p.nuevo).toMatch(/select v_n \+ count\(\*\) into v_n/);
  });

  it('el rollback devuelve la definición exacta anterior y exige revertir antes la limpieza', () => {
    const r = rb(CASCADA);
    const [p] = parches(r);
    expect(p.desde).toBe('5a07af394490108d83143753c749aa25');
    expect(p.hasta).toBe('2313276899bfe5433ff3b7d5d453e44e');
    const [a] = parches(mig(CASCADA));
    expect(p.viejo).toBe(a.nuevo);
    expect(p.nuevo).toBe(a.viejo);
    expect(r).toMatch(/origen = 'limpieza_20260930'\) then\s+raise exception 'Revertir primero 20260930233200/);
    for (const x of ['trg_producto_variante_padre_vigente', 'trg_producto_baja_variantes']) expect(r).toContain(`drop trigger if exists ${x} on public.products;`);
    expect(r).toContain('drop table if exists private.inv_variantes_baja_en_cascada;');
  });
});

describe('2/3 lecturas: inventario, POS, inicio y reportes excluyen variantes de un padre eliminado', () => {
  const ps = parches(mig(LECTURAS));
  const rs = parches(rb(LECTURAS));
  const FUNCIONES = [
    'fn_stock_listado',
    'pos_product_ranking',
    'buscar_productos',
    'fn_reporte_stock_critico',
    'fn_reporte_rotacion_inventario',
  ];

  it('parchea exactamente las cinco funciones, cada una con el predicado canónico pp_elim', () => {
    expect(ps.map((p) => p.firma.split('(')[0])).toEqual(FUNCIONES);
    for (const p of ps) {
      const plano = p.nuevo.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();
      expect(plano).toContain(PREDICADO_SQL_PADRE_VIGENTE.toLowerCase());
      // Solo se añade: el fragmento nuevo contiene el viejo.
      expect(p.nuevo.replace(/\n\s*--[^\n]*\n\s*(and|AND) not exists[\s\S]*?'deleted'\)\n/i, '\n')).toBe(p.viejo);
    }
  });

  it('md5 antes/después coherentes entre migración y rollback (definición exacta anterior)', () => {
    expect(rs).toHaveLength(ps.length);
    ps.forEach((p, i) => {
      expect(p.desde).toMatch(/^[0-9a-f]{32}$/);
      expect(p.hasta).toMatch(/^[0-9a-f]{32}$/);
      expect(p.yaAplicado).toBe(p.hasta);
      expect(rs[i].firma).toBe(p.firma);
      expect(rs[i].desde).toBe(p.hasta);
      expect(rs[i].hasta).toBe(p.desde);
      expect(rs[i].viejo).toBe(p.nuevo);
      expect(rs[i].nuevo).toBe(p.viejo);
    });
    expect(ps.find((p) => p.firma.startsWith('fn_stock_listado'))?.desde).toBe('ea36b5a1cc8339effa4cc6ecb7f7199d');
  });

  it('el md5 de partida de fn_stock_listado es el cuerpo de su migración original', () => {
    const original = mig('20260929100000_inv_b1_1_stock_listado');
    const viejo = ps[0].viejo;
    expect(original).toContain(viejo);
  });
});

describe('3/3 limpieza: solo las que no tienen nada abierto, con rastro para el rollback', () => {
  const sql = sinComentarios(mig(LIMPIEZA));

  it('no toca huérfanas con inventario, ventas, pedidos, compras, reservas o promociones', () => {
    expect(sql).toMatch(/stock_levels x where x\.product_id = h\.id\s+and \(coalesce\(x\.qty_on_hand, 0\) <> 0 or coalesce\(x\.qty_reserved, 0\) <> 0\)/);
    for (const t of ['sale_items', 'web_order_items', 'po_items', 'purchase_order_items', 'transfer_items', 'invoice_items', 'shipment_items', 'quotation_items', 'return_lines', 'serial_numbers', 'memberships', 'folio_items']) {
      expect(sql).toContain(`public.${t} x where x.product_id = h.id`);
    }
    expect(sql).toMatch(/stock_reservations x where x\.product_id = h\.id and x\.released_at is null/);
    expect(sql).toMatch(/promotion_rules x[\s\S]*pr\.is_active/);
    expect(sql).toMatch(/public\.carts c/);
  });

  it('guarda cada id con su status y updated_at previos y aborta si los datos cambiaron', () => {
    expect(sql).toMatch(/select h\.id, h\.parent_product_id, h\.organization_id, h\.status, h\.updated_at, 'limpieza_20260930'/);
    expect(sql).toContain('"137":225');
    expect(sql).toMatch(/v_total <> 1195/);
    expect(sql).toMatch(/if v_n <> 1195 then/);
  });

  it('el rollback devuelve status y updated_at exactos y solo salta la guarda en su transacción', () => {
    const r = rb(LIMPIEZA);
    expect(r).toMatch(/set status = r\.status_previo,\s+updated_at = r\.updated_at_previo/);
    expect(r).toMatch(/and v\.status = 'deleted';/);
    expect(r).toContain("select set_config('inv.permitir_variante_huerfana', 'on', true);");
    expect(r).toContain("delete from private.inv_variantes_baja_en_cascada where origen = 'limpieza_20260930';");
  });
});

describe('TypeScript: lecturas desde el navegador y errores', () => {
  it('padreEliminado reconoce el embed como objeto o como arreglo', () => {
    expect(padreEliminado({ padre: { status: 'deleted' } })).toBe(true);
    expect(padreEliminado({ padre: [{ status: 'deleted' }] })).toBe(true);
    expect(padreEliminado({ padre: { status: 'active' } })).toBe(false);
    expect(padreEliminado({ padre: null })).toBe(false);
    expect(padreEliminado({})).toBe(false);
    expect(padreEliminado(null)).toBe(false);
  });

  it('el tablero de inventario del inicio trae el estado del padre y descarta las huérfanas', () => {
    const fuente = leer('src/lib/services/inventoryDashboardService.ts');
    expect(fuente.split(`is_parent, ${EMBED_ESTADO_PADRE})`).length - 1).toBe(3);
    expect(fuente.match(/is_parent === true \|\| padreEliminado\(product\)/g)).toHaveLength(3);
    expect(fuente).toMatch(/padre:products!parent_product_id!inner\(status\)[\s\S]*\.eq\('padre\.status', 'deleted'\)/);
  });

  it('el error de la guarda llega con código a la UI y al importador', () => {
    expect(CODIGOS_ERROR_PRODUCTO).toContain('variante_padre_eliminado');
    expect(aErrorProducto({ message: 'variante_padre_eliminado', code: '23514' }).codigo).toBe('variante_padre_eliminado');
    expect(codigoErrorRpc('variante_padre_eliminado')).toBe('VARIANTE_PADRE_ELIMINADO');
    for (const idioma of ['es', 'en', 'fr', 'pt']) {
      const m = JSON.parse(leer(`messages/${idioma}.json`)) as Record<string, unknown>;
      const plano = JSON.stringify(m);
      expect(plano).toContain('"variante_padre_eliminado":');
      expect(plano).toContain('"VARIANTE_PADRE_ELIMINADO":');
    }
  });
});
