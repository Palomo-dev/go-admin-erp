/**
 * @jest-environment jsdom
 *
 * Pie › Diseño › opciones de las plantillas de tienda (Figma A5, PLANO §2 ítems 23-25): marca
 * gigante con figura, pie como tarjeta con margen y enlaces grandes. Qué columna escribe cada
 * control, que el default no se guarda en `shell.footer.opciones` (el pie de hoy) y la ida y
 * vuelta por `vistaEditor`. Datos ficticios (org 120).
 */
import { TextEncoder } from 'util';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import { normalizarOpcionShell } from '@/lib/website/v2/mapeoAjustes';
import { ajustesDesdeDocumento, aplicarAjustesAlDocumento } from '@/lib/website/v2/vistaEditor';
import { shellPorDefecto } from '@/lib/website/v2/plantillaCompleta';
import { InspectorPie } from '../inspector/InspectorPie';
import { cambiosParaFilaLegacy, cambiosRestablecer } from '../inspector/zonaGlobalLogica';

// `validarDocumentoSitio` mide los bytes con TextEncoder, que jsdom no trae.
Object.assign(globalThis, { TextEncoder });

const FIGURA = 'https://cdn.ejemplo.test/figura.svg';

jest.mock('@/components/common/ImagePickerDialog', () => ({
  __esModule: true,
  default: ({ open, onSelect }: { open: boolean; onSelect: (url: string) => void }) =>
    open ? (
      <button type="button" onClick={() => onSelect('https://cdn.ejemplo.test/figura.svg')}>
        Usar figura de prueba
      </button>
    ) : null,
}));

const SLUGS = ['home', 'productos', 'nosotros', 'contacto', 'terminos', 'privacidad'];
const PORDEFECTO = shellPorDefecto('retail_modern', 'tienda', SLUGS);
const COLORES = { fondo: '#FFFFFF', texto: '#1C1A18', acento: '#B4583A' };

const pie = (ajustes: Record<string, unknown> = {}) => {
  const onCambiar = jest.fn();
  renderConIdioma(
    <InspectorPie
      ajustes={{ footer_style: 'default', ...ajustes }}
      onCambiar={onCambiar}
      menusPie={[]}
      porDefecto={PORDEFECTO}
      enBorrador
      giro="tienda"
      coloresTema={COLORES}
      onEditarMenus={jest.fn()}
      onCerrar={jest.fn()}
      pestanaInicial="diseno"
    />,
  );
  return onCambiar;
};
const grupoRadios = (nombre: RegExp) => screen.getByRole('radiogroup', { name: nombre });

