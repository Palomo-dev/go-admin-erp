/**
 * Editores de Contacto v2 (Figma 3108:85760, 3108:86969, 3112:87143): lo que escriben en el
 * `content` de la sección se lee igual en la tienda (contrato `paginaContacto.ts`).
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

import { SECTION_CATALOG, getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import { getSectionCatalogForBranch } from '@/lib/services/website/sectionsByBranchType';
import { PLANTILLAS_PAGINA } from '@/components/sitio-web/paginas/plantillasPagina';
import { leerCamposContacto, leerCanales, seccionesContactoPorDefecto } from '@/lib/website/contrato/paginaContacto';
import {
  alternarRed,
  anadirCampoPropio,
  anadirCanalPropio,
  cambiarCampo,
  cambiarCanal,
  camposAGuardar,
  camposEnEditor,
  canalesAGuardar,
  moverCampo,
  quitarCampo,
  quitarCanal,
  redesEncendidas,
} from '../contactoV2Logica';

describe('campos del formulario', () => {
  it('sin `form_fields` el editor muestra los de la página Contacto y avisa que no están guardados', () => {
    const { campos, guardados } = camposEnEditor(undefined);
    expect(guardados).toBe(false);
    expect(campos.map((c) => c.name)).toEqual(['name', 'email', 'phone', 'subject', 'message', 'company', 'consent']);
  });

  it('lo que se guarda se vuelve a leer igual (ida y vuelta)', () => {
    let { campos } = camposEnEditor(undefined);
    campos = cambiarCampo(campos, 'phone', { required: true, label: 'Celular' });
    campos = cambiarCampo(campos, 'company', { visible: true });
    campos = anadirCampoPropio(campos, 'Ciudad');
    const guardado = camposAGuardar(campos);
    const leido = leerCamposContacto(guardado)!;
    expect(leido.map((c) => [c.name, c.label, c.visible, c.required])).toEqual(campos.map((c) => [c.name, c.label, c.visible, c.required]));
    // El campo propio entra antes de la casilla de datos.
    expect(leido.slice(-2).map((c) => c.name)).toEqual(['campo_1', 'consent']);
  });

  it('nombre y correo no se apagan; la casilla de datos es obligatoria si se muestra', () => {
    let { campos } = camposEnEditor(undefined);
    campos = cambiarCampo(campos, 'email', { visible: false, required: false });
    expect(campos.find((c) => c.name === 'email')).toMatchObject({ visible: true, required: true });
    campos = cambiarCampo(campos, 'consent', { visible: false });
    expect(campos.find((c) => c.name === 'consent')).toMatchObject({ visible: false, required: false });
    campos = cambiarCampo(campos, 'consent', { visible: true });
    expect(campos.find((c) => c.name === 'consent')?.required).toBe(true);
  });

  it('solo los campos propios se quitan; mover respeta los bordes', () => {
    let { campos } = camposEnEditor(undefined);
    expect(quitarCampo(campos, 'phone')).toHaveLength(campos.length);
    campos = anadirCampoPropio(campos, 'Ciudad');
    expect(quitarCampo(campos, 'campo_1')).toHaveLength(campos.length - 1);
    expect(moverCampo(campos, 0, -1)).toEqual(campos);
    expect(moverCampo(campos, 0, 1).slice(0, 2).map((c) => c.name)).toEqual(['email', 'name']);
  });
});

describe('canales', () => {
  it('cambiar, añadir y quitar canales propios; ida y vuelta', () => {
    let canales = leerCanales(undefined);
    canales = cambiarCanal(canales, 'phone', { source: 'own', value: '(601) 745 0000 · ext. 2', type: 'email' });
    expect(canales.find((c) => c.id === 'phone')).toMatchObject({ type: 'phone', source: 'own' });
    canales = anadirCanalPropio(canales, 'Línea gratuita');
    expect(canales).toHaveLength(5);
    expect(quitarCanal(canales, 'whatsapp')).toHaveLength(5);
    expect(leerCanales(canalesAGuardar(canales))).toEqual(canales);
  });
});

describe('redes', () => {
  const links = { instagram: '@tienda', facebook: 'https://facebook.com/tienda', youtube: '@tienda' };
  it('sin `networks` todas encendidas; apagar una guarda la lista explícita', () => {
    expect([...redesEncendidas(undefined, links)]).toEqual(['instagram', 'facebook', 'youtube']);
    expect(alternarRed(undefined, links, 'facebook', false)).toEqual(['instagram', 'youtube']);
    expect(alternarRed(['youtube'], links, 'instagram', true)).toEqual(['instagram', 'youtube']);
  });
});

describe('catálogo del editor', () => {
  it('cada sección de la página Contacto existe en el catálogo con su variante', () => {
    for (const s of seccionesContactoPorDefecto({ conPreguntas: true })) {
      const def = getSectionDefinition(s.section_type);
      expect(def?.variants.map((v) => v.id)).toContain(s.section_variant);
    }
  });

  it('«Encabezado de página» no hereda las opciones de foto de fondo de la portada', () => {
    const hero = SECTION_CATALOG.find((d) => d.type === 'hero')!;
    const visibles = hero.contentFields.filter((c) => !c.showIf?.variantIn || c.showIf.variantIn.includes('page_header')).map((c) => c.key);
    expect(visibles).toEqual(expect.arrayContaining(['title', 'subtitle', 'image_url', 'show_breadcrumb', 'badges', 'buttons']));
    expect(visibles).not.toContain('overlay_opacity');
    expect(visibles).not.toContain('slides');
    expect(visibles).not.toContain('height');
  });

  it('el formulario usa el editor de campos y suma las claves nuevas', () => {
    const def = getSectionDefinition('contact_form')!;
    expect(def.variants[0].id).toBe('card_hours');
    expect(def.contentFields.find((c) => c.key === 'form_fields')?.type).toBe('contact_fields');
    for (const k of ['button_text', 'success_title', 'success_text', 'whatsapp_after', 'show_hours', 'crm_source']) {
      expect(def.contentFields.some((c) => c.key === k)).toBe(true);
    }
  });

  it('«Recomendadas para Contacto» en la página contacto; las demás no cambian', () => {
    const contacto = getSectionCatalogForBranch('retail', { pageSlug: 'contacto' });
    expect(contacto.recomendadas.slice(0, 2).map((e) => e.type)).toEqual(['contact_channels', 'contact_form']);
    const otra = getSectionCatalogForBranch('retail', { pageSlug: 'nosotros' });
    expect(otra.recomendadas.map((e) => e.type)[0]).toBe('products_grid');
  });

  it('la plantilla de página Contacto trae las secciones nuevas', () => {
    const contacto = PLANTILLAS_PAGINA.find((p) => p.id === 'contacto');
    expect(contacto?.secciones.map((s) => s.tipo)).toEqual(['hero', 'contact_channels', 'contact_form', 'hours_location', 'faq', 'social_networks']);
  });
});
