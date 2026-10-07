/**
 * @jest-environment jsdom
 *
 * Encabezado y pie por plantilla en Plantillas (Figma «16 Sitio web» › «Plantillas · encabezado y
 * pie en la galería, la vista previa y «Usar»»): la miniatura de la tarjeta dibuja SU encabezado
 * y SU pie con texto alternativo, la vista previa los pinta en grande (y en celular con la barra
 * fija), y el diálogo explica que «Plantilla completa» los cambia y «Solo estilo» conserva los
 * tuyos, enseñando cómo quedaría cada caso. Organización ficticia («Mi empresa S.A.S.», org 120).
 */
import { TextEncoder } from 'util';
import { screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';

Object.assign(globalThis, { TextEncoder });

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

import { CATALOGO_SITIO } from '../catalogo';
import { MiniaturaPlantilla, useShellDePlantilla } from '../MiniaturaPlantilla';
import { VistaEsquematicaPlantilla } from '../VistaEsquematicaPlantilla';
import { DialogoVistaPreviaPlantilla } from '../DialogoVistaPreviaPlantilla';
import { TemplateCard } from '../../ui/TemplateCard';

const plantilla = (id: string): PlantillaCatalogo => CATALOGO_SITIO.plantillas.find((p) => p.id === id)!;

function documento(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: { nombre: { mode: 'value', value: 'Mi empresa S.A.S.' } },
    tema: { plantillaBase: { mode: 'value', value: 'restaurant_rustic' }, modo: { mode: 'value', value: 'light' }, colores: {}, tipografia: {} },
    seo: {},
    contenido: {},
    shell: {
      header: { composicion: 'default', menuPrincipalId: null, opciones: { header_cta_text: 'Reservar', header_cta_url: '/reservas' } },
      footer: { composicion: 'default', menuIds: [], opciones: {} },
    },
    menus: [],
    paginas: [{ id: 'p-inicio', slug: 'home', tipo: 'home', titulo: 'Inicio', publicada: true, secciones: [] }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

/** La tarjeta de la galería tal como la arma `GaleriaPlantillas`. */
function Tarjeta({ p }: { p: PlantillaCatalogo }) {
  const shell = useShellDePlantilla(p);
  return <TemplateCard nombre={p.nombre} descripcion={p.descripcion} detalle={shell.linea} miniatura={<MiniaturaPlantilla shell={shell} />} giro={p.giro} secciones={p.inicio.length} onSeleccionar={() => undefined} />;
}

const zona = (raiz: HTMLElement, nombre: string) => raiz.querySelector<HTMLElement>(`[data-zona="${nombre}"]`);

describe('tarjeta de la galería: SU encabezado y SU pie', () => {
  test('Noir Omakase: línea distintiva, texto alternativo y el dibujo de su lámina', () => {
    renderConIdioma(<Tarjeta p={plantilla('noir_omakase')} />);
    expect(screen.getByText('Logo al centro · Pie centrado con WhatsApp')).toBeTruthy();
    const img = screen.getByRole('img', { name: /^Encabezado: logo al centro, barra superior con sede y horario/ });
    expect(img.getAttribute('aria-label')).toMatch(/botón «Reservar mesa».*Pie centrado.*botón de WhatsApp.*En el celular, barra fija con Reservar, Cómo llegar, Llamar\.$/);
    expect(img.getAttribute('data-esquema-shell')).toBe('mini');
    expect(zona(img, 'encabezado')!.getAttribute('data-menu')).toBe('partido');
    expect(zona(img, 'barra-superior')).toBeTruthy();
    expect(zona(img, 'pie')!.getAttribute('data-composicion')).toBe('centered');
    expect(img.querySelector('[data-bloque="whatsapp"]')).toBeTruthy();
    // A ese tamaño solo los botones llevan texto, abreviado.
    expect(within(img).getByText('Reservar')).toBeTruthy();
    expect(within(img).queryByText('Reservar mesa')).toBeNull();
    expect(within(img).queryByText('Tu marca')).toBeNull();
  });

  test('Retail Moderno: megamenú con sus columnas y pie con boletín y medios de pago', () => {
    renderConIdioma(<Tarjeta p={plantilla('retail_modern')} />);
    expect(screen.getByText('Megamenú de categorías · Pie en 3 columnas con boletín y medios de pago')).toBeTruthy();
    const img = screen.getByRole('img', { name: /megamenú de categorías en 4 columnas/ });
    expect(zona(img, 'megamenu')!.getAttribute('data-columnas')).toBe('4');
    expect(img.querySelector('[data-bloque="boletin"]')).toBeTruthy();
    expect(img.querySelector('[data-bloque="pagos"]')).toBeTruthy();
  });

  test('las 32 plantillas tienen miniatura con texto alternativo, y cada composición se dibuja distinta', () => {
    expect(CATALOGO_SITIO.plantillas).toHaveLength(32);
    const { container } = renderConIdioma(
      <>
        {CATALOGO_SITIO.plantillas.map((p) => (
          <Tarjeta key={p.id} p={p} />
        ))}
      </>,
    );
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(32);
    imgs.forEach((img) => expect(img.getAttribute('aria-label')).toMatch(/^Encabezado: .+\. Pie .+/));
    // Todas las posiciones del menú y todas las composiciones de pie que usan las láminas aparecen.
    const menus = new Set(imgs.map((img) => zona(img, 'encabezado')!.getAttribute('data-menu')));
    const pies = new Set(imgs.map((img) => zona(img, 'pie')!.getAttribute('data-composicion')));
    expect([...menus].sort()).toEqual(['categorias', 'fila', 'linea', 'oculto', 'partido']);
    expect([...pies].sort()).toEqual(['centered', 'default', 'minimal', 'split', 'three_columns']);
    // Livianas: sin imágenes.
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });
});

describe('vista previa de la plantilla: encabezado y pie en grande', () => {
  test('escritorio: con tu nombre, el megamenú y el pie de la plantilla, sin barra del celular', () => {
    const { container } = renderConIdioma(<VistaEsquematicaPlantilla plantilla={plantilla('retail_modern')} documento={documento()} />);
    const raiz = container.querySelector<HTMLElement>('[data-esquema-shell="grande"]')!;
    expect(raiz).toBeTruthy();
    expect(within(raiz).getAllByText('Mi empresa S.A.S.').length).toBeGreaterThan(0);
    expect(within(raiz).getByText('Categorías del inventario')).toBeTruthy();
    expect(within(raiz).getByText('Envíos y devoluciones')).toBeTruthy();
    expect(within(raiz).getByText('Suscribirme')).toBeTruthy();
    expect(zona(raiz, 'barra-celular')).toBeNull();
  });

  test('celular: encabezado compacto, sin barra superior, pie del celular y la barra fija', () => {
    const { container } = renderConIdioma(<VistaEsquematicaPlantilla plantilla={plantilla('noir_omakase')} documento={documento()} celular />);
    const raiz = container.querySelector<HTMLElement>('[data-esquema-shell="celular"]')!;
    expect(zona(raiz, 'barra-superior')).toBeNull();
    expect(zona(raiz, 'pie')!.getAttribute('data-celular')).toBe('acordeon');
    const barra = zona(raiz, 'barra-celular')!;
    expect(within(barra).getAllByText(/.+/).map((n) => n.textContent)).toEqual(['Reservar', 'Cómo llegar', 'Llamar']);
  });

  test('el botón grande lleva su texto completo', () => {
    const { container } = renderConIdioma(<VistaEsquematicaPlantilla plantilla={plantilla('noir_omakase')} documento={documento()} />);
    expect(within(container).getByText('Reservar mesa')).toBeTruthy();
  });
});

describe('«Usar esta plantilla»: qué cambia con cada opción', () => {
  const abrir = (idioma: 'es' | 'en' = 'es', doc: DocumentoSitio | null = documento()) =>
    renderConIdioma(
      <DialogoVistaPreviaPlantilla
        plantilla={plantilla('noir_omakase')}
        onCerrar={() => undefined}
        documento={doc}
        puedeUsar
        usando={false}
        modo="estilo"
        onModoChange={() => undefined}
        onUsar={() => undefined}
      />,
      { idioma },
    );

  test('«Plantilla completa» cambia encabezado y pie; «Solo estilo» conserva los tuyos, y cada una enseña el resultado', () => {
    abrir();
    const grupo = screen.getByRole('radiogroup', { name: 'Cómo aplicarla' });
    expect(within(grupo.parentElement!).getByText('Así quedan tu encabezado y tu pie')).toBeTruthy();
    const completa = within(grupo).getByRole('radio', { name: /Plantilla completa/ });
    const estilo = within(grupo).getByRole('radio', { name: /Solo estilo/ });
    expect(completa.textContent).toMatch(/Cambian el encabezado y el pie por los de la plantilla/);
    expect(estilo.textContent).toMatch(/Conservas tu encabezado, tu pie y tu contenido/);
    expect(within(completa).getByText('Los de «Noir Omakase»')).toBeTruthy();
    expect(within(estilo).getByText('Los tuyos de hoy, con los colores nuevos')).toBeTruthy();
    // El resultado de cada opción: el de la plantilla (logo al centro) y el tuyo (logo a la izquierda).
    const menu = (radio: HTMLElement) => radio.querySelector('[data-resultado-shell] [data-zona="encabezado"]')!.getAttribute('data-menu');
    expect(menu(completa)).toBe('partido');
    expect(menu(estilo)).toBe('linea');
    // El dibujo no alarga el nombre accesible del radio.
    expect(completa.querySelector('[data-resultado-shell] [aria-hidden="true"]')).toBeTruthy();
  });

  test('a la derecha: lo que traen el encabezado y el pie, y que solo se aplican con «Plantilla completa»', () => {
    abrir();
    const panel = document.querySelector<HTMLElement>('[data-rasgos-shell]')!;
    expect(within(panel).getByRole('heading', { name: 'Encabezado y pie de esta plantilla' })).toBeTruthy();
    expect(within(panel).getByText('Botón «Reservar mesa»')).toBeTruthy();
    expect(within(panel).getByText('Pie centrado')).toBeTruthy();
    expect(within(panel).getByText('Barra fija con Reservar, Cómo llegar, Llamar')).toBeTruthy();
    expect(within(panel).getByText('Se aplican solo con «Plantilla completa».')).toBeTruthy();
  });

  test('sin borrador, «Solo estilo» explica sin dibujo (no hay encabezado propio que enseñar)', () => {
    abrir('es', null);
    const estilo = screen.getByRole('radio', { name: /Solo estilo/ });
    expect(estilo.querySelector('[data-resultado-shell]')).toBeNull();
    expect(screen.getByRole('radio', { name: /Plantilla completa/ }).querySelector('[data-resultado-shell]')).toBeTruthy();
  });

  test('i18n: en inglés también se explica la diferencia', () => {
    abrir('en');
    expect(screen.getByText('This is how your header and footer will look')).toBeTruthy();
    expect(screen.getByText('They are applied only with “Full template”.')).toBeTruthy();
    expect(screen.getByText('Your current ones, with the new colors')).toBeTruthy();
  });
});
