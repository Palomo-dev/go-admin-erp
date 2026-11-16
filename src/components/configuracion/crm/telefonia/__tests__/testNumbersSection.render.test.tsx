/**
 * @jest-environment jsdom
 */
/**
 * «Números de prueba» (Figma 1810:145821 listo, 1811:908520 estados,
 * 1811:908595 móvil): contador, quién lo agregó, vacío, tope de 10, solo
 * lectura para quien no es administrador (lo dice el servidor) y número inválido.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { TestNumbersSection } from '../TestNumbersSection';

jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ formatDate: (v: string) => `D(${v})` }) }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));

const fila = (n: number) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  phone_e164: `+57300000000${n}`,
  label: `Celular ${n}`,
  created_by: 'u1',
  created_at: '2026-09-30T15:00:00Z',
  created_by_name: 'Ana Admin',
});
const respuesta = (cuerpo: unknown, status = 200) => ({ ok: status < 400, status, json: async () => cuerpo });

function simular(data: unknown[], puedeEditar: boolean) {
  global.fetch = jest.fn(async () => respuesta({ success: true, data, max: 10, puedeEditar })) as unknown as typeof fetch;
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

test('listo: contador «2 de 10», número · etiqueta y «Agregado por …»', async () => {
  simular([fila(1), fila(2)], true);
  renderConIdioma(<TestNumbersSection />, { idioma: 'es' });
  expect((await screen.findAllByText('2 de 10')).length).toBeGreaterThan(0);
  expect(screen.getAllByText('Agregado por Ana Admin · D(2026-09-30T15:00:00Z)')).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: /Quitar el número/ })).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Agregar número' })).toBeTruthy();
});

test('vacío: aviso y «Agregar número» abre el alta', async () => {
  simular([], true);
  renderConIdioma(<TestNumbersSection />, { idioma: 'es' });
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar número' }));
  expect(await screen.findByText('Se normaliza a E.164.')).toBeTruthy();
});

test('tope de 10: aviso y sin alta', async () => {
  simular(Array.from({ length: 10 }, (_, i) => ({ ...fila(i), id: `id-${i}` })), true);
  renderConIdioma(<TestNumbersSection />, { idioma: 'es' });
  expect(await screen.findByText('Llegaste a 10 números de prueba')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Agregar número' }) as HTMLButtonElement).disabled).toBe(true);
});

test('sin permiso: la lista en solo lectura, sin quitar ni agregar', async () => {
  simular([fila(1)], false);
  renderConIdioma(<TestNumbersSection />, { idioma: 'es' });
  expect(await screen.findByText(/Solo un administrador agrega o quita números de prueba/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Quitar/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Agregar número' })).toBeNull();
});

test('número inválido: error con el formato esperado', async () => {
  simular([fila(1)], true);
  renderConIdioma(<TestNumbersSection />, { idioma: 'es' });
  await screen.findByRole('button', { name: 'Agregar número' });
  const campo = document.getElementById('tel-numero-prueba') as HTMLInputElement;
  fireEvent.change(campo, { target: { value: '310 000' } });
  await waitFor(() => expect(screen.getByText('No es un número válido. Usa el formato +57 3xx xxx xxxx.')).toBeTruthy());
});
