/**
 * Lectura de la respuesta de validación de Factus (forma real del sandbox,
 * 2026-09-23, con datos ficticios).
 */

import { leerResultadoFactus } from '@/lib/services/einvoicing/respuestaFactus';

describe('leerResultadoFactus', () => {
  test('factura: número, CUFE, QR y notificaciones de la DIAN', () => {
    const r = leerResultadoFactus({
      status: 'Created',
      data: {
        reference_code: 'INV-1',
        number: 'SETP990020456',
        is_validated: true,
        cufe: 'cufe-factura',
        errors: { FAJ43b: 'Regla: FAJ43b, Notificación: nombre no coincide' },
        links: { qr: 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=x', public_url: 'https://app-sandbox.factus.com.co/documents/bills/x' },
      },
    });
    expect(r).toEqual({
      numero: 'SETP990020456',
      codigoUnico: 'cufe-factura',
      qr: 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=x',
      urlPublica: 'https://app-sandbox.factus.com.co/documents/bills/x',
      validado: true,
      notificaciones: ['Regla: FAJ43b, Notificación: nombre no coincide'],
    });
  });

  test('nota crédito: toma el CUDE de la nota, no el CUFE de la factura referenciada', () => {
    const r = leerResultadoFactus({
      data: {
        number: 'CRTE633',
        is_validated: true,
        correction_concept: { code: '2' },
        cude: 'cude-nota',
        bill: { number: 'SETP990020456', cufe: 'cufe-factura' },
        errors: ['Regla: CAK55, Notificación: correo no informado'],
        links: { qr: 'https://qr-nota' },
      },
    });
    expect(r.numero).toBe('CRTE633');
    expect(r.codigoUnico).toBe('cude-nota');
    expect(r.qr).toBe('https://qr-nota');
    expect(r.notificaciones).toHaveLength(1);
  });

  test('sin validar → validado false', () => {
    expect(leerResultadoFactus({ data: { number: 'X1', is_validated: false } }).validado).toBe(false);
  });

  test('respuesta vacía no lanza', () => {
    expect(leerResultadoFactus(null)).toMatchObject({ numero: null, codigoUnico: null, validado: false, notificaciones: [] });
  });
});
