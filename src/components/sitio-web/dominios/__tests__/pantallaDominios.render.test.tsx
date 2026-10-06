/**
 * @jest-environment jsdom
 *
 * Dominios (Figma B/07-01…07-07, 07-25): los cinco estados de la pantalla
 * sobre el hook único `useDominiosSitio` (doblado), los avisos, la versión
 * móvil y la entrada por `?accion=conectar&sede=` que abre el diálogo único.
 * Organización ficticia 120; hosts ficticios.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import type { DominioSitio, RespuestaDominios } from '../tiposDominios';

// La pantalla no consulta Supabase desde el navegador: la sede de `?sede=` llega resuelta en `datos.sede`.
jest.mock('@/lib/supabase/config', () => ({
  supabase: { from: () => { throw new Error('PantallaDominios no debe consultar tablas desde el navegador'); } },
}));
const push = jest.fn();
const routerPush = jest.fn();
let query = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: (u: string) => routerPush(u), replace: (u: string) => routerPush(u) }),
  usePathname: () => '/app/sitio-web/dominios',
  useSearchParams: () => new URLSearchParams(query),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('../../useUrlSitio', () => ({
  useUrlSitio: () => ({ host: 'tumarca.com', subdominio: 'tu-marca', url: 'https://tumarca.com', cargando: false, recargar: jest.fn() }),
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('@stripe/stripe-js', () => ({ loadStripe: () => null }));
jest.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => children,
  CardElement: () => null,
  useStripe: () => null,
  useElements: () => null,
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const base = (p: Partial<DominioSitio>): DominioSitio => ({
  id: 'd',
  host: 'tumarca.com',
  tipo: 'propio',
  estado: 'activo',
  diasParaVencer: null,
  principal: false,
  activo: true,
  redirigeA: null,
  codigoRedireccion: null,
  ssl: 'emitido',
  renovacion: { tipo: 'proveedor' },
  revisadoEn: null,
  verificadoEn: null,
  compradoEn: null,
  motivoError: null,
  ...p,
});

const SUB = base({ id: 's', host: 'tu-marca.goadmin.io', tipo: 'subdominio', renovacion: { tipo: 'no_vence' } });
const LISTA: DominioSitio[] = [
  base({ id: 'r', host: 'tumarca.com', tipo: 'comprado', principal: true, renovacion: { tipo: 'automatica', venceEn: '2027-03-14T15:00:00Z', precio: null, moneda: null } }),
  base({ id: 'w', host: 'www.tumarca.com', tipo: 'alias_www', redirigeA: 'tumarca.com', codigoRedireccion: 308, renovacion: { tipo: 'incluida', con: 'tumarca.com' } }),
  base({ id: 'c', host: 'tumarca.co', tipo: 'comprado', estado: 'vence_pronto', diasParaVencer: 21, renovacion: { tipo: 'apagada', venceEn: '2026-10-26T15:00:00Z', precio: null, moneda: null } }),
  base({ id: 'v', host: 'tumarca.com.co', estado: 'verificando', ssl: 'pendiente' }),
  base({ id: 'm', host: 'tiendatumarca.shop', estado: 'mal_configurado', ssl: 'no_aplica', motivoError: 'a_otro_servidor' }),
  SUB,
];

function respuesta(p: Partial<RespuestaDominios> = {}): RespuestaDominios {
  return {
    subdominio: 'tu-marca',
    hostSubdominio: 'tu-marca.goadmin.io',
    hostPublico: 'tumarca.com',
    dominios: LISTA,
    alertas: [{ id: 'vence-c', dominioId: 'c', host: 'tumarca.co', tipo: 'vence_sin_renovar', tono: 'advertencia', dias: 21, puedeActivarRenovacion: true }],
    permisos: { gestionar: true, comprar: true },
    conexionAutomatica: true,
    titular: null,
    sede: null,
    ...p,
  };
}

const acciones = {
  recargar: jest.fn(async () => undefined),
  conectar: jest.fn(),
  verificar: jest.fn(),
  hacerPrincipal: jest.fn(),
  quitar: jest.fn(),
  cambiarSubdominio: jest.fn(),
  autoRenovar: jest.fn(async () => LISTA[2]),
  solicitarCodigo: jest.fn(),
};
let hook: Record<string, unknown>;
const opcionesHook = jest.fn();
jest.mock('../useDominiosSitio', () => ({
  useDominiosSitio: (o: unknown) => {
    opcionesHook(o);
    return hook;
  },
}));

import { PantallaDominios } from '../PantallaDominios';

beforeEach(() => {
  query = '';
  simularAncho(1440);
  push.mockReset();
  routerPush.mockReset();
  for (const f of Object.values(acciones)) f.mockClear();
  opcionesHook.mockClear();
  hook = { datos: respuesta(), cargando: false, refrescando: false, fallo: null, ...acciones };
});

describe('PantallaDominios', () => {
  test('cargando (B/07-02): cabecera completa, subtítulo sin host y tabla en esqueleto', () => {
    hook = { ...hook, datos: null, cargando: true };
    renderConIdioma(<PantallaDominios />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Dominios');
    expect(screen.getByText('La dirección de tu sitio en internet')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Conectar un dominio que ya tienes/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Comprar un dominio/ })).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  test('listo (B/07-01): filas, principal, aviso, tipos, renovación y tarjetas de ayuda', () => {
    renderConIdioma(<PantallaDominios />);
    expect(screen.getByText('La dirección de tu sitio en internet · tumarca.com')).toBeTruthy();
    expect(screen.getAllByText('tumarca.co').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Principal · tu sitio abre aquí').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Redirige a tumarca.com (308)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('El registro A apunta a otro servidor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gratis · siempre activo · redirige al principal').length).toBeGreaterThan(0);
    expect(screen.getByText('tumarca.co vence en 21 días y su renovación automática está apagada')).toBeTruthy();
    expect(screen.getAllByText('Comprado aquí').length).toBe(2);
    expect(screen.getAllByText('Automática · 14 mar 2027').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Apagada · vence 26 oct 2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('La gestiona tu proveedor').length).toBe(2);
    expect(screen.getByRole('button', { name: 'Renovar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registros' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revisar' })).toBeTruthy();
    expect(screen.getByText('¿Qué dominio abre mi sitio?')).toBeTruthy();
    expect(screen.getByText('¿Y el correo @tumarca.com?')).toBeTruthy();
  });

  test('«Activar renovación» del aviso usa el hook único', async () => {
    renderConIdioma(<PantallaDominios />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Activar renovación' }));
    });
    expect(acciones.autoRenovar).toHaveBeenCalledWith('c', true);
  });

  test('vacío (B/07-03): solo el subdominio y los dos caminos', () => {
    hook = { ...hook, datos: respuesta({ dominios: [SUB], alertas: [], hostPublico: 'tu-marca.goadmin.io' }) };
    renderConIdioma(<PantallaDominios />);
    expect(screen.getByText('Tu sitio ya está en línea en tu-marca.goadmin.io')).toBeTruthy();
    expect(screen.getByText('¿Ya tienes un dominio?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conectar mi dominio' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Buscar un dominio' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cambiar subdominio' })).toBeTruthy();
  });

  test('error (B/07-04): mensaje y «Reintentar»', () => {
    hook = { ...hook, datos: null, fallo: 'error' };
    renderConIdioma(<PantallaDominios />);
    expect(screen.getByText('No pudimos consultar el estado de tus dominios')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(acciones.recargar).toHaveBeenCalled();
  });

  test('sin permiso (B/07-05): sin Conectar ni Comprar, con «Volver al resumen»', () => {
    hook = { ...hook, datos: null, fallo: 'sin_permiso' };
    renderConIdioma(<PantallaDominios />);
    expect(screen.getByText('No tienes permiso para gestionar dominios')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Conectar un dominio/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Comprar un dominio/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Volver al resumen' }).getAttribute('href')).toBe('/app/sitio-web');
  });

  test('comprar sin permiso de compra: el botón queda deshabilitado y dice por qué', () => {
    hook = { ...hook, datos: respuesta({ permisos: { gestionar: true, comprar: false } }) };
    renderConIdioma(<PantallaDominios />);
    const b = screen.getByRole('button', { name: /Comprar un dominio/ }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toContain('Comprar dominios');
  });

  test('móvil 390 (B/07-25): tarjetas y barra inferior con Conectar y Comprar', () => {
    simularAncho(390);
    renderConIdioma(<PantallaDominios />);
    expect(screen.getByRole('button', { name: 'Conectar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Comprar' })).toBeTruthy();
    expect(screen.getByText('tumarca.co vence en 21 días')).toBeTruthy();
    expect(screen.getByText('Comprado · renueva 14 mar 2027')).toBeTruthy();
  });

  test('móvil 390, vacío (B/07-03): sin barra inferior; las tarjetas ya traen los dos caminos', () => {
    simularAncho(390);
    hook = { ...hook, datos: respuesta({ dominios: [SUB], alertas: [], hostPublico: 'tu-marca.goadmin.io' }) };
    renderConIdioma(<PantallaDominios />);
    expect(screen.getByRole('button', { name: 'Conectar mi dominio' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Buscar un dominio' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Conectar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Comprar' })).toBeNull();
  });

  test('?accion=conectar&sede=7 abre el diálogo único con la sede y conecta (B/07-06 → 07-07)', async () => {
    query = 'accion=conectar&sede=7';
    hook = { ...hook, datos: respuesta({ sede: { id: 7, nombre: 'Sede Centro' } }) };
    acciones.conectar.mockResolvedValue({
      dominio: base({ id: 'n', host: 'nuevo.com.co', estado: 'pendiente' }),
      registros: [
        { tipo: 'A', nombre: '@', valor: '192.0.2.21', estado: 'pendiente', encontrado: null },
        { tipo: 'CNAME', nombre: 'www', valor: 'destino.example.net', estado: 'pendiente', encontrado: null },
      ],
      proveedor: 'godaddy',
      conexionAutomatica: true,
    });
    renderConIdioma(<PantallaDominios />);
    expect(await screen.findByText('Conecta tu dominio')).toBeTruthy();
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy();
    expect(await screen.findByText('Para la sede Sede Centro')).toBeTruthy();
    // La sede se pide en la misma lectura; el servidor la valida con la organización de la sesión.
    expect(opcionesHook).toHaveBeenCalledWith({ sedeId: 7 });
    const campo = screen.getByPlaceholderText('tumarca.com.co');
    fireEvent.change(campo, { target: { value: 'no valido' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    });
    expect(screen.getByText('Escribe un dominio válido, por ejemplo tumarca.com.co.')).toBeTruthy();
    expect(acciones.conectar).not.toHaveBeenCalled();
    fireEvent.change(campo, { target: { value: 'https://www.Nuevo.com.co/' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    });
    expect(acciones.conectar).toHaveBeenCalledWith('nuevo.com.co', 7);
    await waitFor(() => expect(screen.getByText('Crea estos registros en tu proveedor')).toBeTruthy());
    expect(screen.getByText('Detectamos que nuevo.com.co está en GoDaddy. Entra a su panel de DNS y crea:')).toBeTruthy();
    expect(screen.getByText('192.0.2.21')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ya los creé, verificar/ })).toBeTruthy();
  });

  test('verificar un dominio mal configurado muestra lo encontrado y lo esperado (B/07-10)', async () => {
    acciones.verificar.mockResolvedValue({
      dominio: LISTA[4],
      resultado: 'mal_configurado',
      registros: [{ tipo: 'A', nombre: '@', valor: '192.0.2.21', estado: 'otro_valor', encontrado: '192.0.2.10' }],
      revisadoEn: new Date().toISOString(),
      propagacion: { vistos: 0, total: 8 },
      mensaje: null,
    });
    renderConIdioma(<PantallaDominios />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    });
    expect(await screen.findByText('tiendatumarca.shop está mal configurado')).toBeTruthy();
    expect(screen.getByText('Lo que encontramos')).toBeTruthy();
    expect(screen.getByText('A @ → 192.0.2.10')).toBeTruthy();
    expect(screen.getByText('A @ → 192.0.2.21')).toBeTruthy();
    expect(screen.getByText('Borra el registro A viejo')).toBeTruthy();
  });

  test('?accion=comprar abre la búsqueda (B/07-13)', async () => {
    query = 'accion=comprar';
    renderConIdioma(<PantallaDominios />);
    expect(await screen.findByText('Compra tu dominio')).toBeTruthy();
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Buscar/ })).toBeTruthy();
  });
});
