/**
 * Venta por peso en gramos, kilos y libras (PRODUCTOS-POR-PESO-BASCULA.md).
 *
 * Estándar de los POS de pesaje: el producto guarda la cantidad en su unidad de
 * inventario (GR gramos enteros, KG y LB con 3 decimales) y el precio por esa
 * unidad; la báscula lee en kg o lb y se convierte con UNA función
 * (`@printing/peso`, espejo de `fn_peso_convertir`). Carrito, ticket y pantalla
 * del cliente muestran el peso legible («735 g», «1,250 kg») y el precio por kg.
 *
 * Datos inventados: organización 120, productos genéricos.
 */
import {
  GRAMOS_POR_UNIDAD,
  convertirPeso,
  pesoEnUnidad,
  pesoLegible,
  precioVisiblePeso,
  unidadPeso,
} from '@printing/peso';
import { buildPlainTextSaleTicket, getPaperSpec, itemsSummary, linePriceDetail, moneyFormatter, type SaleTicketPrintPayload } from '@printing';
import {
  UNIDADES_PESO,
  camposCantidadImpresa,
  decimalesCantidad,
  formatoCantidad,
  precioPorUnidadVisible,
  validarPesada,
} from '@/lib/pos/peso';
import {
  esReferenciaKilo,
  factorReferencia,
  precioEnReferencia,
  precioPorUnidadDesdeReferencia,
  referenciaDelProducto,
  referenciasPermitidas,
} from '@/lib/pos/peso/precioReferencia';
import { entradaParaProducto, pesajeBascula, vistaLectura } from '@/lib/pos/bascula/pesada';
import type { EstadoLector } from '@/lib/pos/bascula/lector';
import type { ConfigBascula } from '@/lib/pos/bascula/tipos';
import { lineaDesdeEtiqueta } from '@/lib/pos/etiquetaPeso';
import { projectCartForDisplay } from '@/lib/pos/display/projection';
import { formatWeighingQty, weighingVisiblePrice } from '@/lib/pos/display/weighing';
import { sanitizeDisplayLine } from '@/components/pos-display/logic';
import { aProductoTarjeta } from '@/lib/pos/venta/catalogoGrilla';
import type { PosGridProduct } from '@/lib/pos/venta/catalogo';
import type { Cart } from '@/components/pos/types';
import { referenciaComoTexto, unidadParaModo } from '@/components/inventario/productos/logica/formularioProducto';

// Productos genéricos: la org 120 vende en las tres unidades.
const PECHUGA_G = { id: 1, name: 'Pechuga por kilo', sale_mode: 'weight', qty_decimals: 0, unit_code: 'GR  ', price_ref_qty: 1000, price_ref_unit_code: 'GR' };
const QUESO_KG = { id: 2, name: 'Queso campesino', sale_mode: 'weight', qty_decimals: 3, unit_code: 'KG  ' };
const CARNE_LB = { id: 3, name: 'Carne molida', sale_mode: 'weight', qty_decimals: 3, unit_code: 'LB  ' };

const money = moneyFormatter({ currency: 'COP', locale: 'es-CO', currencyDecimals: 0 }, { symbol: true });

