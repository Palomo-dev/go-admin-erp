/**
 * Catálogo del editor para la página «Contacto v2 editable» (Figma «16 Sitio web», sección
 * 3104:84056; editor Formulario 3108:85760, Canales 3108:86969, Sedes 3112:86965, Redes 3112:87143,
 * Añadir sección 3112:87252). Aprobado por el dueño el 2026-11-24.
 *
 * - Tipos nuevos: `contact_channels` («Canales de contacto») y `social_networks` («Redes sociales»).
 * - `contact_form`: variante `card_hours` y, en todas, campos con «Mostrar»/«Obligatorio», texto del
 *   botón, mensaje de enviado, origen en el CRM.
 * - `hero`: variante `page_header` («Encabezado de página»: migas e imagen opcional).
 * - `hours_location`: «Sede que se abre primero» y botón de WhatsApp por sede.
 *
 * El contrato (claves, defaults y lectores) vive en `src/lib/website/contrato/paginaContacto.ts`,
 * copiado tal cual en la tienda. Aquí solo va lo del editor (etiquetas, grupos y condiciones).
 */
import type { ContentFieldDef, SectionTypeDefinition } from '@/lib/services/websitePageBuilderService';
import {
  TIPO_CANALES_CONTACTO,
  TIPO_REDES_SOCIALES,
  VARIANTE_CANALES_TARJETAS,
  VARIANTE_ENCABEZADO_PAGINA,
  VARIANTE_FORMULARIO_TARJETA,
  VARIANTE_REDES_FILA,
} from '@/lib/website/contrato/paginaContacto';

/** CRM › Clientes potenciales: ahí queda cada mensaje del formulario. */
export const RUTA_LEADS_CRM = '/app/crm/leads';

const SOLO_TARJETA = { variantIn: [VARIANTE_FORMULARIO_TARJETA] };
const SOLO_ENCABEZADO = { variantIn: [VARIANTE_ENCABEZADO_PAGINA] };

/** Campos de «Portada» que también lee «Encabezado de página». */
const CLAVES_HERO_EN_ENCABEZADO = ['title', 'subtitle', 'show_title', 'show_cta', 'cta_text', 'cta_url', 'buttons', 'image_url'];

const CAMPOS_ENCABEZADO: ContentFieldDef[] = [
  {
    key: 'show_breadcrumb',
    label: 'Mostrar migas «Inicio › página»',
    type: 'boolean',
    group: 'content',
    defaultValue: true,
    showIf: SOLO_ENCABEZADO,
  },
  {
    key: 'badges',
    label: 'Chips debajo del texto',
    type: 'chips',
    itemType: 'text',
    group: 'content',
    maxItems: 4,
    helpText: 'Frases cortas, como «Respondemos en menos de 2 horas». El primero lleva un punto verde y los demás un reloj.',
    showIf: SOLO_ENCABEZADO,
  },
];

