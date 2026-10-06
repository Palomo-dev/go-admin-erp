/**
 * Catálogo del editor para la Carta QR en la mesa (Figma «16 Sitio web», 2032:75742, láminas 17
 * «Cómo se edita» y 18 «Secciones y campos»): los cuatro tipos nuevos, la variante «mesa» de la
 * portada de restaurante y la variante «qr» de la carta completa.
 *
 * Claves, variantes y valores por defecto salen del contrato compartido con el sitio
 * (`src/lib/website/contrato/seccionesMesa.ts`, copia de goadmin-websites): aquí solo se dice
 * CÓMO se edita cada campo (etiqueta, ayuda, pestaña y bloque del inspector).
 *
 * Pestañas (lámina 17): todo lo de la sección se edita en «Diseño» por bloques («Textos»,
 * «División de la cuenta», «Propina sugerida», «Pago»…); «Contenido» dice de dónde salen los
 * datos (POS › Mesas, Comandas, Ventas en línea); «Estilo» y «Avanzado» son los de siempre.
 */
import type { ContentFieldDef, SectionTypeDefinition } from '@/lib/services/websitePageBuilderService';
import {
  DEFAULT_CARTA_QR,
  DEFAULT_CUENTA_MESA,
  DEFAULT_MOTIVOS_SERVICIO,
  DEFAULT_PEDIDO_MESA,
  DEFAULT_PORTADA_MESA,
  DEFAULT_SERVICIO_MESA,
  DEFAULT_VALORAR_VISITA,
  ETIQUETAS_SECCION_MESA,
  ICONOS_MOTIVO,
  MODOS_DIVISION,
  VARIANTES_SECCION_MESA,
  VARIANTE_CARTA_QR,
  VARIANTE_PORTADA_MESA,
  type TipoSeccionMesa,
} from '@/lib/website/contrato/seccionesMesa';

const AYUDA_MESA = '{mesa} se cambia por el nombre de la mesa, p. ej. «Mesa 7».';
const RUTA_VENTAS_EN_LINEA = '/app/sitio-web/ventas';
const RUTA_MESAS = '/app/pos/mesas';

function variantes(tipo: TipoSeccionMesa): { id: string; label: string }[] {
  const etiquetas = ETIQUETAS_SECCION_MESA[tipo].variantes;
  return (VARIANTES_SECCION_MESA[tipo] as readonly string[]).map((id) => ({ id, label: etiquetas[id] ?? id }));
}

/** Campo de la pestaña Diseño dentro de un bloque con título. */
function diseno(seccion: string, campo: ContentFieldDef): ContentFieldDef {
  return { ...campo, group: 'layout', section: seccion };
}

const NOMBRE_MODO: Record<(typeof MODOS_DIVISION)[number], string> = {
  todo: 'Todo junto',
  iguales: 'Partes iguales',
  comensal: 'Por lo que pidió cada uno',
};

const NOMBRE_ICONO: Record<(typeof ICONOS_MOTIVO)[number], string> = {
  bell: 'Campana',
  chef: 'Cocinero',
  cup: 'Vaso',
  utensils: 'Cubiertos',
  help: 'Ayuda',
};

// ─── Tipos nuevos ─────────────────────────────────────────────────────────────────────────────

