/**
 * Página «Membresías» y sección «Planes de membresía» (`membership_plans` · `pricing_table`).
 * Figma «16 Sitio web», sección 3279-100508: A computador 3281-100572, B celular 3281-100830,
 * C estados 3283-100941, D sin planes 3284-101231, E editor 3286-101346, tarjeta 3279-100711.
 *
 * Decisiones del dueño (2026-11-25):
 * - «La tienda tiene membresías» = al menos un plan activo (`membership_plans.is_active`). Sin
 *   ninguno, /membresias responde 404 con la marca de la tienda y sale del menú y del sitemap.
 * - /membresias pinta la página «Membresías» del editor o, si la tienda no la armó, la plantilla
 *   `seccionesMembresiasPorDefecto()`.
 * - Orden, cuáles se ven y cuál es «Popular» se guardan en el CONTENIDO de la sección (sin columnas
 *   nuevas). Precio, duración, beneficios y activo siguen en Membresías › Planes.
 * - «Popular» lo marca la tienda (una estrella); sin marca no hay insignia, y con un solo plan
 *   visible tampoco.
 * - Plan que no se vende en línea (sin producto activo o sin precio vigente): «Precio a consultar»
 *   y botón a WhatsApp con el mensaje listo; sin WhatsApp, a Contacto. Plan con el producto pausado:
 *   «No disponible por ahora» (se puede ocultar con el ojo).
 * - En el editor, sin planes, el lienzo muestra planes de muestra marcados «Ejemplo»; nunca se
 *   publican.
 *
 * Este archivo es la única definición y lo leen los dos lados: el editor del ERP y la tienda
 * (goadmin-websites, copia idéntica que vigila `scripts/verify-copias-erp.mjs`).
 *
 * Código puro: sin imports, sin React ni Supabase.
 */

// ─── Tipos, variantes y rutas ────────────────────────────────────────────────────────────────

export const TIPO_PLANES_MEMBRESIA = 'membership_plans' as const;
export const VARIANTE_TABLA_PLANES = 'pricing_table' as const;
export const SLUG_PAGINA_MEMBRESIAS = 'membresias' as const;
export const RUTA_MEMBRESIAS = '/membresias' as const;

/** Claves del contenido de la sección que escribe el editor (además de `title`, `subtitle`, `cta_text`). */
export const CLAVES_PLANES_MEMBRESIA = [
  'plan_order',
  'hidden_plan_ids',
  'popular_plan_id',
  'offline_action',
  'whatsapp_message',
  'show_duration',
  'show_payment_note',
  'show_sample_plans',
] as const;

// ─── Estado de venta de un plan ──────────────────────────────────────────────────────────────

/**
 * - `en_linea`: producto activo con precio vigente → «Comprar plan» (carrito y pedido web; el ERP
 *   activa la membresía al confirmarse el pago).
 * - `consulta`: sin producto activo o sin precio vigente → «Precio a consultar» y botón a WhatsApp.
 * - `pausado`: el producto del plan está inactivo → «No disponible por ahora».
 */
export type EstadoVentaPlan = 'en_linea' | 'consulta' | 'pausado';

/** Estado de venta de un plan ACTIVO según el estado de su producto y si tiene precio vigente. */
export function estadoVentaPlan(estadoProducto: string | null | undefined, tienePrecioVigente: boolean): EstadoVentaPlan {
  if (estadoProducto === 'inactive') return 'pausado';
  if (estadoProducto === 'active' && tienePrecioVigente) return 'en_linea';
  return 'consulta';
}

/**
 * Orden de siempre (sin orden guardado en la sección): por precio de menor a mayor; los que no
 * tienen precio, al final; a igual precio, por id. Lo usan la tienda y la lista del editor.
 */
export function ordenPorDefecto<T extends { id: number; price: number | null }>(planes: readonly T[]): T[] {
  return [...planes].sort((a, b) => {
    if (a.price === null && b.price === null) return a.id - b.id;
    if (a.price === null) return 1;
    if (b.price === null) return -1;
    return a.price - b.price || a.id - b.id;
  });
}

/** Regla del dueño: la tienda «tiene membresías» con al menos un plan activo. */
export function tieneMembresias(planesActivos: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(planesActivos) && planesActivos.length > 0;
}

// ─── Ajustes de la sección ───────────────────────────────────────────────────────────────────

export type AccionSinVenta = 'whatsapp' | 'contacto';

