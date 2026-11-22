/**
 * @jest-environment jsdom
 *
 * Asistente del sitio, rediseño aprobado en Figma el 2026-11-22 («Asistente / Paso 2 — todas a
 * la vista»): el paso 2 muestra las plantillas reales del catálogo (en tienda, las 4 clásicas
 * renovadas y luego las 7 nuevas con «Nueva», con su Inicio diseñado) y al seguir arma el sitio
 * con la elegida; «Saltar configuración» y «Omitir este paso» dejan salir sin terminar.
 * Organización ficticia.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
const push = jest.fn();
const replace = jest.fn();
let paso = '2';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/app/sitio-web/primera-configuracion',
  useSearchParams: () => new URLSearchParams(`paso=${paso}`),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('@/lib/website/v2/clienteSitiosV2', () => ({ clienteSitiosV2: { vistaPrevia: jest.fn(async () => ({ token: 't' })) } }));
jest.mock('next/dynamic', () => () => () => null);

const plantillaCompleta = jest.fn(async () => ({ resumen: {}, instantaneaId: 'i-1', sitioId: 's-1', version: 2 }));
jest.mock('../../paginas/apiPaginas', () => {
  class ErrorApiPaginas extends Error {
    esConflicto = false;
  }
  return { apiPaginas: { plantillaCompleta: (...a: unknown[]) => (plantillaCompleta as (...x: unknown[]) => unknown)(...a) }, ErrorApiPaginas };
});

const guardarOb = jest.fn(async () => true);
let ob: Record<string, unknown>;
jest.mock('../asistente/useOnboardingSitio', () => ({ useOnboardingSitio: () => ob }));

const guardarSitio = jest.fn(async () => true);
const recargar = jest.fn(async () => undefined);
let revisionPublicadaId: string | null = null;
jest.mock('../../useSitioV2', () => ({
  useSitioV2: () => ({
    sitio: { id: 's-1', branchId: null, versionBorrador: 1, revisionPublicadaId },
    borrador: { version: 1 },
    documento: null,
    cargando: false,
    guardando: false,
    publicando: false,
    conflicto: false,
    error: null,
    guardar: guardarSitio,
    asegurar: jest.fn(async () => ({ id: 's-1', branchId: null, versionBorrador: 1, revisionPublicadaId })),
    publicar: jest.fn(),
    recargar,
  }),
}));

import { AsistenteSitio } from '../asistente/AsistenteSitio';
import { PLANTILLAS_CATALOGO_ASISTENTE, plantillasCatalogoDelGiro } from '../asistente/catalogoAsistente';

const contexto = {
  organizacion: { nombre: 'Mi tienda S.A.S.', logoUrl: null, giro: 'tienda', subdominio: 'tu-marca' },
  sede: { nombre: 'Sede Centro', direccion: 'Calle 00 # 00-00, Bogotá', telefono: null, horario: null },
  whatsapp: null,
  direccion: { host: 'tu-marca.goadmin.io', url: 'https://tu-marca.goadmin.io', subdominioHost: null, hostEsPropio: false },
  pasarela: false,
  permisos: { editar: true, publicar: true },
};

beforeEach(() => {
  paso = '2';
  revisionPublicadaId = null;
  push.mockReset();
  replace.mockReset();
  guardarOb.mockClear();
  guardarSitio.mockClear();
  plantillaCompleta.mockClear();
  ob = { onboarding: { giro: 'tienda' }, contexto, cargando: false, fallo: null, guardando: false, errorGuardar: null, guardar: guardarOb, recargar: jest.fn() };
});

describe('catálogo del paso 2', () => {
  test('tienda: las 4 renovadas primero (Moderna encabeza) y luego las 7 nuevas', () => {
    const ids = plantillasCatalogoDelGiro('tienda', 'tienda').map((p) => p.id);
    expect(ids).toEqual([
      'retail_modern',
      'retail_classic',
      'retail_bold',
      'retail_elegant',
      'retail_panorama',
      'retail_atelier',
      'retail_radiante',
      'retail_roble',
      'retail_marea',
      'retail_contraste',
      'retail_hogar',
    ]);
  });

  test('«Todas»: primero las del giro del sitio y después el resto del catálogo', () => {
    const todas = plantillasCatalogoDelGiro('todas', 'hotel');
    expect(todas[0].id).toBe('hotel_luxury');
    expect(todas.slice(0, 4).every((p) => p.giro === 'hotel')).toBe(true);
    expect(todas).toHaveLength(PLANTILLAS_CATALOGO_ASISTENTE.length);
  });
});

describe('AsistenteSitio — paso 2 con el catálogo real', () => {
  test('todas a la vista, con «Nueva» en las 7 de tienda y su Inicio diseñado como miniatura', () => {
    renderConIdioma(<AsistenteSitio />);
    const grupo = screen.getByRole('radiogroup', { name: 'Elige una plantilla' });
    const tarjetas = within(grupo).getAllByRole('radio');
    expect(tarjetas).toHaveLength(11);
    expect(tarjetas[0].textContent).toContain('Moderna');
    expect(within(grupo).getAllByText('Nueva')).toHaveLength(7);
    expect(grupo.querySelectorAll('[data-miniatura-disenada]')).toHaveLength(11);
    expect(screen.queryByText(/Ver más/)).toBeNull();
    expect(screen.getByText(/inicio, página de categoría y ficha de producto/)).toBeTruthy();
  });

  test('elegir una y seguir arma el sitio con la plantilla completa y guarda el avance', async () => {
    renderConIdioma(<AsistenteSitio />);
    fireEvent.click(screen.getByRole('radio', { name: /Panorama/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    });
    expect(plantillaCompleta).toHaveBeenCalledWith({ branchId: null, version: 1 }, 'retail_panorama');
    expect(recargar).toHaveBeenCalled();
    expect(guardarSitio).not.toHaveBeenCalled();
    expect(guardarOb).toHaveBeenCalledWith({ pasos: { plantilla: 'retail_panorama' }, pasoActual: 3 });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/app/sitio-web/primera-configuracion?paso=3'));
  });

  test('con el sitio ya publicado: solo colores y fuentes, nunca rearma el contenido', async () => {
    revisionPublicadaId = 'r-1';
    renderConIdioma(<AsistenteSitio />);
    expect(screen.getByText(/Tu sitio ya está publicado/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Atelier/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    });
    expect(plantillaCompleta).not.toHaveBeenCalled();
    expect(guardarSitio).toHaveBeenCalledTimes(1);
    expect(guardarOb).toHaveBeenCalledWith({ pasos: { plantilla: 'retail_atelier' }, pasoActual: 3 });
  });
});

describe('AsistenteSitio — saltar y omitir', () => {
  test('«Omitir este paso» avanza sin escribir nada del paso', async () => {
    paso = '3';
    renderConIdioma(<AsistenteSitio />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Omitir/ }));
    });
    expect(guardarOb).toHaveBeenCalledWith({ pasoActual: 4 });
    expect(guardarSitio).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/app/sitio-web/primera-configuracion?paso=4');
  });

  test('el giro (paso 1) y revisar y publicar (paso 6) no se omiten', () => {
    paso = '1';
    const { unmount } = renderConIdioma(<AsistenteSitio />);
    expect(screen.queryByRole('button', { name: /Omitir/ })).toBeNull();
    unmount();
    paso = '6';
    renderConIdioma(<AsistenteSitio />);
    expect(screen.queryByRole('button', { name: /Omitir/ })).toBeNull();
  });

  test('«Saltar configuración» confirma y lleva al Resumen guardando dónde iba', async () => {
    renderConIdioma(<AsistenteSitio />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Saltar configuración' })[0]);
    const dialogo = await screen.findByRole('dialog', { name: '¿Saltar la configuración?' });
    expect(within(dialogo).getByText(/Tu sitio queda en borrador y no se publica/)).toBeTruthy();
    expect(within(dialogo).getByRole('button', { name: 'Seguir configurando' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Saltar e ir al resumen' }));
    });
    expect(guardarOb).toHaveBeenCalledWith({ pasoActual: 2 });
    expect(push).toHaveBeenCalledWith('/app/sitio-web');
  });

  test('«Ir al editor» sin página de Inicio aún lleva a Diseño', async () => {
    renderConIdioma(<AsistenteSitio />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Saltar configuración' })[0]);
    const dialogo = await screen.findByRole('dialog', { name: '¿Saltar la configuración?' });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Ir al editor' }));
    });
    expect(push).toHaveBeenCalledWith('/app/sitio-web/diseno');
  });
});
