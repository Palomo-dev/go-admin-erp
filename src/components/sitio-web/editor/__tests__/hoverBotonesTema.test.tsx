/**
 * @jest-environment jsdom
 *
 * Estilo del sitio › «Efecto al pasar el mouse» (Figma A3, `tema.tokens.hover`, PLANO §2 ítem 12):
 * Sutil y Expresivo se guardan; «Ninguno» borra la clave (y `tokens` si queda vacío), así el tema
 * queda como hoy. Datos ficticios.
 */
import { TextEncoder } from 'util';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { hoverDeTokens, type TokensCrudos } from '@/lib/website/v2/tokensDiseno';
import { HoverBotonesTema } from '../inspector/HoverBotonesTema';
import { cambiarHoverBotones, leerHoverBotones } from '../inspector/hoverBotonesLogica';

// `validarDocumentoSitio` mide los bytes con TextEncoder, que jsdom no trae.
Object.assign(globalThis, { TextEncoder });

function documento(tokens?: Record<string, unknown>): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: {},
    tema: { modo: { mode: 'value', value: 'light' }, colores: {}, tipografia: {}, ...(tokens ? { tokens } : {}) },
    seo: {},
    contenido: {},
    shell: {
      header: { composicion: 'default', menuPrincipalId: null, opciones: {} },
      footer: { composicion: 'default', menuIds: [], opciones: {} },
    },
    menus: [],
    paginas: [],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

const BOTON_PRESET = { boton: { mayusculas: { mode: 'value', value: true } } };

describe('hoverBotonesLogica', () => {
  test('sin tokens (o con «ninguno» o inválido) se lee «ninguno»', () => {
    expect(leerHoverBotones(documento())).toBe('ninguno');
    expect(leerHoverBotones(null)).toBe('ninguno');
    expect(leerHoverBotones(documento({ hover: { mode: 'value', value: 'ninguno' } }))).toBe('ninguno');
    expect(leerHoverBotones(documento({ hover: { mode: 'clear' } }))).toBe('ninguno');
  });

  test('sutil y expresivo se escriben como valor propio y el sitio los lee igual', () => {
    for (const v of ['sutil', 'expresivo'] as const) {
      const doc = cambiarHoverBotones(documento(), v);
      expect(doc.tema.tokens).toEqual({ hover: { mode: 'value', value: v } });
      expect(validarDocumentoSitio(doc).ok).toBe(true);
      expect(leerHoverBotones(doc)).toBe(v);
      expect(hoverDeTokens(doc.tema.tokens as TokensCrudos)).toBe(v);
    }
  });

  test('conserva los demás tokens (los del preset)', () => {
    const doc = cambiarHoverBotones(documento(BOTON_PRESET), 'expresivo');
    expect(doc.tema.tokens).toEqual({ ...BOTON_PRESET, hover: { mode: 'value', value: 'expresivo' } });
  });

  test('«ninguno» borra hover; sin otros tokens, borra tokens: el documento vuelve a ser el de hoy', () => {
    const hoy = documento();
    const ida = cambiarHoverBotones(hoy, 'sutil');
    const vuelta = cambiarHoverBotones(ida, 'ninguno');
    expect(vuelta).toEqual(hoy);
    expect(vuelta.tema).not.toHaveProperty('tokens');
    const conPreset = cambiarHoverBotones(cambiarHoverBotones(documento(BOTON_PRESET), 'sutil'), 'ninguno');
    expect(conPreset.tema.tokens).toEqual(BOTON_PRESET);
  });

  test('«ninguno» sin hover guardado no cambia el documento (misma referencia)', () => {
    const hoy = documento(BOTON_PRESET);
    expect(cambiarHoverBotones(hoy, 'ninguno')).toBe(hoy);
    const sinTokens = documento();
    expect(cambiarHoverBotones(sinTokens, 'ninguno')).toBe(sinTokens);
  });

  test('un valor fuera del contrato no cambia nada', () => {
    const hoy = documento();
    expect(cambiarHoverBotones(hoy, 'neon' as never)).toBe(hoy);
  });
});

describe('HoverBotonesTema', () => {
  const montar = (doc: DocumentoSitio, deshabilitado = false) => {
    const onCambiarDocumento = jest.fn();
    renderConIdioma(<HoverBotonesTema documento={doc} onCambiarDocumento={onCambiarDocumento} deshabilitado={deshabilitado} />);
    const grupo = screen.getByRole('radiogroup', { name: /Efecto al pasar el mouse/ });
    return { onCambiarDocumento, grupo };
  };
  const aplicado = (f: jest.Mock, doc: DocumentoSitio) => (f.mock.calls.at(-1)![0] as (d: DocumentoSitio) => DocumentoSitio)(doc);

  test('sin valor marca «Ninguno»; elegir «Sutil» escribe tokens.hover', () => {
    const doc = documento();
    const { onCambiarDocumento, grupo } = montar(doc);
    expect(within(grupo).getByRole('radio', { checked: true }).textContent).toBe('Ninguno');
    expect(screen.getByText('Nuevo')).toBeTruthy();
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Sutil' }));
    expect(aplicado(onCambiarDocumento, doc).tema.tokens).toEqual({ hover: { mode: 'value', value: 'sutil' } });
  });

  test('con «Expresivo» guardado, «Ninguno» lo borra', () => {
    const doc = documento({ hover: { mode: 'value', value: 'expresivo' } });
    const { onCambiarDocumento, grupo } = montar(doc);
    expect(within(grupo).getByRole('radio', { checked: true }).textContent).toBe('Expresivo');
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Ninguno' }));
    expect(aplicado(onCambiarDocumento, doc).tema).not.toHaveProperty('tokens');
  });

  test('elegir la opción ya marcada no escribe nada', () => {
    const { onCambiarDocumento, grupo } = montar(documento());
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Ninguno' }));
    expect(onCambiarDocumento).not.toHaveBeenCalled();
  });

  test('deshabilitado no escribe', () => {
    const { onCambiarDocumento, grupo } = montar(documento(), true);
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Expresivo' }));
    expect(onCambiarDocumento).not.toHaveBeenCalled();
  });
});