export const SECCIONES_MESA_CATALOGO: SectionTypeDefinition[] = [
  {
    type: 'table_service',
    label: ETIQUETAS_SECCION_MESA.table_service.tipo,
    icon: 'ConciergeBell',
    description: 'Llamar al mesero con un motivo y pedir la cuenta desde la mesa',
    variants: variantes('table_service'),
    contentFields: [
      {
        key: '_origen',
        label: 'De dónde salen los datos',
        type: 'notice',
        helpText: 'La mesa sale del QR. Cada llamado llega en tiempo real a POS › Mesas y a la campana del mesero.',
        link: { label: 'Abrir POS › Mesas', href: RUTA_MESAS },
      },
      diseno('Textos', { key: 'title', label: 'Pregunta', type: 'text', placeholder: DEFAULT_SERVICIO_MESA.title }),
      diseno('Textos', { key: 'button_text', label: 'Botón', type: 'text', placeholder: DEFAULT_SERVICIO_MESA.buttonText }),
      diseno('Textos', { key: 'other_placeholder', label: 'Texto del campo «algo más»', type: 'text', placeholder: DEFAULT_SERVICIO_MESA.otherPlaceholder }),
      diseno('Textos', { key: 'sent_title', label: 'Título del aviso enviado', type: 'text', placeholder: DEFAULT_SERVICIO_MESA.sentTitle }),
      diseno('Textos', {
        key: 'sent_text',
        label: 'Texto del aviso enviado',
        type: 'text',
        placeholder: DEFAULT_SERVICIO_MESA.sentText,
        helpText: '{mesero} se cambia por el nombre del mesero de la mesa; sin mesero, «El equipo».',
      }),
      diseno('Motivos del llamado', {
        key: 'reasons',
        label: 'Motivos',
        type: 'repeater',
        itemLabelKey: 'label',
        maxItems: 8,
        defaultItems: DEFAULT_MOTIVOS_SERVICIO.map((m) => ({ ...m })),
        helpText: 'El comensal elige uno; el mesero lo ve en la solicitud.',
        itemFields: [
          { key: 'label', label: 'Texto', type: 'text', placeholder: 'Que venga el mesero' },
          { key: 'icon', label: 'Icono', type: 'select', defaultValue: 'help', options: ICONOS_MOTIVO.map((i) => ({ value: i, label: NOMBRE_ICONO[i] })) },
        ],
      }),
      diseno('Comportamiento', {
        key: 'show_bill_button',
        label: 'Mostrar «Pedir la cuenta»',
        type: 'boolean',
        defaultValue: DEFAULT_SERVICIO_MESA.showBillButton,
      }),
      diseno('Comportamiento', {
        key: 'cooldown_seconds',
        label: 'Tiempo entre llamados',
        type: 'number',
        min: 15,
        max: 600,
        suffix: 's',
        defaultValue: DEFAULT_SERVICIO_MESA.cooldownSeconds,
        helpText: 'Evita llamados repetidos. La base también los agrupa.',
      }),
    ],
  },
  {
    type: 'table_order',
    label: ETIQUETAS_SECCION_MESA.table_order.tipo,
    icon: 'ClipboardList',
    description: 'Rondas de la mesa con su estado en vivo y quién pidió qué',
    variants: variantes('table_order'),
    contentFields: [
      {
        key: '_origen',
        label: 'De dónde salen los datos',
        type: 'notice',
        helpText: 'Las rondas y su estado salen de la cuenta de la mesa y de Comandas. Lo que el comensal envía entra a POS › Pedidos online, o directo a la mesa si la sede lo activa.',
        link: { label: 'Abrir POS › Mesas', href: RUTA_MESAS },
      },
      diseno('Textos', { key: 'title', label: 'Título', type: 'text', placeholder: DEFAULT_PEDIDO_MESA.title, helpText: AYUDA_MESA }),
      diseno('Textos', { key: 'eta_text', label: 'Tiempo estimado', type: 'text', placeholder: DEFAULT_PEDIDO_MESA.etaText, helpText: 'Vacío: no se muestra.' }),
      diseno('Textos', { key: 'no_charge_text', label: 'Aviso de cobro', type: 'text', placeholder: DEFAULT_PEDIDO_MESA.noChargeText }),
      diseno('Vista', {
        key: 'default_view',
        label: 'Ver el pedido',
        type: 'select',
        defaultValue: DEFAULT_PEDIDO_MESA.defaultView,
        options: [
          { value: 'ronda', label: 'Por ronda' },
          { value: 'persona', label: 'Por persona' },
        ],
      }),
      diseno('Vista', {
        key: 'show_live_status',
        label: 'Mostrar el estado en vivo',
        type: 'boolean',
        defaultValue: DEFAULT_PEDIDO_MESA.showLiveStatus,
        helpText: 'Enviada · En preparación · Lista · Servida.',
      }),
      diseno('Confirmación', {
        key: 'confirm_before_send',
        label: 'Confirmar antes de enviar',
        type: 'boolean',
        defaultValue: DEFAULT_PEDIDO_MESA.confirmBeforeSend,
      }),
      diseno('Confirmación', {
        key: 'confirm_title',
        label: 'Título de la confirmación',
        type: 'text',
        placeholder: DEFAULT_PEDIDO_MESA.confirmTitle,
        helpText: '{n} se cambia por el número de la ronda.',
        showIf: { field: 'confirm_before_send', in: [true, undefined] },
      }),
      diseno('Confirmación', {
        key: 'confirm_text',
        label: 'Texto de la confirmación',
        type: 'textarea',
        placeholder: DEFAULT_PEDIDO_MESA.confirmText,
        showIf: { field: 'confirm_before_send', in: [true, undefined] },
      }),
      diseno('Estados', { key: 'pending_text', label: 'Ronda por confirmar', type: 'text', placeholder: DEFAULT_PEDIDO_MESA.pendingText }),
      diseno('Estados', { key: 'offline_text', label: 'Sin conexión', type: 'textarea', placeholder: DEFAULT_PEDIDO_MESA.offlineText }),
      diseno('Estados', { key: 'error_title', label: 'Error al enviar · título', type: 'text', placeholder: DEFAULT_PEDIDO_MESA.errorTitle }),
      diseno('Estados', { key: 'error_text', label: 'Error al enviar · texto', type: 'textarea', placeholder: DEFAULT_PEDIDO_MESA.errorText }),
      diseno('Estados', { key: 'sold_out_text', label: 'Plato agotado', type: 'text', placeholder: DEFAULT_PEDIDO_MESA.soldOutText }),
      diseno('Estados', { key: 'kitchen_closed_text', label: 'Cocina cerrada', type: 'textarea', placeholder: DEFAULT_PEDIDO_MESA.kitchenClosedText }),
    ],
  },
  {
    type: 'table_bill',
    label: ETIQUETAS_SECCION_MESA.table_bill.tipo,
    icon: 'Receipt',
    description: 'La cuenta de la mesa: dividir, propina y pagar en línea o en la mesa',
    variants: variantes('table_bill'),
    contentFields: [
      {
        key: '_origen',
        label: 'De dónde salen los datos',
        type: 'notice',
        helpText: 'Los importes salen de la cuenta de la mesa en POS › Mesas. El pago en línea usa los métodos de Sitio web › Ventas en línea y descuenta el saldo de la mesa.',
        link: { label: 'Abrir POS › Mesas', href: RUTA_MESAS },
      },
      diseno('Textos', { key: 'title', label: 'Título', type: 'text', placeholder: DEFAULT_CUENTA_MESA.title, helpText: AYUDA_MESA }),
      diseno('Textos', { key: 'tip_text', label: 'Texto de la propina', type: 'textarea', placeholder: DEFAULT_CUENTA_MESA.tipText }),
      diseno('División de la cuenta', {
        key: 'allow_split',
        label: 'Dejar dividir la cuenta',
        type: 'boolean',
        defaultValue: DEFAULT_CUENTA_MESA.allowSplit,
        helpText: 'El comensal elige cómo; el cajero ve cada parte en POS › Mesas.',
      }),
      diseno('División de la cuenta', {
        key: 'split_modes',
        label: 'Formas de dividir',
        type: 'checklist',
        defaultValue: [...DEFAULT_CUENTA_MESA.splitModes],
        options: MODOS_DIVISION.map((m) => ({ value: m, label: NOMBRE_MODO[m] })),
        showIf: { field: 'allow_split', in: [true, undefined] },
      }),
      diseno('Propina sugerida', {
        key: 'tip_options',
        label: 'Propinas sugeridas',
        type: 'chips',
        itemType: 'number',
        suffix: '%',
        min: 0,
        max: 30,
        maxItems: 4,
        defaultValue: [...DEFAULT_CUENTA_MESA.tipOptions],
        placeholder: 'Sin propina',
        helpText: '0 se muestra como «Sin propina». Hasta 4, de 0 a 30 %.',
      }),
      diseno('Propina sugerida', { key: 'allow_custom_tip', label: 'Permitir otro valor', type: 'boolean', defaultValue: DEFAULT_CUENTA_MESA.allowCustomTip }),
      diseno('Pago', {
        key: 'pay_online',
        label: 'Pagar en línea',
        type: 'boolean',
        defaultValue: DEFAULT_CUENTA_MESA.payOnline,
        helpText: 'Usa los métodos de Sitio web › Ventas en línea.',
      }),
      diseno('Pago', {
        key: 'pay_at_table',
        label: 'Pagar en la mesa',
        type: 'boolean',
        defaultValue: DEFAULT_CUENTA_MESA.payAtTable,
        helpText: 'Avisa al mesero para traer datáfono o recibir efectivo.',
      }),
      diseno('Pago', {
        key: 'pay_at_table_text',
        label: 'Texto del botón «Pagar en la mesa»',
        type: 'text',
        placeholder: DEFAULT_CUENTA_MESA.payAtTableText,
        showIf: { field: 'pay_at_table', in: [true, undefined] },
      }),
      diseno('Pago', {
        key: '_aviso_pasarela',
        label: 'Pagar en línea necesita una pasarela activa',
        type: 'notice',
        helpText: 'Sin ella, la sección solo ofrece pagar en la mesa. No hay que tocar nada más.',
        link: { label: 'Ver Ventas en línea', href: RUTA_VENTAS_EN_LINEA },
        showIf: { field: 'pay_online', in: [true, undefined] },
      }),
    ],
  },
  {
    type: 'visit_feedback',
    label: ETIQUETAS_SECCION_MESA.visit_feedback.tipo,
    icon: 'Star',
    description: 'Estrellas, lo que más gustó y un comentario, después de pagar',
    variants: variantes('visit_feedback'),
    contentFields: [
      {
        key: '_origen',
        label: 'De dónde salen los datos',
        type: 'notice',
        helpText: 'La valoración queda en la venta de la mesa y se ve en POS › Mesas y en el informe de satisfacción.',
      },
      diseno('Textos', { key: 'question', label: 'Pregunta', type: 'text', placeholder: DEFAULT_VALORAR_VISITA.question }),
      diseno('Textos', { key: 'aspects_title', label: 'Título de los aspectos', type: 'text', placeholder: DEFAULT_VALORAR_VISITA.aspectsTitle, helpText: 'Vacío: no se muestra.' }),
      diseno('Textos', { key: 'comment_placeholder', label: 'Texto del comentario', type: 'text', placeholder: DEFAULT_VALORAR_VISITA.commentPlaceholder }),
      diseno('Textos', { key: 'thanks_text', label: 'Agradecimiento', type: 'text', placeholder: DEFAULT_VALORAR_VISITA.thanksText }),
      diseno('Aspectos', {
        key: 'aspects',
        label: 'Aspectos',
        type: 'chips',
        itemType: 'text',
        maxItems: 8,
        defaultValue: [...DEFAULT_VALORAR_VISITA.aspects],
        placeholder: 'Añadir aspecto',
      }),
      diseno('Comportamiento', {
        key: 'only_after_payment',
        label: 'Mostrar solo después de pagar',
        type: 'boolean',
        defaultValue: DEFAULT_VALORAR_VISITA.onlyAfterPayment,
      }),
      diseno('Comportamiento', {
        key: 'reviews_url',
        label: 'Enlace a reseñas externas',
        type: 'url',
        placeholder: 'https://g.page/r/…',
        helpText: 'Google o TripAdvisor. Solo enlaces https.',
      }),
    ],
  },
];

