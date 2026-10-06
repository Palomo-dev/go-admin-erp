/**
 * @jest-environment jsdom
 *
 * Detalle de un dominio (Figma B/07-21, 07-22, 07-23): migas de tres niveles,
 * tarjetas de conexión, certificado, redirecciones, renovación, transferencia
 * y quitar; y los estados no encontrado, sin permiso y error. Hosts ficticios.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { RespuestaDetalleDominio } from '../tiposDominios';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/app/sitio-web/dominios/d-1',
  useSearchParams: () => new URLSearchParams(''),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const autoRenovar = jest.fn(async () => undefined);
const solicitarCodigo = jest.fn(async () => ({ correo: 'admin@tumarca.com' }));
jest.mock('../useDominiosSitio', () => ({
  useDominiosSitio: () => ({
    datos: { alertas: [], hostPublico: 'tumarca.com', subdominio: 'tu-marca' },
    autoRenovar,
    solicitarCodigo,
    quitar: jest.fn(),
    hacerPrincipal: jest.fn(),
    verificar: jest.fn(),
    conectar: jest.fn(),
    cambiarSubdominio: jest.fn(),
    recargar: jest.fn(),
  }),
}));

const detalle = jest.fn();
jest.mock('../apiDominios', () => {
  const real = jest.requireActual('../apiDominios');
  return { ...real, apiDominios: { detalle: (id: string) => detalle(id) } };
});

import { ErrorApiDominios } from '../apiDominios';
import { DetalleDominio } from '../DetalleDominio';

function respuesta(p: Partial<RespuestaDetalleDominio['dominio']> = {}): RespuestaDetalleDominio {
  return {
    dominio: {
      id: 'd-1',
      host: 'tumarca.com',
      tipo: 'comprado',
      estado: 'activo',
      diasParaVencer: null,
      principal: true,
      activo: true,
      redirigeA: null,
      codigoRedireccion: null,
      ssl: 'emitido',
      renovacion: { tipo: 'automatica', venceEn: '2027-03-14T15:00:00Z', precio: null, moneda: null },
      revisadoEn: new Date(Date.now() - 8 * 60_000).toISOString(),
      verificadoEn: '2024-03-14T15:00:00Z',
      compradoEn: '2024-03-14T15:00:00Z',
      motivoError: null,
      ...p,
    },
    registros: [
      { tipo: 'A', nombre: '@', valor: '192.0.2.21', estado: 'correcto', encontrado: null },
      { tipo: 'CNAME', nombre: 'www', valor: 'destino.example.net', estado: 'correcto', encontrado: null },
    ],
    proveedor: 'otro',
    redirecciones: [
      { host: 'www.tumarca.com', hacia: 'tumarca.com' },
      { host: 'tu-marca.goadmin.io', hacia: 'tumarca.com' },
    ],
    transferencia: { puede: true, disponibleEn: '2024-05-13T15:00:00Z' },
    hostSubdominio: 'tu-marca.goadmin.io',
    permisos: { gestionar: true, comprar: true },
    conexionAutomatica: true,
  };
}

beforeEach(() => {
  detalle.mockReset();
  autoRenovar.mockClear();
  solicitarCodigo.mockClear();
});

describe('DetalleDominio', () => {
  test('comprado aquí: migas, subtítulo, conexión, certificado, redirecciones, renovación, transferencia y quitar', async () => {
    detalle.mockResolvedValue(respuesta());
    renderConIdioma(<DetalleDominio dominioId="d-1" />);
    expect(await screen.findByRole('heading', { level: 1, name: /tumarca\.com/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dominios' }).getAttribute('href')).toBe('/app/sitio-web/dominios');
    expect(screen.getByText('Comprado con GO Admin el 14 mar 2024 · principal')).toBeTruthy();
    expect(screen.getByText('Última verificación hace 8 min · todo correcto')).toBeTruthy();
    expect(screen.getByText('Conexión DNS')).toBeTruthy();
    expect(screen.getByText('192.0.2.21')).toBeTruthy();
    expect(screen.getByText("Let's Encrypt (vía Vercel)")).toBeTruthy();
    expect(screen.getByText('www.tumarca.com')).toBeTruthy();
    expect(screen.getByText('14 mar 2027')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Renovar ahora por 1 año' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Solicitar código de transferencia' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Quitar de mi sitio/ })).toBeTruthy();
  });

  test('apagar la renovación usa el hook único', async () => {
    detalle.mockResolvedValue(respuesta());
    renderConIdioma(<DetalleDominio dominioId="d-1" />);
    const sw = await screen.findByRole('switch', { name: 'Renovar automáticamente' });
    await act(async () => {
      fireEvent.click(sw);
    });
    expect(autoRenovar).toHaveBeenCalledWith('d-1', false);
  });

  test('transferencia (B/07-23): el código se pide por correo', async () => {
    detalle.mockResolvedValue(respuesta());
    renderConIdioma(<DetalleDominio dominioId="d-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar código de transferencia' }));
    expect(screen.getByText('Llevar tumarca.com a otro proveedor')).toBeTruthy();
    expect(screen.getByText(/tumarca\.com ya puede\./)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Solicitar código' }));
    });
    expect(solicitarCodigo).toHaveBeenCalledWith('d-1');
  });

  test('quitar (B/07-22): texto según comprado y principal', async () => {
    detalle.mockResolvedValue(respuesta());
    renderConIdioma(<DetalleDominio dominioId="d-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /Quitar de mi sitio/ }));
    expect(screen.getByText('¿Quitar tumarca.com de tu sitio?')).toBeTruthy();
    expect(
      screen.getByText(
        'El sitio dejará de abrir en tumarca.com y www.tumarca.com. El dominio sigue siendo tuyo hasta el 14 mar 2027. Como es el principal, tu-marca.goadmin.io pasa a serlo.',
      ),
    ).toBeTruthy();
  });

  test('externo: «La gestiona tu proveedor» y sin transferencia', async () => {
    detalle.mockResolvedValue({ ...respuesta({ tipo: 'propio', renovacion: { tipo: 'proveedor' }, compradoEn: null }), transferencia: null });
    renderConIdioma(<DetalleDominio dominioId="d-1" />);
    expect(await screen.findByText(/La gestiona tu proveedor/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Solicitar código de transferencia' })).toBeNull();
  });

  test('no encontrado u otra organización: «Volver a Dominios»', async () => {
    detalle.mockRejectedValue(new ErrorApiDominios(404, 'no_existe', 'No encontramos ese dominio.'));
    renderConIdioma(<DetalleDominio dominioId="d-x" />);
    expect(await screen.findByText('No encontramos este dominio')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver a Dominios' }).getAttribute('href')).toBe('/app/sitio-web/dominios');
  });

  test('sin permiso y error con «Reintentar»', async () => {
    detalle.mockRejectedValueOnce(new ErrorApiDominios(403, 'sin_permiso', 'x'));
    const { unmount } = renderConIdioma(<DetalleDominio dominioId="d-1" />);
    expect(await screen.findByText('No tienes permiso para gestionar dominios')).toBeTruthy();
    unmount();
    detalle.mockRejectedValueOnce(new ErrorApiDominios(500, 'error_interno', 'x'));
    renderConIdioma(<DetalleDominio dominioId="d-1" />);
    expect(await screen.findByText('No pudimos consultar el estado de tus dominios')).toBeTruthy();
    detalle.mockResolvedValue(respuesta());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    });
    expect(await screen.findByText('Conexión DNS')).toBeTruthy();
  });
});
