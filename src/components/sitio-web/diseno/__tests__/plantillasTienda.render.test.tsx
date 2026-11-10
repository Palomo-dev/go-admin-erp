/**
 * @jest-environment jsdom
 *
 * Las 7 plantillas de tienda nuevas en «Usar plantilla» (Figma «Sistema de diseño» › 16 Sitio web,
 * A0-A2; encargo E5 del 2026-11-10): se ven SIN bandera en la pestaña «Tienda» con «Nueva» y
 * «3 páginas», la pestaña filtra por tipo de negocio, la miniatura dibuja sus rasgos de pie y
 * encabezado, y el diálogo avisa la decisión D4 (ficha de producto y página de categoría
 * reemplazadas, lo anterior en la copia «antes de restaurar») SOLO en las 7 nuevas.
 *
 * Mientras el catálogo (`catalogoPlantillas.ts`, paquete E1) no las registre, la prueba les pone un
 * registro mínimo sobre la base `retail_modern`; cuando estén, usa las reales. Organización
 * ficticia («Mi empresa S.A.S.», org 120).
 */
import { TextEncoder } from 'util';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { dibujoDePlantilla } from '@/lib/website/v2/dibujoShell';
import { textoCanonicoDiseno } from '../textos';
import { lineaShell, textosRasgos } from '../textosShell';

Object.assign(globalThis, { TextEncoder });

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));
let busqueda = '';
const replace = jest.fn((url: string) => {
  busqueda = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
});
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace }),
  usePathname: () => '/app/sitio-web/plantillas',
  useSearchParams: () => new URLSearchParams(busqueda),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: jest.fn() }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('@/lib/website/v2/clienteSitiosV2', () => ({
  clienteSitiosV2: { vistaPrevia: jest.fn(), restaurarInstantanea: jest.fn() },
  ErrorApiSitio: class extends Error {},
}));
jest.mock('../../paginas/apiPaginas', () => ({ apiPaginas: { plantillaCompleta: jest.fn() }, ErrorApiPaginas: class extends Error {} }));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

/** Registro mínimo de las 7 (nombre y negocio de A1) mientras E1 no las registre en el catálogo. */
jest.mock('../catalogo', () => {
  const real = jest.requireActual('../catalogo');
  const registro: [string, string, string][] = [
    ['retail_panorama', 'Panorama', 'Deportes, aire libre y tecnología.'],
    ['retail_atelier', 'Atelier', 'Moda de autor y boutique.'],
    ['retail_radiante', 'Radiante', 'Belleza y cosmética.'],
    ['retail_roble', 'Roble', 'Muebles de autor y taller.'],
    ['retail_marea', 'Marea', 'Moda de costa.'],
    ['retail_contraste', 'Contraste', 'Muebles modernos y decoración.'],
    ['retail_hogar', 'Hogar', 'Hogar cálido: muebles, decoración y menaje.'],
  ];
  const plantillas = real.CATALOGO_SITIO.plantillas as { id: string; estilo: Record<string, unknown> }[];
  const base = plantillas.find((p) => p.id === 'retail_modern')!;
  const ya = new Set(plantillas.map((p) => p.id));
  const faltan = registro
    .filter(([id]) => !ya.has(id))
    .map(([id, nombre, descripcion]) => ({ ...base, id, nombre, descripcion, porDefecto: false, estilo: { ...base.estilo, id, nombre } }));
  return { ...real, CATALOGO_SITIO: { ...real.CATALOGO_SITIO, plantillas: [...plantillas, ...faltan] } };
});

import { CATALOGO_SITIO } from '../catalogo';
import { GaleriaPlantillas } from '../GaleriaPlantillas';
import { EsquemaShell } from '../EsquemaShell';
import {
  IDS_PLANTILLAS_TIENDA_NUEVAS,
  SIN_EXTRAS_TIENDA,
  esPlantillaTiendaNueva,
  extrasShellTienda,
  filtrarPorNegocio,
  negociosPresentes,
} from '../plantillasTienda';