// ─── Variantes nuevas de tipos existentes ────────────────────────────────────────────────────

/** Variante «mesa» de `restaurant_hero` (lámina 01). */
export const VARIANTE_PORTADA_MESA_CATALOGO = { id: VARIANTE_PORTADA_MESA, label: 'Mesa (Carta QR)' };

const SOLO_MESA = { variantIn: [VARIANTE_PORTADA_MESA] };

/** Campos de la portada que solo aplican a la variante «mesa». */
export const CAMPOS_PORTADA_MESA: ContentFieldDef[] = [
  { key: 'image_caption', label: 'Pie de la imagen', type: 'text', placeholder: 'Cocina de autor · desde 2012', showIf: SOLO_MESA },
  { key: 'allergy_note', label: 'Aviso de alergias', type: 'text', placeholder: DEFAULT_PORTADA_MESA.allergyNote, helpText: 'Vacío: sin aviso.', showIf: SOLO_MESA },
  { key: 'no_table_text', label: 'Texto sin mesa', type: 'text', placeholder: DEFAULT_PORTADA_MESA.noTableText, helpText: 'Cuando la página se abre sin el QR de una mesa.', showIf: SOLO_MESA },
  diseno('Mesa', { key: 'show_kitchen_status', label: 'Mostrar el estado de la cocina', type: 'boolean', defaultValue: DEFAULT_PORTADA_MESA.showKitchenStatus, helpText: '«Cocina abierta · hasta las 22:30», con el horario de la sede.', showIf: SOLO_MESA }),
  diseno('Mesa', { key: 'show_language', label: 'Mostrar el selector de idioma', type: 'boolean', defaultValue: DEFAULT_PORTADA_MESA.showLanguage, showIf: SOLO_MESA }),
  diseno('Mesa', { key: 'show_waiter_button', label: 'Mostrar «Llamar al mesero»', type: 'boolean', defaultValue: DEFAULT_PORTADA_MESA.showWaiterButton, showIf: SOLO_MESA }),
  diseno('Mesa', { key: 'show_bill_button', label: 'Mostrar «Pedir la cuenta»', type: 'boolean', defaultValue: DEFAULT_PORTADA_MESA.showBillButton, showIf: SOLO_MESA }),
];

