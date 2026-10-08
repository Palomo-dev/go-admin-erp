/**
 * @jest-environment jsdom
 *
 * Diseño › Plantillas con selector de sede (Figma «16 Sitio web» › «Plantillas por sede», láminas
 * A, B, D y E). Un hotel ficticio (org 120) con una sede restaurante («Sede restaurante», 531):
 * - con `?sede=531` la galería abre en Restaurante (el giro de la sede, no el del hotel) y se
 *   pueden ver las demás pestañas;
 * - el aviso dice que la sede hereda el estilo del principal;
 * - el diálogo es «Usar <plantilla> en <sede>» y llama a la API de la sede (completa o estilo);
 * - una plantilla de otro giro solo se puede usar como «Solo estilo»;
 * - con estilo propio, la tarjeta dice «En uso en <sede>» y se ofrece «Volver a heredar»;
 * - sin sedes con sitio no hay selector: todo como antes.
 */
import { TextEncoder } from 'util';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { plantillaPorId } from '@/lib/website/contrato/catalogoPlantillas';
import { CATALOGO_PLANTILLAS } from '@/lib/website/v2/plantillaCompleta';
import { aplicarEstiloPlantillaSede, documentoPlantillaSede, type SedeParaPlantillas } from '@/lib/website/v2/plantillaSede';

Object.assign(globalThis, { TextEncoder });

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));
const replace = jest.fn();
let busqueda = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace }),
  usePathname: () => '/app/sitio-web/plantillas',
  useSearchParams: () => new URLSearchParams(busqueda),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: jest.fn() }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toast } = require('sonner') as { toast: { success: jest.Mock; error: jest.Mock } };

let n = 0;
const generar = () => `id-${++n}`;

function principal(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: { nombre: { mode: 'value', value: 'Hotel de prueba' } },
    tema: {
      plantillaBase: { mode: 'value', value: 'hotel_minimal' },
      colores: { primario: { mode: 'value', value: '#4A5568' } },
      tipografia: { titulos: { mode: 'value', value: 'Outfit' } },
    },
    seo: {},
    contenido: {},
    shell: { header: { composicion: 'default', menuPrincipalId: null, menuMegaId: null, opciones: {} }, footer: { composicion: 'default', menuIds: [], opciones: {} } },
    menus: [],
    paginas: [{ id: 'p-home', slug: 'home', tipo: 'builtin', titulo: 'Inicio', publicada: true, secciones: [] }],
  });
  if (!r.ok) throw new Error('principal');
  return r.documento;
}
const SEDE_HOY = documentoPlantillaSede(principal(), 'restaurant', generar) as DocumentoSitio;
const VELVET = plantillaPorId(CATALOGO_PLANTILLAS, 'velvet_lounge')!;

const sedeBase: SedeParaPlantillas = {
  branchId: 531,
  nombre: 'Sede restaurante',
  tipo: 'restaurant',
  giro: 'restaurante',
  sitioId: 's-531',
  version: 4,
  estiloPropio: false,
  plantillaEnUsoId: null,
};
let sedes: SedeParaPlantillas[] = [sedeBase];
let documentoSede: DocumentoSitio = SEDE_HOY;

