/**
 * Contrato de las secciones de la Carta QR en la mesa (Figma «16 Sitio web», sección 2032:75742,
 * láminas 17 «Cómo se edita» y 18 «Secciones y campos»).
 *
 * La Carta QR NO es una app aparte: es la página «Carta QR» del sitio, armada con secciones del
 * editor V2. Este archivo es la única definición de lo nuevo y lo leen los dos lados:
 * - el sitio público (goadmin-websites: SectionRenderer y las vistas de mesa), y
 * - el editor del ERP (catálogo de secciones, inspector y plantilla de página), que lo copia tal
 *   cual en `src/lib/website/contrato/seccionesMesa.ts` (`npm run verify:copias`).
 *
 * Qué define:
 * - Cuatro TIPOS de sección nuevos: `table_service` («Servicio de mesa»), `table_order` («Pedido
 *   de la mesa»), `table_bill` («Cuenta de la mesa», variante «Hoja») y `visit_feedback`
 *   («Valorar la visita»).
 * - La variante `mesa` de `restaurant_hero` (Bienvenida de la mesa): NO es un tipo nuevo.
 * - La variante `qr` de `menu_full` (ya existe en el sitio) y sus cuatro campos nuevos.
 *
 * Reglas del contrato:
 * - Cada campo tiene su default; ausente, nulo o fuera de la regla = default. Una sección recién
 *   añadida sin tocar se ve igual que las láminas.
 * - Los textos admiten marcadores: `{mesa}` (nombre de la mesa, «Mesa 7»), `{zona}`, `{sede}` y,
 *   en el pedido, `{n}` (número de ronda). `reemplazarMarcadores` los resuelve; un marcador sin
 *   valor se quita con su separador.
 * - Ninguna sección trae colores propios: usan las variables del tema, como las existentes.
 * - Lo que es operación (pasarela, propinas cobradas, estado de cocina) sale de la base, no de
 *   aquí: `pay_online` solo ofrece el botón si la sede tiene pasarela activa.
 *
 * Código puro: sin imports, sin React ni Supabase.
 */

// ─── Tipos y variantes ──────────────────────────────────────────────────────────────────────

export const TIPOS_SECCION_MESA = ['table_service', 'table_order', 'table_bill', 'visit_feedback'] as const;
export type TipoSeccionMesa = (typeof TIPOS_SECCION_MESA)[number];

/** Variantes de cada tipo nuevo. La primera es la de por defecto. */
export const VARIANTES_SECCION_MESA = {
  /** `barra`: barra fija arriba con «Mesero» y «Cuenta» (lámina 02). `botones`: dos botones en la página. */
  table_service: ['barra', 'botones'],
  /** Rondas con estado en vivo, por ronda o por persona (láminas 04–06). */
  table_order: ['rondas'],
  /** Hoja de la cuenta: dividir, propina y pagar (láminas 08–09). */
  table_bill: ['hoja'],
  /** Tarjeta de valoración con estrellas, aspectos y comentario (lámina 10). */
  visit_feedback: ['tarjeta'],
} as const satisfies Record<TipoSeccionMesa, readonly string[]>;

/** Variante «mesa» de la portada de restaurante (lámina 01). */
export const VARIANTE_PORTADA_MESA = 'mesa' as const;
/** Variante QR de la carta completa (lámina 02). */
export const VARIANTE_CARTA_QR = 'qr' as const;

/** Nombre visible de cada tipo y variante (lista de secciones del editor). */
export const ETIQUETAS_SECCION_MESA: Record<TipoSeccionMesa, { tipo: string; variantes: Record<string, string> }> = {
  table_service: { tipo: 'Servicio de mesa', variantes: { barra: 'Barra fija arriba', botones: 'Botones en la página' } },
  table_order: { tipo: 'Pedido de la mesa', variantes: { rondas: 'Rondas' } },
  table_bill: { tipo: 'Cuenta de la mesa', variantes: { hoja: 'Hoja' } },
  visit_feedback: { tipo: 'Valorar la visita', variantes: { tarjeta: 'Tarjeta' } },
};

