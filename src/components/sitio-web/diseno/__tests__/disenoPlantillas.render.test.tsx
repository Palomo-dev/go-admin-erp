/**
 * @jest-environment jsdom
 *
 * Diseño y Plantillas (Figma A/06a-06g): estados de las dos pantallas (cargando,
 * error con «Reintentar», sin permiso, listo), elegir un preset guarda el
 * estilo en el borrador, y la galería por giro con «En uso», el diálogo y sus
 * dos modos («Plantilla completa» y «Solo estilo»). Organización ficticia
 * («Mi empresa S.A.S.», org 120).
 */
import { TextEncoder } from 'util';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';

// jsdom no trae TextEncoder (lo usa el validador del documento para medir bytes).
Object.assign(globalThis, { TextEncoder });

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));
const push = jest.fn();
let busqueda = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/app/sitio-web/diseno',
  useSearchParams: () => new URLSearchParams(busqueda),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
const cabeceraMovil = jest.fn();
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: (a: unknown) => cabeceraMovil(a) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));
const restaurarInstantanea = jest.fn(async () => ({ version: 6, actualizadoEn: '2026-10-06T00:00:00Z' }));
jest.mock('@/lib/website/v2/clienteSitiosV2', () => ({
  clienteSitiosV2: { vistaPrevia: jest.fn(async () => ({ token: 'tok' })), restaurarInstantanea: (...a: unknown[]) => restaurarInstantanea(...(a as [])) },
  ErrorApiSitio: class extends Error {},
}));
const plantillaCompleta = jest.fn(async () => ({
  sitioId: 's-1',
  version: 5,
  actualizadoEn: '2026-10-06T00:00:00Z',
  instantaneaId: 'inst-1',
  resumen: { paginas: 9, secciones: 30, ocultas: [{ pagina: 'Inicio', tipo: 'chef_team' }, { pagina: 'Inicio', tipo: 'testimonials' }], conservadas: 2 },
}));
jest.mock('../../paginas/apiPaginas', () => ({
  apiPaginas: { plantillaCompleta: (...a: unknown[]) => plantillaCompleta(...(a as [])) },
  ErrorApiPaginas: class extends Error {},
}));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toast } = require('sonner') as { toast: { success: jest.Mock; error: jest.Mock } };

let ctx: Record<string, unknown>;
jest.mock('../useContextoDiseno', () => ({ useContextoDiseno: () => ctx }));

import { PaginaDiseno } from '../PaginaDiseno';
import { GaleriaPlantillas } from '../GaleriaPlantillas';

