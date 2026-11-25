/**
 * Contrato de la página «Membresías» (Figma «16 Sitio web», sección 3279-100508; decisiones del
 * dueño del 2026-11-25). La tienda tiene su copia idéntica y su propia verificación
 * (goadmin-websites/scripts/verify-membresias.mjs).
 */
import {
  CLAVES_PLANES_MEMBRESIA,
  PLANES_EJEMPLO,
  TEXTOS_PLANES,
  alternarPlanOculto,
  alternarPlanPopular,
  conOrdenPlanes,
  estadoVentaPlan,
  leerAjustesPlanes,
  mensajeWhatsappPlan,
  ordenPorDefecto,
  planesVisibles,
  popularVisible,
  seccionesMembresiasPorDefecto,
  tieneMembresias,
} from '../paginaMembresias';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import { PLANTILLAS_PAGINA } from '@/components/sitio-web/paginas/plantillasPagina';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));

const tres = [{ id: 10 }, { id: 20 }, { id: 30 }];

describe('regla «tiene membresías» y estado de venta', () => {
  test('al menos un plan activo', () => {
    expect(tieneMembresias([])).toBe(false);
    expect(tieneMembresias(null)).toBe(false);
    expect(tieneMembresias([{ id: 1 }])).toBe(true);
  });

  test('en línea, a consultar y pausado', () => {
    expect(estadoVentaPlan('active', true)).toBe('en_linea');
    expect(estadoVentaPlan('active', false)).toBe('consulta');
    expect(estadoVentaPlan(null, false)).toBe('consulta');
    expect(estadoVentaPlan('deleted', true)).toBe('consulta');
    expect(estadoVentaPlan('inactive', true)).toBe('pausado');
  });

  test('orden de siempre: por precio y los sin precio al final', () => {
    const planes = [{ id: 3, price: null }, { id: 2, price: 500 }, { id: 1, price: 900 }, { id: 4, price: 500 }];
    expect(ordenPorDefecto(planes).map((p) => p.id)).toEqual([2, 4, 1, 3]);
  });
});

describe('orden, ojo y «Popular» en el contenido de la sección', () => {
  test('orden guardado, nuevos al final y ocultos fuera', () => {
    expect(planesVisibles(tres, leerAjustesPlanes({})).map((p) => p.id)).toEqual([10, 20, 30]);
    expect(planesVisibles(tres, leerAjustesPlanes({ plan_order: [30, 10] })).map((p) => p.id)).toEqual([30, 10, 20]);
    expect(planesVisibles(tres, leerAjustesPlanes({ hidden_plan_ids: [20] })).map((p) => p.id)).toEqual([10, 30]);
  });

  test('«Popular» solo marcado, visible y con dos o más planes', () => {
    expect(popularVisible(tres, leerAjustesPlanes({}))).toBeNull();
    expect(popularVisible(tres, leerAjustesPlanes({ popular_plan_id: 20 }))).toBe(20);
    expect(popularVisible([{ id: 20 }], leerAjustesPlanes({ popular_plan_id: 20 }))).toBeNull();
    expect(popularVisible([{ id: 10 }, { id: 30 }], leerAjustesPlanes({ popular_plan_id: 20 }))).toBeNull();
  });

  test('escritura del editor', () => {
    expect(conOrdenPlanes({ title: 'x' }, [3, 1, 3])).toEqual({ title: 'x', plan_order: [3, 1] });
    expect(alternarPlanOculto(alternarPlanOculto({}, 5), 5)).toEqual({ hidden_plan_ids: [] });
    expect(alternarPlanPopular({}, 5)).toEqual({ popular_plan_id: 5 });
    expect(alternarPlanPopular({ popular_plan_id: 5 }, 5)).toEqual({ popular_plan_id: null });
    expect(alternarPlanPopular({ popular_plan_id: 5 }, 6)).toEqual({ popular_plan_id: 6 });
  });

  test('WhatsApp con el plan elegido; Contacto si la tienda lo pide', () => {
    expect(mensajeWhatsappPlan(TEXTOS_PLANES.mensajeWhatsapp, 'Club Plus')).toBe('Hola, quiero información del plan «Club Plus» que vi en la tienda.');
    expect(leerAjustesPlanes({}).sinVenta).toBe('whatsapp');
    expect(leerAjustesPlanes({ offline_action: 'contact' }).sinVenta).toBe('contacto');
    expect(leerAjustesPlanes({}).boton).toBe('Comprar plan');
    expect(leerAjustesPlanes({}).verEjemplo).toBe(true);
  });
});

describe('plantilla y muestra', () => {
  test('plantilla neutra: encabezado, planes y preguntas, sin gimnasio', () => {
    const secciones = seccionesMembresiasPorDefecto();
    expect(secciones.map((s) => `${s.section_type}:${s.section_variant}`)).toEqual(['hero:page_header', 'membership_plans:pricing_table', 'faq:accordion']);
    expect(JSON.stringify(secciones)).not.toMatch(/gimnasio|gym|entrenador|sauna/i);
  });

  test('planes de muestra con ids negativos', () => {
    expect(PLANES_EJEMPLO.length).toBe(3);
    expect(PLANES_EJEMPLO.every((p) => p.id < 0)).toBe(true);
  });

  test('la plantilla de página «Membresías» del editor es la misma que pinta la tienda', () => {
    const plantilla = PLANTILLAS_PAGINA.find((p) => p.slug === 'membresias');
    expect(plantilla?.secciones.map((s) => `${s.tipo}:${s.variante}`)).toEqual(['hero:page_header', 'membership_plans:pricing_table', 'faq:accordion']);
    expect(plantilla?.giros).toEqual(expect.arrayContaining(['tienda', 'gimnasio']));
  });
});

describe('catálogo del editor: «Planes de membresía»', () => {
  const def = getSectionDefinition('membership_plans');
  const claves = (def?.contentFields ?? []).map((c) => c.key);

  test('sin planes inventados ni el selector de categorías', () => {
    expect(claves).not.toContain('plans');
    expect(claves).not.toContain('plan_ids');
  });

  test('la lista de planes, el botón y qué mostrar (Figma E2)', () => {
    expect(def?.contentFields.find((c) => c.key === 'plan_order')?.type).toBe('membership_plans');
    for (const k of ['cta_text', 'offline_action', 'whatsapp_message', 'show_description', 'show_duration', 'show_compare_price', 'show_payment_note', 'show_sample_plans']) {
      expect(claves).toContain(k);
    }
    expect(new Set(claves).size).toBe(claves.length);
    for (const k of CLAVES_PLANES_MEMBRESIA) {
      if (k === 'hidden_plan_ids' || k === 'popular_plan_id') continue; // los escribe la lista
      expect(claves).toContain(k);
    }
  });
});
