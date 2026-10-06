/**
 * @jest-environment jsdom
 *
 * MarcoSitioWeb (Figma A/02a-02e): cabecera del catálogo con «estado ·
 * dirección», «Ver sitio» + «Abrir editor» y los cinco estados de página.
 */
import { screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { MarcoSitioWeb, EstadoAjustes } from '../MarcoSitioWeb';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/app/sitio-web' }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }) }));
const leerUrl = jest.fn();
jest.mock('../useUrlSitio', () => ({
  useUrlSitio: (id: number | null | undefined) => leerUrl(id),
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));

beforeEach(() => {
  leerUrl.mockReset();
  leerUrl.mockReturnValue({ host: 'www.tumarca.co', subdominio: 'tu-marca', url: 'https://www.tumarca.co', cargando: false, recargar: jest.fn() });
});

describe('MarcoSitioWeb', () => {
  test('listo: migas, título del catálogo, «Publicado · host», Ver sitio y Abrir editor', () => {
    renderConIdioma(
      <MarcoSitioWeb href="/app/sitio-web" estadoPublicacion={{ tipo: 'publicado' }} rutaEditor="/app/sitio-web/editor/p1">
        <p>contenido</p>
      </MarcoSitioWeb>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Resumen');
    expect(screen.getByText('Publicado · www.tumarca.co')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ver sitio/ }).getAttribute('href')).toBe('https://www.tumarca.co');
    expect(screen.getByRole('link', { name: /Abrir editor/ }).getAttribute('href')).toBe('/app/sitio-web/editor/p1');
    expect(screen.getByText('contenido')).toBeTruthy();
    expect(leerUrl).toHaveBeenCalledWith(120);
  });

  test('vista sin entrada en el catálogo: migas padre y título propio', () => {
    renderConIdioma(
      <MarcoSitioWeb href="/app/sitio-web/paginas/menu" titulo="Menú y navegación" migasPadre={[{ etiqueta: 'Páginas', href: '/app/sitio-web/paginas' }]} host={null} />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Menú y navegación');
    expect(screen.getByRole('link', { name: 'Páginas' })).toBeTruthy();
    expect(leerUrl).toHaveBeenCalledWith(null);
  });

  test('error: mensaje, Reintentar y sin «Abrir editor»', () => {
    const onReintentar = jest.fn();
    renderConIdioma(
      <MarcoSitioWeb href="/app/sitio-web" estado="error" onReintentar={onReintentar} rutaEditor="/x" nombreContenido="el resumen del sitio">
        <p>contenido</p>
      </MarcoSitioWeb>,
    );
    expect(screen.getByText('No pudimos cargar el resumen del sitio')).toBeTruthy();
    expect(screen.queryByText('contenido')).toBeNull();
    expect(screen.queryByRole('link', { name: /Abrir editor/ })).toBeNull();
  });

  test('sin permiso: título «Sitio web», sin acciones y «Volver al inicio»', () => {
    renderConIdioma(<MarcoSitioWeb href="/app/sitio-web/diseno" estado="sin_permiso" rutaEditor="/x" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sitio web');
    expect(screen.getByText('No tienes acceso al sitio web')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver al inicio' }).getAttribute('href')).toBe('/app/inicio');
    expect(screen.queryByRole('link', { name: /Ver sitio/ })).toBeNull();
  });

  test('primera vez: lleva al asistente', () => {
    renderConIdioma(<MarcoSitioWeb href="/app/sitio-web" estado="primera_vez" />);
    expect(screen.getByRole('link', { name: 'Crear mi sitio' }).getAttribute('href')).toBe('/app/sitio-web/primera-configuracion');
  });

  test('cargando: subtítulo «Cargando…» y esqueleto', () => {
    const { container } = renderConIdioma(<MarcoSitioWeb href="/app/sitio-web" estado="cargando" />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  test('EstadoAjustes conserva el contrato viejo y suma sin permiso', () => {
    const { rerender } = renderConIdioma(
      <EstadoAjustes cargando={false} hayAjustes onReintentar={() => {}}>
        <p>ajustes</p>
      </EstadoAjustes>,
    );
    expect(screen.getByText('ajustes')).toBeTruthy();
    rerender(
      <EstadoAjustes cargando={false} hayAjustes onReintentar={() => {}} sinPermiso>
        <p>ajustes</p>
      </EstadoAjustes>,
    );
    expect(screen.getByText('No tienes acceso al sitio web')).toBeTruthy();
  });
});
