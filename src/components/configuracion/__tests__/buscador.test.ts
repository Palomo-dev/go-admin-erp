/**
 * Buscador de Configuración: encuentra ajustes por palabra clave, sin importar
 * tildes ni mayúsculas, y solo entre las secciones que el servidor dejó ver.
 */
import { buscarAjustes, construirIndice, normalizar, type TextosIndice } from '../config/buscadorConfiguracion';
import { SECCIONES_CONFIG } from '../config/configSectionsRegistry';
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';

type Ns = { modulos: Record<string, string>; secciones: Record<string, { titulo: string; palabras: string }>; ajustes: Record<string, { titulo: string; palabras: string }> };

function textos(ns: Ns): TextosIndice {
  return {
    modulo: (id) => ns.modulos[id],
    seccion: (clave) => ns.secciones[clave],
    ajuste: (clave) => ns.ajustes[clave],
  };
}
const ES = textos((es as unknown as { configuracionUnificada: Ns }).configuracionUnificada);
const EN = textos((en as unknown as { configuracionUnificada: Ns }).configuracionUnificada);
const indice = construirIndice(SECCIONES_CONFIG, ES);

describe('normalizar', () => {
  test('quita tildes, diéresis y mayúsculas', () => {
    expect(normalizar('  Interés  ELECTRÓNICA pingüino ')).toBe('interes electronica pinguino');
  });
});

describe('buscarAjustes', () => {
  test('«interés» lleva a la tarjeta del desinterés, en CRM › Agente de voz', () => {
    const [primero] = buscarAjustes('interés', indice);
    expect(primero).toMatchObject({ titulo: 'Cuando el cliente no tiene interés', ruta: 'CRM › Agente de voz', href: '/app/configuracion?modulo=crm&seccion=agente-voz#desinteres' });
  });

  test('sin tildes y en mayúsculas encuentra lo mismo', () => {
    expect(buscarAjustes('INTERES', indice)[0]?.ancla).toBe('desinteres');
    expect(buscarAjustes('numeros de prueba', indice)[0]).toMatchObject({ titulo: 'Números de prueba', ancla: 'numeros-prueba' });
  });

  test('«factura electrónica» lleva a Facturación electrónica', () => {
    const r = buscarAjustes('factura electrónica', indice);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.ruta.startsWith('Facturación electrónica ›'))).toBe(true);
    expect(r.map((x) => x.seccionId)).toEqual(expect.arrayContaining(['facturacion.resumen', 'facturacion.servicio']));
  });

  test('cada palabra de la consulta tiene que aparecer', () => {
    expect(buscarAjustes('números ballena', indice)).toEqual([]);
    expect(buscarAjustes('   ', indice)).toEqual([]);
  });

  test('solo busca en las secciones visibles (módulo inactivo = no aparece)', () => {
    const sinCrm = construirIndice(SECCIONES_CONFIG.filter((s) => s.modulo !== 'crm'), ES);
    expect(buscarAjustes('interés', sinCrm).some((r) => r.seccionId.startsWith('crm.'))).toBe(false);
  });

  test('busca en el idioma de quien busca', () => {
    const indiceEn = construirIndice(SECCIONES_CONFIG, EN);
    expect(buscarAjustes('test numbers', indiceEn)[0]).toMatchObject({ titulo: 'Test numbers', ruta: 'CRM › Voice agent' });
  });

  test('el título que empieza por la consulta va antes que una palabra clave', () => {
    const r = buscarAjustes('telefonía', indice);
    expect(r[0].seccionId).toBe('crm.telefonia');
  });
});