const NOMBRES_NUEVAS = ['Panorama', 'Atelier', 'Radiante', 'Roble', 'Marea', 'Contraste', 'Hogar'];
const NOMBRES_RETAIL_DE_HOY = ['Retail Moderno', 'Retail Clásico', 'Retail Bold', 'Retail Elegante'];

function documento(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: { nombre: { mode: 'value', value: 'Mi empresa S.A.S.' } },
    tema: { plantillaBase: { mode: 'value', value: 'restaurant_rustic' }, modo: { mode: 'value', value: 'light' }, colores: {}, tipografia: {} },
    seo: {},
    contenido: {},
    shell: { header: { composicion: 'default', menuPrincipalId: null, opciones: {} }, footer: { composicion: 'default', menuIds: [], opciones: {} } },
    menus: [],
    paginas: [{ id: 'p-inicio', slug: 'home', tipo: 'home', titulo: 'Inicio', publicada: true, secciones: [] }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

let ctx: Record<string, unknown>;
jest.mock('../useContextoDiseno', () => ({ useContextoDiseno: () => ctx }));

/** Sitio sin publicar: el diálogo abre en «Plantilla completa» (`modoPorDefecto`). */
function contexto() {
  const doc = documento();
  return {
    estado: 'listo',
    resumen: null,
    sitio: {
      sitio: { id: 's-1', branchId: null, v2Adoptado: true, revisionPublicadaId: null, versionBorrador: 3, borradorActualizadoEn: null, cambiosSinPublicar: true },
      borrador: { version: 3, documento: doc },
      documento: doc,
      cargando: false,
      guardando: false,
      publicando: false,
      error: null,
      conflicto: false,
      asegurar: jest.fn(async () => ({ id: 's-1' })),
      guardar: jest.fn(async () => true),
      recargar: jest.fn(),
    },
    permisos: { editar: true, publicar: true },
    giro: 'tienda',
    host: 'tu-marca.goadmin.io',
    url: 'https://tu-marca.goadmin.io',
    paginaInicioId: 'p-inicio',
    reintentar: jest.fn(),
  };
}

beforeEach(() => {
  busqueda = '';
  replace.mockClear();
  ctx = contexto();
});

/** Nombres de las tarjetas visibles, en orden. */
function tarjetasVisibles(): string[] {
  const panel = screen.getByRole('tabpanel');
  return within(panel)
    .getAllByRole('listitem')
    .map((li) => li.querySelector('button span.truncate')!.textContent ?? '');
}

const tarjeta = (nombre: string) => screen.getAllByText(nombre).map((n) => n.closest('button')).find((b) => b?.querySelector('span.truncate')?.textContent === nombre)!;

describe('galería: las 7 de tienda, sin bandera', () => {
  test('la pestaña «Tienda» muestra las 4 de hoy y las 7 nuevas (11), sin variable de entorno', () => {
    expect(process.env.NEXT_PUBLIC_WEBSITE_PLANTILLAS_TIENDA).toBeUndefined();
    renderConIdioma(<GaleriaPlantillas />);
    const pestana = screen.getByRole('tab', { name: /Tienda/ });
    expect(pestana.getAttribute('aria-selected')).toBe('true');
    expect(pestana.textContent).toContain('11');
    const visibles = tarjetasVisibles();
    expect(visibles).toHaveLength(11);
    expect([...visibles].sort()).toEqual([...NOMBRES_NUEVAS, ...NOMBRES_RETAIL_DE_HOY].sort());
    // La de por defecto va primero.
    expect(visibles[0]).toBe('Retail Moderno');
  });

  test('las 7 llevan «Nueva», «3 páginas», su descripción y su miniatura; las de antes no llevan «Nueva»', () => {
    renderConIdioma(<GaleriaPlantillas />);
    for (const nombre of NOMBRES_NUEVAS) {
      const t = tarjeta(nombre);
      const plantilla = CATALOGO_SITIO.plantillas.find((p) => p.nombre === nombre)!;
      expect(within(t).getByText('Nueva')).toBeTruthy();
      expect(within(t).getByText(/· 3 páginas/)).toBeTruthy();
      expect(within(t).getByText(plantilla.descripcion)).toBeTruthy();
      const img = within(t).getByRole('img');
      expect(img.getAttribute('data-esquema-shell')).toBe('mini');
      expect(img.getAttribute('aria-label')).toMatch(/^Encabezado: .+\. Pie .+/);
    }
    for (const nombre of NOMBRES_RETAIL_DE_HOY) {
      const t = tarjeta(nombre);
      expect(within(t).queryByText('Nueva')).toBeNull();
      expect(within(t).queryByText(/· 3 páginas/)).toBeNull();
    }
  });

  test('filtro por tipo de negocio: moda, belleza, hogar y deportes', () => {
    const { rerender } = renderConIdioma(<GaleriaPlantillas />);
    const grupo = screen.getByRole('radiogroup', { name: 'Tipo de negocio' });
    expect(within(grupo).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Todos los negocios',
      'Moda',
      'Belleza y cosmética',
      'Hogar y muebles',
      'Deportes y tecnología',
    ]);
    expect(within(grupo).getByRole('radio', { name: /Todos los negocios/ }).getAttribute('aria-checked')).toBe('true');

    const elegir = (n: string) => {
      fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Tipo de negocio' })).getByRole('radio', { name: new RegExp(n) }));
      rerender(<GaleriaPlantillas />);
    };
    elegir('Moda');
    expect(busqueda).toContain('negocio=moda');
    expect(tarjetasVisibles()).toEqual(['Atelier', 'Marea']);
    elegir('Hogar y muebles');
    expect(tarjetasVisibles()).toEqual(['Roble', 'Contraste', 'Hogar']);
    elegir('Belleza');
    expect(tarjetasVisibles()).toEqual(['Radiante']);
    elegir('Deportes');
    expect(tarjetasVisibles()).toEqual(['Panorama']);
    elegir('Todos los negocios');
    expect(tarjetasVisibles()).toHaveLength(11);
  });

  test('el filtro solo está en «Tienda»; en otro giro un `?negocio=` no filtra nada', () => {
    busqueda = 'giro=restaurante&negocio=moda';
    renderConIdioma(<GaleriaPlantillas />);
    expect(screen.queryByRole('radiogroup', { name: 'Tipo de negocio' })).toBeNull();
    expect(tarjetasVisibles().length).toBeGreaterThan(0);
    expect(tarjetasVisibles()).toContain('Noir Omakase');
  });
});

describe('diálogo: aviso D4 solo en las 7 nuevas', () => {
  const AVISO_D4 = 'Con esta plantilla, «Plantilla completa» también rearma la ficha de producto y la página de categoría (antes se conservaban).';

  test('una nueva con «Plantilla completa»: «Nueva», negocio, páginas, aviso D4 y la copia «antes de restaurar»', () => {
    renderConIdioma(<GaleriaPlantillas />);
    fireEvent.click(tarjeta('Hogar'));
    const dialogo = screen.getByRole('dialog');
    const grupo = within(dialogo).getByRole('radiogroup', { name: 'Cómo aplicarla' });
    expect(within(grupo).getByRole('radio', { name: /Plantilla completa/ }).getAttribute('aria-checked')).toBe('true');
    expect(within(dialogo).getAllByText('Nueva').length).toBeGreaterThan(0);
    expect(within(dialogo).getByText('Hogar y muebles')).toBeTruthy();
    expect(within(dialogo).getByText('Páginas que diseña: Inicio, ficha de producto y página de categoría')).toBeTruthy();
    expect(within(dialogo).getByText(AVISO_D4)).toBeTruthy();
    const aviso = within(dialogo).getByText(/Se reemplazan el encabezado, el pie, Inicio, la ficha de producto, la página de categoría/);
    expect(aviso.textContent).toContain('«antes de restaurar»');
    expect(within(dialogo).getByText(/Usa tu catálogo, tus fotos y tus textos/)).toBeTruthy();
  });

  test('la misma nueva con «Solo estilo»: sin aviso D4 (el estilo no toca páginas)', () => {
    renderConIdioma(<GaleriaPlantillas />);
    fireEvent.click(tarjeta('Atelier'));
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('radio', { name: /Solo estilo/ }));
    expect(within(dialogo).queryByText(AVISO_D4)).toBeNull();
    expect(within(dialogo).queryByText(/antes de restaurar/)).toBeNull();
    expect(within(dialogo).getByText('Cambia el estilo, conserva tu contenido')).toBeTruthy();
  });

  test('una de las de antes con «Plantilla completa»: el aviso de siempre, sin D4 ni «Nueva»', () => {
    renderConIdioma(<GaleriaPlantillas />);
    fireEvent.click(tarjeta('Retail Moderno'));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('radio', { name: /Plantilla completa/ }).getAttribute('aria-checked')).toBe('true');
    expect(within(dialogo).queryByText(AVISO_D4)).toBeNull();
    expect(within(dialogo).queryByText('Nueva')).toBeNull();
    expect(within(dialogo).queryByText(/Páginas que diseña/)).toBeNull();
    expect(within(dialogo).getByText(textoCanonicoDiseno('dialogo.avisoCompletaDescripcion'))).toBeTruthy();
    expect(within(dialogo).getByText(textoCanonicoDiseno('dialogo.descripcion', { descripcion: CATALOGO_SITIO.plantillas.find((p) => p.id === 'retail_modern')!.descripcion }))).toBeTruthy();
  });
});