export function esTipoSeccionMesa(tipo: unknown): tipo is TipoSeccionMesa {
  return typeof tipo === 'string' && (TIPOS_SECCION_MESA as readonly string[]).includes(tipo);
}

/** Variante válida del tipo, o la primera (default). */
export function varianteSeccionMesa(tipo: TipoSeccionMesa, variante: unknown): string {
  const lista = VARIANTES_SECCION_MESA[tipo] as readonly string[];
  return typeof variante === 'string' && lista.includes(variante) ? variante : lista[0];
}

// ─── Marcadores ─────────────────────────────────────────────────────────────────────────────

export interface ValoresMarcadores {
  mesa?: string | null;
  zona?: string | null;
  sede?: string | null;
  n?: number | string | null;
}

/**
 * `{mesa}`, `{zona}`, `{sede}` y `{n}`. Un marcador sin valor desaparece junto con el separador
 * « · » que lo acompañe, para no dejar «Terraza ·  · Sede».
 */
export function reemplazarMarcadores(texto: string, valores: ValoresMarcadores): string {
  const mapa: Record<string, string> = {
    mesa: valores.mesa ? String(valores.mesa) : '',
    zona: valores.zona ? String(valores.zona) : '',
    sede: valores.sede ? String(valores.sede) : '',
    n: valores.n === null || valores.n === undefined ? '' : String(valores.n),
  };
  const sustituido = texto.replace(/\{(mesa|zona|sede|n)\}/g, (_, clave: string) => mapa[clave] ?? '');
  return sustituido
    .split(' · ')
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '')
    .join(' · ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Lectores de campos ─────────────────────────────────────────────────────────────────────

const MAX_TEXTO = 300;
const MAX_ETIQUETA = 60;

function texto(valor: unknown, porDefecto: string, max = MAX_TEXTO): string {
  if (typeof valor !== 'string') return porDefecto;
  const t = valor.trim();
  return t === '' ? porDefecto : t.slice(0, max);
}

/** Texto que el editor puede dejar vacío a propósito (`''` = no se muestra). */
function textoOpcional(valor: unknown, porDefecto: string, max = MAX_TEXTO): string {
  if (valor === undefined || valor === null) return porDefecto;
  if (typeof valor !== 'string') return porDefecto;
  return valor.trim().slice(0, max);
}

function booleano(valor: unknown, porDefecto: boolean): boolean {
  if (typeof valor === 'boolean') return valor;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  return porDefecto;
}

function enteroEntre(valor: unknown, min: number, max: number, porDefecto: number): number {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
}

function unoDe<T extends string>(valor: unknown, lista: readonly T[], porDefecto: T): T {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor) ? (valor as T) : porDefecto;
}

/** Lista de textos cortos sin repetidos. Ausente o vacía = default. */
function listaTextos(valor: unknown, porDefecto: readonly string[], maxItems: number): string[] {
  if (!Array.isArray(valor)) return [...porDefecto];
  const salida: string[] = [];
  for (const v of valor) {
    const t = typeof v === 'string' ? v.trim().slice(0, MAX_ETIQUETA) : '';
    if (t && !salida.includes(t)) salida.push(t);
    if (salida.length >= maxItems) break;
  }
  return salida.length > 0 ? salida : [...porDefecto];
}

// ─── restaurant_hero · variante «mesa» (lámina 01) ──────────────────────────────────────────

export const CLAVES_PORTADA_MESA = [
  'eyebrow',
  'title',
  'subtitle',
  'image_url',
  'image_alt',
  'image_caption',
  'primary_cta_text',
  'show_kitchen_status',
  'show_language',
  'show_waiter_button',
  'show_bill_button',
  'allergy_note',
  'no_table_text',
] as const;

