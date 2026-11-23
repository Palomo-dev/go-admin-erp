/**
 * Canal de una venta (Figma 24 Ventas, InsigniaCanal 2896:12337, 2026-11-23)
 * y la miga «Ventas». La misma regla vive en SQL (`pos_ventas_filtradas`,
 * migración 20261123200752_ventas_canal_listado_y_cifras): si una cambia, la
 * otra también.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CANALES_VENTA, canalSiempreVisible, canalVenta, esCanalVenta } from '@/lib/pos/ventas/canalVenta';
import { HREF_TODAS_LAS_VENTAS } from '@/components/pos/useMigaVentas';
import { moduloPorCodigo } from '@/lib/navigation/catalog';

describe('canalVenta', () => {
  it.each([
    [{ source: 'pos' }, 'pos'],
    [{ source: 'pos', web_order_id: null }, 'pos'],
    [{ source: 'invoice' }, 'manual'],
    [{ source: 'web', web_order_id: 'w1' }, 'tienda_web'],
    [{ source: 'web', web_order_id: 'w1', pedido: { source: 'website', delivery_type: 'delivery_own' } }, 'tienda_web'],
    [{ source: 'web', web_order_id: 'w1', pedido: { source: 'website', delivery_type: 'dine_in' } }, 'menu_qr'],
    [{ source: 'web', web_order_id: 'w1', pedido: { source: 'website', delivery_type: 'pickup', internal_notes: '[Comer aquí] Mesa: 4' } }, 'menu_qr'],
    [{ source: 'web', web_order_id: 'w1', pedido: { source: 'whatsapp', delivery_type: 'pickup' } }, 'manual'],
    [{ source: 'web', web_order_id: 'w1', pedido: { source: 'phone', delivery_type: 'delivery_own' } }, 'manual'],
  ] as const)('%j → %s', (venta, canal) => {
    expect(canalVenta(venta)).toBe(canal);
  });

  it('cinco canales; Marketplace solo se ofrece si tiene ventas', () => {
    expect(CANALES_VENTA).toEqual(['pos', 'tienda_web', 'menu_qr', 'marketplace', 'manual']);
    expect(CANALES_VENTA.filter((c) => !canalSiempreVisible(c))).toEqual(['marketplace']);
    expect(esCanalVenta('mesa')).toBe(false);
  });

  it('la migración calcula el canal con los mismos valores', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261123200752_ventas_canal_listado_y_cifras.sql'), 'utf8');
    for (const c of ['pos', 'tienda_web', 'menu_qr', 'manual']) expect(sql).toContain(`'${c}'`);
    expect(sql).toMatch(/p_canales text\[\] default null/);
    expect(readFileSync(join(process.cwd(), 'supabase/rollbacks/20261123200752_ventas_canal_listado_y_cifras_rollback.sql'), 'utf8')).toMatch(/drop function if exists public\.pos_ventas_filtradas/);
  });
});

describe('miga «Ventas»', () => {
  it('lleva a la página con que abre el módulo (Todas las ventas), no a la pantalla del POS', () => {
    expect(HREF_TODAS_LAS_VENTAS).toBe(moduloPorCodigo('pos')!.inicio);
  });

  it('ninguna pantalla del módulo vuelve a escribir «POS» como primer eslabón', () => {
    const patron = /etiqueta: (?:'POS'|t\w*\('(?:migaPos|migas\.pos|pantalla\.migasPos|pagina\.migaPos|listado\.migas\.pos)'\)), href: '\/app\/pos' \}/;
    const archivos = (dir: string): string[] =>
      readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === '__tests__' ? [] : archivos(`${dir}/${e.name}`)) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : [],
      );
    const conMigaVieja = ['src/app/app/pos', 'src/components/pos', 'src/components/finanzas/cuentas-por-cobrar']
      .flatMap(archivos)
      .filter((f) => patron.test(readFileSync(join(process.cwd(), f), 'utf8')));
    expect(conMigaVieja).toEqual([]);
  });
});
