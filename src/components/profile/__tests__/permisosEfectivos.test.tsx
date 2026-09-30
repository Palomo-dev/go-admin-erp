/**
 * @jest-environment jsdom
 */
/**
 * «Permisos efectivos» del perfil (Figma 346:21440): pinta lo que resolvió el
 * servidor, agrupado por módulo; estados cargando, error (con reintento) y
 * vacío; los cuatro idiomas. Sin jest-dom: se comprueba el texto del DOM.
 * Organización ficticia; sin datos reales.
 */
import { act, fireEvent, cleanup } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import PermisosEfectivos from '../PermisosEfectivos';

const RESPUESTA = {
  organizationId: 120,
  accesoTotal: false,
  total: 2,
  grupos: [
    {
      modulo: 'pos',
      permitidos: [
        { codigo: 'pos.vender', nombre: 'Vender en el POS' },
        { codigo: 'pos.caja', nombre: 'Abrir y cerrar su caja' },
      ],
      noIncluidos: [{ codigo: 'pos.cajas.cerrar_ajenas', nombre: 'Cerrar una caja del POS que abrió otra persona' }],
    },
  ],
};

let respuestas: Array<{ ok: boolean; status: number; json: () => Promise<unknown> }> = [];
const fetchMock = jest.fn(async () => respuestas.shift() ?? { ok: false, status: 500, json: async () => ({}) });

beforeAll(() => {
  (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
});
afterEach(() => {
  cleanup();
  fetchMock.mockClear();
});

async function montar(idioma: IdiomaPrueba = 'es') {
  const r = renderConIdioma(<PermisosEfectivos organizacion="Mi empresa S.A.S." />, { idioma });
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
  return r;
}

test('pide la lista a la ruta del servidor, sin mandar organización ni usuario', async () => {
  respuestas = [{ ok: true, status: 200, json: async () => RESPUESTA }];
  await montar();
  expect(fetchMock).toHaveBeenCalledWith('/api/me/permisos', { cache: 'no-store' });
});

test('listo: módulo legible, permisos permitidos y lo que no incluye', async () => {
  respuestas = [{ ok: true, status: 200, json: async () => RESPUESTA }];
  const { container } = await montar();
  const texto = container.textContent ?? '';
  expect(texto).toContain('Permisos efectivos');
  expect(texto).toContain('Mi empresa S.A.S.');
  expect(texto).toContain('Punto de venta');
  expect(texto).toContain('2 permisos');
  expect(texto).toContain('Vender en el POS');
  expect(texto).toContain('No incluye');
  expect(texto).toContain('Cerrar una caja del POS que abrió otra persona');
  expect(container.querySelectorAll('details')).toHaveLength(1);
});

test('acceso total: lo dice arriba', async () => {
  respuestas = [{ ok: true, status: 200, json: async () => ({ ...RESPUESTA, accesoTotal: true }) }];
  const { container } = await montar();
  expect(container.textContent).toContain('Administras esta organización');
});

test('vacío: explica a quién pedir el permiso', async () => {
  respuestas = [{ ok: true, status: 200, json: async () => ({ ...RESPUESTA, total: 0, grupos: [] }) }];
  const { container } = await montar();
  expect(container.textContent).toContain('No tienes permisos asignados');
});

test('error: aviso y «Reintentar» vuelve a pedir', async () => {
  respuestas = [
    { ok: false, status: 500, json: async () => ({}) },
    { ok: true, status: 200, json: async () => RESPUESTA },
  ];
  const { container, getByText } = await montar();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => {
    fireEvent.click(getByText('Reintentar'));
    await new Promise((res) => setTimeout(res, 0));
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain('Vender en el POS');
});

test.each<[IdiomaPrueba, string, string]>([
  ['en', 'Effective permissions', 'Point of sale'],
  ['fr', 'Autorisations effectives', 'Point de vente'],
  ['pt', 'Permissões efetivas', 'Ponto de venda'],
])('%s: títulos y módulos traducidos', async (idioma, titulo, modulo) => {
  respuestas = [{ ok: true, status: 200, json: async () => RESPUESTA }];
  const { container } = await montar(idioma);
  expect(container.textContent).toContain(titulo);
  expect(container.textContent).toContain(modulo);
});