describe('conversión única de peso', () => {
  test('1 kg = 1000 g y 1 lb = 453,59237 g, en cualquier dirección', () => {
    expect(GRAMOS_POR_UNIDAD).toMatchObject({ GR: 1, KG: 1000, LB: 453.59237 });
    expect(convertirPeso(0.735, 'KG', 'GR')).toBeCloseTo(735, 9);
    expect(convertirPeso(1250, 'GR  ', 'kg')).toBeCloseTo(1.25, 9);
    expect(convertirPeso(1, 'LB', 'GR')).toBeCloseTo(453.59237, 9);
    expect(convertirPeso(1, 'KG', 'UN')).toBeNull();
    expect(unidadPeso('g')).toBe('GR');
    expect(unidadPeso('MT')).toBeNull();
  });

  test('a la unidad del producto, redondeado a sus decimales', () => {
    expect(pesoEnUnidad(0.735, 'KG', 'GR')).toBe(735);
    expect(pesoEnUnidad(0.7355, 'KG', 'GR')).toBe(736);
    expect(pesoEnUnidad(735, 'GR', 'KG')).toBe(0.735);
    expect(pesoEnUnidad(0.68039, 'KG', 'LB')).toBe(1.5);
  });

  test('peso legible: menos de 1 kg en g, desde 1 kg en kg, libras en lb', () => {
    expect(pesoLegible(735, 'GR')).toBe('735 g');
    expect(pesoLegible(0.735, 'KG')).toBe('735 g');
    expect(pesoLegible(1250, 'GR')).toBe('1,250 kg');
    expect(pesoLegible(1.25, 'KG')).toBe('1,250 kg');
    expect(pesoLegible(1.5, 'LB')).toBe('1,500 lb');
    expect(pesoLegible(1250, 'GR', 'en-US')).toBe('1.250 kg');
    expect(pesoLegible(2, 'MT')).toBeNull();
  });

  test('precio visible por kg (por lb en libras)', () => {
    expect(precioVisiblePeso(12, 'GR')).toEqual({ precio: 12000, unidad: 'kg' });
    expect(precioVisiblePeso(12.5, 'GR')).toEqual({ precio: 12500, unidad: 'kg' });
    expect(precioVisiblePeso(18900, 'KG')).toEqual({ precio: 18900, unidad: 'kg' });
    expect(precioVisiblePeso(12000, 'LB')).toEqual({ precio: 12000, unidad: 'lb' });
  });
});

describe('modo de venta en gramos', () => {
  test('GR es unidad de venta por peso, con gramos enteros', () => {
    expect(UNIDADES_PESO).toEqual(expect.arrayContaining(['GR', 'KG', 'LB']));
    expect(decimalesCantidad(PECHUGA_G)).toBe(0);
    expect(decimalesCantidad(QUESO_KG)).toBe(3);
    expect(decimalesCantidad(CARNE_LB)).toBe(3);
    // GR por unidad sigue siendo una unidad entera, como siempre.
    expect(decimalesCantidad({ sale_mode: 'unit', unit_code: 'GR' })).toBe(0);
  });

  test('formato y precio visible de la línea', () => {
    expect(formatoCantidad(735, PECHUGA_G)).toBe('735 g');
    expect(formatoCantidad(1250, PECHUGA_G)).toBe('1,250 kg');
    expect(formatoCantidad(0.735, QUESO_KG)).toBe('735 g');
    expect(formatoCantidad(1.5, CARNE_LB)).toBe('1,500 lb');
    expect(precioPorUnidadVisible(PECHUGA_G, 12)).toEqual({ precio: 12000, unidad: 'kg' });
    expect(precioPorUnidadVisible({ sale_mode: 'unit', unit_code: 'GR' }, 12)).toBeNull();
  });

  test('una pesada en gramos no admite fracciones de gramo', () => {
    expect(validarPesada({ producto: PECHUGA_G, cantidad: 735, origen: 'manual', permisoPesoManual: true })).toEqual({ ok: true, cantidad: 735 });
    expect(validarPesada({ producto: PECHUGA_G, cantidad: 735.5, origen: 'manual', permisoPesoManual: true })).toMatchObject({
      ok: false,
      error: 'demasiados_decimales',
    });
  });

  test('importe: 735 g × $ 12/g = $ 8.820, igual que 0,735 kg × $ 12.000/kg', () => {
    expect(735 * 12).toBe(8820);
    expect(Math.round(0.735 * 12000)).toBe(8820);
  });
});

