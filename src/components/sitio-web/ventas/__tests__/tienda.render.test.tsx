/**
 * @jest-environment jsdom
 *
 * Tienda del sitio web: el catálogo en móvil nombra cada interruptor y la
 * pestaña Reseñas usa la moderación del área (kit + ruta con permiso), no el
 * panel heredado. Organización ficticia; sin datos reales.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { RespuestaResenas, RespuestaTienda } from '@/lib/website/tiendaSitio.server';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
let tab = 'catalogo';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/sitio-web/tienda',
  useSearchParams: () => new URLSearchParams(`tab=${tab}`),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ code: 'COP', decimals: 0, locale: 'es-CO' }) }));
jest.mock('../../useUrlSitio', () => ({
  useUrlSitio: () => ({ host: 'tu-marca.goadmin.io', subdominio: 'tu-marca', url: 'https://tu-marca.goadmin.io', cargando: false, recargar: jest.fn() }),
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));

const tienda: RespuestaTienda = {
  permisos: { editar: true, publicar: true },
  kpis: { productosActivos: 2, categorias: 1, resenasPendientes: 1 },
  sedes: [{ id: 1, nombre: 'Sede Centro', principal: true, ocultos: 0, agotados: 0 }],
  plantillas: [],
  autoAprobarResenas: false,
  inventarioVisible: false,
};

const resenas: RespuestaResenas = {
  resenas: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      autor: 'Cliente de ejemplo',
      ciudad: null,
      calificacion: 4,
      titulo: 'Muy bueno',
      texto: 'Llegó a tiempo.',
      compraVerificada: true,
      estado: 'pending',
      respuesta: null,
      respondidaEn: null,
      creadaEn: '2026-10-01T15:00:00Z',
      producto: { id: 5, nombre: 'Producto de ejemplo' },
    },
  ],
  total: 1,
  pagina: 1,
  tamano: 20,
  puedeEditar: true,
};

const moderar = jest.fn().mockResolvedValue(undefined);
jest.mock('../useTiendaSitio', () => ({
  ...jest.requireActual('../useTiendaSitio'),
  useTiendaSitio: () => ({ datos: tienda, cargando: false, fallo: null, recargar: jest.fn(), refrescar: jest.fn(), alternarAutoAprobar: jest.fn() }),
  useCatalogoSede: () => ({
    datos: {
      productos: [{ id: 5, name: 'Producto de ejemplo', sku: 'SKU-1', precio_vigente: 10000, ajuste: null }],
      total: 1,
      pagina: 1,
      tamano: 20,
      puedeEditar: true,
    },
    cargando: false,
    fallo: null,
    recargar: jest.fn(),
    cambiar: jest.fn(),
  }),
  useResenasTienda: () => ({ datos: resenas, cargando: false, fallo: null, recargar: jest.fn(), moderar }),
}));

import { PantallaTienda } from '../PantallaTienda';

describe('Tienda', () => {
  test('catálogo en móvil: cada interruptor con su nombre visible', () => {
    tab = 'catalogo';
    renderConIdioma(<PantallaTienda />);
    expect(screen.getAllByText('En la web').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Agotado').length).toBeGreaterThan(0);
  });

  test('Reseñas: moderación del área, sin el panel heredado, con aprobar a un clic', () => {
    tab = 'resenas';
    renderConIdioma(<PantallaTienda />);
    expect(screen.getAllByText('Cliente de ejemplo').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: '4 de 5 estrellas' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Por revisar').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /^Aprobar$/ })[0]);
    expect(moderar).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'aprobar', undefined);
  });

  test('Reseñas: la hoja de detalle publica la respuesta', () => {
    tab = 'resenas';
    moderar.mockClear();
    renderConIdioma(<PantallaTienda />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Cliente de ejemplo' })[0]);
    const hoja = screen.getByRole('dialog');
    fireEvent.change(within(hoja).getByRole('textbox'), { target: { value: 'Gracias por tu compra.' } });
    fireEvent.click(within(hoja).getByRole('button', { name: /Publicar respuesta/ }));
    expect(moderar).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'responder', 'Gracias por tu compra.');
  });
});
