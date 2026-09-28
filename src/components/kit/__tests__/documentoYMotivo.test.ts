/**
 * Kit · documentos y motivo: la cadena del documento (orden, iconos del
 * catálogo), la validación del motivo obligatorio y los estados que
 * añadieron los planes de POS y finanzas (SISTEMA-BADGES §4).
 */
import { Receipt, FileText, ReceiptText, Wallet, HandCoins, ShoppingBag, ClipboardList } from 'lucide-react';
import { claveEtiquetaEstado, etiquetaEstado, resolverEstado } from '../estadoTono';
import { componerMotivo, limpiarMotivo, validarMotivo } from '../motivo';
import { esTipoDocumento, ICONO_DOCUMENTO, ordenarCadena, TIPOS_DOCUMENTO } from '../documento/documentos';
import { clasesTonoFilaDato, clasesTonoTarjeta, type TonoFilaDato, type TonoTarjeta } from '../tonosKit';

const SIN_ESTILOS_SUELTOS = /dark:|#[0-9a-f]{3,6}\b|gray-|text-white|bg-white/i;

describe('FilaDato y Tarjeta: tonos con tokens', () => {
  test('los 6 tonos de FilaDato son distintos y solo usan tokens', () => {
    const tonos: TonoFilaDato[] = ['neutro', 'fuerte', 'exito', 'peligro', 'advertencia', 'enlace'];
    const clases = tonos.map((t) => clasesTonoFilaDato(t));
    expect(new Set(clases).size).toBe(6);
    for (const c of clases) expect(c).not.toMatch(SIN_ESTILOS_SUELTOS);
    expect(clasesTonoFilaDato('peligro')).toContain('text-danger-text');
    expect(clasesTonoFilaDato()).toBe(clasesTonoFilaDato('neutro'));
  });

  test('Tarjeta: el tono cambia borde y caja del icono', () => {
    const tonos: TonoTarjeta[] = ['neutro', 'peligro', 'advertencia', 'exito', 'informacion'];
    for (const t of tonos) {
      const c = clasesTonoTarjeta(t);
      expect(`${c.borde} ${c.icono}`).not.toMatch(SIN_ESTILOS_SUELTOS);
    }
    expect(clasesTonoTarjeta('peligro').borde).toBe('border-line-danger');
    expect(clasesTonoTarjeta().icono).toContain('bg-brand-tint');
  });
});

describe('documentos: iconos y orden de la cadena', () => {
  test('cada tipo tiene icono y se respeta CATALOGO-ICONOS §2', () => {
    for (const tipo of TIPOS_DOCUMENTO) expect(ICONO_DOCUMENTO[tipo]).toBeDefined();
    expect(ICONO_DOCUMENTO.venta).toBe(Receipt);
    expect(ICONO_DOCUMENTO.factura).toBe(FileText);
    expect(ICONO_DOCUMENTO.facturaCompra).toBe(ReceiptText);
    expect(ICONO_DOCUMENTO.cuentaPorCobrar).toBe(Wallet);
    expect(ICONO_DOCUMENTO.cuentaPorPagar).toBe(HandCoins);
    expect(ICONO_DOCUMENTO.pedido).toBe(ShoppingBag);
    expect(ICONO_DOCUMENTO.ordenCompra).toBe(ClipboardList);
  });

  test('un icono por concepto: dos tipos no comparten icono', () => {
    const iconos = Object.values(ICONO_DOCUMENTO);
    expect(new Set(iconos).size).toBe(iconos.length);
  });

  test('venta → factura → pagos → devolución → nota crédito, pagos en su orden', () => {
    const cadena = ordenarCadena([
      { tipo: 'notaCredito' as const, id: 'nc' },
      { tipo: 'pago' as const, id: 'p1' },
      { tipo: 'venta' as const, id: 'v' },
      { tipo: 'devolucion' as const, id: 'd' },
      { tipo: 'pago' as const, id: 'p2' },
      { tipo: 'factura' as const, id: 'f' },
    ]);
    expect(cadena.map((e) => e.id)).toEqual(['v', 'f', 'p1', 'p2', 'd', 'nc']);
  });

  test('compras: orden de compra → factura de compra → entrada → CxP → pago', () => {
    const cadena = ordenarCadena([
      { tipo: 'pago' as const, id: 'p' },
      { tipo: 'cuentaPorPagar' as const, id: 'cxp' },
      { tipo: 'entradaInventario' as const, id: 'ent' },
      { tipo: 'facturaCompra' as const, id: 'fc' },
      { tipo: 'ordenCompra' as const, id: 'oc' },
    ]);
    expect(cadena.map((e) => e.id)).toEqual(['oc', 'fc', 'ent', 'cxp', 'p']);
  });

  test('esTipoDocumento', () => {
    expect(esTipoDocumento('factura')).toBe(true);
    expect(esTipoDocumento('invoice')).toBe(false);
    expect(esTipoDocumento(null)).toBe(false);
  });
});