const CAMPOS_FORMULARIO_V2: ContentFieldDef[] = [
  // Diseño · «Al lado del formulario» (solo la tarjeta con horario).
  { key: 'show_hours', label: 'Horario de atención', type: 'boolean', group: 'layout', section: 'Al lado del formulario', defaultValue: true, helpText: 'El de Configuración › Contacto o, si no hay, el de la sede principal.', showIf: SOLO_TARJETA },
  { key: 'show_order_card', label: 'Tarjeta «¿Ya hiciste un pedido?»', type: 'boolean', group: 'layout', section: 'Al lado del formulario', defaultValue: true, showIf: SOLO_TARJETA },
  { key: 'show_contact_info', label: 'Datos de contacto (teléfono, correo, dirección)', type: 'boolean', group: 'layout', section: 'Al lado del formulario', defaultValue: false, helpText: 'En celular van debajo del formulario.', showIf: SOLO_TARJETA },
  { key: 'two_columns', label: 'Nombre y correo en dos columnas', type: 'boolean', group: 'layout', section: 'Formulario', defaultValue: true, helpText: 'Solo en computador.', showIf: SOLO_TARJETA },
  {
    key: 'title_align',
    label: 'Alineación del título',
    type: 'select',
    group: 'layout',
    section: 'Formulario',
    defaultValue: 'left',
    options: [
      { value: 'left', label: 'Izquierda' },
      { value: 'center', label: 'Centro' },
    ],
    showIf: SOLO_TARJETA,
  },
  { key: 'form_in_card', label: 'Formulario dentro de una tarjeta', type: 'boolean', group: 'layout', section: 'Formulario', defaultValue: true, showIf: SOLO_TARJETA },
  // Contenido · Botón.
  { key: 'button_text', label: 'Texto del botón', type: 'text', group: 'content', section: 'Botón', placeholder: 'Enviar mensaje' },
  { key: 'show_privacy_note', label: 'Mostrar «No compartimos tus datos»', type: 'boolean', group: 'content', section: 'Botón', defaultValue: true, showIf: SOLO_TARJETA },
  // Contenido · Al enviar.
  {
    key: '_aviso_crm',
    label: 'Cada mensaje también queda en CRM › Clientes potenciales',
    type: 'notice',
    group: 'data',
    section: 'Al enviar',
    helpText: 'Con origen «Página Contacto» o el que pongas en Avanzado.',
    link: { label: 'Ver mensajes recibidos en CRM', href: RUTA_LEADS_CRM },
  },
  { key: 'success_title', label: 'Título del mensaje de enviado', type: 'text', group: 'data', section: 'Al enviar', placeholder: '¡Mensaje enviado!' },
  {
    key: 'success_text',
    label: 'Texto del mensaje de enviado',
    type: 'textarea',
    group: 'data',
    section: 'Al enviar',
    placeholder: 'Gracias, {nombre}. Te respondemos a {correo} lo antes posible.',
    helpText: 'Usa {nombre} y {correo}: se cambian por los datos del cliente.',
  },
  { key: 'whatsapp_after', label: 'Botón de WhatsApp al terminar', type: 'boolean', group: 'data', section: 'Al enviar', defaultValue: true, helpText: 'Con el número de Configuración › WhatsApp.', showIf: SOLO_TARJETA },
  // Avanzado.
  { key: 'anchor_id', label: 'Ancla (enlace directo)', type: 'text', group: 'advanced', placeholder: 'formulario', helpText: 'Para enlazar directo al formulario: /contacto#formulario', showIf: SOLO_TARJETA },
  { key: 'crm_source', label: 'Origen en el CRM', type: 'text', group: 'advanced', placeholder: 'Página Contacto', helpText: 'Así aparece en el cliente potencial. Protección contra spam siempre activa: campo trampa y máximo 5 envíos por hora por persona.' },
];

const CAMPOS_SEDES_V2: ContentFieldDef[] = [
  {
    key: 'featured_branch_id',
    label: 'Sede que se abre primero',
    type: 'entity',
    entity: 'branch',
    multiple: false,
    group: 'data',
    helpText: 'Va de primera y es la que se ve al abrir la página. Vacío: el orden de siempre.',
  },
  {
    key: 'show_whatsapp',
    label: 'Botón «WhatsApp» de la sede',
    type: 'boolean',
    group: 'data',
    defaultValue: false,
    helpText: 'Las sedes aún no tienen número propio: se usa el WhatsApp del sitio con el nombre de la sede en el mensaje.',
  },
];

/** Inserta `nuevos` después del campo `despues` (o al final). */
function insertarDespues(campos: ContentFieldDef[], despues: string, nuevos: ContentFieldDef[]): ContentFieldDef[] {
  const i = campos.findIndex((c) => c.key === despues);
  if (i < 0) return [...campos, ...nuevos];
  return [...campos.slice(0, i + 1), ...nuevos, ...campos.slice(i + 1)];
}

/**
 * Suma lo de Contacto v2 a los tipos que ya existían. Se aplica sobre el catálogo con las variantes
 * de tienda (como `conVariantesTienda`): un campo que no declara variantes queda en las de antes,
 * así la variante nueva no hereda opciones que no lee.
 */