function documento(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: { nombre: { mode: 'value', value: 'Mi empresa S.A.S.' } },
    tema: {
      plantillaBase: { mode: 'value', value: 'restaurant_rustic' },
      modo: { mode: 'value', value: 'light' },
      colores: {
        primario: { mode: 'value', value: '#8C2F1B' },
        fondo: { mode: 'value', value: '#F6F1E7' },
        texto: { mode: 'value', value: '#1F1B16' },
      },
      tipografia: { titulos: { mode: 'value', value: 'Libre Caslon Text' }, cuerpo: { mode: 'value', value: 'Inter' } },
    },
    seo: {},
    contenido: {},
    shell: { header: { composicion: 'default', menuPrincipalId: null, opciones: {} }, footer: { composicion: 'default', menuIds: [], opciones: {} } },
    menus: [],
    paginas: [{ id: 'p-inicio', slug: 'home', tipo: 'home', titulo: 'Inicio', publicada: true, secciones: [] }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

const guardar = jest.fn(async () => true);
const publicar = jest.fn(async () => ({ revisionId: 'r', numero: 1, publicadaEn: '2026-10-06T00:00:00Z', idempotente: false }));
const reintentar = jest.fn();

function contexto(parcial: Record<string, unknown> = {}) {
  const doc = documento();
  return {
    estado: 'listo',
    resumen: { sitio: { cambiosSinPublicar: { cantidad: 1, areas: [{ tipo: 'tema' }] } } },
    sitio: {
      sitio: { id: 's-1', branchId: null, v2Adoptado: true, revisionPublicadaId: 'r0', versionBorrador: 3, borradorActualizadoEn: null, cambiosSinPublicar: true },
      borrador: { version: 3, documento: doc },
      documento: doc,
      cargando: false,
      guardando: false,
      publicando: false,
      error: null,
      conflicto: false,
      estadoPublicacion: { tipo: 'cambios', cantidad: 1 },
      asegurar: jest.fn(async () => ({ id: 's-1' })),
      guardar,
      publicar,
      revisiones: jest.fn(),
      recargar: jest.fn(),
    },
    permisos: { editar: true, publicar: true },
    giro: 'restaurante',
    host: 'tu-marca.goadmin.io',
    url: 'https://tu-marca.goadmin.io',
    paginaInicioId: 'p-inicio',
    estadoPublicacion: { tipo: 'cambios', cantidad: 1 },
    reintentar,
    recontar: jest.fn(),
    ...parcial,
  };
}

beforeEach(() => {
  busqueda = '';
  guardar.mockClear();
  publicar.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
  cabeceraMovil.mockClear();
  reintentar.mockClear();
  push.mockClear();
  ctx = contexto();
});

describe('Diseño (A/06a)', () => {
  test('listo: cabecera, pestañas, panel con presets del giro y el preset en uso marcado', () => {
    renderConIdioma(<PaginaDiseno />);
    expect(screen.getAllByText('Estilo del sitio · 1 cambio sin publicar').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'Estilo' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Encabezado y pie' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Logo y favicon' })).toBeTruthy();
    const marfil = screen.getByRole('radio', { name: /Editorial Marfil/ });
    expect(marfil.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Ver los 8 presets de restaurante')).toBeTruthy();
    expect(screen.getByText('Vista previa en vivo · Inicio')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Publicar/ }).length).toBeGreaterThan(0);
  });

  test('elegir un preset guarda el estilo en el borrador tras la espera', async () => {
    jest.useFakeTimers();
    renderConIdioma(<PaginaDiseno />);
    fireEvent.click(screen.getByRole('radio', { name: /Noir Omakase/ }));
    expect(screen.getByRole('radio', { name: /Noir Omakase/ }).getAttribute('aria-checked')).toBe('true');
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    jest.useRealTimers();
    expect(guardar).toHaveBeenCalledTimes(1);
    const cambiar = (guardar.mock.calls[0] as unknown as [(d: DocumentoSitio) => DocumentoSitio])[0];
    const nuevo = cambiar(documento());
    expect(nuevo.tema.colores.primario).toEqual({ mode: 'value', value: '#C8A97E' });
    expect(nuevo.tema.modo).toEqual({ mode: 'value', value: 'dark' });
    expect(validarDocumentoSitio(nuevo).ok).toBe(true);
  });

  test('redondeo, botones y movimiento quedan deshabilitados mientras el sitio público no los aplique', () => {
    renderConIdioma(<PaginaDiseno />);
    const grupo = screen.getByRole('radiogroup', { name: 'Botones' });
    within(grupo)
      .getAllByRole('radio')
      .forEach((r) => expect((r as HTMLButtonElement).disabled).toBe(true));
  });

  test('cargando: subtítulo «Cargando…» y esqueleto', () => {
    ctx = contexto({ estado: 'cargando' });
    const { container } = renderConIdioma(<PaginaDiseno />);
    expect(screen.getAllByText('Cargando…').length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  test('error: «No pudimos cargar el diseño» y «Reintentar»', () => {
    ctx = contexto({ estado: 'error' });
    renderConIdioma(<PaginaDiseno />);
    expect(screen.getByText('No pudimos cargar el diseño')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(reintentar).toHaveBeenCalled();
  });

  test('sin permiso (A/06f): candado, permiso real y «Ver sitio»', () => {
    ctx = contexto({ estado: 'sin_permiso', permisos: { editar: false, publicar: false } });
    renderConIdioma(<PaginaDiseno />);
    expect(screen.getByText('No puedes cambiar el diseño del sitio')).toBeTruthy();
    expect(screen.getByText(/website\.sites\.edit/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ver sitio/ }).getAttribute('href')).toBe('https://tu-marca.goadmin.io');
    expect(screen.queryByRole('button', { name: /Publicar/ })).toBeNull();
  });

  test('encabezado y pie: abre el editor con el elemento seleccionado', () => {
    busqueda = 'tab=encabezado-pie';
    renderConIdioma(<PaginaDiseno />);
    expect(screen.getByRole('link', { name: /encabezado seleccionado/ }).getAttribute('href')).toBe('/app/sitio-web/editor/p-inicio?seleccion=header');
    expect(screen.getByRole('link', { name: /pie de página seleccionado/ }).getAttribute('href')).toBe('/app/sitio-web/editor/p-inicio?seleccion=footer');
  });
});

describe('Plantillas (A/06b-06e)', () => {
  test('galería por giro con contadores reales y «En uso»', () => {
    renderConIdioma(<GaleriaPlantillas />);
    expect(screen.getAllByText('Usar una plantilla crea un borrador: tu contenido se conserva').length).toBeGreaterThan(0);
    const pestana = screen.getByRole('tab', { name: /Restaurante/ });
    expect(pestana.getAttribute('aria-selected')).toBe('true');
    expect(within(pestana).getByText('8')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Todas/ })).toBeTruthy();
    expect(screen.getByText('Noir Omakase')).toBeTruthy();
    // El borrador usa la base `restaurant_rustic` con Libre Caslon: Editorial Marfil.
    const tarjeta = screen.getByText('Editorial Marfil').closest('button')!;
    expect(within(tarjeta).getByText('En uso')).toBeTruthy();
  });

  test('diálogo, sitio ya publicado: «Solo estilo» por defecto; guarda colores y fuentes y conserva el contenido', async () => {
    renderConIdioma(<GaleriaPlantillas />);
    fireEvent.click(screen.getByText('Velvet Lounge').closest('button')!);
    expect(screen.getByText('Bar de coctelería')).toBeTruthy();
    const grupo = screen.getByRole('radiogroup', { name: 'Cómo aplicarla' });
    expect(within(grupo).getByRole('radio', { name: /Solo estilo/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Cambia el estilo, conserva tu contenido')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar solo el estilo' }));
    });
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));
    const cambiar = (guardar.mock.calls[0] as unknown as [(d: DocumentoSitio) => DocumentoSitio])[0];
    const nuevo = cambiar(documento());
    expect(nuevo.tema.plantillaBase).toEqual({ mode: 'value', value: 'restaurant_elegant' });
    expect(nuevo.paginas).toEqual(documento().paginas);
    expect(plantillaCompleta).not.toHaveBeenCalled();
  });

  test('diálogo, sitio importado sin publicar: «Plantilla completa» por defecto, con aviso, páginas y «Deshacer»', async () => {
    const base = contexto();
    const sitio = base.sitio as Record<string, unknown> & { sitio: Record<string, unknown> };
    ctx = { ...base, sitio: { ...sitio, sitio: { ...sitio.sitio, revisionPublicadaId: null } } };
    renderConIdioma(<GaleriaPlantillas />);
    fireEvent.click(screen.getByText('Noir Omakase').closest('button')!);
    const grupo = screen.getByRole('radiogroup', { name: 'Cómo aplicarla' });
    expect(within(grupo).getByRole('radio', { name: /Plantilla completa/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Tu sitio actual queda en el historial')).toBeTruthy();
    expect(screen.getByText(/Páginas: Inicio · Menú · Pedir Online · Reservar Mesa/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Usar plantilla completa' }));
    });
    await waitFor(() => expect(plantillaCompleta).toHaveBeenCalledWith({ branchId: null, version: 3 }, 'noir_omakase'));
    expect(guardar).not.toHaveBeenCalled();
    const [titulo, opciones] = toast.success.mock.calls[toast.success.mock.calls.length - 1] as [string, { description: string; action: { label: string; onClick: () => void } }];
    expect(titulo).toBe('Tu borrador ya tiene «Noir Omakase» completa.');
    expect(opciones.description).toMatch(/^2 secciones quedan ocultas/);
    expect(opciones.action.label).toBe('Deshacer');
    await act(async () => {
      opciones.action.onClick();
    });
    await waitFor(() => expect(restaurarInstantanea).toHaveBeenCalledWith('s-1', 'inst-1', 5));
  });

  test('cambiar de opción cambia el aviso y el botón', () => {
    renderConIdioma(<GaleriaPlantillas />);
    fireEvent.click(screen.getByText('Velvet Lounge').closest('button')!);
    fireEvent.click(screen.getByRole('radio', { name: /Plantilla completa/ }));
    expect(screen.getByRole('button', { name: 'Usar plantilla completa' })).toBeTruthy();
    expect(screen.getByText('Tu sitio actual queda en el historial')).toBeTruthy();
  });

  test('sin permiso de edición: se ve la galería y el botón queda deshabilitado con motivo', () => {
    ctx = contexto({ permisos: { editar: false, publicar: false } });
    renderConIdioma(<GaleriaPlantillas />);
    fireEvent.click(screen.getByText('Velvet Lounge').closest('button')!);
    const usar = screen.getByRole('button', { name: 'Aplicar solo el estilo' }) as HTMLButtonElement;
    expect(usar.disabled).toBe(true);
    expect(usar.title).toMatch(/website\.sites\.edit/);
  });

  test('cargando (A/06d) y error (A/06e)', () => {
    ctx = contexto({ estado: 'cargando' });
    const { unmount } = renderConIdioma(<GaleriaPlantillas />);
    expect(screen.getAllByText('Cargando…').length).toBeGreaterThan(0);
    unmount();
    ctx = contexto({ estado: 'error' });
    renderConIdioma(<GaleriaPlantillas />);
    expect(screen.getByText('No pudimos cargar las plantillas')).toBeTruthy();
    expect(screen.getByText('Tu sitio no cambió. Inténtalo de nuevo en unos segundos.')).toBeTruthy();
  });
});

describe('Iconos y px (pedido del dueño: «los iconos los entiende más fácil cualquier usuario»)', () => {
  test('Diseño: el subtítulo lleva el icono del estado y cada pestaña su icono', () => {
    const { container } = renderConIdioma(<PaginaDiseno />);
    expect(container.querySelector('svg[data-estado="cambios"]')).toBeTruthy();
    for (const nombre of ['Estilo', 'Encabezado y pie', 'Logo y favicon']) {
      expect(screen.getByRole('tab', { name: nombre }).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    }
  });

  test('vista previa: 1440 / 1024 / 390 con unidad px e icono de dispositivo', () => {
    renderConIdioma(<PaginaDiseno />);
    const grupo = screen.getAllByRole('radiogroup', { name: 'Ancho de la vista previa' })[0];
    const opciones = within(grupo).getAllByRole('radio');
    expect(opciones.map((o) => o.textContent)).toEqual(['1440 px', '1024 px', '390 px']);
    opciones.forEach((o) => expect(o.querySelector('svg')).toBeTruthy());
  });

  test('panel de estilo: títulos de grupo con icono y redondeo en px', () => {
    renderConIdioma(<PaginaDiseno />);
    for (const titulo of ['Presets', 'Tipografía', 'Redondeo', 'Botones', 'Movimiento']) {
      const h = screen.getByRole('heading', { level: 3, name: titulo });
      expect(h.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    }
    const redondeo = screen.getByRole('radiogroup', { name: 'Redondeo' });
    expect(within(redondeo).getAllByRole('radio').map((r) => r.textContent)).toEqual(['0 px', '4 px', '12 px', '24 px']);
  });

  test('Plantillas: pestañas de giro con icono y tarjeta con icono de giro, secciones y «En uso»', () => {
    renderConIdioma(<GaleriaPlantillas />);
    for (const nombre of [/Restaurante/, /Tienda/, /Hotel/, /Todas/]) {
      expect(screen.getByRole('tab', { name: nombre }).querySelector('svg')).toBeTruthy();
    }
    const tarjeta = screen.getByText('Editorial Marfil').closest('button')!;
    expect(tarjeta.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
  });
});

describe('tablas de iconos de Diseño y Plantillas (una sola fuente)', () => {
  test('giros, «Todas», pestañas y dispositivos reutilizan los iconos del módulo', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ic = require('../../ui/iconosSitio') as typeof import('../../ui/iconosSitio');
    expect(ic.ICONO_GIRO_PLANTILLA.restaurante).toBe(ic.ICONO_GIRO_SITIO.restaurante);
    expect(ic.ICONO_GIRO_PLANTILLA.todas).toBe(ic.ICONO_TAREA_SITIO.plantilla);
    expect(ic.ICONO_PESTANA_DISENO.estilo).toBe(ic.ICONO_TAREA_SITIO.estilo);
    // La paleta es el grupo «colores» dentro de Estilo: la pestaña no la repite.
    expect(ic.ICONO_PESTANA_DISENO.estilo).not.toBe(ic.ICONO_GRUPO_ESTILO.colores);
    expect(ic.ICONO_PESTANA_DISENO['encabezado-pie']).toBe(ic.ICONO_TAREA_SITIO.encabezado);
    expect(ic.ICONO_PESTANA_DISENO.logo).toBe(ic.ICONO_TAREA_SITIO.logo);
    const dispositivos = Object.values(ic.ICONO_DISPOSITIVO_VISTA);
    // Un icono distinto por dispositivo de la tabla única (4 desde que el editor sumó la tableta).
    expect(new Set(dispositivos).size).toBe(Object.keys(ic.ICONO_DISPOSITIVO_VISTA).length);
    expect(new Set(Object.values(ic.ICONO_GRUPO_ESTILO)).size).toBe(6);
  });
});

/** Un fallo de `guardar`/`publicar` tal como lo deja `useSitioV2`: el estado cambia DESPUÉS del `await`. */
function fallarCon(error: { esConflicto: boolean; message: string }) {
  const sitio = ctx.sitio as Record<string, unknown>;
  ctx = { ...ctx, sitio: { ...sitio, conflicto: error.esConflicto, error } };
}

function conLogo() {
  const base = contexto();
  const sitio = base.sitio as Record<string, unknown> & { documento: DocumentoSitio };
  const doc: DocumentoSitio = { ...sitio.documento, identidad: { ...sitio.documento.identidad, logoUrl: { mode: 'value', value: 'https://cdn.ejemplo.co/logo.png' } } };
  return { ...base, sitio: { ...sitio, documento: doc, borrador: { version: 3, documento: doc } } };
}

describe('revisión de Diseño y Plantillas', () => {
  test('Plantillas (A/06b): el subtítulo lleva su icono de 14 px de la tabla del módulo', () => {
    renderConIdioma(<GaleriaPlantillas />);
    const texto = screen.getByText('Usar una plantilla crea un borrador: tu contenido se conserva');
    const icono = texto.parentElement!.querySelector('svg[aria-hidden="true"]')!;
    expect(icono).toBeTruthy();
    expect(icono.getAttribute('class')).toContain('size-3.5');
    expect(icono.getAttribute('stroke-width')).toBe('1.5');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ic = require('../../ui/iconosSitio') as typeof import('../../ui/iconosSitio');
    expect(ic.ICONO_SUBTITULO_SITIO.plantillas).toBeTruthy();
  });

  test('tarjeta en uso (A/06b): «En uso» va en la misma fila que el giro y las secciones', () => {
    renderConIdioma(<GaleriaPlantillas />);
    const enUso = screen.getByText('En uso');
    const fila = enUso.closest('span.flex-wrap')!;
    expect(fila).toBeTruthy();
    expect(within(fila as HTMLElement).getByText('Restaurante')).toBeTruthy();
    expect(within(fila as HTMLElement).getByText(/secciones/)).toBeTruthy();
  });

  test('diálogo (A/06c): selector de ancho en la cabecera y barra «Vista previa con tu contenido»', () => {
    renderConIdioma(<GaleriaPlantillas />);
    fireEvent.click(screen.getByText('Velvet Lounge').closest('button')!);
    const titulo = screen.getByRole('heading', { name: 'Velvet Lounge' });
    const cabecera = titulo.parentElement!.parentElement!;
    expect(within(cabecera).getByText('1440 px')).toBeTruthy();
    expect(within(cabecera).getByRole('button', { name: /Cerrar/ })).toBeTruthy();
    expect(screen.getByText('Vista previa con tu contenido')).toBeTruthy();
    expect(screen.queryByText('tu-marca.goadmin.io')).toBeNull();
  });

  test('Logo y favicon: un 409 abre el conflicto y NO muestra un toast de error vacío', async () => {
    busqueda = 'tab=logo';
    ctx = conLogo();
    guardar.mockImplementationOnce(async () => {
      fallarCon({ esConflicto: true, message: 'version_conflict' });
      return false;
    });
    renderConIdioma(<PaginaDiseno />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Quitar.*logo/i }));
    });
    await waitFor(() => expect(screen.getByText('Alguien guardó cambios antes que tú')).toBeTruthy());
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('Logo y favicon: otro error se avisa con su mensaje real (no el del render anterior)', async () => {
    busqueda = 'tab=logo';
    ctx = conLogo();
    guardar.mockImplementationOnce(async () => {
      fallarCon({ esConflicto: false, message: 'Sin conexión' });
      return false;
    });
    renderConIdioma(<PaginaDiseno />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Quitar.*logo/i }));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No pudimos guardar el cambio: Sin conexión'));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  test('Publicar: un 409 avisa el conflicto (antes nunca salía)', async () => {
    publicar.mockImplementationOnce(async () => {
      fallarCon({ esConflicto: true, message: 'version_conflict' });
      return null as never;
    });
    renderConIdioma(<PaginaDiseno />);
    fireEvent.click(screen.getAllByRole('button', { name: /^Publicar$/ })[0]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publicar cambios' }));
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Otra persona guardó o publicó una versión más nueva. Recargamos el diseño para que veas lo último.'),
    );
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  test('móvil (A/06g): cabecera «Diseño» con la sección activa y flecha de volver', () => {
    renderConIdioma(<PaginaDiseno />);
    const ultima = cabeceraMovil.mock.calls[cabeceraMovil.mock.calls.length - 1][0] as Record<string, unknown>;
    expect(ultima.titulo).toBe('Diseño');
    expect(ultima.subtitulo).toBe('Estilo del sitio');
    expect(ultima.volverA).toBe('/app/sitio-web');
    // El título del panel queda solo para lectores de pantalla por debajo de lg.
    const tituloPanel = screen.getByRole('heading', { name: 'Estilo del sitio' });
    expect(tituloPanel.parentElement!.className).toContain('max-lg:sr-only');
  });

  test('Plantillas conserva la cabecera móvil por defecto («Sitio web» + página)', () => {
    renderConIdioma(<GaleriaPlantillas />);
    const ultima = cabeceraMovil.mock.calls[cabeceraMovil.mock.calls.length - 1][0] as Record<string, unknown>;
    expect(ultima.titulo).toBe('Sitio web');
    expect(ultima.subtitulo).toBe('Plantillas');
  });
});