export interface PortadaMesa {
  /** «Bienvenidos a la» (cursiva, sobre el título). */
  eyebrow: string;
  /** «{mesa}». */
  title: string;
  /** Línea bajo la zona y la sede. */
  subtitle: string;
  imageUrl: string;
  imageAlt: string;
  /** Pie sobre la imagen («Cocina de autor · desde 2012»). */
  imageCaption: string;
  /** «Ver la carta». */
  primaryCtaText: string;
  /** Píldora «Cocina abierta · hasta las 22:30» (horario de la sede). */
  showKitchenStatus: boolean;
  /** Selector de idioma sobre la imagen. */
  showLanguage: boolean;
  showWaiterButton: boolean;
  showBillButton: boolean;
  /** «¿Alergias? Filtra la carta o díselo al mesero.» (`''` = sin aviso). */
  allergyNote: string;
  /** Texto cuando la página se abre sin el QR de una mesa. */
  noTableText: string;
}

export const DEFAULT_PORTADA_MESA: PortadaMesa = {
  eyebrow: 'Bienvenidos a la',
  title: '{mesa}',
  subtitle: 'Pide desde tu celular: llega directo a la cocina. Pagas al final, en la mesa o en línea.',
  imageUrl: '',
  imageAlt: '',
  imageCaption: '',
  primaryCtaText: 'Ver la carta',
  showKitchenStatus: true,
  showLanguage: true,
  showWaiterButton: true,
  showBillButton: true,
  allergyNote: '¿Alergias? Filtra la carta o díselo al mesero.',
  noTableText: 'Escanea el código QR de tu mesa para pedir desde aquí.',
};

export function normalizarPortadaMesa(content: Record<string, unknown> | null | undefined): PortadaMesa {
  const c = content ?? {};
  const d = DEFAULT_PORTADA_MESA;
  return {
    eyebrow: textoOpcional(c.eyebrow, d.eyebrow, MAX_ETIQUETA),
    title: texto(c.title, d.title, MAX_ETIQUETA),
    subtitle: textoOpcional(c.subtitle, d.subtitle),
    imageUrl: texto(c.image_url, d.imageUrl, 2048),
    imageAlt: textoOpcional(c.image_alt, d.imageAlt, 200),
    imageCaption: textoOpcional(c.image_caption, d.imageCaption, 120),
    primaryCtaText: texto(c.primary_cta_text, d.primaryCtaText, MAX_ETIQUETA),
    showKitchenStatus: booleano(c.show_kitchen_status, d.showKitchenStatus),
    showLanguage: booleano(c.show_language, d.showLanguage),
    showWaiterButton: booleano(c.show_waiter_button, d.showWaiterButton),
    showBillButton: booleano(c.show_bill_button, d.showBillButton),
    allergyNote: textoOpcional(c.allergy_note, d.allergyNote, 200),
    noTableText: texto(c.no_table_text, d.noTableText, 200),
  };
}

// ─── menu_full · variante «qr» (lámina 02): campos nuevos ───────────────────────────────────

/** Claves NUEVAS de `menu_full` (las demás siguen en MenuFull.CONTENT_KEYS). */
export const CLAVES_CARTA_QR = ['show_search', 'diet_filters', 'show_allergens', 'ask_diner'] as const;

export interface CartaQr {
  /** Buscador «Buscar plato o ingrediente». */
  showSearch: boolean;
  /** Chips de dieta (product_tags.kind = 'dieta' y 'picante'). */
  dietFilters: boolean;
  /** Aviso de alérgenos en la ficha del plato (product_tags.kind = 'alergeno'). */
  showAllergens: boolean;
  /** «¿Para quién es?» en la ficha del plato (comensal de la línea). */
  askDiner: boolean;
}

export const DEFAULT_CARTA_QR: CartaQr = {
  showSearch: true,
  dietFilters: true,
  showAllergens: true,
  askDiner: true,
};

export function normalizarCartaQr(content: Record<string, unknown> | null | undefined): CartaQr {
  const c = content ?? {};
  return {
    showSearch: booleano(c.show_search, DEFAULT_CARTA_QR.showSearch),
    dietFilters: booleano(c.diet_filters, DEFAULT_CARTA_QR.dietFilters),
    showAllergens: booleano(c.show_allergens, DEFAULT_CARTA_QR.showAllergens),
    askDiner: booleano(c.ask_diner, DEFAULT_CARTA_QR.askDiner),
  };
}

