// formato.ts reutiliza formatMonedaSinDecimales, que vive junto al hook de la
// moneda (y este importa el cliente de Supabase del navegador).
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import {
  condicionPago,
  cuentaEnmascarada,
  documentoProveedor,
  estadoCartera,
  etiquetaRegimen,
  formatoMonedaCompacta,
  lineaCartera,
} from '@/components/inventario/proveedores/formato';

describe('proveedores · textos del listado y del detalle', () => {
  describe('condicionPago', () => {
    it('0 días es contado (antes el listado pintaba 30 por `credit_days || 30`)', () => {
      expect(condicionPago('credito_30', 0)).toBe('Contado');
    });
    it('mandan los días de crédito sobre la condición guardada', () => {
      expect(condicionPago('contado', 45)).toBe('Crédito 45 días');
      expect(condicionPago(null, 1)).toBe('Crédito 1 día');
    });
    it('sin días usa la condición y, si no hay, «Sin definir»', () => {
      expect(condicionPago('credito_60', null)).toBe('Crédito 60 días');
      expect(condicionPago(null, undefined)).toBe('Sin definir');
    });
  });

  describe('documentoProveedor', () => {
    it('NIT con miles y DV', () => {
      expect(documentoProveedor({ nit: '900123456', dv: '7', identification_document_code: '31' })).toBe('NIT 900.123.456-7');
    });
    it('no duplica el DV si el NIT ya lo trae', () => {
      expect(documentoProveedor({ nit: '900123456-7', dv: '7', identification_document_code: '31' })).toBe('NIT 900123456-7');
    });
    it('cédula de una persona natural, sin DV', () => {
      expect(documentoProveedor({ nit: '1020345678', dv: '3', identification_document_code: '13' })).toBe('CC 1.020.345.678');
      expect(documentoProveedor({ nit: '1020345678', supplier_type: 'person' })).toBe('CC 1.020.345.678');
    });
    it('sin número: «Sin NIT»', () => {
      expect(documentoProveedor({ nit: '  ', identification_document_code: '31' })).toBe('Sin NIT');
      expect(documentoProveedor({ nit: null })).toBe('Sin NIT');
    });
  });

  describe('lineaCartera y estadoCartera', () => {
    it('al día sin facturas abiertas', () => {
      expect(lineaCartera({ facturas_abiertas: 0, facturas_vencidas: 0, saldo: 0 })).toEqual({ texto: 'Al día', peligro: false });
    });
    it('facturas sin vencer', () => {
      expect(lineaCartera({ facturas_abiertas: 2, facturas_vencidas: 0, saldo: 10 })).toEqual({ texto: '2 facturas', peligro: false });
      expect(lineaCartera({ facturas_abiertas: 1, facturas_vencidas: 0, saldo: 10 })).toEqual({ texto: '1 factura', peligro: false });
    });
    it('una parte vencida', () => {
      expect(lineaCartera({ facturas_abiertas: 4, facturas_vencidas: 1, saldo: 10 })).toEqual({ texto: '4 facturas · 1 vencida', peligro: true });
    });
    it('todas vencidas', () => {
      expect(lineaCartera({ facturas_abiertas: 3, facturas_vencidas: 3, saldo: 10 })).toEqual({ texto: '3 facturas vencidas', peligro: true });
    });
    it('estado del badge móvil', () => {
      expect(estadoCartera({ is_active: false, facturas_vencidas: 2 })).toBe('inactivo');
      expect(estadoCartera({ is_active: true, facturas_vencidas: 2 })).toBe('vencido');
      expect(estadoCartera({ is_active: true, facturas_vencidas: 0 })).toBe('activo');
    });
  });

  it('régimen: etiqueta conocida o el valor tal como lo trajo la DIAN', () => {
    expect(etiquetaRegimen('comun')).toBe('Responsable de IVA');
    expect(etiquetaRegimen('Régimen ordinario')).toBe('Régimen ordinario');
    expect(etiquetaRegimen(null)).toBe('Sin definir');
  });

  it('la cuenta bancaria se enmascara salvo los últimos 4 dígitos', () => {
    expect(cuentaEnmascarada('123 456 784521')).toBe('•••• 4521');
    expect(cuentaEnmascarada('4521')).toBe('4521');
    expect(cuentaEnmascarada(null)).toBe('');
  });

  it('moneda compacta solo desde un millón', () => {
    expect(formatoMonedaCompacta(0, 'COP')).toMatch(/\$\s?0$/);
    const compacta = formatoMonedaCompacta(12_480_000, 'COP');
    expect(compacta).toMatch(/12,5/);
    expect(compacta).toMatch(/M/);
  });
});
