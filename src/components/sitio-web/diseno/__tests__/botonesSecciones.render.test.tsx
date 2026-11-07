/**
 * @jest-environment jsdom
 *
 * Estilo del sitio › «Botones de las secciones» (2026-11-07): qué se ve sin el interruptor, qué
 * token y qué opción del shell escribe cada control, «Volver a lo de hoy» y la muestra. Datos
 * ficticios (org 120).
 */
import { useState } from 'react';
import { TextEncoder } from 'util';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { cambiarBotonesSecciones, leerBotonesSecciones } from '@/lib/website/v2/botonesSecciones';
import type { EstiloEditable } from '@/lib/website/v2/tokensEstilo';
import { EstiloDelSitioPanel } from '../EstiloDelSitioPanel';

// `validarDocumentoSitio` mide los bytes con TextEncoder, que jsdom no trae.
Object.assign(globalThis, { TextEncoder });

const ESTILO: EstiloEditable = {
  preset: null,
  modo: 'light',
  fondo: '#F3ECDF',
  texto: '#2E3328',
  acento: '#2E3328',
  fuenteTitulos: 'Inter',
  fuenteCuerpo: 'Inter',
  radio: 12,
  estiloBoton: 'solido',
  movimiento: 'ninguno',
};

function documento(tokens?: unknown): DocumentoSitio {
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
    paginas: [{ id: 'p1', slug: 'home', tipo: 'home', titulo: 'Inicio', publicada: true, secciones: [] }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

/** Panel con el documento en estado, como lo conecta el editor (`onCambiarDocumento`). */
function Panel({ inicial, disponible = true, alCambiar }: { inicial: DocumentoSitio; disponible?: boolean; alCambiar: (d: DocumentoSitio) => void }) {
  const [doc, setDoc] = useState(inicial);
  return (
    <EstiloDelSitioPanel
      estilo={ESTILO}
      presets={[]}
      seleccionado={null}
      onElegirPreset={jest.fn()}
      onCambiar={jest.fn()}
      giro={null}
      extendidos
      botonesSecciones={{
        valor: leerBotonesSecciones(doc),
        disponible,
        onCambiar: (c) => {
          const siguiente = cambiarBotonesSecciones(doc, c);
          setDoc(siguiente);
          alCambiar(siguiente);
        },
      }}
    />
  );
}

const grupo = (nombre: string) => screen.getByRole('radiogroup', { name: nombre });
const marcado = (g: string) => within(grupo(g)).queryAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent);

test('sin la prop (legacy) el grupo no aparece', () => {
  renderConIdioma(
    <EstiloDelSitioPanel estilo={ESTILO} presets={[]} seleccionado={null} onElegirPreset={jest.fn()} onCambiar={jest.fn()} giro={null} extendidos />,
  );
  expect(screen.queryByText('Botones de las secciones')).toBeNull();
  // «Botones» (estiloBoton) sigue ahí.
  expect(grupo('Botones')).toBeTruthy();
});

test('sin el interruptor: nada elegido aunque el preset guarde tokens, y lo dice', () => {
  const alCambiar = jest.fn();
  renderConIdioma(
    <Panel
      inicial={documento({ boton: { forma: { mode: 'value', value: 'pildora' }, relleno: { mode: 'value', value: 'fantasma' } } })}
      alCambiar={alCambiar}
    />,
  );
  expect(screen.getByText('Botones de las secciones')).toBeTruthy();
  expect(marcado('Forma')).toEqual([]);
  expect(marcado('Relleno')).toEqual([]);
  expect(marcado('Tamaño')).toEqual([]);
  expect(screen.getByText('Tu estilo ya trae Píldora · Fantasma: se aplican al elegir cualquiera.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Volver a lo de hoy' })).toBeNull();
  expect(screen.getByText(/el Relleno de aquí manda sobre «Botones»/)).toBeTruthy();
  // La muestra parte del botón de hoy: radio 12 del Redondeo.
  const muestra = screen.getByRole('img', { name: /Muestra/ });
  expect((muestra.firstElementChild as HTMLElement).style.borderRadius).toBe('12px');
});

test('cada control escribe su token y enciende buttons_theme_active; volver lo apaga sin borrar tokens', () => {
  const alCambiar = jest.fn();
  renderConIdioma(<Panel inicial={documento()} alCambiar={alCambiar} />);
  const ultimo = () => alCambiar.mock.calls.at(-1)![0] as DocumentoSitio;

  fireEvent.click(within(grupo('Forma')).getByRole('radio', { name: 'Píldora' }));
  expect(ultimo().tema.tokens?.boton?.forma).toEqual({ mode: 'value', value: 'pildora' });
  expect(ultimo().shell.header.opciones.buttons_theme_active).toBe(true);
  expect(marcado('Forma')).toEqual(['Píldora']);
  expect(screen.getByText('Aplicados en todas las secciones del sitio.')).toBeTruthy();
  expect((screen.getByRole('img', { name: /Muestra/ }).firstElementChild as HTMLElement).style.borderRadius).toBe('9999px');

  fireEvent.click(within(grupo('Relleno')).getByRole('radio', { name: 'Sombra dura' }));
  expect(ultimo().tema.tokens?.boton?.relleno).toEqual({ mode: 'value', value: 'sombra_dura' });
  fireEvent.click(within(grupo('Tamaño')).getByRole('radio', { name: 'L' }));
  expect(ultimo().tema.tokens?.boton?.tamano).toEqual({ mode: 'value', value: 'l' });

  fireEvent.click(screen.getByRole('switch', { name: 'Mayúsculas' }));
  expect(ultimo().tema.tokens?.boton?.mayusculas).toEqual({ mode: 'value', value: true });
  expect(ultimo().shell.header.opciones.buttons_uppercase_active).toBe(true);
  expect(validarDocumentoSitio(ultimo()).ok).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Volver a lo de hoy' }));
  expect(ultimo().shell.header.opciones.buttons_theme_active).toBe(false);
  expect(ultimo().tema.tokens?.boton).toMatchObject({ forma: { value: 'pildora' }, relleno: { value: 'sombra_dura' }, tamano: { value: 'l' } });
  expect(marcado('Forma')).toEqual([]);
});

test('sin poder escribir tokens, los controles salen deshabilitados', () => {
  renderConIdioma(<Panel inicial={documento()} disponible={false} alCambiar={jest.fn()} />);
  expect(within(grupo('Forma')).getAllByRole('radio').every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
  expect((screen.getByRole('switch', { name: 'Mayúsculas' }) as HTMLButtonElement).disabled).toBe(true);
});