/** Convención de etiquetas (CHECK product_tags_kind_valido, sin tilde). */
export const KIND_ETIQUETA = { dieta: 'dieta', alergeno: 'alergeno', picante: 'picante', general: 'general' } as const;

// ─── table_service «Servicio de mesa» (láminas 07 y 07b) ────────────────────────────────────

/** Motivo del llamado. `kind` es lo que guarda la base (table_service_requests.kind). */
export interface MotivoServicio {
  id: string;
  label: string;
  /** Icono: bell | chef | cup | utensils | help. */
  icon: string;
}

export const ICONOS_MOTIVO = ['bell', 'chef', 'cup', 'utensils', 'help'] as const;

export const CLAVES_SERVICIO_MESA = [
  'title',
  'reasons',
  'other_placeholder',
  'button_text',
  'sent_title',
  'sent_text',
  'show_bill_button',
  'cooldown_seconds',
] as const;

export interface ServicioMesa {
  /** «¿Qué necesitas?». */
  title: string;
  reasons: MotivoServicio[];
  /** «Algo más (opcional)». */
  otherPlaceholder: string;
  /** «Llamar al mesero». */
  buttonText: string;
  /** «Avisamos al mesero». */
  sentTitle: string;
  /** «{mesero} va a tu mesa»; sin mesero asignado: «El equipo va a tu mesa». */
  sentText: string;
  /** Botón «Cuenta» en la barra. */
  showBillButton: boolean;
  /** Segundos antes de poder volver a llamar (la base deduplica igual). */
  cooldownSeconds: number;
}

export const DEFAULT_MOTIVOS_SERVICIO: readonly MotivoServicio[] = [
  { id: 'mesero', label: 'Que venga el mesero', icon: 'bell' },
  { id: 'recomendacion', label: 'Una recomendación', icon: 'chef' },
  { id: 'bebidas', label: 'Agua o bebidas', icon: 'cup' },
  { id: 'cubiertos', label: 'Cubiertos o servilletas', icon: 'utensils' },
];

export const DEFAULT_SERVICIO_MESA: ServicioMesa = {
  title: '¿Qué necesitas?',
  reasons: DEFAULT_MOTIVOS_SERVICIO.map((m) => ({ ...m })),
  otherPlaceholder: 'Algo más (opcional)',
  buttonText: 'Llamar al mesero',
  sentTitle: 'Avisamos al mesero',
  sentText: '{mesero} va a tu mesa',
  showBillButton: true,
  cooldownSeconds: 60,
};

function motivos(valor: unknown): MotivoServicio[] {
  if (!Array.isArray(valor)) return DEFAULT_SERVICIO_MESA.reasons.map((m) => ({ ...m }));
  const salida: MotivoServicio[] = [];
  valor.forEach((v, i) => {
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label.trim().slice(0, MAX_ETIQUETA) : '';
    if (!label) return;
    const id = typeof o.id === 'string' && /^[a-z0-9_-]{1,30}$/.test(o.id) ? o.id : `motivo_${i + 1}`;
    salida.push({ id, label, icon: unoDe(o.icon, ICONOS_MOTIVO, 'help') });
  });
  return salida.slice(0, 8).length > 0 ? salida.slice(0, 8) : DEFAULT_SERVICIO_MESA.reasons.map((m) => ({ ...m }));
}

export function normalizarServicioMesa(content: Record<string, unknown> | null | undefined): ServicioMesa {
  const c = content ?? {};
  const d = DEFAULT_SERVICIO_MESA;
  return {
    title: texto(c.title, d.title, MAX_ETIQUETA),
    reasons: motivos(c.reasons),
    otherPlaceholder: texto(c.other_placeholder, d.otherPlaceholder, MAX_ETIQUETA),
    buttonText: texto(c.button_text, d.buttonText, MAX_ETIQUETA),
    sentTitle: texto(c.sent_title, d.sentTitle, MAX_ETIQUETA),
    sentText: texto(c.sent_text, d.sentText, 120),
    showBillButton: booleano(c.show_bill_button, d.showBillButton),
    cooldownSeconds: enteroEntre(c.cooldown_seconds, 15, 600, d.cooldownSeconds),
  };
}

