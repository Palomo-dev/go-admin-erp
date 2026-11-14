/**
 * Pestañas-enlace de Configuración › Integraciones (94-config-04): llevan a
 * las pestañas de la página Conexiones, con los mismos `?tab=` que usa ella.
 */
import { ENLACES_PESTANA, enlacesDeEntrada } from '../config/enlacesPestana';
import { PESTANAS } from '@/components/integraciones/conexiones-v2/filtrosConexiones';
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';

test('Catálogo, Mis conexiones y Actividad llevan a las pestañas de Conexiones', () => {
  expect(enlacesDeEntrada('integraciones').map((e) => e.href)).toEqual([
    '/app/integraciones/conexiones',
    '/app/integraciones/conexiones?tab=mis',
    '/app/integraciones/conexiones?tab=actividad',
  ]);
  for (const e of enlacesDeEntrada('integraciones')) {
    const tab = new URL(e.href, 'https://x.co').searchParams.get('tab');
    if (tab) expect((PESTANAS as readonly string[]).includes(tab)).toBe(true);
  }
});

test('las demás entradas no tienen enlaces', () => {
  expect(enlacesDeEntrada('chat')).toEqual([]);
  expect(Object.keys(ENLACES_PESTANA)).toEqual(['integraciones']);
});

test.each([
  ['es', es],
  ['en', en],
  ['fr', fr],
  ['pt', pt],
])('texto visible y etiqueta accesible en %s (la accesible contiene la visible)', (_i, m) => {
  const ns = (m as unknown as { configuracionDialogo: { enlacesPestana: Record<string, { etiqueta: string; aria: string }> } }).configuracionDialogo.enlacesPestana;
  for (const e of enlacesDeEntrada('integraciones')) {
    expect(ns[e.clave].etiqueta).toBeTruthy();
    expect(ns[e.clave].aria).toContain(ns[e.clave].etiqueta);
  }
});