describe('lógica de la galería (pura)', () => {
  test('las 7 ids y sus negocios; las de antes no son nuevas ni tienen negocio', () => {
    expect(IDS_PLANTILLAS_TIENDA_NUEVAS).toHaveLength(7);
    IDS_PLANTILLAS_TIENDA_NUEVAS.forEach((id) => expect(esPlantillaTiendaNueva(id)).toBe(true));
    for (const id of ['retail_modern', 'retail_classic', 'retail_bold', 'retail_elegant', 'noir_omakase']) expect(esPlantillaTiendaNueva(id)).toBe(false);
    const lista = [...IDS_PLANTILLAS_TIENDA_NUEVAS, 'retail_modern'].map((id) => ({ id }));
    expect(negociosPresentes(lista)).toEqual(['moda', 'belleza', 'hogar', 'deportes']);
    expect(negociosPresentes([{ id: 'retail_modern' }])).toEqual([]);
    expect(filtrarPorNegocio(lista, 'todos')).toHaveLength(8);
    expect(filtrarPorNegocio(lista, 'moda').map((p) => p.id)).toEqual(['retail_atelier', 'retail_marea']);
  });

  test('rasgos de tienda del shell: ausentes o inválidos = el dibujo de siempre', () => {
    expect(extrasShellTienda({}, {})).toEqual(SIN_EXTRAS_TIENDA);
    expect(extrasShellTienda({ search_style: 'bar' }, { footer_inset: 'si', footer_brand_display: 'enorme', footer_links_style: 'xl' })).toEqual(SIN_EXTRAS_TIENDA);
    // Hogar (PLANO §4): buscador en píldora flotante y pie como tarjeta.
    expect(extrasShellTienda({ search_style: 'pill_floating' }, { footer_inset: true })).toEqual({ ...SIN_EXTRAS_TIENDA, buscadorPildora: true, pieTarjeta: true });
    expect(extrasShellTienda({}, { footer_brand_display: 'giant', footer_links_style: 'display' })).toEqual({ ...SIN_EXTRAS_TIENDA, marcaGigante: true, enlacesGrandes: true });
  });

  test('línea corta y rasgos de la vista previa con los rasgos de tienda (A1)', () => {
    const t = (k: string, v?: Record<string, string | number>) => textoCanonicoDiseno(k, v);
    const d = dibujoDePlantilla(CATALOGO_SITIO.plantillas.find((p) => p.id === 'retail_modern')!);
    expect(lineaShell(t, d)).toBe('Megamenú de categorías · Pie en 3 columnas con boletín y medios de pago');
    expect(lineaShell(t, d, { ...SIN_EXTRAS_TIENDA, marcaGigante: true })).toBe('Megamenú de categorías · Pie en 3 columnas con la marca gigante');
    expect(lineaShell(t, d, { ...SIN_EXTRAS_TIENDA, pieTarjeta: true })).toBe('Megamenú de categorías · Pie en 3 columnas, como tarjeta');
    const r = textosRasgos(t, d, { buscadorPildora: false, pieTarjeta: true, marcaGigante: true, enlacesGrandes: true });
    expect(r.pie.slice(-3)).toEqual(['nombre de la tienda en grande', 'enlaces grandes con la letra de los títulos', 'pie como tarjeta con margen']);
    expect(textosRasgos(t, d)).toEqual(textosRasgos(t, d, SIN_EXTRAS_TIENDA));
  });
});

