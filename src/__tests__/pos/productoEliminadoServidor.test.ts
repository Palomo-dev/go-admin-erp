/**
 * RPC legadas de baja y POS con productos eliminados
 * (docs/inventario/VARIANTES-HUERFANAS.md, «RPC legadas y POS», 2026-09-30).
 *
 * Contrato de 20260930234000 y 20260930234100 y de las piezas de TypeScript que
 * traducen el error. El comportamiento se probó en la base con DO … RAISE (nada
 * quedó escrito), con usuarios simulados (request.jwt.claims + role authenticated):
 *   · soft_delete_product: miembro sin permiso → sin_permiso; con inventory.delete →
 *     elimina; usuario de otra organización → «Acceso denegado»; anon → sin EXECUTE.
 *     deactivate_product (2 firmas) → sin EXECUTE para authenticated.
 *   · pos_checkout_v1 con el producto eliminado: en línea → producto_eliminado; sin
 *     conexión con hora anterior a la baja → venta pagada (y con el reloj desfasado,
 *     además, marcada reloj_desfasado); sin conexión con hora = baja → rechazada.
 *   · línea de mesa pedida antes de la baja → pasa; pedida después → rechazada.
 *   · variante viva bajo un padre eliminado → producto_eliminado («su producto padre»).
 *   · producto inactivo → sin cambio (pasa).
 *   · devolución (procesar_devolucion) de una venta antigua de un producto hoy
 *     eliminado → se hace, con su nota crédito.
 *   · factura de venta nueva y las dos RPC de GO Assistant → producto_eliminado.
 *   · los rollbacks devuelven los md5 originales de prosrc.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CODIGOS_ERROR_COBRO,
  codigoErrorCobro,
  detalleErrorCobro,
  mensajeErrorCobro,
  mensajeErrorOutbox,
} from '@/lib/pos/erroresCobro';
import { ERRORES_FACTURA, codigoErrorFactura, estadoHttpErrorFactura } from '@/lib/finanzas/ventas/contratoFacturas';

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/--.*$/gm, '');

const LEGADAS = '20260930234000_inv_rpc_legadas_baja_producto_permiso';
const POS = '20260930234100_pos_rechaza_producto_eliminado';
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

describe('1. RPC legadas de baja: permiso en la base o sin EXECUTE', () => {
  const sql = sinComentarios(mig(LEGADAS));

  it('soft_delete_product delega en fn_producto_cambiar_estado (pertenencia + inventory.delete), sin rol cableado', () => {
    expect(sql).toMatch(/create or replace function public\.soft_delete_product\(p_product_id integer\)[\s\S]*security definer\s+set search_path = public, pg_temp/);
    expect(sql).toContain("perform public.fn_producto_cambiar_estado(v_org_id, p_product_id, 'deleted');");
    expect(sql).not.toMatch(/role_id|organization_members/);
    expect(sql).not.toMatch(/update public\.products/i);
  });

  it('deactivate_product (las dos firmas) deja de estar expuesta; soft_delete_product no se abre a anon', () => {
    expect(sql).toContain('revoke all on function public.deactivate_product(integer) from public, anon, authenticated;');
    expect(sql).toContain('revoke all on function public.deactivate_product(integer, integer) from public, anon, authenticated;');
    expect(sql).toContain('revoke all on function public.soft_delete_product(integer) from public, anon;');
    expect(sql).not.toMatch(/grant [^;]*deactivate_product[^;]* to [^;]*authenticated/);
  });

  it('el rollback devuelve la definición exacta (md5 original) y el EXECUTE anterior', () => {
    const r = rb(LEGADAS);
    expect(r).toContain('5994240bc79ad07b3d6343f25bd739e6');
    expect(r).toContain("RAISE EXCEPTION 'No tiene permisos para eliminar este producto';");
    expect(r).toContain('grant execute on function public.deactivate_product(integer) to authenticated;');
    expect(r).toContain('grant execute on function public.deactivate_product(integer, integer) to authenticated;');
  });
});

describe('2. Punto único: fn_producto_exigir_vendible', () => {
  const sql = sinComentarios(mig(POS));
  const helper = sql.slice(sql.indexOf('create or replace function public.fn_producto_exigir_vendible'), sql.indexOf('$function$;') + 11);

  it('rechaza producto o padre eliminado con un código estable y el nombre en el detalle', () => {
    expect(helper).toMatch(/v_estado <> 'deleted' and v_padre_estado <> 'deleted'/);
    expect(helper).toMatch(/raise exception 'producto_eliminado' using errcode = '22023',\s+detail = /);
    expect(helper).toContain('su producto padre está eliminado');
  });

  it('respeta la línea anterior a la baja; sin momento o sin fecha de baja, falla cerrado', () => {
    expect(helper).toMatch(/if p_momento is not null and v_baja is not null and p_momento < v_baja then\s+return;/);
    // La baja: última transición a 'deleted' en la auditoría; sin rastro, updated_at.
    expect(helper).toMatch(/from public\.products_audit_log a[\s\S]*a\.changes->'after'->>'status' = 'deleted'[\s\S]*coalesce\(a\.changes->'before'->>'status', ''\) <> 'deleted'/);
    expect(helper).toMatch(/select pr\.updated_at from public\.products pr where pr\.id = ids\.id/);
  });

  it('no toca inactivos (solo mira deleted) y exige acceso a la organización', () => {
    expect(helper).not.toMatch(/'inactive'|'discontinued'/);
    expect(helper).toContain('perform public.fn_assert_acceso_org(p_org);');
    expect(helper).toMatch(/where p\.id = p_product and p\.organization_id = p_org/);
  });

  it('SECURITY DEFINER con search_path fijo, sin EXECUTE para anon ni public', () => {
    expect(helper).toMatch(/stable\s+security definer\s+set search_path = public, pg_temp/);
    expect(sql).toContain('revoke all on function public.fn_producto_exigir_vendible(integer, integer, timestamptz) from public, anon;');
    expect(sql).not.toMatch(/grant [^;]*fn_producto_exigir_vendible[^;]* to [^;]*anon/);
  });
});

describe('3. Quién lo llama (parches con md5)', () => {
  const ps = parches(mig(POS));
  const porNombre = (n: string) => ps.find((p) => p.firma.startsWith(`${n}(`));

  it('parchea exactamente cuatro funciones, cada una con md5 antes/después distintos', () => {
    expect(ps.map((p) => p.firma.split('(')[0]).sort()).toEqual(
      ['assistant_register_sale', 'assistant_register_sales_invoice', 'fn_factura_venta_guardar', 'fn_pos_validar_linea_venta'],
    );
    for (const p of ps) {
      expect(p.desde).toMatch(/^[0-9a-f]{32}$/);
      expect(p.hasta).toBe(p.yaAplicado);
      expect(p.desde).not.toBe(p.hasta);
      expect(p.nuevo.startsWith(p.viejo) || p.nuevo.endsWith(p.viejo)).toBe(true);
    }
  });

  it('POS: el validador usa el momento de la línea (hora del equipo sin conexión, hora de la línea en mesa)', () => {
    const p = porNombre('fn_pos_validar_linea_venta');
    expect(p?.nuevo).toContain('perform public.fn_producto_exigir_vendible(p_org, v_product, p_created_at);');
  });

  it('factura de venta: solo el alta (la edición de un borrador no reescribe sale_items)', () => {
    expect(porNombre('fn_factura_venta_guardar')?.nuevo).toMatch(
      /if p_invoice_id is null then\s+perform public\.fn_producto_exigir_vendible\(p_org, v_producto, now\(\)\);/,
    );
  });

  it('GO Assistant: venta y factura, con la hora del servidor', () => {
    for (const n of ['assistant_register_sale', 'assistant_register_sales_invoice']) {
      expect(porNombre(n)?.nuevo).toContain('perform public.fn_producto_exigir_vendible(p_organization_id, v_product_id, now());');
    }
  });

  it('devoluciones, notas crédito y pedidos web no pasan por la comprobación', () => {
    const texto = sinComentarios(mig(POS));
    for (const fn of ['procesar_devolucion', 'fn_nota_credito_emitir', 'fn_confirmar_pedido_web', 'fn_pedido_web_confirmar_stock', 'pos_checkout_v1']) {
      expect(texto).not.toContain(`public.${fn}(`);
    }
  });

  it('el rollback invierte cada parche (md5 original) y borra el punto único', () => {
    const vuelta = parches(rb(POS));
    expect(vuelta).toHaveLength(ps.length);
    for (const p of ps) {
      const r = vuelta.find((v) => v.firma === p.firma);
      expect(r?.desde).toBe(p.hasta);
      expect(r?.hasta).toBe(p.desde);
      expect(r?.viejo).toBe(p.nuevo);
      expect(r?.nuevo).toBe(p.viejo);
    }
    expect(rb(POS)).toContain('drop function if exists public.fn_producto_exigir_vendible(integer, integer, timestamptz);');
  });
});

describe('4. El error llega traducido', () => {
  const errorRpc = { code: '22023', message: 'producto_eliminado', details: '«Agua» (producto 7) está eliminado.' };
  const t = (clave: string, valores?: Record<string, string>) => `[${clave}] ${valores?.detalle ?? ''}`.trim();

  it('POS (cobro en línea y mesas): código estable y detalle', () => {
    expect(CODIGOS_ERROR_COBRO).toContain('producto_eliminado');
    expect(codigoErrorCobro(errorRpc)).toBe('producto_eliminado');
    expect(detalleErrorCobro(errorRpc)).toBe('«Agua» (producto 7) está eliminado.');
    expect(mensajeErrorCobro(errorRpc, t, 'No se pudo cobrar')).toBe('[errores.producto_eliminado] «Agua» (producto 7) está eliminado.');
  });

  it('bandeja sin conexión: traduce el last_error que guarda salesSync («código — mensaje — detalle»)', () => {
    expect(mensajeErrorOutbox('22023 — producto_eliminado — «Agua» (producto 7) está eliminado.', t)).toBe(
      '[errores.producto_eliminado] «Agua» (producto 7) está eliminado.',
    );
    expect(mensajeErrorOutbox('22023 — precio_no_coincide', t)).toBe('[errores.precio_no_coincide]');
    expect(mensajeErrorOutbox('Failed to fetch', t)).toBe('Failed to fetch');
  });

  it('factura de venta: código conocido, 422', () => {
    expect(ERRORES_FACTURA).toContain('producto_eliminado');
    expect(codigoErrorFactura('producto_eliminado')).toBe('producto_eliminado');
    expect(estadoHttpErrorFactura('producto_eliminado')).toBe(422);
  });

  it.each(['es', 'en', 'fr', 'pt'])('texto en %s para el POS y para la factura de venta', (lang) => {
    const msgs = JSON.parse(leer(`messages/${lang}.json`));
    expect(msgs.posCobroServidor.errores.producto_eliminado).toContain('{detalle}');
    expect(typeof msgs.facturasVenta.errores.producto_eliminado).toBe('string');
  });
});