describe('precio escrito por kg y guardado por gramo', () => {
  test('referencias en gramos: por kg (1000 g), 500, 250 y 100 g', () => {
    expect(referenciasPermitidas('GR')).toEqual([
      { cantidad: 1000, unidad: 'GR' },
      { cantidad: 500, unidad: 'GR' },
      { cantidad: 250, unidad: 'GR' },
      { cantidad: 100, unidad: 'GR' },
    ]);
    expect(esReferenciaKilo({ cantidad: 1000, unidad: 'GR' })).toBe(true);
    expect(esReferenciaKilo({ cantidad: 1, unidad: 'KG' })).toBe(true);
    expect(factorReferencia({ cantidad: 100, unidad: 'GR' }, 'KG')).toBeCloseTo(0.1, 9);
    expect(referenciaDelProducto({ unit_code: 'GR', price_ref_qty: null, price_ref_unit_code: null })).toEqual({ cantidad: 1000, unidad: 'GR' });
  });

  test('$ 12.000 por kg se guarda como $ 12/g, con centavos aunque la moneda no los use', () => {
    const kilo = { cantidad: 1000, unidad: 'GR' };
    expect(precioPorUnidadDesdeReferencia(12000, kilo, 'GR', 0)).toBe(12);
    expect(precioPorUnidadDesdeReferencia(12500, kilo, 'GR', 0)).toBe(12.5);
    expect(precioPorUnidadDesdeReferencia(1250, { cantidad: 100, unidad: 'GR' }, 'GR', 0)).toBe(12.5);
    expect(precioEnReferencia(12.5, kilo, 'GR', 0)).toBe(12500);
    // KG sigue igual: cada 100 g → por kg.
    expect(precioPorUnidadDesdeReferencia(1890, { cantidad: 100, unidad: 'GR' }, 'KG', 0)).toBe(18900);
  });

  test('el formulario abre un producto en gramos con el precio «por kg»', () => {
    expect(unidadParaModo('weight', 'GR')).toBe('GR');
    expect(referenciaComoTexto({ price_ref_qty: 1000, price_ref_unit_code: 'GR' })).toBe('1000GR');
  });
});

describe('báscula en kg, producto en gramos o en libras', () => {
  const BASCULA: ConfigBascula = {
    id: '6b0e1c8e-8a52-4f4e-9a38-2f1a3c9d7e11',
    nombre: 'Mostrador',
    transporte: 'web_serial',
    protocolo: 'continuous_st_gs',
    dispositivo: null,
    baudios: 9600,
    bitsDatos: 8,
    paridad: 'none',
    bitsParada: 1,
    unidad: 'KG',
    decimales: 3,
    capacidad: 15,
    division: 0.005,
    estableMs: 500,
  };
  const leyendo = (peso: number): EstadoLector =>
    ({
      fase: 'leyendo',
      error: null,
      lectura: { neto: peso, bruto: peso, tara: null, unidad: 'KG', estable: true, estado: 'ok', netoDeBascula: false },
      peso,
      unidad: 'KG',
      estable: true,
    }) as unknown as EstadoLector;

  test('0,735 kg en la báscula son 735 g en un producto en gramos', () => {
    const vista = vistaLectura(entradaParaProducto({ lector: leyendo(0.735), producto: PECHUGA_G as never, config: BASCULA, tara: 0 }));
    expect(vista).toMatchObject({ estado: 'estable', neto: 735, puedeAgregar: true });
    const pesaje = pesajeBascula({ basculaId: BASCULA.id, vista, unidadProducto: 'GR' });
    expect(pesaje).toMatchObject({ origen: 'bascula', neto: 735, unidad: 'GR', estable: true });
  });

  test('0,735 kg en un producto por kg siguen siendo 0,735 kg; 0,68039 kg son 1,500 lb', () => {
    expect(vistaLectura(entradaParaProducto({ lector: leyendo(0.735), producto: QUESO_KG as never, config: BASCULA, tara: 0 })).neto).toBe(0.735);
    expect(vistaLectura(entradaParaProducto({ lector: leyendo(0.68039), producto: CARNE_LB as never, config: BASCULA, tara: 0 })).neto).toBe(1.5);
  });

  test('la tara en gramos se resta en gramos', () => {
    const vista = vistaLectura(entradaParaProducto({ lector: leyendo(0.755), producto: PECHUGA_G as never, config: BASCULA, tara: 20 }));
    expect(vista).toMatchObject({ bruto: 755, tara: 20, neto: 735 });
  });
});

describe('etiqueta de balanza con peso embebido', () => {
  const etiqueta = { codigo: '2000010007354', prefijo: '20', plu: 1, contenido: 'weight' as const, valor: 735 };
  test('735 g de la etiqueta: 735 en un producto en gramos, 0,735 en uno por kg', () => {
    expect(lineaDesdeEtiqueta({ etiqueta, producto: PECHUGA_G, precioPorUnidad: 12 })).toMatchObject({ ok: true, cantidad: 735 });
    expect(lineaDesdeEtiqueta({ etiqueta, producto: QUESO_KG, precioPorUnidad: 18900 })).toMatchObject({ ok: true, cantidad: 0.735 });
  });
});