export function conContactoV2(def: SectionTypeDefinition): SectionTypeDefinition {
  if (def.type === 'hero') {
    if (def.variants.some((v) => v.id === VARIANTE_ENCABEZADO_PAGINA)) return def;
    const previas = def.variants.map((v) => v.id);
    const campos = def.contentFields.map((campo): ContentFieldDef => {
      const ofrecidas = campo.showIf?.variantIn ?? previas;
      const variantIn = CLAVES_HERO_EN_ENCABEZADO.includes(campo.key) ? [...ofrecidas, VARIANTE_ENCABEZADO_PAGINA] : ofrecidas;
      return { ...campo, showIf: { ...(campo.showIf ?? {}), variantIn } };
    });
    return {
      ...def,
      variants: [...def.variants, { id: VARIANTE_ENCABEZADO_PAGINA, label: 'Encabezado de página' }],
      contentFields: insertarDespues(campos, 'subtitle', CAMPOS_ENCABEZADO),
    };
  }
  if (def.type === 'contact_form') {
    if (def.variants.some((v) => v.id === VARIANTE_FORMULARIO_TARJETA)) return def;
    // «A qué correo llega» va en el bloque «Al enviar» (Figma 3108:85760), junto al aviso del CRM.
    const correo = def.contentFields.find((c) => c.key === 'email_to');
    const campos = def.contentFields
      .filter((c) => c.key !== 'email_to')
      .map((campo): ContentFieldDef => {
        if (campo.key === 'title' || campo.key === 'subtitle') return { ...campo, section: 'Textos', ...(campo.key === 'subtitle' ? { label: 'Texto debajo del título' } : {}) };
        if (campo.key === 'form_fields') {
          // Editor propio: etiqueta, «Mostrar», «Obligatorio», opciones del Asunto y la casilla de datos.
          return { key: 'form_fields', label: 'Campos del formulario', type: 'contact_fields', group: 'content', section: 'Campos del formulario' };
        }
        return campo;
      });
    const nuevos = correo
      ? insertarDespues(CAMPOS_FORMULARIO_V2, '_aviso_crm', [
          { ...correo, label: 'A qué correo llega', section: 'Al enviar', helpText: 'Uno o varios correos (hasta 5), separados por coma. Sin correo, el mensaje solo queda en el CRM.' },
        ])
      : CAMPOS_FORMULARIO_V2;
    return {
      ...def,
      variants: [{ id: VARIANTE_FORMULARIO_TARJETA, label: 'Tarjeta con horario al lado' }, ...def.variants],
      contentFields: [...campos, ...nuevos],
    };
  }
  if (def.type === 'hours_location') {
    if (def.contentFields.some((c) => c.key === 'featured_branch_id')) return def;
    return { ...def, contentFields: insertarDespues(def.contentFields, 'branch_ids', CAMPOS_SEDES_V2) };
  }
  return def;
}

/** Tipos nuevos de Contacto v2 (la tarjeta de «Añadir sección» lleva «Nueva»). */
export const TIPOS_NUEVOS_CONTACTO: readonly string[] = [TIPO_CANALES_CONTACTO, TIPO_REDES_SOCIALES];

export const SECCIONES_CONTACTO_CATALOGO: SectionTypeDefinition[] = [
  {
    type: TIPO_CANALES_CONTACTO,
    label: 'Canales de contacto',
    icon: 'MessageCircle',
    description: 'WhatsApp, teléfono, correo y dirección',
    variants: [{ id: VARIANTE_CANALES_TARJETAS, label: 'Tarjetas' }],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', section: 'Textos', placeholder: 'Elige cómo hablar con nosotros' },
      { key: 'subtitle', label: 'Texto debajo del título', type: 'textarea', section: 'Textos', placeholder: 'Todos los canales llegan al mismo equipo.' },
      { key: 'channels', label: 'Canales', type: 'contact_channels', group: 'content', section: 'Canales' },
      { key: 'show_help', label: 'Mostrar texto de ayuda', type: 'boolean', group: 'layout', section: 'Tarjetas', defaultValue: true },
      { key: 'whatsapp_primary', label: 'Botón principal en WhatsApp', type: 'boolean', group: 'layout', section: 'Tarjetas', defaultValue: true },
    ],
  },
  {
    type: TIPO_REDES_SOCIALES,
    label: 'Redes sociales',
    icon: 'Share2',
    description: 'Instagram, Facebook, TikTok…',
    variants: [{ id: VARIANTE_REDES_FILA, label: 'En fila' }],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Síguenos en redes' },
      { key: 'subtitle', label: 'Texto', type: 'textarea', placeholder: '@tutienda · ofertas y lanzamientos' },
      { key: 'networks', label: 'Redes a mostrar', type: 'social_networks', group: 'content' },
      {
        key: 'display',
        label: 'Forma',
        type: 'select',
        group: 'content',
        defaultValue: 'name',
        options: [
          { value: 'name', label: 'Botón con nombre' },
          { value: 'icon', label: 'Solo ícono' },
        ],
      },
    ],
  },
];
