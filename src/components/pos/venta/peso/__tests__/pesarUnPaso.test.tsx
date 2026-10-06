/**
 * @jest-environment jsdom
 *
 * Venta por peso en un paso en la caja (§11 de PRODUCTOS-POR-PESO-BASCULA.md):
 * con báscula y lectura estable, escanear agrega directo con «Deshacer»; el
 * mismo peso no se repite para el siguiente producto (abre «Pesar»
 * esperando); otro escaneo con «Pesar» abierto cancela la pendiente; sin
 * báscula, «Pesar» con el peso a mano de siempre.
 *
 * Datos inventados: organización 120.
 */
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { ProveedorIdioma } from '@/test-utils/renderConIdioma';
import type { Cart, Product } from '@/components/pos/types';
import type { ConfigBascula } from '@/lib/pos/bascula/tipos';
import type { EstadoLector } from '@/lib/pos/bascula/lector';

const toastMock = { success: jest.fn(), info: jest.fn(), error: jest.fn() };
jest.mock('sonner', () => ({ toast: toastMock }));
jest.mock('@/lib/hooks/useOrgCurrency', () => {
  const { contextoMoneda, crearFormateadorMoneda } = jest.requireActual('@/lib/utils/moneda') as typeof import('@/lib/utils/moneda');
  const ctx = contextoMoneda('COP', { decimals: 0, locale: 'es-CO' });
  const valor = { ...ctx, resuelta: true, formatear: crearFormateadorMoneda(ctx), paraDocumento: () => ctx };
  return { useMonedaOrganizacion: () => valor };
});
jest.mock('@/lib/pos/peso/usePesajeContexto', () => ({
  usePesajeContexto: () => ({ manual: 'permiso', puedePesarAMano: true, pesoEnPantallaCliente: false, agregarAlEstabilizar: true, cargando: false }),
}));
jest.mock('@/components/pos/venta/peso/usePesadaEnPantalla', () => ({ usePesadaEnPantalla: () => ({ publicar: jest.fn(), retirar: jest.fn() }) }));

