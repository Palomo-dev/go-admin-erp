/**
 * @jest-environment jsdom
 *
 * El editor real (CodeMirror) se carga con next/dynamic y ssr:false. Aquí el
 * doble es un textarea: así se prueba que guardar y editar dejan el mismo
 * texto que antes, sin recortes.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import type { CodigoMedida } from '@/lib/website/configuracionSitio';
import { accionEscapeEditor } from '../escapeEditorCodigo';
import { useTextosConfiguracion, type TraductorConfiguracion } from '../textos';

jest.mock('next/dynamic', () => {
  const llamadas: Array<{ ssr?: boolean; origen: string; cargador: () => Promise<unknown> }> = [];
  const dynamic = (cargador: () => Promise<unknown>, opciones?: { ssr?: boolean }) => {
    llamadas.push({ ssr: opciones?.ssr, origen: String(cargador), cargador });
    // El doble del editor vive dentro de la fábrica de jest.mock, que no puede importar.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react') as typeof import('react');
    function EditorFalso(props: { valor?: string; onChange?: (valor: string) => void; soloLectura?: boolean }) {
      if (props.soloLectura) {
        return React.createElement('pre', { 'aria-label': 'Código' }, props.valor ?? '');
      }
      return React.createElement('textarea', {
        'aria-label': 'Código',
        value: props.valor ?? '',
        onChange: (e: { target: { value: string } }) => props.onChange?.(e.target.value),
      });
    }
    return EditorFalso;
  };
  (dynamic as unknown as { llamadas: typeof llamadas }).llamadas = llamadas;
  return dynamic;
});

import dynamic from 'next/dynamic';
import { SeccionCodigo, type SeccionCodigoProps } from '../SeccionCodigo';

const llamadas = (dynamic as unknown as { llamadas: Array<{ ssr?: boolean; origen: string; cargador: () => Promise<{ EditorCodigo?: unknown }> }> }).llamadas;

const CINCO = 'linea 1\nlinea 2\nlinea 3\nlinea 4\n  linea 5  ';
const CON_ESPACIOS = '  <script src="https://cdn.ejemplo/a.js"></script>  \n';

function Pantalla(props: Omit<SeccionCodigoProps, 't'>) {
  const t: TraductorConfiguracion = useTextosConfiguracion();
  return <SeccionCodigo {...props} t={t} />;
}

function bloque(codigo: string, extra: Partial<CodigoMedida> = {}): CodigoMedida {
  return {
    id: 'c1',
    nombre: 'Chat de soporte externo',
    alcance: 'todas',
    posicion: 'body',
    activo: true,
    codigo,
    autor: 'Persona de prueba',
    creadoEn: '2026-10-01',
    ...extra,
  };
}

beforeEach(() => {
  simularAncho(1440);
});

describe('editor de código a medida', () => {
  it('carga el editor de forma diferida y sin SSR', async () => {
    expect(llamadas.length).toBeGreaterThan(0);
    expect(llamadas.every((l) => l.ssr === false)).toBe(true);
    expect(llamadas.some((l) => l.origen.includes('EditorCodigo'))).toBe(true);
    const modulo = await llamadas[0].cargador();
    expect(modulo).toEqual(expect.any(Function));
  });

  it('guardar un bloque nuevo deja el código exactamente como se escribió', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<Pantalla codigo={[]} onCambiar={onCambiar} pendiente={false} />);
    expect(screen.getByText('El código a medida se ejecuta en cada visita a tu sitio')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Añadir código' }));
    expect(screen.getByText('Dónde se carga')).toBeTruthy();
    expect(screen.getByText('Posición')).toBeTruthy();
    expect(screen.getByText('0 / 20000')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre/ }), { target: { value: '  Chat  ' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Código' }), { target: { value: CON_ESPACIOS } });
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));

    expect(onCambiar).toHaveBeenCalledTimes(1);
    expect(onCambiar.mock.calls[0][0]).toEqual([
      {
        id: null,
        activo: true,
        autor: null,
        creadoEn: null,
        nombre: 'Chat',
        alcance: 'todas',
        posicion: 'body',
        codigo: CON_ESPACIOS,
      },
    ]);
  });

  it('editar abre el código completo y al guardar no lo recorta', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<Pantalla codigo={[bloque(CINCO)]} onCambiar={onCambiar} pendiente={false} />);
    expect(screen.getByLabelText('Código').textContent).toBe('linea 1\nlinea 2\nlinea 3');

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const campo = screen.getByRole('textbox', { name: 'Código' });
    expect(campo).toHaveProperty('value', CINCO);
    fireEvent.change(campo, { target: { value: CON_ESPACIOS } });
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));

    expect(onCambiar).toHaveBeenCalledWith([
      {
        id: 'c1',
        nombre: 'Chat de soporte externo',
        alcance: 'todas',
        posicion: 'body',
        activo: true,
        codigo: CON_ESPACIOS,
        autor: 'Persona de prueba',
        creadoEn: '2026-10-01',
      },
    ]);
  });

  it('no deja guardar una etiqueta sin cerrar y sí avisa sin bloquear en head o en un documento', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<Pantalla codigo={[]} onCambiar={onCambiar} pendiente={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir código' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre/ }), { target: { value: 'Pixel' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Código' }), { target: { value: '<div>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByText('La etiqueta «div» no está cerrada.')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Código' }), { target: { value: '<div></div>' } });
    fireEvent.click(screen.getByRole('radio', { name: 'En <head>' }));
    expect(screen.getByText(/elementos que se ven en la página/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(onCambiar.mock.calls[0][0][0].codigo).toBe('<div></div>');
    expect(onCambiar.mock.calls[0][0][0].posicion).toBe('head');

    onCambiar.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir código' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre/ }), { target: { value: 'Página' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Código' }), {
      target: { value: '<html><body><script></script></body></html>' },
    });
    expect(screen.getByText(/página completa/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(onCambiar.mock.calls[0][0][0].codigo).toBe('<html><body><script></script></body></html>');
    expect(onCambiar.mock.calls[0][0][0].posicion).toBe('body');
  });

  it('Escape dentro del editor sale del foco y, con el buscador abierto, cierra el panel', () => {
    const raiz = document.createElement('div');
    const campo = document.createElement('div');
    raiz.appendChild(campo);
    expect(accionEscapeEditor({ tecla: 'Escape', activo: campo, raiz, panelAbierto: false })).toBe('salir');
    expect(accionEscapeEditor({ tecla: 'Escape', activo: campo, raiz, panelAbierto: true })).toBe('cerrar-panel');
    expect(accionEscapeEditor({ tecla: 'Escape', activo: document.body, raiz, panelAbierto: false })).toBe('ignorar');
    expect(accionEscapeEditor({ tecla: 'Enter', activo: campo, raiz, panelAbierto: false })).toBe('ignorar');
  });
});
