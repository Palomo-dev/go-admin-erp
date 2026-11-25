/**
 * @jest-environment jsdom
 *
 * Fallo del dueño (2026-11-25, celular de ~390 px, detalle de una factura de
 * venta de la tienda web): con un nombre largo, el enlace del producto se
 * montaba encima del total de la línea, la tarjeta se salía del ancho y la
 * pantalla quedaba con scroll horizontal.
 *
 * Causa: el nombre iba en una sola línea (`truncate`, que es `nowrap`) dentro
 * de un enlace `inline-flex` sin tope de ancho. El ancho mínimo de un texto
 * `nowrap` es el texto entero, así que el enlace medía todo el nombre aunque
 * su columna fuera más angosta, y se desbordaba sobre el total.
 *
 * jsdom no calcula el layout: la prueba fija las clases que lo impiden en la
 * pieza compartida `NombreLinea` y en las tres listas que la usan (líneas de
 * documento, pedido en línea y devolución).
 */
import { screen, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { DocumentoLineas } from '../documento/DocumentoLineas';
import { NombreLinea } from '../documento/NombreLinea';
import type { LineaDocumento } from '../documento/documentoLineasLogica';

jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (n: number) => `$ ${n}` }),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: null }) }));

import { OrderItemsList } from '@/components/pos/pedidos-online/OrderItemsList';
import { EnlaceFichaProducto } from '@/components/inventario/productos/EnlaceFichaProducto';
import type { WebOrderItem } from '@/lib/services/webOrdersService';

const NOMBRE_LARGO = 'Protector Sofá Grueso Forro 3 Puestos Doble Faz Antideslizante Impermeable Edición Especial';

const LINEA: LineaDocumento = {
  id: 'l-1',
  descripcion: NOMBRE_LARGO,
  sku: 'PRT-3P-DF',
  enlace: '/app/inventario/productos/42',
  cantidad: 1,
  precioUnitario: 14900,
  descuento: 2772,
  total: 12128,
};

const clases = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);

beforeEach(() => simularAncho(390));

describe('NombreLinea · nombre largo', () => {
  test('envolver: hasta 3 líneas, parte palabras largas, el enlace no pasa de su columna y el ↗ va en el flujo', () => {
    renderConIdioma(<NombreLinea nombre={NOMBRE_LARGO} href="/app/inventario/productos/42" ajuste="envolver" />);
    const enlace = screen.getByRole('link', { name: NOMBRE_LARGO });
    expect(clases(enlace)).toEqual(expect.arrayContaining(['inline-flex', 'min-w-0', 'max-w-full', 'items-start']));
    // Título completo al pasar el puntero o mantener presionado.
    expect(enlace.getAttribute('title')).toBe(NOMBRE_LARGO);
    const texto = within(enlace).getByText(NOMBRE_LARGO);
    expect(clases(texto)).toEqual(expect.arrayContaining(['min-w-0', 'line-clamp-3', 'break-words', '[overflow-wrap:anywhere]']));
    expect(clases(texto)).not.toContain('truncate');
    const icono = enlace.querySelector('svg');
    expect(icono).not.toBeNull();
    expect(clases(icono as Element)).toContain('shrink-0');
    expect(icono?.parentElement).toBe(enlace);
  });

  test('truncar (tabla de computador): una línea con «…», como antes', () => {
    renderConIdioma(<NombreLinea nombre={NOMBRE_LARGO} href="/x" />);
    const texto = within(screen.getByRole('link')).getByText(NOMBRE_LARGO);
    expect(clases(texto)).toContain('truncate');
    expect(clases(texto)).not.toContain('line-clamp-3');
  });
});

