/**
 * @jest-environment jsdom
 *
 * Resumen del sitio (Figma A/02a-02g): los cinco estados sobre
 * `GET /api/sitio-web/resumen` (doblado) y las acciones que dependen de los
 * permisos resueltos en el servidor. Organización ficticia; sin datos reales.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { ResumenSitioRespuesta } from '@/lib/website/resumenSitio';
import { calcularLanzamiento } from '@/lib/website/resumenSitio';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }), usePathname: () => '/app/sitio-web' }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('../../useUrlSitio', () => ({
  useUrlSitio: () => ({ host: 'tu-marca.goadmin.io', subdominio: 'tu-marca', url: 'https://tu-marca.goadmin.io', cargando: false, recargar: jest.fn() }),
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('qrcode.react', () => ({ QRCodeCanvas: () => null }));

let resumen: { datos: ResumenSitioRespuesta | null; cargando: boolean; fallo: 'error' | 'sin_permiso' | null; recargar: jest.Mock };
jest.mock('../useResumenSitio', () => ({ useResumenSitio: () => resumen }));
const publicar = jest.fn();
jest.mock('../../useSitioV2', () => ({
  useSitioV2: () => ({
    borrador: { version: 4 },
    publicando: false,
    conflicto: false,
    error: null,
    estadoPublicacion: { tipo: 'publicado' },
    publicar,
    recargar: jest.fn(),
  }),
}));

import { ResumenSitio } from '../ResumenSitio';

function datos(parcial: Partial<ResumenSitioRespuesta> = {}): ResumenSitioRespuesta {
  const primeraVez = parcial.estado === 'primera_vez';
  return {
    estado: 'listo',
    giro: 'restaurante',
    typeId: 1,
    sitio: {
      v2Id: 's-1',
      versionBorrador: 4,
      origen: 'v2',
      host: 'www.tumarca.co',
      url: 'https://www.tumarca.co',
      subdominioHost: 'tu-marca.goadmin.io',
      hostEsPropio: true,
      nombre: 'Tu marca',
      plantillaId: null,
      ultimaPublicacion: null,
      publicado: true,
      cambiosSinPublicar: { cantidad: 3, areas: [{ tipo: 'pagina', id: 'p1', titulo: 'Inicio', accion: 'editada' }, { tipo: 'tema' }] },
      paginaInicioId: 'p1',
    },
    lanzamiento: calcularLanzamiento({
      giro: 'restaurante',
      primeraVez,
      plantillaId: primeraVez ? null : 'restaurant_modern',
      estiloElegido: !primeraVez,
      datos: { logo: true, nombre: true, contacto: true, sedePrincipal: 'Sede Centro' },
      inventario: primeraVez ? { productos: 0, categorias: 0 } : { productos: 42, categorias: 6 },
      pasarela: false,
      dominio: { propio: primeraVez ? null : 'www.tumarca.co', opcion: null },
      publicacion: { publicado: !primeraVez, cambios: 3 },
    }),
    kpis: {
      disponible: primeraVez ? 'sin_publicar' : 'si',
      visitas: 1284,
      visitasAnterior: 1146,
      pedidos: 37,
      reservas: 18,
      conversion: 0.029,
      hrefPedidos: '/app/pos/pedidos-online',
      hrefReservas: '/app/pos/reservas-mesas',
      hrefAnalitica: '/app/sitio-web/analitica',
    },
    alertas: [
      {
        id: 'sin-pasarela',
        tono: 'informacion',
        titulo: { clave: 'alertas.sinPasarelaTitulo' },
        descripcion: { clave: 'alertas.sinPasarelaDescripcion' },
        accion: { etiqueta: { clave: 'alertas.conectarPasarela' }, href: '/app/sitio-web/ventas' },
      },
    ],
    cambios: [],
    permisos: { editar: true, publicar: true },
    onboarding: { pasoActual: null, iniciado: false },
    ...parcial,
  };
}

beforeEach(() => {
  push.mockReset();
  publicar.mockReset();
  resumen = { datos: datos(), cargando: false, fallo: null, recargar: jest.fn() };
});

describe('ResumenSitio', () => {
  test('cargando (A/02c): esqueleto ocupado y «Abrir editor» deshabilitado', () => {
    resumen = { datos: null, cargando: true, fallo: null, recargar: jest.fn() };
    const { container } = renderConIdioma(<ResumenSitio />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect((screen.getAllByRole('button', { name: /Abrir editor/ })[0] as HTMLButtonElement).disabled).toBe(true);
  });

  test('listo (A/02a): dirección real, lista «5 de 7», KPIs, alerta y publicar', () => {
    renderConIdioma(<ResumenSitio />);
    expect(screen.getByRole('heading', { level: 2, name: 'www.tumarca.co' })).toBeTruthy();
    expect(screen.getByText(/también responde en tu-marca\.goadmin\.io/)).toBeTruthy();
    expect(screen.getAllByText('5 de 7').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1.284').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Aún no recibes pagos en línea').length).toBeGreaterThan(0);
    expect(screen.getByText(/3 · Inicio y estilo del sitio/)).toBeTruthy();
    const abrir = screen.getAllByRole('link', { name: /Abrir editor/ })[0];
    expect(abrir.getAttribute('href')).toBe('/app/sitio-web/editor/p1');
    fireEvent.click(screen.getByRole('button', { name: /Publicar cambios/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  test('sin website.sites.publish: «Publicar cambios» deshabilitado; sin edit, sin «Abrir editor» ni «Configurar»', () => {
    resumen = { ...resumen, datos: datos({ permisos: { editar: false, publicar: false } }) };
    renderConIdioma(<ResumenSitio />);
    expect((screen.getByRole('button', { name: /Publicar cambios/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('link', { name: /Abrir editor/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Configurar/ })).toBeNull();
  });

  test('primera vez (A/02b): héroe, «Empezar configuración» al asistente y lista «0 de 7»', () => {
    resumen = { ...resumen, datos: datos({ estado: 'primera_vez' }) };
    renderConIdioma(<ResumenSitio />);
    expect(screen.getByText('Tu sitio está a 6 pasos de estar en línea')).toBeTruthy();
    const empezar = screen.getAllByRole('link', { name: 'Empezar configuración' });
    expect(empezar[0].getAttribute('href')).toBe('/app/sitio-web/primera-configuracion');
    expect(screen.getByText('0 de 7')).toBeTruthy();
    expect(screen.getAllByText('Disponible cuando publiques').length).toBeGreaterThan(0);
  });

  test('primera vez con avance guardado: «Seguir donde ibas» en el paso guardado', () => {
    resumen = { ...resumen, datos: datos({ estado: 'primera_vez', onboarding: { pasoActual: 3, iniciado: true } }) };
    renderConIdioma(<ResumenSitio />);
    expect(screen.getAllByRole('link', { name: 'Seguir donde ibas' })[0].getAttribute('href')).toBe('/app/sitio-web/primera-configuracion?paso=3');
  });

  test('primera vez: los pasos hechos se dicen con check y texto, no solo con color', () => {
    resumen = { ...resumen, datos: datos({ estado: 'primera_vez', onboarding: { pasoActual: 3, iniciado: true } }) };
    const { container } = renderConIdioma(<ResumenSitio />);
    const hechos = container.querySelectorAll('li[data-hecho]');
    expect(hechos.length).toBe(2);
    for (const li of Array.from(hechos)) {
      expect(li.querySelector('.sr-only')?.textContent).toContain('hecho');
      expect(li.querySelector('svg')?.getAttribute('class')).toContain('text-success-text');
    }
    expect(container.querySelectorAll('ol li[aria-current="step"]').length).toBeGreaterThan(0);
  });

  test('KPIs en móvil (A/02f): etiquetas con mayúscula inicial, en pizarra y a 13/18', () => {
    const { container } = renderConIdioma(<ResumenSitio />);
    const movil = container.querySelector('div.lg\\:hidden > section') as HTMLElement;
    const etiqueta = Array.from(movil.querySelectorAll('span')).find((e) => e.textContent === 'Visitas · 7 días' && e.children.length === 0);
    const caja = etiqueta!.parentElement as HTMLElement;
    expect(caja.className).not.toContain('uppercase');
    expect(caja.className).toContain('text-fg-secondary');
    expect(caja.className).toContain('text-[13px]');
  });

  test('cambios recientes: la caja del borrador es gris como su píldora, no azul de marca', () => {
    resumen = {
      ...resumen,
      datos: datos({
        cambios: [
          { id: 'b', tipo: 'borrador', texto: { clave: 'cambios.edito_tema' }, en: '2026-10-01T15:00:00Z', autor: null },
          { id: 'r', tipo: 'publicado', texto: { clave: 'cambios.publicoUno' }, en: '2026-09-30T15:00:00Z', autor: null },
        ],
      }),
    };
    renderConIdioma(<ResumenSitio />);
    const filaBorrador = screen.getByText('Cambió el estilo del sitio').closest('li') as HTMLElement;
    const caja = filaBorrador.querySelector('[data-tamano]') as HTMLElement;
    expect(caja.className).toContain('bg-subtle');
    expect(caja.className).not.toContain('bg-brand-tint');
    const filaPublicado = screen.getByText('Publicó 1 cambio').closest('li') as HTMLElement;
    expect((filaPublicado.querySelector('[data-tamano]') as HTMLElement).className).toContain('bg-success-subtle');
  });

  test('error (A/02d): mensaje y «Reintentar» vuelve a pedir el resumen', () => {
    const recargar = jest.fn();
    resumen = { datos: null, cargando: false, fallo: 'error', recargar };
    renderConIdioma(<ResumenSitio />);
    expect(screen.getByText('No pudimos cargar el resumen del sitio')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(recargar).toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Abrir editor/ })).toBeNull();
  });

  test('sin permiso (A/02e): «Sitio web», sin acciones y «Volver al inicio»', () => {
    resumen = { datos: null, cargando: false, fallo: 'sin_permiso', recargar: jest.fn() };
    renderConIdioma(<ResumenSitio />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sitio web');
    expect(screen.getByRole('link', { name: 'Volver al inicio' }).getAttribute('href')).toBe('/app/inicio');
    expect(screen.queryByRole('link', { name: /Ver sitio/ })).toBeNull();
  });
});