describe('ticket', () => {
  test('los tres en el detalle: peso legible y precio por kg (o lb)', () => {
    expect(camposCantidadImpresa(PECHUGA_G)).toEqual({ unit: 'g', qtyDecimals: 0 });
    expect(linePriceDetail({ quantity: 735, ...camposCantidadImpresa(PECHUGA_G), unitPrice: 12 }, money)).toBe('735 g x $ 12.000/kg');
    expect(linePriceDetail({ quantity: 1250, ...camposCantidadImpresa(PECHUGA_G), unitPrice: 12 }, money)).toBe('1,250 kg x $ 12.000/kg');
    expect(linePriceDetail({ quantity: 1.25, ...camposCantidadImpresa(QUESO_KG), unitPrice: 10000 }, money)).toBe('1,250 kg x $ 10.000/kg');
    expect(linePriceDetail({ quantity: 1.5, ...camposCantidadImpresa(CARNE_LB), unitPrice: 12000 }, money)).toBe('1,500 lb x $ 12.000/lb');
  });

  test('el resumen suma gramos y kilos juntos', () => {
    expect(itemsSummary([{ quantity: 735, unit: 'g', qtyDecimals: 0 }, { quantity: 0.5, unit: 'kg', qtyDecimals: 3 }])).toBe('2 líneas · 1,235 kg');
  });

  test('tiquete de texto: «735 g x 12.000/kg» y el importe exacto', () => {
    const venta = {
      createdAt: '2026-10-06T15:00:00Z',
      timezone: 'America/Bogota',
      currency: 'COP',
      locale: 'es-CO',
      currencyDecimals: 0,
      items: [{ productName: 'Pechuga por kilo', quantity: 735, ...camposCantidadImpresa(PECHUGA_G), unitPrice: 12, total: 8820 }],
      subtotal: 8820,
      total: 8820,
      payments: [{ method: 'cash', amount: 8820 }],
    } as unknown as SaleTicketPrintPayload;
    const txt = buildPlainTextSaleTicket(venta, getPaperSpec('80mm'));
    expect(txt).toContain('735 g x 12.000/kg');
    expect(txt).toContain('8.820');
    expect(txt).not.toContain('735x');
  });
});

describe('pantalla del cliente', () => {
  const cart = {
    id: 'c1',
    items: [
      { id: 'l1', product_id: 1, product: PECHUGA_G, quantity: 735, unit_price: 12, total: 8820, discount_amount: 0 },
      { id: 'l2', product_id: 9, product: { id: 9, name: 'Gaseosa', sale_mode: 'unit', unit_code: 'UN' }, quantity: 2, unit_price: 2500, total: 5000 },
    ],
  } as unknown as Cart;

  test('la línea por peso lleva su unidad y se muestra «735 g»; la de unidad no cambia', () => {
    const d = projectCartForDisplay(cart, { currency: 'COP' });
    expect(d.lines[0]).toMatchObject({ qty: 735, unit: 'g', total: 8820 });
    expect(d.lines[1]).not.toHaveProperty('unit');
    expect(sanitizeDisplayLine(d.lines[0])).toMatchObject({ unit: 'g' });
    expect(formatWeighingQty({ qty: 735, unit: 'g', decimals: 0 }, 'es-CO')).toBe('735 g');
  });

  test('«Pesando…»: precio por kg aunque la pesada vaya en gramos', () => {
    expect(weighingVisiblePrice({ unitPrice: 12, unit: 'g' })).toEqual({ price: 12000, unit: 'kg' });
    expect(weighingVisiblePrice({ unitPrice: 2500, unit: 'm' })).toEqual({ price: 2500, unit: 'm' });
  });
});

describe('tarjeta del catálogo del POS', () => {
  test('en gramos: «$ 12.000 / kg» y el stock en kg (57.300 g = 57,3 kg)', () => {
    const t = aProductoTarjeta({ ...PECHUGA_G, price: 12, track_stock: true, stock_quantity: 57300 } as unknown as PosGridProduct);
    expect(t).toMatchObject({ precio: 12000, unidadVenta: 'kg', decimalesCantidad: 3, stock: { cantidad: 57.3 } });
  });
});
