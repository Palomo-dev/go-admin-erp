/**
 * @jest-environment jsdom
 *
 * «Buscador personalizable» (Figma «16 Sitio web» 3241:99000; aprobado 2026-11-25).
 * - Contrato: `search_appearance` y `mobile_search_appearance` en shell.header.opciones (sin
 *   columnas), en vivo en el lienzo y con la misma copia que lee la tienda.
 * - Lógica: el celular vacío copia al computador; plantillas como atajo; «Restablecer» solo borra
 *   la apariencia.
 * - Vista: se suma a Diseño › Buscador sin quitar nada; abrirla no escribe; cada cambio guarda solo
 *   la subclave tocada; aviso de contraste con sugerencia; textos reales en los 4 idiomas.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma as render } from '@/test-utils/renderConIdioma';
import { OPCIONES_SHELL } from '@/lib/website/v2/mapeoAjustes';
import { CLAVES_ENCABEZADO } from '@/lib/website/ajustesVivos';
import { aplicarPlantilla, PLANTILLAS_BUSCADOR } from '@/lib/website/v2/aparienciaBuscador';
import {
  aparienciaDisponible,
  celularCopia,
  cambioApariencia,
  cambioPlantilla,
  cambioRestablecerApariencia,
  dispositivosEditables,
} from '../aparienciaBuscadorLogica';
import { FilaAparienciaBuscador, VistaAparienciaBuscador } from '../VistaAparienciaBuscador';
import es from '../../../../../../messages/es.json';
import en from '../../../../../../messages/en.json';
import fr from '../../../../../../messages/fr.json';
import pt from '../../../../../../messages/pt.json';

const COLORES = { fondo: '#FFFFFF', texto: '#111827', acento: '#2563EB' };
const ultimo = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1][0] as Record<string, unknown>;

describe('contrato', () => {
  test('dos objetos nuevos en shell.header.opciones, null por defecto, en vivo en el lienzo', () => {
    for (const k of ['search_appearance', 'mobile_search_appearance']) {
      expect(OPCIONES_SHELL[k]).toEqual({ zona: 'header', porDefecto: null, nueva: true });
      expect(CLAVES_ENCABEZADO as readonly string[]).toContain(k);
    }
  });

  test('la copia de la tienda importa el contraste por ./contrasteColor (mismo archivo en los dos repos)', () => {
    const fuente = readFileSync(join(process.cwd(), 'src/lib/website/v2/aparienciaBuscador.ts'), 'utf8');
    expect(fuente).toContain("from './contrasteColor'");
    expect(fuente).not.toMatch(/from '@\//);
  });
});

describe('lógica', () => {
  test('con «igual al de escritorio» solo se edita el computador', () => {
    expect(dispositivosEditables({ mobile_search_same_as_desktop: true })).toEqual(['computador']);
    expect(dispositivosEditables({})).toEqual(['computador', 'celular']);
  });

  test('la vista existe mientras alguno de los dos buscadores se vea', () => {
    expect(aparienciaDisponible({ search_style: 'hidden', mobile_search_style: 'hidden' })).toBe(false);
    expect(aparienciaDisponible({ search_style: 'hidden', mobile_search_style: 'bar' })).toBe(true);
    expect(aparienciaDisponible({})).toBe(true);
  });

  test('el celular que copia arranca desde lo del computador al primer cambio', () => {
    const a = { search_appearance: { radius: 'square', bg: '#FFFFFF' } };
    expect(celularCopia(a)).toBe(true);
    expect(cambioApariencia(a, 'celular', { height: 'lg' })).toEqual({
      mobile_search_appearance: { height: 'lg', radius: 'square', bg: '#FFFFFF' },
    });
    expect(cambioApariencia(a, 'computador', { bg: null })).toEqual({ search_appearance: { radius: 'square' } });
    expect(cambioApariencia({ search_appearance: { bg: '#FFFFFF' } }, 'computador', { bg: null })).toEqual({ search_appearance: null });
  });

  test('plantillas: atajo que llena subclaves; «Hoy» deja la clave vacía', () => {
    expect(cambioPlantilla('computador', 'dark')).toEqual({ search_appearance: aplicarPlantilla('dark') });
    expect(cambioPlantilla('celular', 'today')).toEqual({ mobile_search_appearance: null });
    expect(PLANTILLAS_BUSCADOR).toHaveLength(9);
  });

  test('«Restablecer buscador» solo borra la apariencia de los dos', () => {
    expect(cambioRestablecerApariencia()).toEqual({ search_appearance: null, mobile_search_appearance: null });
  });
});

describe('textos', () => {
  const plano = (o: unknown, pre = ''): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? plano(v, `${pre}${k}.`) : [`${pre}${k}`]));
  const de = (m: unknown) => (m as { sitioWeb: { editor: { aparienciaBuscador: unknown } } }).sitioWeb.editor.aparienciaBuscador;

  test('las mismas claves en es/en/fr/pt', () => {
    const base = plano(de(es)).sort();
    expect(base.length).toBeGreaterThan(100);
    for (const m of [en, fr, pt]) expect(plano(de(m)).sort()).toEqual(base);
  });

  test('cada t(…) literal de la vista existe en es', () => {
    const fuente = readFileSync(join(process.cwd(), 'src/components/sitio-web/editor/inspector/VistaAparienciaBuscador.tsx'), 'utf8');
    const usadas = [...fuente.matchAll(/\bt\('([a-zA-Z.]+)'/g)].map((m) => m[1]);
    const hay = new Set(plano(de(es)));
    const faltan = usadas.filter((k) => !hay.has(k));
    expect(faltan).toEqual([]);
  });
});

describe('vista', () => {
  test('la fila-enlace dice la plantilla y abre la vista', () => {
    const onAbrir = jest.fn();
    render(<FilaAparienciaBuscador ajustes={{ search_style: 'bar' }} coloresTema={COLORES} onAbrir={onAbrir} />);
    expect(screen.getByText('Apariencia del buscador')).toBeTruthy();
    expect(screen.getByText(/Plantilla: Hoy/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Apariencia del buscador/ }));
    expect(onAbrir).toHaveBeenCalled();
  });

  test('abrir la vista no escribe; cambiar una opción guarda solo esa subclave', () => {
    const cambiar = jest.fn();
    render(<VistaAparienciaBuscador ajustes={{ search_style: 'bar' }} cambiar={cambiar} coloresTema={COLORES} />);
    expect(cambiar).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Hoy (por defecto)' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Interior' }));
    expect(ultimo(cambiar)).toEqual({ search_appearance: { shadow: 'inner' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Borde grueso' }));
    expect(ultimo(cambiar)).toEqual({ search_appearance: aplicarPlantilla('thick') });
  });

  test('plantilla tocada: «Personalizado (desde …)»', () => {
    const a = { search_style: 'bar', search_appearance: { ...aplicarPlantilla('pill_button'), shadow: 'lg' } };
    render(<VistaAparienciaBuscador ajustes={a} cambiar={jest.fn()} coloresTema={COLORES} />);
    expect(screen.getAllByText('Personalizado (desde «Píldora con botón»)').length).toBeGreaterThan(0);
  });

  test('aviso de contraste con sugerencia que se aplica, nunca bloquea', () => {
    const cambiar = jest.fn();
    render(<VistaAparienciaBuscador ajustes={{ search_style: 'bar', search_appearance: { placeholder_color: '#D1D5DB' } }} cambiar={cambiar} coloresTema={COLORES} />);
    expect(screen.getByText(/El texto de ayuda se lee mal/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Usar sugerencia' }));
    const guardado = ultimo(cambiar).search_appearance as Record<string, unknown>;
    expect(guardado.placeholder_color).toMatch(/^#[0-9A-F]{6}$/);
    expect(guardado.placeholder_color).not.toBe('#D1D5DB');
  });

  test('celular por separado: aviso de copia y edición en mobile_search_appearance', () => {
    const cambiar = jest.fn();
    render(<VistaAparienciaBuscador ajustes={{ search_style: 'bar', mobile_search_style: 'bar', search_appearance: { radius: 'square' } }} cambiar={cambiar} coloresTema={COLORES} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Celular' }));
    expect(screen.getByText(/El celular usa la apariencia del computador/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Interior' }));
    expect(ultimo(cambiar)).toEqual({ mobile_search_appearance: { radius: 'square', shadow: 'inner' } });
  });
});