// ─── table_order «Pedido de la mesa» (láminas 04, 05, 06, 11, 12, 14) ───────────────────────

export const VISTAS_PEDIDO = ['ronda', 'persona'] as const;
export type VistaPedido = (typeof VISTAS_PEDIDO)[number];

export const CLAVES_PEDIDO_MESA = [
  'title',
  'default_view',
  'confirm_before_send',
  'confirm_title',
  'confirm_text',
  'eta_text',
  'show_live_status',
  'no_charge_text',
  'pending_text',
  'offline_text',
  'error_title',
  'error_text',
  'sold_out_text',
  'kitchen_closed_text',
] as const;

export interface PedidoMesa {
  /** «Pedido de la {mesa}». */
  title: string;
  defaultView: VistaPedido;
  /** Hoja «¿Enviamos la ronda {n} a cocina?» antes de enviar. */
  confirmBeforeSend: boolean;
  confirmTitle: string;
  confirmText: string;
  /** «Tiempo estimado: 15 a 20 minutos» (`''` = no se muestra). */
  etaText: string;
  /** Estado en vivo: Enviada · En preparación · Lista · Servida. */
  showLiveStatus: boolean;
  /** «No se cobra ahora: pagas al pedir la cuenta.» */
  noChargeText: string;
  /** Ronda enviada que el equipo aún no confirma. */
  pendingText: string;
  /** Banda «Sin conexión» (lámina 11). */
  offlineText: string;
  /** «No pudimos enviar la ronda {n}» (lámina 14). */
  errorTitle: string;
  errorText: string;
  /** Aviso cuando un plato de la ronda se agotó (lámina 12). */
  soldOutText: string;
  /** Banda de cocina cerrada (lámina 13). */
  kitchenClosedText: string;
}

export const DEFAULT_PEDIDO_MESA: PedidoMesa = {
  title: 'Pedido de la {mesa}',
  defaultView: 'ronda',
  confirmBeforeSend: true,
  confirmTitle: '¿Enviamos la ronda {n} a cocina?',
  confirmText: 'Llega al instante a la cocina y a la barra. Puedes seguir pidiendo después.',
  etaText: 'Tiempo estimado: 15 a 20 minutos',
  showLiveStatus: true,
  noChargeText: 'No se cobra ahora: pagas al pedir la cuenta.',
  pendingText: 'Enviada: el equipo la está revisando.',
  offlineText: 'Tu pedido queda guardado en este celular y lo enviamos cuando vuelva la señal. Los precios pueden no estar al día.',
  errorTitle: 'No pudimos enviar la ronda {n}',
  errorText: 'No se cobró nada y tu pedido sigue aquí. Revisa la señal e intenta de nuevo, o pide al mesero que lo tome.',
  soldOutText: 'Lo quitamos de tu ronda. Nada se cobró.',
  kitchenClosedText: 'La cocina está cerrada por ahora. Pregunta al mesero qué puedes pedir.',
};

