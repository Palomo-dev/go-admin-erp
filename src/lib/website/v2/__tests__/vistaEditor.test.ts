/**
 * Adaptador documento V2 ↔ formas del editor. Datos ficticios (org 120).
 */
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import { documentoSedeDesdeBase } from '../importadorLegacy';
import {
  ajustesDesdeDocumento,
  aplicarAjustesAlDocumento,
  aplicarPaginaAlDocumento,
  contarPersonalizados,
  estadoSecciones,
  fijarModoCampo,
  nuevoIdSeccion,
  paginaAVista,
  propagarSeccionesHeredadas,
  restablecerSeccion,
} from '../vistaEditor';

const ctx = { organizationId: 120, branchId: null };

function documento(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: { alturaLogo: { mode: 'value', value: 48 } },
    tema: { modo: { mode: 'value', value: 'light' }, colores: { primario: { mode: 'value', value: '#111111' } }, tipografia: {} },
    seo: { titulo: { mode: 'value', value: 'Sitio' } },
    contenido: {},
    shell: {
      header: { composicion: 'default', menuPrincipalId: 'm1', opciones: { show_topbar: true } },
      footer: { composicion: 'default', menuIds: [], opciones: {} },
    },
    menus: [{ id: 'm1', nombre: 'Principal', items: [] }],
    paginas: [
      {
        id: 'p1',
        slug: 'home',
        tipo: 'home',
        titulo: 'Inicio',
        publicada: true,
        secciones: [
          { id: 's1', tipo: 'hero', variante: 'split', version: 2, contenido: { title: 'Hola' }, diseno: {}, visibilidad: { movil: false, escritorio: true }, fuente: { tipo: 'offers', limite: 4 } },
          { id: 's2', tipo: 'faq', variante: null, version: 1, contenido: {} },
        ],
      },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

const legacy = {
  id: 'x',
  organization_id: 120,
  primary_color: '#999999',
  shipping_flat_rate: 5000,
  background_color: '#fafafa',
} as unknown as WebsiteSettings;

describe('páginas', () => {
  test('ida y vuelta sin cambios conserva versión, fuente y visibilidad fina', () => {
    const doc = documento();
    const vista = paginaAVista(doc.paginas[0], ctx);
    expect(vista.sections.map((s) => s.section_type)).toEqual(['hero', 'faq']);
    expect(vista.sections[1].section_variant).toBe('default');
    expect(vista.meta_title).toBeNull();
    const vuelta = aplicarPaginaAlDocumento(doc, vista);
    expect(vuelta.paginas[0].secciones[0]).toEqual(doc.paginas[0].secciones[0]);
  });

  test('reordenar, ocultar, añadir y SEO de página llegan al documento válido', () => {
    const doc = documento();
    const vista = paginaAVista(doc.paginas[0], ctx);
    const nueva = { ...vista.sections[1], id: nuevoIdSeccion(), section_type: 'gallery', content: { images: [] } };
    vista.sections = [{ ...vista.sections[1], is_visible: false }, vista.sections[0], nueva];
    vista.meta_title = 'Título de página';
    const resultado = aplicarPaginaAlDocumento(doc, vista);
    expect(validarDocumentoSitio(resultado).ok).toBe(true);
    expect(resultado.paginas[0].secciones.map((s) => s.tipo)).toEqual(['faq', 'hero', 'gallery']);
    expect(resultado.paginas[0].secciones[0].visibilidad).toEqual({ movil: false, escritorio: false });
    expect(resultado.paginas[0].seo?.titulo).toEqual({ mode: 'value', value: 'Título de página' });
    expect(doc.paginas[0].secciones).toHaveLength(2); // no muta la entrada
  });
});

describe('ajustes', () => {
  test('sitio principal: documento manda en lo suyo; operación sale de la fila legacy', () => {
    const { ajustes, origenes } = ajustesDesdeDocumento(documento(), legacy, null);
    const a = ajustes as unknown as Record<string, unknown>;
    expect(a.primary_color).toBe('#111111');
    expect(a.shipping_flat_rate).toBe(5000);
    expect(a.background_color).toBe('#fafafa');
    expect(a.show_topbar).toBe(true);
    expect(a.show_header_cart).toBe(true); // default
    expect(a.template_id).toBe('modern'); // default de columna NOT NULL
    expect(a.header_menu_id).toBe('m1');
    expect(origenes.primary_color).toBe('propio');
  });

  test('cambios del inspector: heredables, shell y operación separados', () => {
    const { documento: doc, noAplicadas } = aplicarAjustesAlDocumento(documento(), {
      primary_color: '#222222',
      meta_description: '',
      show_topbar: false,
      header_cta_text: 'Pedir',
      header_style: 'mega',
      header_menu_id: 'no-existe',
      countdown_enabled: true,
    });
    expect(doc.tema.colores.primario).toEqual({ mode: 'value', value: '#222222' });
    expect(doc.seo.descripcion).toEqual({ mode: 'clear' });
    expect(doc.shell.header.opciones).toEqual({ header_cta_text: 'Pedir' });
    expect(doc.shell.header.composicion).toBe('mega');
    expect(doc.shell.header.menuPrincipalId).toBe('m1');
    expect(noAplicadas.sort()).toEqual(['countdown_enabled', 'header_menu_id']);
    expect(validarDocumentoSitio(doc).ok).toBe(true);
  });
});

describe('herencia de sede (D6)', () => {
  test('hereda del principal; personalizar, vaciar y restablecer', () => {
    const principal = documento();
    let sede = documentoSedeDesdeBase(principal);
    let vista = ajustesDesdeDocumento(sede, legacy, principal);
    expect((vista.ajustes as unknown as Record<string, unknown>).primary_color).toBe('#111111');
    expect(vista.origenes.primary_color).toBe('principal');
    expect(contarPersonalizados(vista.origenes)).toBe(0);

    sede = aplicarAjustesAlDocumento(sede, { primary_color: '#00ff00' }).documento;
    sede = fijarModoCampo(sede, 'meta_title', 'clear');
    vista = ajustesDesdeDocumento(sede, legacy, principal);
    expect((vista.ajustes as unknown as Record<string, unknown>).primary_color).toBe('#00ff00');
    expect(vista.origenes.primary_color).toBe('propio');
    expect((vista.ajustes as unknown as Record<string, unknown>).meta_title).toBeNull();
    expect(vista.origenes.meta_title).toBe('vacio');
    expect(contarPersonalizados(vista.origenes)).toBe(2);

    sede = fijarModoCampo(sede, 'primary_color', 'inherit');
    expect(ajustesDesdeDocumento(sede, legacy, principal).origenes.primary_color).toBe('principal');
  });

  test('secciones: hereda / propia / nueva y «Restablecer» copia la del principal', () => {
    const principal = documento();
    let sede = documentoSedeDesdeBase(principal);
    expect(estadoSecciones(sede, principal)).toEqual({ s1: 'hereda', s2: 'hereda' });

    const vista = paginaAVista(sede.paginas[0], { organizationId: 120, branchId: 7 });
    vista.sections[0] = { ...vista.sections[0], content: { title: 'Sede norte' } };
    vista.sections.push({ ...vista.sections[1], id: 's-nueva' });
    sede = aplicarPaginaAlDocumento(sede, vista);
    expect(estadoSecciones(sede, principal)).toEqual({ s1: 'propia', s2: 'hereda', 's-nueva': 'nueva' });

    sede = restablecerSeccion(sede, principal, 'p1', 's1');
    expect(estadoSecciones(sede, principal).s1).toBe('hereda');
  });
});

describe('herencia de secciones al publicar el principal', () => {
  test('la sede recibe lo que heredaba y conserva lo que personalizó', () => {
    const anterior = documento();
    const sede = documentoSedeDesdeBase(anterior);
    sede.paginas[0].secciones[1].contenido = { titulo: 'Solo en esta sede' };
    const nueva = documento();
    nueva.paginas[0].secciones[0].contenido = { title: 'Nuevo' };
    nueva.paginas[0].secciones[1].contenido = { titulo: 'Del principal' };
    const r = propagarSeccionesHeredadas(sede, anterior, nueva);
    expect(r?.secciones).toBe(1);
    expect(r?.documento.paginas[0].secciones[0].contenido).toEqual({ title: 'Nuevo' });
    expect(r?.documento.paginas[0].secciones[1].contenido).toEqual({ titulo: 'Solo en esta sede' });
    expect(estadoSecciones(r!.documento, nueva).s1).toBe('hereda');
    expect(sede.paginas[0].secciones[0].contenido).toEqual({ title: 'Hola' });
  });

  test('una sección nueva del principal entra en la sede tras la que la precede en el principal', () => {
    const anterior = documento();
    const sede = documentoSedeDesdeBase(anterior);
    const nueva = documento();
    nueva.paginas[0].secciones.splice(1, 0, { id: 's-cta', tipo: 'cta', variante: null, version: 1, contenido: { title: 'Reserva' }, diseno: {}, visibilidad: { movil: true, escritorio: true } });
    const r = propagarSeccionesHeredadas(sede, anterior, nueva);
    expect(r?.secciones).toBe(1);
    expect(r?.documento.paginas[0].secciones.map((s) => s.id)).toEqual(['s1', 's-cta', 's2']);
    expect(propagarSeccionesHeredadas(r!.documento, nueva, nueva)).toBeNull();
  });

  test('una sección que el principal quitó sale de la sede solo si la sede la heredaba sin cambios', () => {
    const anterior = documento();
    const sede = documentoSedeDesdeBase(anterior);
    sede.paginas[0].secciones[1].contenido = { titulo: 'Personalizada' };
    const nueva = documento();
    nueva.paginas[0].secciones = [];
    const r = propagarSeccionesHeredadas(sede, anterior, nueva);
    expect(r?.secciones).toBe(1);
    expect(r?.documento.paginas[0].secciones.map((s) => s.id)).toEqual(['s2']);
  });

  test('sin cambios en el principal no hay nada que guardar (idempotente)', () => {
    const base = documento();
    expect(propagarSeccionesHeredadas(documentoSedeDesdeBase(base), base, base)).toBeNull();
  });
});
