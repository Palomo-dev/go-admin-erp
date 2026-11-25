/**
 * @jest-environment jsdom
 *
 * Tienda del sitio web: el catálogo en móvil nombra cada interruptor y la
 * pestaña Reseñas usa la moderación del área (kit + ruta con permiso), no el
 * panel heredado. Organización ficticia; sin datos reales.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { RespuestaResenas, RespuestaTienda } from '@/lib/website/tiendaSitio.server';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
const mockCrearDetalle = jest.fn(async (..._a: unknown[]) => 'pagina-nueva');
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
  detalles: { faltan: ['product_detail', 'category_detail'], version: 3 },
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
const mockGuardarAjustes = jest.fn(async (..._a: unknown[]) => undefined);
const ajustesResenas = {
  origenTienda: null,
  moderar: true,
  quienEscribe: 'any' as const,
  fotos: true,
  correo: { activo: false, dias: 7, recordatorio: true },
  remitente: { nombre: 'Tienda de ejemplo', correo: null, dominioVerificado: false },
  puedeEditar: true,
};
jest.mock('../useTiendaSitio', () => ({
  ...jest.requireActual('../useTiendaSitio'),
  useTiendaSitio: () => ({ datos: tienda, cargando: false, fallo: null, recargar: jest.fn(), refrescar: jest.fn(), alternarAutoAprobar: jest.fn(), crearDetalle: (...a: unknown[]) => mockCrearDetalle(...a) }),
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
  useAjustesResenas: () => ({ datos: ajustesResenas, cargando: false, fallo: null, recargar: jest.fn(), guardar: (...a: unknown[]) => mockGuardarAjustes(...a) }),
}));

import { PantallaTienda } from '../PantallaTienda';



describe('Tienda', () => {
  test('catálogo en móvil: cada interruptor con su nombre visible', () => {
    tab = 'catalogo';
    renderConIdioma(<PantallaTienda />);
    expect(screen.getAllByText('En la web').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Agotado').length).toBeGreaterThan(0);
  });

  test('Reseñas: moderación del área (Pendientes / Publicadas / Ocultas), con publicar a un clic', () => {
    tab = 'resenas';
    renderConIdioma(<PantallaTienda />);
    expect(screen.getAllByText('Cliente de ejemplo').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: '4 de 5 estrellas' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pendientes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Publicadas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ocultas').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /^Publicar$/ })[0]);
    expect(moderar).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'aprobar', undefined);
  });

  test('Plantillas sin ficha: tarjetas con «Crear ficha editable» y «Crear página editable»', async () => {
    tab = 'plantillas';
    mockCrearDetalle.mockClear();
    renderConIdioma(<PantallaTienda />);
    expect(screen.getByText('Tu sitio todavía no tiene ficha editable')).toBeTruthy();
    expect(screen.getByText('Tu sitio todavía no tiene página de categoría editable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Crear ficha editable/ }));
    await screen.findByRole('button', { name: /Crear ficha editable/ });
    expect(mockCrearDetalle).toHaveBeenCalledWith('product_detail');
  });

  test('Reseñas: la hoja de la opinión publica y responde como la tienda', () => {
    tab = 'resenas';
    moderar.mockClear();
    renderConIdioma(<PantallaTienda />);
    fireEvent.click(screen.getAllByRole('button', { name: /^Cliente de ejemplo/ })[0]);
    const hoja = screen.getByRole('dialog');
    expect(within(hoja).getByText('Responder como la tienda')).toBeTruthy();
    expect(within(hoja).getByText('Destacar esta opinión')).toBeTruthy();
    fireEvent.change(within(hoja).getByRole('textbox'), { target: { value: 'Gracias por tu compra.' } });
    fireEvent.click(within(hoja).getByRole('button', { name: /Publicar y responder/ }));
    expect(moderar).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'publicar', 'Gracias por tu compra.');
  });

  test('Reseñas: «Ajustes de reseñas» guarda quién puede escribir', async () => {
    tab = 'resenas';
    mockGuardarAjustes.mockClear();
    renderConIdioma(<PantallaTienda />);
    fireEvent.click(screen.getByRole('button', { name: /Ajustes de reseñas/ }));
    const hoja = screen.getByRole('dialog');
    expect(within(hoja).getByText('Origen de las reseñas: Solo ejemplos')).toBeTruthy();
    fireEvent.click(within(hoja).getByRole('radio', { name: 'Solo compradores' }));
    fireEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockGuardarAjustes).toHaveBeenCalledWith({ moderar: true, quienEscribe: 'buyers', fotos: true, correo: { activo: false, dias: 7, recordatorio: true } }),
    );
  });
});
