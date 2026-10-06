/**
 * @jest-environment jsdom
 *
 * Sitio web › Páginas (Figma A/04a, 04d-04g): estados listo, cargando, vacío, error y sin
 * permiso, con los datos de `GET /api/sitio-web/paginas` simulados.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { RespuestaPaginas } from '../tiposPaginas';
import type { FilaPagina } from '../vistaPaginas';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/app/sitio-web/paginas',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120, name: 'Mi empresa S.A.S.' } }), getOrganizationId: () => 120 }));
jest.mock('../../useUrlSitio', () => ({
  useUrlSitio: () => ({ host: 'tu-marca.goadmin.io', subdominio: 'tu-marca', url: 'https://tu-marca.goadmin.io', cargando: false, recargar: jest.fn() }),
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
let mockEscritorio = true;
jest.mock('@/components/kit/useEsEscritorio', () => ({ useEsEscritorio: () => mockEscritorio }));

const listar = jest.fn();
const modificar = jest.fn();
jest.mock('../apiPaginas', () => {
  const real = jest.requireActual('../apiPaginas');
  return { ...real, apiPaginas: { ...real.apiPaginas, listar: (...a: unknown[]) => listar(...a), modificar: (...a: unknown[]) => modificar(...a) } };
});

import { PaginasLista } from '../PaginasLista';
import { ErrorApiPaginas } from '../apiPaginas';
import { contarPaginas } from '../vistaPaginas';

function fila(p: Partial<FilaPagina> & { id: string; titulo: string; slug: string }): FilaPagina {
  return {
    ruta: `/${p.slug}`,
    tipo: 'personalizada',
    publicada: true,
    estado: { tipo: 'publicado' },
    enMenu: true,
    legal: false,
    inicio: false,
    seo: 'completo',
    actualizadaEn: '2026-10-02T15:00:00Z',
    ...p,
  };
}

function respuesta(paginas: FilaPagina[], editar = true): RespuestaPaginas {
  return {
    modo: 'v2',
    sitio: { id: 's1', branchId: null, version: 3, v2Adoptado: false, revisionPublicadaId: null },
    paginas,
    contadores: contarPaginas(paginas),
    permisos: { editar, publicar: editar },
    giro: 'restaurante',
    paginasBase: ['Inicio', 'Menú', 'Reservar Mesa', 'Contacto', 'Términos y condiciones'],
    sedes: [],
  };
}

const FILAS = [
  fila({ id: 'p1', titulo: 'Inicio', slug: 'home', ruta: '/', tipo: 'inicio', inicio: true, estado: { tipo: 'cambios', cantidad: 3 } }),
  fila({ id: 'p2', titulo: 'Carta', slug: 'carta', tipo: 'carta', seo: 'falta_descripcion' }),
  fila({ id: 'p3', titulo: 'Eventos', slug: 'eventos', enMenu: false, publicada: false, estado: { tipo: 'sin_publicar' }, seo: 'sin_revisar' }),
  fila({ id: 'p4', titulo: 'Política de privacidad', slug: 'privacidad', tipo: 'legal', legal: true, enMenu: false }),
];

beforeEach(() => {
  mockEscritorio = true;
  listar.mockReset();
  modificar.mockReset();
  push.mockReset();
});

describe('PaginasLista', () => {
  test('listo: subtítulo, pestañas con contadores, columnas y legal en el pie', async () => {
    listar.mockResolvedValue(respuesta(FILAS));
    renderConIdioma(<PaginasLista />);
    expect(await screen.findByText('4 páginas · 1 con cambios sin publicar')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Páginas');
    expect(screen.getByRole('tab', { name: /Todas/ }).textContent).toContain('4');
    expect(screen.getByRole('tab', { name: /Ocultas/ }).textContent).toContain('1');
    expect(screen.getAllByText('Carta').length).toBeGreaterThan(0);
    expect(screen.getByText('Pie de página')).toBeTruthy();
    expect(screen.getByText('Falta descripción')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Menú y navegación/ }).getAttribute('href')).toBe('/app/sitio-web/paginas/menu');
    expect(screen.getByRole('button', { name: /Nueva página/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Editar «Carta»' }).getAttribute('href')).toContain('/app/sitio-web/editor/p2');
  });

  test('interruptor «En el menú» optimista: revierte si el servidor falla', async () => {
    listar.mockResolvedValue(respuesta(FILAS));
    modificar.mockRejectedValue(new ErrorApiPaginas(500, 'error_interno', 'falló'));
    renderConIdioma(<PaginasLista />);
    const sw = await screen.findByRole('switch', { name: 'Mostrar «Eventos» en el menú' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    await waitFor(() => expect(modificar).toHaveBeenCalledWith({ branchId: null, version: 3 }, 'p3', { accion: 'en_menu', enMenu: true }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Mostrar «Eventos» en el menú' }).getAttribute('aria-checked')).toBe('false'));
  });

  test('cargando: esqueleto', () => {
    listar.mockReturnValue(new Promise(() => undefined));
    const { container } = renderConIdioma(<PaginasLista />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  test('vacío: «Aún no tienes páginas» con Nueva página y Restaurar páginas base', async () => {
    listar.mockResolvedValue(respuesta([]));
    renderConIdioma(<PaginasLista />);
    expect(await screen.findByText('Aún no tienes páginas')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Restaurar páginas base/ })).toBeTruthy();
    expect(screen.getByText(/Inicio, Menú, Reservar Mesa, Contacto y legales/)).toBeTruthy();
  });

  test('error: mensaje y Reintentar vuelve a pedir', async () => {
    listar.mockRejectedValueOnce(new ErrorApiPaginas(500, 'error_interno', '')).mockResolvedValueOnce(respuesta(FILAS));
    renderConIdioma(<PaginasLista />);
    expect(await screen.findByText('No pudimos cargar tus páginas')).toBeTruthy();
    expect(screen.getByText('tu-marca.goadmin.io')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('4 páginas · 1 con cambios sin publicar')).toBeTruthy();
    expect(listar).toHaveBeenCalledTimes(2);
  });

  test('sin permiso: sin acciones de cabecera y con «Ver sitio»', async () => {
    listar.mockResolvedValue(respuesta(FILAS, false));
    renderConIdioma(<PaginasLista />);
    expect(await screen.findByText('Solo puedes ver las páginas')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Nueva página/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Menú y navegación/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Ver sitio/ })).toBeTruthy();
  });

  test('403 del GET lleva al mismo estado sin permiso', async () => {
    listar.mockRejectedValue(new ErrorApiPaginas(403, 'sin_permiso', ''));
    renderConIdioma(<PaginasLista />);
    expect(await screen.findByText('Solo puedes ver las páginas')).toBeTruthy();
  });

  test('iconos: la insignia SEO lleva el icono de lo que falta, y el tipo de página su icono de 16', async () => {
    listar.mockResolvedValue(respuesta(FILAS));
    const { container } = renderConIdioma(<PaginasLista />);
    const falta = await screen.findByText('Falta descripción');
    const insignia = falta.closest('[data-salud]');
    expect(insignia?.getAttribute('data-salud')).toBe('falta_descripcion');
    expect(insignia?.querySelector('svg.lucide-align-left')).toBeTruthy();
    expect(container.querySelector('[data-salud="completo"] svg.lucide-search-check')).toBeTruthy();
    expect(container.querySelector('[data-salud="sin_revisar"] svg.lucide-circle-dashed')).toBeTruthy();
    // Carta = cubiertos, a 16 px y trazo 1,5 (escala única de iconosSitio).
    const cubiertos = container.querySelector('td svg.lucide-utensils-crossed');
    expect(cubiertos?.getAttribute('class')).toContain('size-4');
    expect(cubiertos?.getAttribute('stroke-width')).toBe('1.5');
  });

  test('móvil: cada tarjeta lleva el icono de su tipo en caja de 40 y el aviso del computador', async () => {
    mockEscritorio = false;
    listar.mockResolvedValue(respuesta(FILAS));
    const { container } = renderConIdioma(<PaginasLista />);
    expect(await screen.findByText('Para editar secciones, usa un computador')).toBeTruthy();
    const iconos = Array.from(container.querySelectorAll('svg.lucide-utensils-crossed'));
    expect(iconos.some((i) => i.closest('td') === null && (i.getAttribute('class') ?? '').includes('size-5'))).toBe(true);
  });
});