export function normalizarPedidoMesa(content: Record<string, unknown> | null | undefined): PedidoMesa {
  const c = content ?? {};
  const d = DEFAULT_PEDIDO_MESA;
  return {
    title: texto(c.title, d.title, MAX_ETIQUETA),
    defaultView: unoDe(c.default_view, VISTAS_PEDIDO, d.defaultView),
    confirmBeforeSend: booleano(c.confirm_before_send, d.confirmBeforeSend),
    confirmTitle: texto(c.confirm_title, d.confirmTitle, 120),
    confirmText: textoOpcional(c.confirm_text, d.confirmText),
    etaText: textoOpcional(c.eta_text, d.etaText, 120),
    showLiveStatus: booleano(c.show_live_status, d.showLiveStatus),
    noChargeText: textoOpcional(c.no_charge_text, d.noChargeText, 200),
    pendingText: texto(c.pending_text, d.pendingText, 200),
    offlineText: texto(c.offline_text, d.offlineText),
    errorTitle: texto(c.error_title, d.errorTitle, 120),
    errorText: texto(c.error_text, d.errorText),
    soldOutText: texto(c.sold_out_text, d.soldOutText, 200),
    kitchenClosedText: texto(c.kitchen_closed_text, d.kitchenClosedText),
  };
}

// ─── table_bill «Cuenta de la mesa», variante «Hoja» (láminas 08, 09 y 17) ──────────────────

export const MODOS_DIVISION = ['todo', 'iguales', 'comensal'] as const;
export type ModoDivision = (typeof MODOS_DIVISION)[number];

export const CLAVES_CUENTA_MESA = [
  'title',
  'tip_text',
  'allow_split',
  'split_modes',
  'tip_options',
  'allow_custom_tip',
  'pay_online',
  'pay_at_table',
  'pay_at_table_text',
] as const;

export interface CuentaMesa {
  /** «La cuenta de la {mesa}». */
  title: string;
  /** Texto de la propina (voluntaria). */
  tipText: string;
  /** «Dejar dividir la cuenta». */
  allowSplit: boolean;
  /** Formas permitidas: todo junto, partes iguales, lo que pidió cada uno. */
  splitModes: ModoDivision[];
  /** Propinas sugeridas en %; 0 = «Sin propina». */
  tipOptions: number[];
  /** «Otro» valor de propina. */
  allowCustomTip: boolean;
  /** Pagar en línea con la pasarela de Sitio web › Ventas en línea (sin pasarela: no se ofrece). */
  payOnline: boolean;
  /** Pagar en la mesa: avisa al mesero (datáfono o efectivo). */
  payAtTable: boolean;
  payAtTableText: string;
}

export const DEFAULT_CUENTA_MESA: CuentaMesa = {
  title: 'La cuenta de la {mesa}',
  tipText: 'La propina es voluntaria: puedes cambiarla o quitarla. Va completa al equipo.',
  allowSplit: true,
  splitModes: ['todo', 'iguales', 'comensal'],
  tipOptions: [0, 10, 15],
  allowCustomTip: true,
  payOnline: true,
  payAtTable: true,
  payAtTableText: 'Pagar en la mesa (datáfono o efectivo)',
};

function modosDivision(valor: unknown): ModoDivision[] {
  if (!Array.isArray(valor)) return [...DEFAULT_CUENTA_MESA.splitModes];
  const salida = MODOS_DIVISION.filter((m) => valor.includes(m));
  return salida.length > 0 ? salida : [...DEFAULT_CUENTA_MESA.splitModes];
}

function propinas(valor: unknown): number[] {
  if (!Array.isArray(valor)) return [...DEFAULT_CUENTA_MESA.tipOptions];
  const salida: number[] = [];
  for (const v of valor) {
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 30 && !salida.includes(n)) salida.push(n);
    if (salida.length >= 4) break;
  }
  return salida.length > 0 ? salida.sort((a, b) => a - b) : [...DEFAULT_CUENTA_MESA.tipOptions];
}

export function normalizarCuentaMesa(content: Record<string, unknown> | null | undefined): CuentaMesa {
  const c = content ?? {};
  const d = DEFAULT_CUENTA_MESA;
  const payOnline = booleano(c.pay_online, d.payOnline);
  const payAtTable = booleano(c.pay_at_table, d.payAtTable);
  return {
    title: texto(c.title, d.title, MAX_ETIQUETA),
    tipText: textoOpcional(c.tip_text, d.tipText, 200),
    allowSplit: booleano(c.allow_split, d.allowSplit),
    splitModes: modosDivision(c.split_modes),
    tipOptions: propinas(c.tip_options),
    allowCustomTip: booleano(c.allow_custom_tip, d.allowCustomTip),
    payOnline,
    // Al menos una forma de pago: sin ninguna, pagar en la mesa (lo de siempre).
    payAtTable: payAtTable || !payOnline,
    payAtTableText: texto(c.pay_at_table_text, d.payAtTableText, 80),
  };
}

