/**
 * @jest-environment jsdom
 *
 * Diálogos del editor con sus estados (Figma A/05g, A/05h, A/05i, D/05-24). Datos ficticios.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { DialogoPublicar } from '../DialogoPublicar';
import { DialogoConflicto } from '../DialogoConflicto';
import { PanelHistorial } from '../PanelHistorial';

jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
  getOrganizationId: () => 120,
  ORGANIZATION_CHANGED_EVENT: 'org-cambio',
}));

const baseDialogo = {
  abierto: true,
  onAbiertoChange: jest.fn(),
  nombreSitio: 'Sitio principal',
  esSede: false,
  ultimaPublicacion: { en: '2026-10-03T23:40:00Z', autor: 'Persona de prueba' },
  v2Adoptado: true,
  publicando: false,
  onVer: jest.fn(),
  onPublicar: jest.fn(),
  onProgramar: jest.fn(),
};

describe('DialogoPublicar', () => {
  test('lista los cambios, publica ahora con la nota y «Ver» lleva a la sección', () => {
    const onPublicar = jest.fn();
    const onVer = jest.fn();
    renderConIdioma(
      <DialogoPublicar
        {...baseDialogo}
        onPublicar={onPublicar}
        onVer={onVer}
        programarDisponible
        cambios={[
          { tipo: 'seccion', accion: 'nueva', paginaId: 'p1', pagina: 'Inicio', seccionId: 's9', seccionTipo: 'events' },
          { tipo: 'tema', colores: [{ rol: 'primario', antes: '#C8A97E', despues: '#8C6A3F' }], tipografia: false, otros: false },
        ]}
      />,
    );
    expect(screen.getByText(/^2 cambios desde la última publicación/)).toBeTruthy();
    expect(screen.getByText('Inicio · Eventos')).toBeTruthy();
    expect(screen.getByText('Acento #C8A97E → #8C6A3F')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nota de la versión (opcional)'), { target: { value: 'Carta de temporada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar ahora' }));
    expect(onPublicar).toHaveBeenCalledWith({ nota: 'Carta de temporada', tambienPrincipal: false });
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver' })[0]);
    expect(onVer).toHaveBeenCalledWith({ paginaId: 'p1', seccionId: 's9' });
  });

  test('sin la migración de programaciones, «Programar» queda apagado con su motivo', () => {
    renderConIdioma(<DialogoPublicar {...baseDialogo} programarDisponible={false} cambios={[]} />);
    expect(screen.getByText('Programar aún no está activo en tu cuenta')).toBeTruthy();
    expect(screen.getByText('No hay cambios desde la última publicación.')).toBeTruthy();
  });

  test('en una sede: «Publicar Sede Norte» y la casilla del principal', () => {
    const onPublicar = jest.fn();
    renderConIdioma(
      <DialogoPublicar
        {...baseDialogo}
        esSede
        nombreSitio="Sede Norte"
        direccion="tumarca.goadmin.io/sede-norte"
        principalConCambios
        programarDisponible
        cambios={[]}
        onPublicar={onPublicar}
      />,
    );
    expect(screen.getByText(/Solo se publica tumarca.goadmin.io\/sede-norte/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar Sede Norte' }));
    expect(onPublicar).toHaveBeenCalledWith({ nota: null, tambienPrincipal: true });
  });
});

describe('DialogoConflicto', () => {
  test('sin revisión base no se puede combinar; descartar resuelve', async () => {
    const onResolver = jest.fn(async () => true);
    renderConIdioma(
      <DialogoConflicto
        abierto
        onAbiertoChange={jest.fn()}
        conflicto={{ autor: 'Persona de prueba', cuando: new Date().toISOString(), publicado: true, puedeCombinar: false }}
        prepararCombinacion={jest.fn()}
        onResolver={onResolver}
      />,
    );
    expect(screen.getByText(/Persona de prueba publicó cambios/)).toBeTruthy();
    expect(screen.getByText('No disponible: tu borrador no parte de una versión publicada.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar y cargar' }));
    await waitFor(() => expect(onResolver).toHaveBeenCalledWith('descartar'));
  });

  test('combinar con choques pide elegir «La mía» o «La suya» antes de guardar', async () => {
    const documento = { schemaVersion: 1 } as never;
    const prepararCombinacion = jest
      .fn()
      .mockResolvedValue({ documento, choques: [{ clave: 'seccion:p1/a', tipo: 'seccion', paginaId: 'p1', titulo: 'Inicio', seccionId: 'a', seccionTipo: 'hero' }] });
    const onResolver = jest.fn(async () => true);
    renderConIdioma(
      <DialogoConflicto
        abierto
        onAbiertoChange={jest.fn()}
        conflicto={{ autor: null, cuando: null, publicado: false, puedeCombinar: true }}
        prepararCombinacion={prepararCombinacion}
        onResolver={onResolver}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Combinar' }));
    expect(await screen.findByText('1 cambios chocan')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'La suya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Combinar con lo elegido' }));
    await waitFor(() => expect(onResolver).toHaveBeenCalledWith('combinar', documento));
    expect(prepararCombinacion).toHaveBeenLastCalledWith({ 'seccion:p1/a': 'suya' });
  });
});

describe('PanelHistorial', () => {
  const props = {
    sitioId: '11111111-1111-4111-8111-111111111111',
    borradorActualizadoEn: '2026-10-06T15:12:00Z',
    cambiosBorrador: 3,
    marca: 'x',
    onCerrar: jest.fn(),
    onVer: jest.fn(),
    onRestaurar: jest.fn(async () => true),
  };

  test('vacío: «Aún no has publicado»', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string) =>
      url.includes('instantaneas')
        ? { ok: false, status: 503, json: async () => ({ error: { code: 'no_disponible', message: '' } }) }
        : { ok: true, status: 200, json: async () => ({ revisiones: [] }) },
    );
    renderConIdioma(<PanelHistorial {...props} />);
    expect(await screen.findByText('Aún no has publicado')).toBeTruthy();
    expect(screen.getByText('Borrador actual')).toBeTruthy();
  });

  test('lista versiones; elegir una muestra «Ver esta versión» y restaurar pide confirmación', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string) =>
      url.includes('instantaneas')
        ? { ok: true, status: 200, json: async () => ({ instantaneas: [] }) }
        : {
            ok: true,
            status: 200,
            json: async () => ({
              revisiones: [
                { id: 'r2', numero: 2, nota: 'Carta de temporada', publicadaEn: '2026-10-03T23:40:00Z', publicadaPor: null, autor: null, versionBorrador: 4, enLinea: true },
                { id: 'r1', numero: 1, nota: null, publicadaEn: '2026-09-15T21:10:00Z', publicadaPor: null, autor: null, versionBorrador: 2, enLinea: false },
              ],
            }),
          },
    );
    const onRestaurar = jest.fn(async () => true);
    renderConIdioma(<PanelHistorial {...props} onRestaurar={onRestaurar} />);
    fireEvent.click(await screen.findByRole('button', { name: /Versión 1/ }));
    expect(screen.getByRole('button', { name: 'Ver esta versión' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    expect(await screen.findByText(/reemplaza los 3 cambios sin publicar/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar en borrador' }));
    await waitFor(() => expect(onRestaurar).toHaveBeenCalledWith({ tipo: 'revision', id: 'r1' }));
  });

  test('error con «Reintentar»', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => null }));
    renderConIdioma(<PanelHistorial {...props} />);
    expect(await screen.findByText('No pudimos cargar el historial')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeTruthy();
  });
});