export const TEXTOS_PLANES = {
  titulo: 'Elige tu plan',
  subtitulo: 'Puedes cambiar de plan cuando se termine el que tienes.',
  boton: 'Comprar plan',
  /** `{plan}` se cambia por el nombre del plan. */
  mensajeWhatsapp: 'Hola, quiero información del plan «{plan}» que vi en la tienda.',
} as const;

export interface AjustesPlanes {
  /** Ids en el orden elegido; los que no están van después, en el orden de siempre. */
  orden: number[];
  ocultos: number[];
  popular: number | null;
  sinVenta: AccionSinVenta;
  mensaje: string;
  boton: string;
  mostrarDuracion: boolean;
  mostrarNotaPago: boolean;
  /** Solo en el editor: planes de muestra en el lienzo cuando no hay planes activos. */
  verEjemplo: boolean;
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function idsDe(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<number>();
  const ids: number[] = [];
  for (const x of v) {
    const n = Number(x);
    if (Number.isInteger(n) && n > 0 && !vistos.has(n)) {
      vistos.add(n);
      ids.push(n);
    }
  }
  return ids;
}

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function leerAjustesPlanes(content: unknown): AjustesPlanes {
  const c = objeto(content);
  const popular = Number(c.popular_plan_id);
  return {
    orden: idsDe(c.plan_order),
    ocultos: idsDe(c.hidden_plan_ids),
    popular: Number.isInteger(popular) && popular > 0 ? popular : null,
    sinVenta: c.offline_action === 'contact' ? 'contacto' : 'whatsapp',
    mensaje: texto(c.whatsapp_message, 300) || TEXTOS_PLANES.mensajeWhatsapp,
    boton: texto(c.cta_text, 60) || TEXTOS_PLANES.boton,
    mostrarDuracion: c.show_duration !== false,
    mostrarNotaPago: c.show_payment_note !== false,
    verEjemplo: c.show_sample_plans !== false,
  };
}

/** Todos los planes en el orden elegido (los nuevos, al final y en el orden en que llegan). */
export function ordenarPlanes<T extends { id: number }>(planes: readonly T[], ajustes: Pick<AjustesPlanes, 'orden'>): T[] {
  const posicion = new Map(ajustes.orden.map((id, i) => [id, i]));
  return planes
    .map((plan, i) => ({ plan, i }))
    .sort((a, b) => {
      const pa = posicion.get(a.plan.id);
      const pb = posicion.get(b.plan.id);
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return a.i - b.i;
    })
    .map((x) => x.plan);
}

/** Los planes que pinta la tienda: ordenados y sin los ocultos con el ojo. */
export function planesVisibles<T extends { id: number }>(planes: readonly T[], ajustes: Pick<AjustesPlanes, 'orden' | 'ocultos'>): T[] {
  const ocultos = new Set(ajustes.ocultos);
  return ordenarPlanes(planes, ajustes).filter((p) => !ocultos.has(p.id));
}

/**
 * Id del plan con la insignia «Popular», o `null`. Solo si la tienda lo marcó, sigue visible y hay
 * al menos dos planes a la vista (con uno solo la tarjeta va destacada, sin insignia).
 */
export function popularVisible(visibles: readonly { id: number }[], ajustes: Pick<AjustesPlanes, 'popular'>): number | null {
  if (ajustes.popular === null || visibles.length < 2) return null;
  return visibles.some((p) => p.id === ajustes.popular) ? ajustes.popular : null;
}

/** Mensaje de WhatsApp con el nombre del plan. */
export function mensajeWhatsappPlan(plantilla: string, plan: string): string {
  return (plantilla.trim() || TEXTOS_PLANES.mensajeWhatsapp).split('{plan}').join(plan.trim());
}

// ─── Escritura desde el editor ───────────────────────────────────────────────────────────────

/** Guarda el orden de los ids (los que el editor muestra, en ese orden). */
export function conOrdenPlanes(content: Record<string, unknown>, ids: readonly number[]): Record<string, unknown> {
  return { ...content, plan_order: idsDe(ids) };
}

/** Oculta o vuelve a mostrar un plan (el ojo). */
export function alternarPlanOculto(content: Record<string, unknown>, id: number): Record<string, unknown> {
  const ocultos = idsDe(content.hidden_plan_ids);
  const siguiente = ocultos.includes(id) ? ocultos.filter((x) => x !== id) : [...ocultos, id];
  return { ...content, hidden_plan_ids: siguiente };
}

/** Marca o desmarca «Popular» (uno solo). */
export function alternarPlanPopular(content: Record<string, unknown>, id: number): Record<string, unknown> {
  const actual = leerAjustesPlanes(content).popular;
  return { ...content, popular_plan_id: actual === id ? null : id };
}

// ─── Planes de muestra (solo el lienzo del editor) ───────────────────────────────────────────

export interface PlanMuestra {
  id: number;
  name: string;
  description: string;
  price: number;
  compare_price: number | null;
  duration_days: number;
  duration_unit: 'month' | 'year';
  duration_value: number;
  frequency: string;
  access_rules: { features: string[] };
  estado: EstadoVentaPlan;
}

/**
 * Planes de muestra del lienzo del editor (Figma E1). Ids negativos: nunca chocan con uno real.
 * La tienda los pinta solo en la vista previa del editor, marcados «Ejemplo»; nunca se publican
 * ni se pueden comprar.
 */
export const PLANES_EJEMPLO: readonly PlanMuestra[] = [
  {
    id: -1,
    name: 'Plan mensual',
    description: 'Para empezar cuando quieras.',
    price: 19900,
    compare_price: null,
    duration_days: 30,
    duration_unit: 'month',
    duration_value: 1,
    frequency: 'monthly',
    access_rules: { features: ['Beneficio de ejemplo', 'Otro beneficio de ejemplo', 'Un beneficio más'] },
    estado: 'en_linea',
  },
  {
    id: -2,
    name: 'Plan trimestral',
    description: 'El más elegido.',
    price: 49900,
    compare_price: null,
    duration_days: 90,
    duration_unit: 'month',
    duration_value: 3,
    frequency: 'quarterly',
    access_rules: { features: ['Beneficio de ejemplo', 'Otro beneficio de ejemplo', 'Un beneficio más', 'Y uno más'] },
    estado: 'en_linea',
  },
  {
    id: -3,
    name: 'Plan anual',
    description: 'Un año completo de beneficios.',
    price: 159900,
    compare_price: 199600,
    duration_days: 365,
    duration_unit: 'year',
    duration_value: 1,
    frequency: 'annual',
    access_rules: { features: ['Beneficio de ejemplo', 'Otro beneficio de ejemplo', 'Un beneficio más', 'Y uno más'] },
    estado: 'en_linea',
  },
];

/** En el lienzo, la muestra marca el plan del medio como «Popular» si la tienda no eligió otro. */
export const ID_POPULAR_EJEMPLO = -2;

// ─── Plantilla de la página ──────────────────────────────────────────────────────────────────

export interface SeccionPorDefecto {
  section_type: string;
  section_variant: string;
  content: Record<string, unknown>;
}

/**
 * Secciones de la página «Membresías» cuando la tienda no la armó en el editor (Figma A/B):
 * Encabezado de página, Planes de membresía y Preguntas frecuentes con textos neutros (sirven
 * para cualquier giro: nada de gimnasio). Todo se puede editar en el editor.
 */
export function seccionesMembresiasPorDefecto(): SeccionPorDefecto[] {
  return [
    {
      section_type: 'hero',
      section_variant: 'page_header',
      content: {
        title: 'Membresías',
        subtitle: 'Elige tu plan y págalo en línea. Tus beneficios empiezan cuando se confirma el pago.',
        show_breadcrumb: true,
      },
    },
    {
      section_type: TIPO_PLANES_MEMBRESIA,
      section_variant: VARIANTE_TABLA_PLANES,
      content: {
        title: TEXTOS_PLANES.titulo,
        subtitle: TEXTOS_PLANES.subtitulo,
        cta_text: TEXTOS_PLANES.boton,
        show_description: true,
        show_compare_price: true,
      },
    },
    {
      section_type: 'faq',
      section_variant: 'accordion',
      content: {
        title: 'Preguntas frecuentes',
        subtitle: '¿Otra duda? Escríbenos.',
        items: [
          {
            question: '¿Cuándo empieza mi membresía?',
            answer: 'Cuando se confirma el pago. La ves en Mi cuenta › Membresía.',
          },
          {
            question: '¿Cuánto dura?',
            answer: 'Cada plan muestra su duración en la tarjeta. Al terminar, puedes comprarlo de nuevo aquí.',
          },
          {
            question: '¿Puedo cancelarla?',
            answer: 'Escríbenos y te contamos las condiciones de tu plan.',
          },
          {
            question: '¿Dónde aplican los beneficios?',
            answer: 'Cada plan muestra sus beneficios. Si tienes una duda puntual, escríbenos.',
          },
        ],
      },
    },
  ];
}