const usarPlantillaEnSede = jest.fn(async () => ({
  accion: 'completa',
  branchId: 531,
  sitioId: 's-531',
  version: 5,
  actualizadoEn: '2026-10-08T00:00:00Z',
  plantillaId: 'velvet_lounge',
  instantaneaId: 'inst-9',
  resumen: { paginas: 10, secciones: 40, ocultas: [], conservadas: 2 },
}));
const heredarEstiloSede = jest.fn(async () => ({ accion: 'heredar', branchId: 531, sitioId: 's-531', version: 5, actualizadoEn: '', plantillaId: null }));
const sitioSede = {
  id: 's-531',
  branchId: 531,
  v2Adoptado: false,
  v2AdoptadoEn: null,
  revisionPublicadaId: null,
  versionBorrador: 4,
  borradorActualizadoEn: null,
  cambiosSinPublicar: true,
};
jest.mock('@/lib/website/v2/clienteSitiosV2', () => ({
  clienteSitiosV2: {
    sedesParaPlantillas: jest.fn(async () => sedes),
    listar: jest.fn(async () => [sitioSede]),
    borrador: jest.fn(async () => ({
      sitio: sitioSede,
      documento: documentoSede,
      version: 4,
      actualizadoEn: '2026-10-08T00:00:00Z',
      revisionBaseId: null,
      basePrincipal: null,
      erroresContrato: [],
    })),
    usarPlantillaEnSede: (...a: unknown[]) => usarPlantillaEnSede(...(a as [])),
    heredarEstiloSede: (...a: unknown[]) => heredarEstiloSede(...(a as [])),
    restaurarInstantanea: jest.fn(),
    vistaPrevia: jest.fn(),
  },
  ErrorApiSitio: class extends Error {
    esConflicto = false;
  },
}));
const plantillaCompletaPrincipal = jest.fn();
jest.mock('../../paginas/apiPaginas', () => ({
  apiPaginas: { plantillaCompleta: (...a: unknown[]) => plantillaCompletaPrincipal(...(a as [])) },
  ErrorApiPaginas: class extends Error {},
}));

let ctx: Record<string, unknown>;
jest.mock('../useContextoDiseno', () => ({ useContextoDiseno: () => ctx }));

import { GaleriaPlantillas } from '../GaleriaPlantillas';

const guardarPrincipal = jest.fn(async () => true);
function contexto() {
  const doc = principal();
  return {
    estado: 'listo',
    resumen: { sitio: { cambiosSinPublicar: { cantidad: 0, areas: [] } } },
    sitio: {
      sitio: { id: 's-1', branchId: null, v2Adoptado: true, revisionPublicadaId: 'r0', versionBorrador: 3, borradorActualizadoEn: null, cambiosSinPublicar: false },
      borrador: { version: 3, documento: doc },
      documento: doc,
      cargando: false,
      guardando: false,
      publicando: false,
      error: null,
      conflicto: false,
      estadoPublicacion: { tipo: 'publicado' },
      asegurar: jest.fn(async () => ({ id: 's-1' })),
      guardar: guardarPrincipal,
      publicar: jest.fn(),
      revisiones: jest.fn(),
      recargar: jest.fn(),
    },
    permisos: { editar: true, publicar: true },
    giro: 'hotel',
    host: 'hotel.goadmin.io',
    url: 'https://hotel.goadmin.io',
    paginaInicioId: 'p-home',
    estadoPublicacion: { tipo: 'publicado' },
    reintentar: jest.fn(),
    recontar: jest.fn(),
  };
}

beforeEach(() => {
  busqueda = 'sede=531';
  sedes = [sedeBase];
  documentoSede = SEDE_HOY;
  ctx = contexto();
  usarPlantillaEnSede.mockClear();
  heredarEstiloSede.mockClear();
  guardarPrincipal.mockClear();
  plantillaCompletaPrincipal.mockClear();
  replace.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
});

async function montar() {
  renderConIdioma(<GaleriaPlantillas />);
  await waitFor(() => expect(screen.getByText('Sede restaurante hereda hoy el estilo del sitio principal')).toBeTruthy());
}

describe('selector de sede (lámina A)', () => {
  test('con ?sede=531 abre en Restaurante, el giro de la sede, y deja ver las demás pestañas', async () => {
    await montar();
    const selector = screen.getByRole('combobox', { name: 'Plantillas para' });
    expect(within(selector).getByText('Sede restaurante')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Restaurante/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Velvet Lounge')).toBeTruthy();
    // Las demás pestañas siguen ahí (Hotel es el giro de la organización).
    fireEvent.click(screen.getByRole('tab', { name: /Hotel/ }));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('giro=hotel'), expect.anything());
  });

  test('la sede que hereda no marca ninguna tarjeta como «En uso»', async () => {
    await montar();
    expect(screen.queryByText(/^En uso/)).toBeNull();
  });

  test('sin sedes con sitio no hay selector y la galería es la del principal', async () => {
    sedes = [];
    busqueda = '';
    renderConIdioma(<GaleriaPlantillas />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Hotel/ }).getAttribute('aria-selected')).toBe('true'));
    expect(screen.queryByRole('combobox', { name: 'Plantillas para' })).toBeNull();
    const tarjeta = screen.getByText('Hotel Minimal').closest('button')!;
    expect(within(tarjeta).getByText('En uso')).toBeTruthy();
  });
});