const BASCULA: ConfigBascula = {
  id: '6b0e1c8e-8a52-4f4e-9a38-2f1a3c9d7e11',
  nombre: 'Mostrador',
  transporte: 'desktop_serial',
  protocolo: 'continuous_st_gs',
  dispositivo: 'COM3',
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
let configEquipo: ConfigBascula | null = BASCULA;
jest.mock('@/lib/pos/bascula/useBasculaDelEquipo', () => ({
  useBasculaDelEquipo: () => ({ config: configEquipo, cargando: false, recargar: jest.fn() }),
}));

let lectura: EstadoLector | null = null;
jest.mock('@/lib/pos/bascula/useLectorBascula', () => ({
  useLectorBascula: () => ({ estado: lectura, cero: jest.fn(), reintentar: jest.fn(), conectarWebSerial: jest.fn(), puedeElegirPuerto: false }),
}));

let carrito: Cart = { id: 'c1', items: [] } as unknown as Cart;
const POS = {
  precioVigenteProducto: jest.fn(async () => 18900),
  addItemToCart: jest.fn(async (_c: string, product: Product, quantity: number, _m: unknown, op?: { pesaje?: unknown }) => {
    carrito = { ...carrito, items: [...carrito.items, { id: `l${carrito.items.length + 1}`, product, quantity, pesaje: op?.pesaje }] } as unknown as Cart;
    return carrito;
  }),
  removeItemFromCart: jest.fn(async (_c: string, id: string) => {
    carrito = { ...carrito, items: carrito.items.filter((i) => i.id !== id) } as unknown as Cart;
    return carrito;
  }),
  updateCartItemPesaje: jest.fn(),
};
jest.mock('@/lib/services/posService', () => ({ POSService: POS }));

import { usePesarPos } from '@/components/pos/venta/peso/usePesarPos';

const QUESO = { id: 31, name: 'Queso campesino', price: 18900, sale_mode: 'weight', qty_decimals: 3, unit_code: 'KG  ', track_stock: false } as unknown as Product;
const JAMON = { ...QUESO, id: 32, name: 'Jamón' } as unknown as Product;

function leyendo(peso: number, estable = true): EstadoLector {
  return {
    fase: 'leyendo',
    error: null,
    lectura: { neto: peso, bruto: peso, tara: null, unidad: 'KG', estable, estado: 'ok', netoDeBascula: false },
    peso,
    unidad: 'KG',
    estable,
    ultimaLecturaMs: 0,
    crudo: new Uint8Array(0),
    tramasReconocidas: 1,
    tramasNoReconocidas: 0,
    ceroEnPos: true,
  };
}

const envoltura = ({ children }: { children: ReactNode }) => <ProveedorIdioma>{children}</ProveedorIdioma>;

function montar() {
  const actualizar = jest.fn();
  const hook = renderHook(() => usePesarPos({ cartId: 'c1', actualizar }), { wrapper: envoltura });
  const abierto = () => (hook.result.current.dialogo as { props: { abierto: boolean; producto: Product | null } }).props;
  return { hook, actualizar, abierto };
}

beforeEach(() => {
  jest.clearAllMocks();
  carrito = { id: 'c1', items: [] } as unknown as Cart;
  configEquipo = BASCULA;
  lectura = null;
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
});

describe('venta por peso en un paso', () => {
  it('lectura estable: se agrega directo con origen báscula, toast «Agregado» y «Deshacer»', async () => {
    lectura = leyendo(0.735);
    const { hook, actualizar, abierto } = montar();
    await act(async () => {
      await hook.result.current.abrirAgregar(QUESO);
    });
    expect(POS.addItemToCart).toHaveBeenCalledWith('c1', QUESO, 0.735, undefined, {
      pesaje: expect.objectContaining({ origen: 'bascula', neto: 0.735, estable: true, bascula_id: BASCULA.id }),
    });
    expect(abierto().abierto).toBe(false);
    expect(actualizar).toHaveBeenCalled();
    const [texto, opciones] = toastMock.success.mock.calls[0];
    expect(texto).toMatch(/^Agregado: 735\sg · Queso campesino · \$\s13\.892$/);
    expect(opciones.action.label).toBe('Deshacer');
    await act(async () => {
      opciones.action.onClick();
      await Promise.resolve();
    });
    expect(POS.removeItemFromCart).toHaveBeenCalledWith('c1', 'l1');
  });

  it('el peso del producto anterior no se repite: abre «Pesar» esperando un peso nuevo', async () => {
    lectura = leyendo(0.735);
    const { hook, abierto } = montar();
    await act(async () => {
      await hook.result.current.abrirAgregar(QUESO);
    });
    await act(async () => {
      await hook.result.current.abrirAgregar(JAMON);
    });
    expect(POS.addItemToCart).toHaveBeenCalledTimes(1);
    expect(abierto()).toMatchObject({ abierto: true, producto: JAMON });
    expect((hook.result.current.dialogo as { props: { agregarAlEstabilizar: boolean; lecturaNueva: boolean } }).props).toMatchObject({
      agregarAlEstabilizar: true,
      lecturaNueva: false,
    });
  });

  it('inestable: abre «Pesar» esperando; otro producto escaneado cancela la pendiente y el mismo se ignora', async () => {
    lectura = leyendo(0.74, false);
    const { hook, abierto } = montar();
    await act(async () => {
      await hook.result.current.abrirAgregar(QUESO);
    });
    expect(abierto()).toMatchObject({ abierto: true, producto: QUESO });
    await act(async () => {
      await hook.result.current.abrirAgregar(QUESO);
    });
    expect(toastMock.info).not.toHaveBeenCalled();
    await act(async () => {
      await hook.result.current.abrirAgregar(JAMON);
    });
    expect(toastMock.info).toHaveBeenCalledWith('Se canceló la pesada de «Queso campesino»: no estaba confirmada.');
    expect(abierto()).toMatchObject({ abierto: true, producto: JAMON });
    expect(POS.addItemToCart).not.toHaveBeenCalled();
  });

  it('producto en gramos: 0,735 kg en la báscula agrega 735 g a $ 12/g («735 g · $ 8.820»)', async () => {
    lectura = leyendo(0.735);
    const PECHUGA = { id: 41, name: 'Pechuga por kilo', price: 12, sale_mode: 'weight', qty_decimals: 0, unit_code: 'GR  ', track_stock: false } as unknown as Product;
    const { hook } = montar();
    await act(async () => {
      await hook.result.current.abrirAgregar(PECHUGA);
    });
    expect(POS.addItemToCart).toHaveBeenCalledWith('c1', PECHUGA, 735, undefined, {
      pesaje: expect.objectContaining({ origen: 'bascula', neto: 735, unidad: 'GR' }),
    });
    expect(toastMock.success.mock.calls[0][0]).toMatch(/^Agregado: 735\sg · Pechuga por kilo · \$\s8\.820$/);
  });

  it('sin precio en la lista (price null) consulta el vigente: «Pesar» no muestra $ 0', async () => {
    configEquipo = null;
    const SIN_PRECIO = { ...QUESO, id: 33, price: null } as unknown as Product;
    const { hook } = montar();
    await act(async () => {
      await hook.result.current.abrirAgregar(SIN_PRECIO);
    });
    expect(POS.precioVigenteProducto).toHaveBeenCalledWith(33, 'Queso campesino');
    expect((hook.result.current.dialogo as { props: { precioPorUnidad: number } }).props.precioPorUnidad).toBe(18900);
  });

  it('sin báscula: «Pesar» con el peso a mano, sin auto-agregar ni toast', async () => {
    configEquipo = null;
    lectura = leyendo(0.735);
    const { hook, abierto } = montar();
    await act(async () => {
      await hook.result.current.abrirAgregar(QUESO);
    });
    expect(POS.addItemToCart).not.toHaveBeenCalled();
    expect(abierto()).toMatchObject({ abierto: true, producto: QUESO });
    expect((hook.result.current.dialogo as { props: { bascula: unknown; agregarAlEstabilizar: boolean } }).props).toMatchObject({
      bascula: null,
      agregarAlEstabilizar: false,
    });
  });
});
