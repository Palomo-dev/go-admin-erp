/**
 * @jest-environment jsdom
 *
 * Sitio web › Páginas › Menú y navegación (Figma A/04c, D/04-10): sitio sin borrador (solo
 * lectura hasta el primer cambio), sin permiso y error.
 */
import { TextEncoder } from 'util';
import { screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { validarDocumentoSitio, VERSION_ESQUEMA_DOCUMENTO, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { RespuestaMenusSitio } from '../tiposPaginas';

// jsdom no trae TextEncoder; el contrato lo usa para medir el documento.
Object.assign(globalThis, { TextEncoder });

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/app/sitio-web/paginas/menu',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120, name: 'Mi empresa S.A.S.' } }), getOrganizationId: () => 120 }));
jest.mock('../../useUrlSitio', () => ({
  useUrlSitio: () => ({ host: 'tu-marca.goadmin.io', subdominio: 'tu-marca', url: 'https://tu-marca.goadmin.io', cargando: false, recargar: jest.fn() }),
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/components/kit/useEsEscritorio', () => ({ useEsEscritorio: () => true }));
jest.mock('../../useSitioV2', () => ({
  useSitioV2: () => ({
    sitio: null,
    borrador: null,
    documento: null,
    cargando: false,
    guardando: false,
    publicando: false,
    error: null,
    conflicto: false,
    estadoPublicacion: { tipo: 'sin_publicar' },
    asegurar: jest.fn(),
    guardar: jest.fn(),
    publicar: jest.fn(),
    revisiones: jest.fn(),
    recargar: jest.fn(),
  }),
}));

const menus = jest.fn();
jest.mock('../apiPaginas', () => {
  const real = jest.requireActual('../apiPaginas');
  return {
    ...real,
    apiPaginas: { ...real.apiPaginas, menus: (...a: unknown[]) => menus(...a), categorias: () => Promise.resolve({ categorias: [] }) },
  };
});

import { PantallaMenus } from '../PantallaMenus';
import { ErrorApiPaginas } from '../apiPaginas';

function documento(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: VERSION_ESQUEMA_DOCUMENTO,
    tema: {},
    shell: { header: { composicion: 'H01', menuPrincipalId: 'principal' }, footer: { composicion: 'F03', menuIds: ['legales'] } },
    menus: [
      { id: 'principal', nombre: 'Principal', items: [{ id: 'i1', etiqueta: 'Carta', tipo: 'page', paginaId: 'p-carta' }] },
      { id: 'legales', nombre: 'Legales', items: [{ id: 'i2', etiqueta: 'Política de privacidad', tipo: 'page', paginaId: 'p-priv' }] },
    ],
    paginas: [
      { id: 'p-inicio', slug: 'home', tipo: 'builtin', titulo: 'Inicio', publicada: true, secciones: [] },
      { id: 'p-carta', slug: 'carta', tipo: 'builtin', titulo: 'Carta', publicada: true, secciones: [] },
      { id: 'p-priv', slug: 'privacidad', tipo: 'legal', titulo: 'Política de privacidad', publicada: true, secciones: [] },
    ],
  });
  if (!r.ok) throw new Error('documento inválido');
  return r.documento;
}

const respuesta = (editar: boolean): RespuestaMenusSitio => ({
  modo: 'legacy',
  permisos: { editar, publicar: editar },
  giro: 'restaurante',
  sedes: [],
  documento: documento(),
});

beforeEach(() => menus.mockReset());

describe('PantallaMenus', () => {
  test('sitio sin borrador: encabezado, grupos del pie y aviso de borrador', async () => {
    menus.mockResolvedValue(respuesta(true));
    renderConIdioma(<PantallaMenus />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Menú y navegación' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Páginas' }).getAttribute('href')).toBe('/app/sitio-web/paginas');
    expect(await screen.findByRole('heading', { name: 'Encabezado' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pie de página' })).toBeTruthy();
    expect(screen.getAllByText('Política de privacidad').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Guardar en borrador/ })).toBeTruthy();
  });

  test('sin permiso: estado forbidden y sin botones de guardado', async () => {
    menus.mockResolvedValue(respuesta(false));
    renderConIdioma(<PantallaMenus />);
    expect(await screen.findByText(/necesitas el permiso/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Guardar en borrador/ })).toBeNull();
  });

  test('error: Reintentar', async () => {
    menus.mockRejectedValue(new ErrorApiPaginas(500, 'error_interno', ''));
    renderConIdioma(<PantallaMenus />);
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeTruthy();
  });
});