describe('«Usar esta plantilla en <sede>» (lámina B)', () => {
  test('Velvet Lounge completa: título con la sede, aviso de herencia y la API de la sede', async () => {
    await montar();
    fireEvent.click(screen.getByText('Velvet Lounge').closest('button')!);
    expect(screen.getByText('Usar Velvet Lounge en Sede restaurante')).toBeTruthy();
    expect(screen.getByText('Hoy Sede restaurante hereda el estilo del sitio principal')).toBeTruthy();
    // Sin revisión publicada: «Plantilla completa» por defecto.
    const grupo = screen.getByRole('radiogroup', { name: 'Cómo aplicarla' });
    expect(within(grupo).getByRole('radio', { name: /Plantilla completa/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('El sitio actual de Sede restaurante queda en el historial')).toBeTruthy();
    // «Volver a heredar» está, pero no hace nada mientras la sede ya hereda.
    expect((screen.getByRole('button', { name: 'Volver a heredar el estilo del sitio principal' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Usar en Sede restaurante' }));
    });
    await waitFor(() => expect(usarPlantillaEnSede).toHaveBeenCalledWith(531, 'velvet_lounge', 'completa', 4));
    expect(guardarPrincipal).not.toHaveBeenCalled();
    expect(plantillaCompletaPrincipal).not.toHaveBeenCalled();
    const [titulo, opciones] = toast.success.mock.calls[toast.success.mock.calls.length - 1] as [string, { action: { label: string } }];
    expect(titulo).toBe('Usamos «Velvet Lounge» en Sede restaurante.');
    expect(opciones.action.label).toBe('Deshacer');
  });

  test('«Solo estilo» manda el alcance estilo', async () => {
    await montar();
    fireEvent.click(screen.getByText('Velvet Lounge').closest('button')!);
    fireEvent.click(screen.getByRole('radio', { name: /Solo estilo/ }));
    expect(screen.getByText('Colores y letras propios de Sede restaurante. Su contenido, su encabezado y su pie no cambian.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Usar en Sede restaurante' }));
    });
    await waitFor(() => expect(usarPlantillaEnSede).toHaveBeenCalledWith(531, 'velvet_lounge', 'estilo', 4));
  });

  test('una plantilla de hotel en la sede restaurante: solo estilo, con el motivo', async () => {
    busqueda = 'sede=531&giro=hotel';
    await montar();
    fireEvent.click(screen.getByText('Hotel Lujo').closest('button')!);
    const completa = screen.getByRole('radio', { name: /Plantilla completa/ }) as HTMLButtonElement;
    expect(completa.disabled).toBe(true);
    expect(screen.getByText(/La plantilla completa debe ser de Restaurante, el tipo de negocio de Sede restaurante/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Solo estilo/ }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('estilo propio y «Volver a heredar» (lámina E)', () => {
  test('con el estilo de Velvet Lounge: «En uso en <sede>» y volver a heredar', async () => {
    documentoSede = aplicarEstiloPlantillaSede(SEDE_HOY, VELVET, false);
    sedes = [{ ...sedeBase, estiloPropio: true, plantillaEnUsoId: 'velvet_lounge' }];
    renderConIdioma(<GaleriaPlantillas />);
    await waitFor(() => expect(screen.getByText('Sede restaurante tiene estilo propio')).toBeTruthy());
    await waitFor(() => {
      const tarjeta = screen.getByText('Velvet Lounge').closest('button')!;
      expect(within(tarjeta).getByText('En uso en Sede restaurante')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Volver a heredar el estilo del sitio principal' }));
    });
    await waitFor(() => expect(heredarEstiloSede).toHaveBeenCalledWith(531, 4));
    expect(toast.success).toHaveBeenCalledWith('Sede restaurante vuelve a heredar el estilo del sitio principal.');
  });
});
