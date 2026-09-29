/**
 * Tamaño de página de los listados de facturas de venta y de cuentas por
 * cobrar (2026-09-28).
 *
 * Las dos pantallas piden 25 filas por defecto (Figma B.1 y `448:201605`),
 * pero el kit valida el tamaño contra `TAMANOS_PAGINA` (10, 20, 50, 100)
 * cuando no recibe `tamanosPermitidos`: el 25 no está, y lo bajaba a 10 en
 * silencio. Se arregla en cada pantalla (como el catálogo de productos), sin
 * tocar el kit: la lista de tamaños va a `useListadoServidor` y al selector de
 * `Pagination`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { TAMANOS_PAGINA } from '@/components/kit/paginacion';
import { estadoInicial, leerEstadoListado, tamanoPorDefecto } from '@/components/kit/listadoUrl';
import { TAMANOS_PAGINA_FACTURAS } from '@/lib/finanzas/ventas/listadoFacturas';
import { TAMANOS_PAGINA_CARTERA } from '@/lib/finanzas/cartera/listadoCartera';

const SRC = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const PANTALLAS = [
  { nombre: 'facturas de venta', tamanos: TAMANOS_PAGINA_FACTURAS, constante: 'TAMANOS_PAGINA_FACTURAS', archivo: 'components/finanzas/facturas-venta/listado/ListadoFacturasVenta.tsx' },
  { nombre: 'cuentas por cobrar', tamanos: TAMANOS_PAGINA_CARTERA, constante: 'TAMANOS_PAGINA_CARTERA', archivo: 'components/finanzas/cuentas-por-cobrar/listado/ListadoCartera.tsx' },
] as const;

describe('el bug: 25 sin tamaños permitidos cae a 10', () => {
  test('el kit no admite 25 por sí solo (por eso hace falta la lista de la pantalla)', () => {
    expect(TAMANOS_PAGINA).not.toContain(25);
    expect(tamanoPorDefecto({ tamanoPorDefecto: 25 })).toBe(10);
  });
});

describe.each(PANTALLAS)('listado de $nombre', ({ tamanos, constante, archivo }) => {
  const config = { tamanoPorDefecto: 25, tamanosPermitidos: tamanos };

  test('con sus tamaños permitidos, el tamaño por defecto es 25', () => {
    expect(tamanos).toContain(25);
    expect(tamanoPorDefecto(config)).toBe(25);
    expect(estadoInicial(config).tamano).toBe(25);
  });

  test('la URL solo acepta los tamaños de la lista; uno ajeno vuelve a 25', () => {
    expect(leerEstadoListado(new URLSearchParams('tamano=50'), config).tamano).toBe(50);
    expect(leerEstadoListado(new URLSearchParams('tamano=10'), config).tamano).toBe(25);
    expect(leerEstadoListado(new URLSearchParams('tamano=5000'), config).tamano).toBe(25);
  });

  test('ningún tamaño supera el tope de la ruta (200)', () => {
    expect(Math.max(...tamanos)).toBeLessThanOrEqual(200);
  });

  test('la pantalla pasa la lista a useListadoServidor y a Pagination', () => {
    const fuente = leer(archivo);
    expect(fuente).toContain('tamanoPorDefecto: 25');
    expect(fuente).toContain(`tamanosPermitidos: ${constante}`);
    expect(fuente).toContain(`opcionesTamano={${constante}}`);
  });
});