describe('motivo obligatorio', () => {
  test('limpia espacios y valida largo', () => {
    expect(limpiarMotivo('  error   de   digitación ')).toBe('error de digitación');
    expect(validarMotivo('   ')).toMatchObject({ valido: false, error: 'vacio', largo: 0 });
    expect(validarMotivo('abc')).toMatchObject({ valido: false, error: 'corto' });
    expect(validarMotivo('Cliente desistió')).toMatchObject({ valido: true, error: null, limpio: 'Cliente desistió' });
    expect(validarMotivo('x'.repeat(501))).toMatchObject({ valido: false, error: 'largo' });
    expect(validarMotivo('abc', { minimo: 3 }).valido).toBe(true);
  });

  test('cuenta caracteres, no unidades UTF-16', () => {
    expect(validarMotivo('😀😀😀😀😀').largo).toBe(5);
  });

  test('motivo rápido + detalle', () => {
    expect(componerMotivo('Error de digitación', 'precio mal cargado')).toBe('Error de digitación · precio mal cargado');
    expect(componerMotivo('Error de digitación', '')).toBe('Error de digitación');
    expect(componerMotivo(null, ' otra cosa ')).toBe('otra cosa');
    expect(componerMotivo('Error', 'error de precio')).toBe('error de precio');
  });
});

describe('estados añadidos (SISTEMA-BADGES §4, 2026-09-24)', () => {
  test('`current` de la cartera es «Al día», éxito', () => {
    expect(resolverEstado('current')).toMatchObject({ tono: 'exito', apariencia: 'suave', conocido: true });
    expect(etiquetaEstado('current')).toBe('Al día');
    expect(claveEtiquetaEstado('current')?.clave).toBe('al_dia');
  });

  test('Por recibir y Pendiente de pago son advertencia · suave', () => {
    expect(resolverEstado('Por recibir')).toMatchObject({ tono: 'advertencia', apariencia: 'suave' });
    expect(resolverEstado('pendiente_de_pago')).toMatchObject({ tono: 'advertencia', apariencia: 'suave' });
  });

  test('Devuelta (y parcial) como Reembolsado: información · contorno', () => {
    for (const e of ['Devuelta', 'returned', 'Devuelta parcial', 'partially_returned']) {
      expect(resolverEstado(e)).toMatchObject({ tono: 'informacion', apariencia: 'contorno', conocido: true });
    }
    expect(etiquetaEstado('partially_returned')).toBe('Devuelta parcial');
  });

  test('En cola, No aplica y Castigada', () => {
    expect(resolverEstado('queued')).toMatchObject({ tono: 'informacion', apariencia: 'suave' });
    expect(resolverEstado('No aplica')).toMatchObject({ tono: 'neutro' });
    expect(resolverEstado('written_off')).toMatchObject({ tono: 'neutro' });
    expect(claveEtiquetaEstado('written_off')?.clave).toBe('castigada');
  });
});