/** Variante «qr» de `menu_full` (lámina 02): ya existe en el sitio, faltaba en el editor. */
export const VARIANTE_CARTA_QR_CATALOGO = { id: VARIANTE_CARTA_QR, label: 'Carta QR (en la mesa)' };

const SOLO_QR = { variantIn: [VARIANTE_CARTA_QR] };

/** Campos nuevos de la carta en su variante QR. */
export const CAMPOS_CARTA_QR: ContentFieldDef[] = [
  { key: 'show_search', label: 'Mostrar buscador', type: 'boolean', defaultValue: DEFAULT_CARTA_QR.showSearch, helpText: '«Buscar plato o ingrediente».', showIf: SOLO_QR },
  {
    key: 'diet_filters',
    label: 'Filtros de dieta',
    type: 'boolean',
    defaultValue: DEFAULT_CARTA_QR.dietFilters,
    helpText: 'Chips con las etiquetas de dieta y picante de los productos (Inventario › Productos).',
    showIf: SOLO_QR,
  },
  {
    key: 'show_allergens',
    label: 'Mostrar alérgenos',
    type: 'boolean',
    defaultValue: DEFAULT_CARTA_QR.showAllergens,
    helpText: 'En la ficha del plato, con las etiquetas de alérgenos del producto.',
    showIf: SOLO_QR,
  },
  { key: 'ask_diner', label: 'Preguntar «¿Para quién es?»', type: 'boolean', defaultValue: DEFAULT_CARTA_QR.askDiner, helpText: 'Así el pedido muestra quién pidió qué.', showIf: SOLO_QR },
];