describe('EsquemaShell: los 4 dibujos de tienda', () => {
  const plantilla = CATALOGO_SITIO.plantillas.find((p) => p.id === 'retail_modern')!;
  const dibujo = { ...dibujoDePlantilla(plantilla), encabezado: { ...dibujoDePlantilla(plantilla).encabezado, composicion: 'default' as const, menu: 'linea' as const, megamenu: null, acciones: ['buscar', 'cuenta', 'carrito'] as const } };

  test('sin rasgos: el dibujo de siempre', () => {
    const { container } = renderConIdioma(<EsquemaShell dibujo={dibujo} enlaces={['Productos']} menusPie={['Ayuda']} />);
    expect(container.querySelector('[data-pie-tarjeta]')).toBeNull();
    expect(container.querySelector('[data-bloque="marca-gigante"]')).toBeNull();
    expect(container.querySelector('[data-enlaces="grandes"]')).toBeNull();
    expect(container.querySelector('[data-accion="buscar"]')!.getAttribute('data-forma')).toBeNull();
  });

  test('con rasgos: pie como tarjeta, marca gigante, enlaces grandes y buscador en píldora', () => {
    const { container } = renderConIdioma(
      <EsquemaShell
        dibujo={dibujo}
        enlaces={['Productos']}
        menusPie={['Ayuda', 'Legal']}
        marca="Mi empresa S.A.S."
        extras={{ buscadorPildora: true, pieTarjeta: true, marcaGigante: true, enlacesGrandes: true }}
      />,
    );
    const pie = container.querySelector<HTMLElement>('[data-zona="pie"]')!;
    expect(pie.getAttribute('data-pie-tarjeta')).toBe('true');
    expect(pie.style.margin).not.toBe('');
    expect(pie.querySelector('[data-bloque="marca-gigante"]')!.textContent).toBe('Mi empresa S.A.S.');
    expect(pie.querySelectorAll('[data-enlaces="grandes"]')).toHaveLength(2);
    const buscar = container.querySelector('[data-accion="buscar"]')!;
    expect(buscar.getAttribute('data-forma')).toBe('pildora');
    expect(buscar.textContent).toBe('Buscar');
  });

  test('celular: la marca gigante y la tarjeta también; el buscador queda en ícono', () => {
    const { container } = renderConIdioma(
      <EsquemaShell dibujo={dibujo} enlaces={[]} menusPie={['Ayuda']} celular extras={{ buscadorPildora: true, pieTarjeta: true, marcaGigante: true, enlacesGrandes: false }} />,
    );
    const pie = container.querySelector<HTMLElement>('[data-zona="pie"]')!;
    expect(pie.getAttribute('data-pie-tarjeta')).toBe('true');
    expect(pie.querySelector('[data-bloque="marca-gigante"]')).toBeTruthy();
    expect(container.querySelector('[data-accion="buscar"]')!.getAttribute('data-forma')).toBeNull();
  });
});
