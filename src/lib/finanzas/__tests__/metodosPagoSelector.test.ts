/**
 * Selector de método de pago con buscador (Figma 2714:150934 / 2714:151166, aprobado el
 * 2026-11-21): tipos para los chips, «Ya lo tienes», estado de conexión y filtro sin tildes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { construirOpcionesMetodoPago, filtrarOpcionesMetodoPago, tipoDeMetodo } from '../metodosPagoSelector';

const opciones = construirOpcionesMetodoPago({
  manuales: [
    { code: 'cash', name: 'Efectivo' },
    { code: 'transfer', name: 'Transferencia bancaria' },
    { code: 'card', name: 'Tarjeta' },
  ],
  integraciones: [
    { code: 'wompi', name: 'Wompi' },
    { code: 'mercadopago', name: 'Mercado Pago' },
    { code: 'bold_link', name: 'Bold (Link de Pago)' },
    { code: 'bold_qr', name: 'Bold QR' },
  ],
  codigosOrganizacion: ['cash'],
  conectoresConectados: ['wompi_co', 'bold_pos'],
});

describe('opciones del selector de método de pago', () => {
  it('lo que ya tiene la organización va deshabilitado y al final de su grupo', () => {
    const manuales = opciones.filter((o) => o.grupo === 'manual');
    expect(manuales.map((o) => o.codigo)).toEqual(['transfer', 'card', 'cash']);
    expect(manuales.find((o) => o.codigo === 'cash')?.yaLoTiene).toBe(true);
  });

  it('las pasarelas dicen si están conectadas (por su conector) y van como integration_<código>', () => {
    const p = Object.fromEntries(opciones.filter((o) => o.grupo === 'pasarela').map((o) => [o.codigo, o]));
    expect(p.wompi).toMatchObject({ valor: 'integration_wompi', conectada: true, tipo: 'pasarelas' });
    expect(p.mercadopago.conectada).toBe(false);
    expect(p.bold_qr).toMatchObject({ conectada: true, tipo: 'qr' });
    expect(p.bold_link.conectada).toBe(false);
  });

  it('tipos para los chips', () => {
    expect(tipoDeMetodo('nequi', 'manual')).toBe('billeteras');
    expect(tipoDeMetodo('cash', 'manual')).toBe('efectivo_bancos');
    expect(tipoDeMetodo('redeban_qr', 'pasarela')).toBe('qr');
  });

  it('busca sin tildes por nombre o código y suma los chips encendidos', () => {
    expect(filtrarOpcionesMetodoPago(opciones, 'bold', []).map((o) => o.codigo)).toEqual(['bold_link', 'bold_qr']);
    expect(filtrarOpcionesMetodoPago(opciones, 'TRANSFERENCIA', []).map((o) => o.codigo)).toEqual(['transfer']);
    expect(filtrarOpcionesMetodoPago(opciones, 'mercado', []).map((o) => o.codigo)).toEqual(['mercadopago']);
    expect(filtrarOpcionesMetodoPago(opciones, '', ['qr']).map((o) => o.codigo)).toEqual(['bold_qr']);
    expect(filtrarOpcionesMetodoPago(opciones, '', ['qr', 'efectivo_bancos'])).toHaveLength(4);
    expect(filtrarOpcionesMetodoPago(opciones, '', [])).toHaveLength(opciones.length);
  });
});

describe('textos del selector en 4 idiomas', () => {
  const raiz = path.resolve(__dirname, '../../../..');
  const leer = (l: string) => JSON.parse(fs.readFileSync(path.join(raiz, 'messages', `${l}.json`), 'utf8'));
  const claves = (o: Record<string, unknown>, pre = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? claves(v as Record<string, unknown>, `${pre}${k}.`) : [`${pre}${k}`]));
  it('mismas claves en es, en, fr y pt', () => {
    const es = claves(leer('es').finanzasCobrosR2.metodo.selector).sort();
    for (const l of ['en', 'fr', 'pt']) {
      expect(claves(leer(l).finanzasCobrosR2.metodo.selector).sort()).toEqual(es);
      expect(Object.keys(leer(l).integracionesConexiones.asistente.llaves.sinPruebaEnAmbiente).sort()).toEqual(['descripcion', 'titulo']);
    }
  });
});