describe('DocumentoLineas · tarjeta de celular con nombre largo (factura, nota, cotización, venta)', () => {
  test('el nombre envuelve, la columna del producto cede y el total no se parte ni se monta', () => {
    const { container } = renderConIdioma(<DocumentoLineas lineas={[LINEA]} modo="lectura" moneda="COP" />);
    const tarjetas = container.querySelector('ul');
    expect(tarjetas).not.toBeNull();
    const enlace = within(tarjetas as HTMLElement).getByRole('link', { name: NOMBRE_LARGO });
    expect(clases(enlace)).toEqual(expect.arrayContaining(['max-w-full', 'min-w-0', 'self-start']));
    expect(clases(within(enlace).getByText(NOMBRE_LARGO))).toEqual(expect.arrayContaining(['line-clamp-3', '[overflow-wrap:anywhere]']));

    // Columna del producto: ocupa lo que deja el total y puede encogerse.
    const columna = enlace.parentElement as HTMLElement;
    expect(clases(columna)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1']));
    // Fila: nombre a la izquierda, total a la derecha, sin desbordar.
    const fila = columna.parentElement as HTMLElement;
    expect(clases(fila)).toEqual(expect.arrayContaining(['flex', 'min-w-0', 'justify-between']));
    const total = fila.lastElementChild as HTMLElement;
    expect(total).not.toBe(columna);
    expect(clases(total)).toEqual(expect.arrayContaining(['shrink-0', 'whitespace-nowrap', 'text-right']));
    // La tarjeta tampoco se ensancha.
    expect(clases(fila.parentElement as HTMLElement)).toContain('min-w-0');
  });

  test('la tabla de computador sigue igual: el nombre en una línea con «…»', () => {
    const { container } = renderConIdioma(<DocumentoLineas lineas={[LINEA]} modo="lectura" moneda="COP" />);
    const tabla = container.querySelector('table');
    expect(tabla).not.toBeNull();
    const enlace = within(tabla as HTMLElement).getByRole('link', { name: NOMBRE_LARGO });
    expect(clases(within(enlace).getByText(NOMBRE_LARGO))).toContain('truncate');
  });
});

describe('Pedido en línea y devolución · nombre largo', () => {
  const item: WebOrderItem = {
    id: 'i-1',
    web_order_id: 'w-1',
    product_id: 42,
    product_name: NOMBRE_LARGO,
    product_sku: 'PRT-3P-DF',
    quantity: 1,
    unit_price: 14900,
    tax_amount: 0,
    discount_amount: 0,
    total: 14900,
    status: 'pending',
    created_at: '2026-11-25T15:54:00-05:00',
  };

  test('detalle del pedido: envuelve en el celular y trunca desde lg; los importes no se parten', () => {
    renderConIdioma(<OrderItemsList items={[item]} showStatus productos={new Map([[42, { id: 42, status: 'active' }]])} />);
    const enlace = screen.getByRole('link', { name: NOMBRE_LARGO });
    expect(clases(enlace)).toContain('max-w-full');
    expect(clases(within(enlace).getByText(NOMBRE_LARGO))).toEqual(
      expect.arrayContaining(['max-lg:line-clamp-3', 'max-lg:[overflow-wrap:anywhere]', 'lg:truncate']),
    );
    const importes = screen.getByText('$ 14900', { selector: 'p.font-semibold' }).parentElement as HTMLElement;
    expect(clases(importes)).toEqual(expect.arrayContaining(['shrink-0', 'whitespace-nowrap', 'text-right']));
  });

  test('EnlaceFichaProducto conserva su título «Abrir ficha» y acepta el ajuste', () => {
    renderConIdioma(<EnlaceFichaProducto nombre={NOMBRE_LARGO} enlace={{ tipo: 'enlace', href: '/app/inventario/productos/42' }} ajuste="envolver" />);
    const enlace = screen.getByRole('link', { name: NOMBRE_LARGO });
    expect(enlace.getAttribute('title')).toBeTruthy();
    expect(enlace.getAttribute('title')).not.toBe(NOMBRE_LARGO);
    expect(clases(within(enlace).getByText(NOMBRE_LARGO))).toContain('line-clamp-3');
  });
});
