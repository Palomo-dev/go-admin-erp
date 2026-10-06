/**
 * Iconos de SEO y Analítica: un canal = un icono en todas las pantallas, las
 * páginas con el icono de su entrada del menú, las cifras compartidas con el
 * Resumen con el mismo icono, y nada de logos de marca obsoletos de lucide.
 */
import * as lucide from 'lucide-react';
import { moduloPorCodigo } from '@/lib/navigation/catalog';
import { ICONO_KPI_SITIO } from '../../ui/iconosSitio';
import { REDES_SEO } from '../seoLogica';
import { FUENTES_TRAFICO } from '@/lib/analiticaWeb/trafico';
import { ICONO_ACCION_SEO, ICONO_CANAL, ICONO_NIVEL, ICONO_PAGINA_ANALITICA, ICONO_PAGINA_SEO, ICONO_PIXEL, ICONO_SECCION_SEO } from '../iconosSeoAnalitica';
import { ICONO_BLOQUE_ANALITICA, ICONO_FUENTE_TRAFICO, ICONO_KPI_ANALITICA } from '@/components/analiticaWeb/iconosAnalitica';
import { PIXELES_VISIBLES } from '../TarjetasPixeles';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

test('las páginas usan el icono de su entrada del menú', () => {
  const paginas = moduloPorCodigo('website')?.paginas ?? [];
  expect(paginas.find((p) => p.href === '/app/sitio-web/seo')?.icono).toBe(ICONO_PAGINA_SEO);
  expect(paginas.find((p) => p.href === '/app/sitio-web/analitica')?.icono).toBe(ICONO_PAGINA_ANALITICA);
  expect(ICONO_PAGINA_SEO).toBe(lucide.Search);
  expect(ICONO_PAGINA_ANALITICA).toBe(lucide.BarChart3);
});

test('cada red, fuente y píxel visible tiene icono', () => {
  for (const r of REDES_SEO) expect(ICONO_CANAL[r]).toBeDefined();
  for (const f of FUENTES_TRAFICO) expect(ICONO_FUENTE_TRAFICO[f]).toBeDefined();
  for (const p of PIXELES_VISIBLES) expect(ICONO_PIXEL[p]).toBeDefined();
});

test('el mismo canal lleva el mismo icono en SEO y en Analítica', () => {
  for (const r of REDES_SEO) expect(ICONO_FUENTE_TRAFICO[r]).toBe(ICONO_CANAL[r]);
  expect(ICONO_PIXEL.tiktok).toBe(ICONO_CANAL.tiktok);
});

test('las cifras compartidas con el Resumen usan su icono', () => {
  expect(ICONO_KPI_ANALITICA.visitantes).toBe(ICONO_KPI_SITIO.visitas);
  expect(ICONO_KPI_ANALITICA.pedidos).toBe(ICONO_KPI_SITIO.pedidos);
  expect(ICONO_KPI_ANALITICA.conversion).toBe(ICONO_KPI_SITIO.conversion);
  expect(ICONO_BLOQUE_ANALITICA.reserva).toBe(ICONO_KPI_SITIO.reservas);
});

test('un nivel = un icono distinto (bien, mejorable, falta)', () => {
  expect(new Set(Object.values(ICONO_NIVEL)).size).toBe(3);
});

test('las secciones de SEO no repiten icono', () => {
  const v = Object.values(ICONO_SECCION_SEO);
  expect(new Set(v).size).toBe(v.length);
});

test('sin logos de marca (lucide los retira en la v1)', () => {
  const todos = [...Object.values(ICONO_CANAL), ...Object.values(ICONO_PIXEL), ...Object.values(ICONO_ACCION_SEO)];
  for (const prohibido of [lucide.Facebook, lucide.Instagram, lucide.Twitter, lucide.Youtube, lucide.Linkedin]) {
    expect(todos).not.toContain(prohibido);
  }
  // «Guardar» no es «crear»: disquete, no «+».
  expect(ICONO_ACCION_SEO.guardar).toBe(lucide.Save);
});