// ─── visit_feedback «Valorar la visita» (lámina 10) ─────────────────────────────────────────

export const CLAVES_VALORAR_VISITA = [
  'question',
  'aspects_title',
  'aspects',
  'comment_placeholder',
  'reviews_url',
  'only_after_payment',
  'thanks_text',
] as const;

export interface ValorarVisita {
  /** «¿Cómo estuvo todo?». */
  question: string;
  /** «¿Qué estuvo mejor?». */
  aspectsTitle: string;
  aspects: string[];
  commentPlaceholder: string;
  /** Enlace a reseñas externas (Google, TripAdvisor), solo https. `''` = sin enlace. */
  reviewsUrl: string;
  /** Solo se ofrece después de pagar (en línea o al pedir la cuenta). */
  onlyAfterPayment: boolean;
  thanksText: string;
}

export const DEFAULT_VALORAR_VISITA: ValorarVisita = {
  question: '¿Cómo estuvo todo?',
  aspectsTitle: '¿Qué estuvo mejor?',
  aspects: ['La comida', 'El servicio', 'Rapidez', 'Ambiente'],
  commentPlaceholder: 'Cuéntanos algo (opcional)',
  reviewsUrl: '',
  onlyAfterPayment: true,
  thanksText: '¡Gracias por contarnos!',
};

export function normalizarValorarVisita(content: Record<string, unknown> | null | undefined): ValorarVisita {
  const c = content ?? {};
  const d = DEFAULT_VALORAR_VISITA;
  const url = typeof c.reviews_url === 'string' && /^https:\/\/[^\s]+$/i.test(c.reviews_url.trim()) ? c.reviews_url.trim().slice(0, 2048) : '';
  return {
    question: texto(c.question, d.question, 120),
    aspectsTitle: textoOpcional(c.aspects_title, d.aspectsTitle, 120),
    aspects: listaTextos(c.aspects, d.aspects, 8),
    commentPlaceholder: texto(c.comment_placeholder, d.commentPlaceholder, MAX_ETIQUETA),
    reviewsUrl: url,
    onlyAfterPayment: booleano(c.only_after_payment, d.onlyAfterPayment),
    thanksText: texto(c.thanks_text, d.thanksText, 120),
  };
}

// ─── Claves por tipo (manifiesto del sitio ↔ catálogo del editor) ───────────────────────────

export const CLAVES_SECCION_MESA: Record<TipoSeccionMesa, readonly string[]> = {
  table_service: CLAVES_SERVICIO_MESA,
  table_order: CLAVES_PEDIDO_MESA,
  table_bill: CLAVES_CUENTA_MESA,
  visit_feedback: CLAVES_VALORAR_VISITA,
};

/**
 * Secciones de la plantilla de página «Carta QR» (lámina 17), en orden. Encabezado y pie son
 * globales (documento.shell) y no van aquí. `contenido` vacío = los defaults de este archivo.
 */
export const SECCIONES_PAGINA_CARTA_QR: readonly { tipo: string; variante: string; contenido: Record<string, unknown> }[] = [
  { tipo: 'restaurant_hero', variante: VARIANTE_PORTADA_MESA, contenido: {} },
  { tipo: 'table_service', variante: 'barra', contenido: {} },
  { tipo: 'menu_full', variante: VARIANTE_CARTA_QR, contenido: {} },
  { tipo: 'table_order', variante: 'rondas', contenido: {} },
  { tipo: 'table_bill', variante: 'hoja', contenido: {} },
  { tipo: 'visit_feedback', variante: 'tarjeta', contenido: {} },
  { tipo: 'hours_location', variante: 'list', contenido: {} },
];
