/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSitioV2 } from '../useSitioV2';
import type { BorradorSitio, ResultadoPublicacion } from '@/lib/website/v2/tipos';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';

const api = { listar: jest.fn(), borrador: jest.fn(), publicar: jest.fn(), guardar: jest.fn() };
jest.mock('@/lib/website/v2/clienteSitiosV2', () => ({
  clienteSitiosV2: new Proxy({}, { get: (_t, k: keyof typeof api) => api[k] }),
  ErrorApiSitio: class extends Error {},
}));
const doc = { schemaVersion: 1, paginas: [], tema: {}, identidad: {}, shell: {}, menus: [], seo: {}, contenido: {} } as unknown as DocumentoSitio;
const borrador: BorradorSitio = {
  sitio: { id: 'sitio-140', branchId: null, v2Adoptado: true, v2AdoptadoEn: '2026-10-01', revisionPublicadaId: 'anterior', versionBorrador: 2, borradorActualizadoEn: '2026-10-24', cambiosSinPublicar: true },
  documento: doc, version: 2, actualizadoEn: '2026-10-24', revisionBaseId: 'anterior', basePrincipal: null, erroresContrato: [],
};
const publicada: ResultadoPublicacion = { revisionId: 'nueva', numero: 2, publicadaEn: '2026-10-24', idempotente: false };
beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.listar.mockResolvedValue([borrador.sitio]);
  api.borrador.mockResolvedValue(borrador);
  api.guardar.mockResolvedValue({ version: 3, actualizadoEn: '2026-10-24' });
});

async function cargar() {
  const h = renderHook(() => useSitioV2());
  await waitFor(() => expect(h.result.current.cargando).toBe(false));
  return h;
}

test('Publicando sigue activo hasta ACK; al confirmar limpia cambios y conserva la versión publicada', async () => {
  let terminar: (r: ResultadoPublicacion) => void = () => undefined;
  api.publicar.mockImplementation(() => new Promise<ResultadoPublicacion>((resolve) => { terminar = resolve; }));
  const h = await cargar();
  let operacion: Promise<ResultadoPublicacion | null>;
  act(() => { operacion = h.result.current.publicar(); });
  expect(h.result.current.publicando).toBe(true);
  expect(h.result.current.sitio?.cambiosSinPublicar).toBe(true);
  await act(async () => { terminar(publicada); await operacion; });
  expect(h.result.current.publicando).toBe(false);
  expect(h.result.current.sitio?.revisionPublicadaId).toBe('nueva');
  expect(h.result.current.sitio?.cambiosSinPublicar).toBe(false);
});

test('un fallo de confirmación conserva cambios para reintentar y muestra error', async () => {
  api.publicar.mockRejectedValueOnce(new Error('Sin ACK'));
  const h = await cargar();
  const leerError = h.result.current.errorDePublicacion;
  await act(async () => {
    expect(await h.result.current.publicar()).toBeNull();
    expect(leerError?.()).toBeInstanceOf(Error);
  });
  expect(h.result.current.publicando).toBe(false);
  expect(h.result.current.sitio?.cambiosSinPublicar).toBe(true);
  expect(h.result.current.estadoPublicacion.tipo).toBe('error');
  api.publicar.mockResolvedValueOnce({ ...publicada, idempotente: true });
  await act(async () => { await h.result.current.publicar(); });
  expect(h.result.current.sitio?.cambiosSinPublicar).toBe(false);
  expect(api.publicar.mock.calls.map((x) => x.slice(0, 2))).toEqual([['sitio-140', 2], ['sitio-140', 2]]);
});

test('callbacks que no editan no escriben ni crean cambios pendientes', async () => {
  api.borrador.mockResolvedValueOnce({ ...borrador, sitio: { ...borrador.sitio, cambiosSinPublicar: false } });
  const h = await cargar();
  await act(async () => { expect(await h.result.current.guardar((d) => ({ ...d }))).toBe(true); });
  expect(api.guardar).not.toHaveBeenCalled();
  expect(h.result.current.sitio?.cambiosSinPublicar).toBe(false);
});

test('una edición guardada durante la publicación no se pierde al recibir el ACK anterior', async () => {
  let terminar: (r: ResultadoPublicacion) => void = () => undefined;
  api.publicar.mockImplementation(() => new Promise<ResultadoPublicacion>((resolve) => { terminar = resolve; }));
  const h = await cargar();
  let operacion: Promise<ResultadoPublicacion | null>;
  act(() => { operacion = h.result.current.publicar(); });
  await act(async () => { await h.result.current.guardar((d) => ({ ...d, contenido: { textoPie: { mode: 'value', value: 'Nueva edición' } } })); });
  await act(async () => { terminar(publicada); await operacion; });
  expect(h.result.current.documento?.contenido).toEqual({ textoPie: { mode: 'value', value: 'Nueva edición' } });
  expect(h.result.current.sitio?.cambiosSinPublicar).toBe(true);
  expect(h.result.current.borrador?.version).toBe(3);
});
