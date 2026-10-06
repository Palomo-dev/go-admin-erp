/**
 * @jest-environment jsdom
 *
 * Render de lo nuevo de productos por peso fuera del mostrador
 * (PRODUCTOS-POR-PESO-BASCULA.md §10), con los textos reales en 4 idiomas:
 * «Pesar» en «Agregar productos» de la mesa (cada pesada es su propia línea),
 * el traslado con decimales, la tarjeta del plato «500 g», la franja
 * «Pesando…» de la pantalla del cliente, la comanda del KDS y el reporte
 * «Pesos manuales».
 *
 * Datos inventados: organización 120.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({}), rpc: jest.fn() } }));
jest.mock('@/lib/supabase/imageUtils', () => ({ getPublicUrl: (p: string) => `https://img/${p}` }));
jest.mock('next/image', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/hooks/useOrgCurrency', () => {
  const { contextoMoneda, crearFormateadorMoneda } = jest.requireActual('@/lib/utils/moneda') as typeof import('@/lib/utils/moneda');
  const ctx = contextoMoneda('COP', { decimals: 0, locale: 'es-CO' });
  const valor = { ...ctx, resuelta: true, formatear: crearFormateadorMoneda(ctx), paraDocumento: () => ctx };
  return { useMonedaOrganizacion: () => valor };
});
jest.mock('@/lib/pos/peso/usePesajeContexto', () => ({
  usePesajeContexto: () => ({ manual: 'permiso', puedePesarAMano: true, pesoEnPantallaCliente: true, cargando: false }),
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branchFilter: 7, branches: [{ id: 7, name: 'Centro' }] }) }));
jest.mock('@/components/pos/configuracion/configuracionService', () => ({
  ConfiguracionService: { getCategoriesDisplayConfig: jest.fn(async () => ({ mode: 'chips', orderBy: 'rank' })) },
  defaultCategoriesDisplayConfig: { mode: 'chips', orderBy: 'rank' },
}));
jest.mock('@/components/pos/CategoryFilterBar', () => ({ CategoryFilterBar: () => null }));
jest.mock('@/components/shared/RichTextEditor', () => ({ RichTextEditor: () => null }));
jest.mock('@/lib/services/recipeService', () => ({ recipeService: { getRecipeById: jest.fn() } }));
jest.mock('@/components/pos/VariantSelectorDialog', () => ({ VariantSelectorDialog: () => null }));
const QUESO = {
  id: 31,
  organization_id: 120,
  sku: 'QUE-1',
  name: 'Queso campesino',
  description: null,
  category_id: null,
  status: 'active',
  is_parent: false,
  variant_data: null,
  price: 18900,
  sale_mode: 'weight',
  qty_decimals: 3,
  unit_code: 'KG  ',
  track_stock: false,
};
const GASEOSA = { ...QUESO, id: 5, sku: 'GAS', name: 'Gaseosa', barcode: '7701234567890', price: 3000, sale_mode: 'unit', qty_decimals: 0, unit_code: 'UN  ' };
jest.mock('@/lib/services/posService', () => ({
  POSService: {
    getProductsPaginated: jest.fn(async ({ search }: { search?: string }) => ({
      data: search === '7701234567890' ? [GASEOSA] : [QUESO],
      total: 1,
      page: 1,
      limit: 200,
      totalPages: 1,
    })),
    getProductByBarcode: jest.fn(async (c: string) => (c === '7701234567890' ? GASEOSA : null)),
    getProductByScalePlu: jest.fn(async (plu: number) => (plu === 31 ? QUESO : null)),
    precioVigenteProducto: jest.fn(async () => 18900),
    getCategories: jest.fn(async () => []),
    toggleProductFavorite: jest.fn(),
  },
}));
jest.mock('@/lib/pos/bascula/useBasculaDelEquipo', () => ({ useBasculaDelEquipo: () => ({ config: null, cargando: false, recargar: jest.fn() }) }));
jest.mock('@/lib/pos/useFormatoEtiquetaPeso', () => ({
  useFormatoEtiquetaPeso: () => ({ activo: true, prefijos: ['27'], contenido: 'weight', digitosPlu: 5, digitosValor: 5, digitoControlValor: false }),
}));
jest.mock('@/components/pos/mesas/mesasService', () => ({
  MesasService: { obtenerMesasConSesiones: jest.fn(async () => [{ id: 'mesa-2', name: 'Mesa 2', zone: null, state: 'occupied' }]) },
}));

import { AddProductDialog } from '@/components/pos/mesas/id/AddProductDialog';
import { TransferItemDialog } from '@/components/pos/mesas/id/TransferItemDialog';
import { OrderItemCard } from '@/components/pos/mesas/id/OrderItemCard';
import type { SaleItem } from '@/components/pos/mesas/id/types';
import { WeighingBanner } from '@/components/pos-display/WeighingBanner';
import { textoCantidadComanda } from '@/components/pos/comandas/TicketCard';
import { VistaPesosManuales, restarDias } from '@/components/pos/reportes/PesosManualesPage';
import { aReporte } from '@/components/pos/reportes/pesosManualesService';
import { buildDisplayWeighing } from '@/lib/pos/display/weighing';
import { FORMATO_ETIQUETA_RECOMENDADO, construirEtiquetaPeso } from '@/lib/pos/etiquetaPeso';

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const txt = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ');

describe('mesas: «Pesar» en «Agregar productos»', () => {
  it('abre «Pesar», cada pesada es su propia línea y el chip muestra «735 g»', async () => {
    const onAdd = jest.fn(async () => undefined);
    renderConIdioma(<AddProductDialog open onOpenChange={jest.fn()} onAddProducts={onAdd} />);
    fireEvent.click(await screen.findByText('Queso campesino'));
    const campo = await screen.findByRole('textbox', { name: /Peso en kg/i });
    fireEvent.change(campo, { target: { value: '0,735' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await screen.findByRole('button', { name: 'Cambiar el peso de Queso campesino' });
    expect(txt(screen.getByRole('button', { name: 'Cambiar el peso de Queso campesino' }).textContent)).toContain('735 g');

    // Segunda pesada del mismo producto: otra línea, no se suma a la primera.
    fireEvent.click(screen.getAllByText('Queso campesino')[0]);
    const campo2 = await screen.findByRole('textbox', { name: /Peso en kg/i });
    fireEvent.change(campo2, { target: { value: '0,5' } });
    fireEvent.keyDown(campo2, { key: 'Enter' });
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Cambiar el peso de Queso campesino' })).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /Agregar al Pedido/ }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const [lineas] = onAdd.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
    expect(lineas).toHaveLength(2);
    expect(lineas.map((l) => l.quantity)).toEqual([0.735, 0.5]);
    expect(lineas[0]).toMatchObject({ product_id: 31, unit_price: 18900, sale_mode: 'weight', pesaje: { origen: 'manual', neto: 0.735, unidad: 'KG' } });
  });
});

describe('mesas: código de barras directo a la mesa', () => {
  it('código escrito + Enter: producto por unidad y etiqueta de balanza entran sin tocar la tarjeta', async () => {
    const onAdd = jest.fn(async () => undefined);
    renderConIdioma(<AddProductDialog open onOpenChange={jest.fn()} onAddProducts={onAdd} />);
    await screen.findByText('Queso campesino');
    const buscador = screen.getByRole('searchbox');
    fireEvent.change(buscador, { target: { value: '7701234567890' } });
    fireEvent.keyDown(buscador, { key: 'Enter' });
    await waitFor(() => expect(screen.getAllByText('Gaseosa').length).toBeGreaterThan(0));

    const etiqueta = construirEtiquetaPeso(FORMATO_ETIQUETA_RECOMENDADO, '27', 31, 735);
    fireEvent.change(buscador, { target: { value: etiqueta } });
    fireEvent.keyDown(buscador, { key: 'Enter' });
    await screen.findByRole('button', { name: 'Cambiar el peso de Queso campesino' });

    fireEvent.click(screen.getByRole('button', { name: /Agregar al Pedido/ }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const [lineas] = onAdd.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
    expect(lineas.map((l) => [l.product_id, l.quantity])).toEqual([[5, 1], [31, 0.735]]);
    expect(lineas[1]).toMatchObject({ unit_price: 18900, pesaje: { origen: 'etiqueta', neto: 0.735, codigo_etiqueta: etiqueta } });
  });
});

describe('mesas: lector con «Pesar» abierto', () => {
  it('otro producto cancela la pesada pendiente (nunca la confirma) y entra directo', async () => {
    renderConIdioma(<AddProductDialog open onOpenChange={jest.fn()} onAddProducts={jest.fn()} />);
    fireEvent.click(await screen.findByText('Queso campesino'));
    await screen.findByRole('textbox', { name: /Peso en kg/i });
    await act(async () => {
      for (const key of [...'7701234567890'.split(''), 'Enter']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      }
    });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /Peso en kg/i })).toBeNull());
    await waitFor(() => expect(screen.getAllByText('Gaseosa').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Cambiar el peso de Queso campesino' })).toBeNull();
  });
});

const PESADA = {
  id: 'si-1',
  sale_id: 's-1',
  product_id: 31,
  quantity: 0.735,
  unit_price: 18900,
  total: 13891.5,
  tax_amount: 0,
  discount_amount: 0,
  notes: { product_name: 'Queso campesino' },
  created_at: '2026-09-29T17:00:00Z',
  updated_at: '2026-09-29T17:00:00Z',
  product: { ...QUESO },
} as unknown as SaleItem;

describe('mesas: traslado y tarjeta del plato con decimales', () => {
  it('traslada 0,25 kg de 735 g (antes parseInt lo volvía 1)', async () => {
    const onTransfer = jest.fn(async () => undefined);
    renderConIdioma(<TransferItemDialog open onOpenChange={jest.fn()} item={PESADA} currentTableId="mesa-1" onTransfer={onTransfer} />);
    await act(async () => undefined); // carga de mesas
    expect(txt(screen.getByText(/Cantidad disponible/).textContent)).toContain('735 g');
    const campo = screen.getByLabelText('Cantidad a Transferir');
    fireEvent.change(campo, { target: { value: '0,9' } });
    expect(screen.getByText(/no puede ser mayor/)).toBeTruthy();
    fireEvent.change(campo, { target: { value: '0,25' } });
    expect(txt(screen.getByText(/Se transferirán/).textContent)).toBe('Se transferirán 250 g de 735 g');
  });

  it('la tarjeta del plato dice «735 g» y el precio por kg', () => {
    renderConIdioma(<OrderItemCard item={PESADA} onUpdateQuantity={jest.fn()} onDelete={jest.fn()} />);
    expect(txt(screen.getByText(/Cant:/).textContent)).toBe('Cant: 735 g');
    expect(txt(screen.getByText(/\/ kg/).textContent)).toBe('$ 18.900 / kg');
  });
});

describe('pantalla del cliente: «Pesando…»', () => {
  const w = buildDisplayWeighing({ name: 'Queso campesino', qty: 0.735, unit: 'kg', decimals: 3, unitPrice: 18900, moneyDecimals: 0 })!;
  const esperado: Record<IdiomaPrueba, string> = {
    es: 'Pesando: 735 g × $ 18.900 / kg = $ 13.892',
    en: 'Weighing: 735 g × COP 18,900 / kg = COP 13,892',
    fr: 'Pesée : 735 g × 18 900 $CO / kg = 13 892 $CO',
    pt: 'Pesando: 735 g × COP 18.900 / kg = COP 13.892',
  };
  const LOCALES: Record<IdiomaPrueba, string> = { es: 'es-CO', en: 'en-US', fr: 'fr-FR', pt: 'pt-BR' };
  it.each(IDIOMAS)('franja en %s', (idioma: IdiomaPrueba) => {
    renderConIdioma(<WeighingBanner weighing={w} currency="COP" locale={LOCALES[idioma]} />, { idioma });
    const franja = document.querySelector('[data-weighing="franja"]');
    expect(txt(franja?.textContent)).toBe(`Queso campesino · ${esperado[idioma]}`);
  });

  it('sin carrito, vista completa; sin peso todavía, solo el precio', () => {
    renderConIdioma(<WeighingBanner weighing={{ ...w, qty: null, total: 0 }} currency="COP" locale="es-CO" completa />);
    expect(txt(document.querySelector('[data-weighing="completa"]')?.textContent)).toContain('Pesando… $ 18.900 / kg');
  });
});

describe('comanda del KDS', () => {
  it('«500 g» en un producto por peso y «2x» en los demás', () => {
    expect(textoCantidadComanda(0.5, { sale_mode: 'weight', qty_decimals: 3, unit_code: 'KG' }, 'es')).toBe('500 g');
    expect(textoCantidadComanda(2, { sale_mode: 'unit' }, 'es')).toBe('2x');
    expect(textoCantidadComanda(0.5, null, 'es')).toBe('0,5x');
  });
});

describe('reporte «Pesos manuales» en 4 idiomas', () => {
  const reporte = aReporte({
    filas: [{ dia: '2026-09-29', usuario_id: 'u1', cajero: 'Cajera A', unidad: 'KG', lineas: 2, cantidad: 1.235, importe: 23341.5, autorizadas: 1 }],
  });
  const cabeceras: Record<IdiomaPrueba, string[]> = {
    es: ['Día', 'Cajero', 'Líneas', 'Peso', 'Importe', 'Con supervisor'],
    en: ['Day', 'Cashier', 'Lines', 'Weight', 'Amount', 'With supervisor'],
    fr: ['Jour', 'Caissier', 'Lignes', 'Poids', 'Montant', 'Avec superviseur'],
    pt: ['Dia', 'Caixa', 'Linhas', 'Peso', 'Valor', 'Com supervisor'],
  };
  it.each(IDIOMAS)('tabla por día y cajero en %s', (idioma: IdiomaPrueba) => {
    renderConIdioma(
      <VistaPesosManuales estado="listo" reporte={reporte} formatearMoneda={(n) => `$${n}`} formatearDia={(d) => `día:${d}`} />,
      { idioma },
    );
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual(cabeceras[idioma]);
    expect(screen.getByText('día:2026-09-29')).toBeTruthy();
    expect(screen.getByText('Cajera A')).toBeTruthy();
    expect(screen.getAllByText('$23341.5').length).toBeGreaterThan(0);
  });

  it('sin permiso, vacío y error', async () => {
    const { rerender } = renderConIdioma(<VistaPesosManuales estado="sinPermiso" reporte={null} formatearMoneda={String} formatearDia={String} />);
    expect(screen.getByText('Sin permiso')).toBeTruthy();
    const onReintentar = jest.fn();
    await act(async () => {
      rerender(<VistaPesosManuales estado="error" reporte={null} formatearMoneda={String} formatearDia={String} onReintentar={onReintentar} />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalled();
    await act(async () => {
      rerender(<VistaPesosManuales estado="listo" reporte={aReporte({ filas: [] })} formatearMoneda={String} formatearDia={String} />);
    });
    expect(screen.getByText('Sin pesos manuales')).toBeTruthy();
  });

  it('el período por defecto se calcula sobre el día calendario, sin zona horaria', () => {
    expect(restarDias('2026-09-29', 6)).toBe('2026-09-23');
    expect(restarDias('2026-03-02', 6)).toBe('2026-02-24');
    expect(restarDias('2026-01-03', 6)).toBe('2025-12-28');
  });
});