describe('InspectorPie › Diseño › opciones de tienda', () => {
  test('sin nada guardado: marca «Ninguna», sin tarjeta, enlaces «Normal» y sin figura', () => {
    pie();
    expect(within(grupoRadios(/^Marca gigante/)).getByRole('radio', { checked: true }).textContent).toBe('Ninguna');
    expect(screen.getByRole('switch', { name: /Pie como tarjeta con margen/ }).getAttribute('aria-checked')).toBe('false');
    expect(within(grupoRadios(/^Estilo de los enlaces/)).getByRole('radio', { checked: true }).textContent).toBe('Normal');
    expect(screen.queryByRole('group', { name: 'Figura o imagen (opcional)' })).toBeNull();
  });

  test('marca gigante escribe footer_brand_display; «Ninguna» vuelve al default', () => {
    const f = pie();
    fireEvent.click(within(grupoRadios(/^Marca gigante/)).getByRole('radio', { name: 'Marca gigante' }));
    expect(f).toHaveBeenLastCalledWith({ footer_brand_display: 'giant' });
  });

  test('con marca gigante: elegir y quitar la figura', () => {
    const f = pie({ footer_brand_display: 'giant' });
    const figura = screen.getByRole('group', { name: 'Figura o imagen (opcional)' });
    fireEvent.click(within(figura).getByRole('button', { name: /Seleccionar imagen/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Usar figura de prueba' }));
    expect(f).toHaveBeenLastCalledWith({ footer_brand_figure_url: FIGURA });
  });

  test('figura guardada: quitarla guarda null (sin figura)', () => {
    const f = pie({ footer_brand_display: 'giant', footer_brand_figure_url: FIGURA });
    const figura = screen.getByRole('group', { name: 'Figura o imagen (opcional)' });
    expect(within(figura).getByRole('img').getAttribute('src')).toBe(FIGURA);
    fireEvent.click(within(figura).getAllByRole('button').at(-1)!);
    expect(f).toHaveBeenLastCalledWith({ footer_brand_figure_url: null });
    fireEvent.click(within(grupoRadios(/^Marca gigante/)).getByRole('radio', { name: 'Ninguna' }));
    expect(f).toHaveBeenLastCalledWith({ footer_brand_display: 'none' });
  });

  test('pie como tarjeta: encender y apagar', () => {
    const f = pie();
    fireEvent.click(screen.getByRole('switch', { name: /Pie como tarjeta con margen/ }));
    expect(f).toHaveBeenLastCalledWith({ footer_inset: true });
  });

  test('pie como tarjeta encendido: apagar escribe false (el default)', () => {
    const f = pie({ footer_inset: true });
    const sw = screen.getByRole('switch', { name: /Pie como tarjeta con margen/ });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(f).toHaveBeenLastCalledWith({ footer_inset: false });
  });

  test('enlaces grandes escribe footer_links_style; «Normal» vuelve al default', () => {
    const f = pie({ footer_links_style: 'display' });
    expect(within(grupoRadios(/^Estilo de los enlaces/)).getByRole('radio', { checked: true }).textContent).toBe('Enlaces grandes');
    fireEvent.click(within(grupoRadios(/^Estilo de los enlaces/)).getByRole('radio', { name: 'Normal' }));
    expect(f).toHaveBeenLastCalledWith({ footer_links_style: 'normal' });
  });

  test('un valor fuera del contrato se muestra como el de hoy', () => {
    pie({ footer_brand_display: 'enorme', footer_links_style: 'serif', footer_inset: 'si' });
    expect(within(grupoRadios(/^Marca gigante/)).getByRole('radio', { checked: true }).textContent).toBe('Ninguna');
    expect(within(grupoRadios(/^Estilo de los enlaces/)).getByRole('radio', { checked: true }).textContent).toBe('Normal');
    expect(screen.getByRole('switch', { name: /Pie como tarjeta con margen/ }).getAttribute('aria-checked')).toBe('false');
  });

  test('las tres llevan la insignia «Nuevo»', () => {
    pie();
    expect(grupoRadios(/^Marca gigante/).getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Ida y vuelta por vistaEditor ─────────────────────────────────────────────────────────────

function documento(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: {},
    tema: { modo: { mode: 'value', value: 'light' }, colores: {}, tipografia: {} },
    seo: {},
    contenido: {},
    shell: {
      header: { composicion: 'default', menuPrincipalId: null, opciones: {} },
      footer: { composicion: 'three_columns', menuIds: [], opciones: { footer_show_newsletter: true } },
    },
    menus: [],
    paginas: [],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

const legacy = { id: 'x', organization_id: 120 } as unknown as WebsiteSettings;
const PIE_TIENDA = {
  footer_brand_display: 'giant',
  footer_brand_figure_url: FIGURA,
  footer_inset: true,
  footer_links_style: 'display',
} as const;

describe('opciones de tienda del pie: ida y vuelta por vistaEditor', () => {
  test('se guardan en shell.footer.opciones, el documento sigue válido y se leen igual', () => {
    const { documento: doc, noAplicadas } = aplicarAjustesAlDocumento(documento(), PIE_TIENDA);
    expect(noAplicadas).toEqual([]);
    expect(doc.shell.footer.opciones).toEqual({ footer_show_newsletter: true, ...PIE_TIENDA });
    expect(doc.shell.header.opciones).toEqual({});
    expect(validarDocumentoSitio(doc).ok).toBe(true);
    const a = ajustesDesdeDocumento(doc, legacy, null).ajustes as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(PIE_TIENDA)) {
      expect(a[k]).toBe(v);
      expect(normalizarOpcionShell(k, a[k])).toBe(v);
    }
  });

  test('el default de cada control (none / null / false / normal) borra la clave: el pie de hoy', () => {
    const conTodo = aplicarAjustesAlDocumento(documento(), PIE_TIENDA).documento;
    const doc = aplicarAjustesAlDocumento(conTodo, {
      footer_brand_display: 'none',
      footer_brand_figure_url: null,
      footer_inset: false,
      footer_links_style: 'normal',
    }).documento;
    expect(doc.shell.footer.opciones).toEqual({ footer_show_newsletter: true });
    expect(doc).toEqual(documento());
    const a = ajustesDesdeDocumento(doc, legacy, null).ajustes as unknown as Record<string, unknown>;
    expect(a.footer_brand_display).toBe('none');
    expect(a.footer_brand_figure_url).toBeNull();
    expect(a.footer_inset).toBe(false);
    expect(a.footer_links_style).toBe('normal');
  });

  test('sin tocarlas, el documento no gana ninguna clave nueva', () => {
    const a = ajustesDesdeDocumento(documento(), legacy, null).ajustes as unknown as Record<string, unknown>;
    const { documento: doc } = aplicarAjustesAlDocumento(documento(), {
      footer_brand_display: a.footer_brand_display,
      footer_brand_figure_url: a.footer_brand_figure_url,
      footer_inset: a.footer_inset,
      footer_links_style: a.footer_links_style,
    });
    expect(doc).toEqual(documento());
  });

  test('«Restablecer» del pie las deja en su default (o en lo que traiga la plantilla)', () => {
    const cambios = cambiosRestablecer('footer', { composicion: 'default', opciones: { footer_inset: true } });
    expect(cambios).toMatchObject({ footer_brand_display: 'none', footer_brand_figure_url: null, footer_inset: true, footer_links_style: 'normal' });
  });

  test('legacy: si la fila cargada no trae la columna, no se envía', () => {
    const { enviar, omitidas } = cambiosParaFilaLegacy(PIE_TIENDA, { footer_style: 'default' });
    expect(enviar).toEqual({});
    expect(omitidas.sort()).toEqual(Object.keys(PIE_TIENDA).sort());
  });
});
