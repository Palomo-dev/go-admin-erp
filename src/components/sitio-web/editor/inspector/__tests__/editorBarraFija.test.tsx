/**
 * @jest-environment jsdom
 *
 * «Acciones de producto › Barra fija al bajar» (Figma 2859:71538: K-E1 celular, K-E2 computador).
 * Sin tocar nada no se escribe ninguna clave; cada opción guarda solo lo distinto de hoy
 * (lib/website/v2/barraFija.ts); el interruptor de antes vive ahora dentro de la sección y el
 * inspector no lo repite. Textos reales (messages/*.json) en los 4 idiomas.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma as render } from '@/test-utils/renderConIdioma';
import { EditorBarraFija } from '../EditorBarraFija';
import { InspectorSeccion } from '../InspectorSeccion';
import type { WebsitePageSection } from '@/lib/services/websitePageBuilderService';
import es from '../../../../../../messages/es.json';
import en from '../../../../../../messages/en.json';
import fr from '../../../../../../messages/fr.json';
import pt from '../../../../../../messages/pt.json';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'org-cambio' }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

const ultimo = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1][0] as Record<string, unknown>;
const interruptor = (nombre: RegExp | string) => screen.getByRole('switch', { name: nombre });

describe('Barra fija al bajar › Celular (K-E1)', () => {
  test('sin configuración: encendida, «Plana» elegida y no escribe nada al abrir', () => {
    const onCambiar = jest.fn();
    render(<EditorBarraFija contenido={{}} onCambiar={onCambiar} />);
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByText('Barra fija al bajar')).toBeTruthy();
    expect(interruptor(/Barra fija en el celular/).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /Plana/ }).getAttribute('aria-checked')).toBe('true');
    expect(within(screen.getByRole('radiogroup', { name: 'Estilo' })).getAllByRole('radio')).toHaveLength(3);
    expect(interruptor(/Miniatura y precio/).getAttribute('aria-checked')).toBe('false');
    expect(interruptor(/Cantidad/).getAttribute('aria-checked')).toBe('false');
    expect(interruptor(/«Comprar ahora»/).getAttribute('aria-checked')).toBe('false');
    expect(interruptor(/Corazón de favoritos/).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Al bajar 400 px (hoy)' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Check verde (hoy)' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByPlaceholderText('Agregar al carrito')).toBeTruthy();
  });

  test('apagarla escribe sticky_mobile: false (la misma clave de antes) y esconde las opciones', () => {
    const onCambiar = jest.fn();
    const { rerender } = render(<EditorBarraFija contenido={{ actions: [] }} onCambiar={onCambiar} />);
    fireEvent.click(interruptor(/Barra fija en el celular/));
    expect(ultimo(onCambiar)).toEqual({ actions: [], sticky_mobile: false });
    rerender(<EditorBarraFija contenido={{ sticky_mobile: false }} onCambiar={onCambiar} />);
    expect(screen.queryByRole('radio', { name: /Plana/ })).toBeNull();
  });

  test('estilo, opciones, texto y efectos guardan solo lo distinto de hoy', () => {
    const onCambiar = jest.fn();
    render(<EditorBarraFija contenido={{ preset: 'clasica' }} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole('radio', { name: /Vidrio/ }));
    expect(ultimo(onCambiar)).toEqual({ preset: 'clasica', sticky: { style: 'glass' } });
    fireEvent.click(interruptor(/Miniatura y precio/));
    expect(ultimo(onCambiar)).toEqual({ preset: 'clasica', sticky: { thumb: true } });
    fireEvent.click(interruptor(/Corazón de favoritos/));
    expect(ultimo(onCambiar)).toEqual({ preset: 'clasica', sticky: { fav: false } });
    fireEvent.change(screen.getByPlaceholderText('Agregar al carrito'), { target: { value: '  ¡Lo  quiero! ' } });
    expect(ultimo(onCambiar)).toEqual({ preset: 'clasica', sticky: { label: '¡Lo quiero!' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Al pasar el botón' }));
    expect(ultimo(onCambiar)).toEqual({ preset: 'clasica', sticky: { trigger: 'pass' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Vuela al carrito' }));
    expect(ultimo(onCambiar)).toEqual({ preset: 'clasica', sticky: { addFx: 'fly' } });
    fireEvent.click(interruptor(/Vibración suave/));
    expect(ultimo(onCambiar)).toEqual({ preset: 'clasica', sticky: { haptic: true } });
  });

  test('lo guardado se lee y volver a lo de hoy quita la clave', () => {
    const onCambiar = jest.fn();
    render(<EditorBarraFija contenido={{ sticky: { style: 'floating', qty: true, label: 'Lo quiero' } }} onCambiar={onCambiar} />);
    expect(screen.getByRole('radio', { name: /Flotante/ }).getAttribute('aria-checked')).toBe('true');
    expect(interruptor(/Cantidad/).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByPlaceholderText('Agregar al carrito') as HTMLInputElement).value).toBe('Lo quiero');
    fireEvent.click(screen.getByRole('radio', { name: /Plana/ }));
    expect(ultimo(onCambiar)).toEqual({ sticky: { qty: true, label: 'Lo quiero' } });
  });
});

describe('Barra fija al bajar › Computador (K-E2)', () => {
  const abrirComputador = () => fireEvent.click(screen.getByRole('radio', { name: 'Computador' }));

  test('apagada por defecto y sin opciones a la vista', () => {
    const onCambiar = jest.fn();
    render(<EditorBarraFija contenido={{}} onCambiar={onCambiar} />);
    abrirComputador();
    expect(interruptor(/Barra fija en el computador/).getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText('Posición')).toBeNull();
    expect(onCambiar).not.toHaveBeenCalled();
  });

  test('encenderla guarda desktop.enabled y arranca arriba (sugerida), con todo a la vista', () => {
    const onCambiar = jest.fn();
    const { rerender } = render(<EditorBarraFija contenido={{}} onCambiar={onCambiar} />);
    abrirComputador();
    fireEvent.click(interruptor(/Barra fija en el computador/));
    const c = ultimo(onCambiar);
    expect(c).toEqual({ sticky: { desktop: { enabled: true } } });
    rerender(<EditorBarraFija contenido={c} onCambiar={onCambiar} />);
    const posiciones = screen.getByRole('radiogroup', { name: 'Posición' });
    expect(within(posiciones).getAllByRole('radio')).toHaveLength(3);
    expect(within(posiciones).getByRole('radio', { name: /Arriba, bajo la cabecera/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Sugerida')).toBeTruthy();
    for (const nombre of [/Miniatura y nombre/, /^Precio$/, /Variante compacta/, /Cantidad/, /«Comprar ahora»/, /Corazón de favoritos/]) {
      expect(interruptor(nombre).getAttribute('aria-checked')).toBe('true');
    }
    expect(screen.getByRole('radio', { name: 'Al pasar el botón' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(within(posiciones).getByRole('radio', { name: /En lugar de la cabecera/ }));
    expect(ultimo(onCambiar)).toEqual({ sticky: { desktop: { enabled: true, position: 'replace' } } });
    fireEvent.click(screen.getByRole('radio', { name: 'Vidrio' }));
    expect(ultimo(onCambiar)).toEqual({ sticky: { desktop: { enabled: true, style: 'glass' } } });
    fireEvent.click(interruptor(/«Comprar ahora»/));
    expect(ultimo(onCambiar)).toEqual({ sticky: { desktop: { enabled: true, buyNow: false } } });
  });

  test('las opciones del celular no se tocan al cambiar el computador', () => {
    const onCambiar = jest.fn();
    render(<EditorBarraFija contenido={{ sticky_mobile: false, sticky: { style: 'glass', desktop: { enabled: true } } }} onCambiar={onCambiar} />);
    abrirComputador();
    fireEvent.click(screen.getByRole('radio', { name: /Abajo, flotante/ }));
    expect(ultimo(onCambiar)).toEqual({ sticky_mobile: false, sticky: { style: 'glass', desktop: { enabled: true, position: 'bottom' } } });
  });
});

describe('Inspector de «Acciones de producto»', () => {
  const seccion = {
    id: 'acciones-1',
    page_id: 'p',
    section_type: 'product_actions',
    section_variant: 'default',
    content: { sticky_mobile: false },
    settings: {},
    sort_order: 3,
    is_visible: true,
  } as unknown as WebsitePageSection;
  const props = {
    seccion,
    enBorrador: true,
    onCambiarVariante: jest.fn(),
    onCambiarEstilo: jest.fn(),
    onCambiarVisibilidad: jest.fn(),
    onAlternarVisible: jest.fn(),
    onDuplicar: jest.fn(),
    onEliminar: jest.fn(),
    tema: { colores: {}, fuentes: [] } as never,
    catalogoFuentes: [],
    categorias: { lista: [], cargando: false },
    entornoEspacio: { primera: false, ajustesSitio: { whatsapp_number: '3001234567' } },
  };

  test('«Barra fija en el celular» sale una sola vez, dentro de «Barra fija al bajar», y lee lo guardado', () => {
    const onCambiarContenido = jest.fn();
    render(<InspectorSeccion {...props} onCambiarContenido={onCambiarContenido} />);
    expect(screen.getByText('Barra fija al bajar')).toBeTruthy();
    expect(screen.getAllByRole('switch', { name: /Barra fija en el celular/ })).toHaveLength(1);
    expect(interruptor(/Barra fija en el celular/).getAttribute('aria-checked')).toBe('false');
    // El precio dentro del botón sigue en su sitio (aplica también a la ficha).
    expect(screen.getByText('Precio dentro del botón')).toBeTruthy();
    fireEvent.click(interruptor(/Barra fija en el celular/));
    expect(ultimo(onCambiarContenido)).toEqual({ sticky_mobile: true });
  });

  test.each([['en', 'Sticky bar on scroll'], ['fr', 'Barre fixe au défilement'], ['pt', 'Barra fixa ao rolar']] as const)('en %s', (idioma, titulo) => {
    render(<EditorBarraFija contenido={{ sticky: { desktop: { enabled: true } } }} onCambiar={jest.fn()} />, { idioma });
    expect(screen.getByText(titulo)).toBeTruthy();
  });
});

describe('Textos de la barra fija', () => {
  /** Rutas de hojas de un objeto de mensajes. */
  const hojas = (o: Record<string, unknown>, prefijo = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? hojas(v as Record<string, unknown>, `${prefijo}${k}.`) : [`${prefijo}${k}`]));
  const de = (m: unknown) => (m as { sitioWeb: { editor: { barraFija: Record<string, unknown> } } }).sitioWeb.editor.barraFija;

  test('las mismas claves en es, en, fr y pt', () => {
    const base = hojas(de(es)).sort();
    expect(base.length).toBeGreaterThan(30);
    for (const m of [en, fr, pt]) expect(hojas(de(m)).sort()).toEqual(base);
  });
});
