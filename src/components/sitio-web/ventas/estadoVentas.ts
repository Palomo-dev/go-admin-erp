/**
 * Tablero de «Ventas en línea» (Figma B/10-01…10-05): de los hechos que lee el
 * servidor a las tarjetas con su estado (Configurado / Falta / Opcional /
 * Disponible con <módulo>), sus filas y el conteo «N de M listos para vender».
 *
 * PURO (sin React ni Supabase): lo usa `ventasSitio.server.ts` para armar la
 * respuesta de `GET /api/sitio-web/ventas` y lo prueban los tests. El
 * navegador solo pinta lo que llega; ninguna regla se repite en el cliente.
 */

export const TEMAS_VENTA = ['checkout', 'pagos', 'envios', 'cupones', 'pedidos', 'reservas', 'pasarela'] as const;
export type TemaVenta = (typeof TEMAS_VENTA)[number];

/** Estado de una tarjeta. `disponible`: el módulo dueño no está activo y no hay alternativa configurada. */
export type EstadoTarjetaVenta = 'configurado' | 'falta' | 'opcional' | 'disponible';

/** Icono de la fila (B/10-01): check verde, aviso ámbar o círculo atenuado. */
export type MarcaFila = 'ok' | 'alerta' | 'neutro';

/**
 * Valor de una fila, sin formatear: el navegador lo pinta en el idioma y la
 * moneda de la organización (`formatoVentas.ts`).
 */
export type ValorFila =
  | { tipo: 'si_no'; valor: boolean }
  | { tipo: 'importe'; valor: number | null }
  | { tipo: 'numero'; valor: number }
  | { tipo: 'visible'; valor: boolean }
  | { tipo: 'pedidos_hoy'; cantidad: number; total: number }
  | { tipo: 'estado_sede'; recibiendo: boolean }
  | { tipo: 'entorno'; valor: string | null }
  | { tipo: 'firma'; veredicto: 'verificada' | 'no_coincide' | 'sin_eventos'; ultimoPago: string | null }
  | { tipo: 'texto'; valor: string }
  /** Canales con los que el sitio avisa al cliente del estado de su pedido. */
  | { tipo: 'avisos'; canales: CanalAviso[] };

/** Canales de aviso al cliente de un pedido web. Hoy solo existe el correo (orderStatusEmailService). */
export type CanalAviso = 'correo' | 'whatsapp';

export interface FilaVenta {
  /** Clave de texto de la etiqueta (`sitioWeb.ventas.filas.<clave>`) o, si `etiquetaLibre`, el texto tal cual. */
  clave: string;
  /** Etiqueta con datos del negocio (nombre del método de pago, de la sede, de la pasarela). */
  etiquetaLibre?: string;
  marca: MarcaFila;
  valor: ValorFila;
}

/** Enlace al módulo dueño, o el módulo que habría que contratar. */
export interface EnlaceVenta {
  href: string;
  /** Clave del texto del botón («irFinanzasMetodos»). */
  texto: string;
  /** `false`: la persona no ve esa página (módulo no activo o sin acceso) → «Disponible con …». */
  visible: boolean;
  /** Clave del módulo en `nav.*` («finance», «transport») para «Disponible con Finanzas». */
  modulo: string;
}

export interface TarjetaVenta {
  tema: TemaVenta;
  estado: EstadoTarjetaVenta;
  filas: FilaVenta[];
  /** Clave del pie («origen.checkout»: «Se edita aquí»). */
  origen: string;
  enlace: EnlaceVenta | null;
  /** Clave del motivo por el que falta (alimenta «Falta: …»). */
  falta?: string;
  /** Resumen de una línea para la ListCard de móvil (B/10-02), sin formatear. */
  resumen: ResumenTarjeta;
  /** Solo reservas: valor del interruptor global y si se puede usar. */
  interruptor?: { valor: boolean; habilitado: boolean };
  /** Solo checkout: si se puede editar desde aquí (permiso website.sites.edit). */
  editable?: boolean;
}

export type ResumenTarjeta =
  | { tipo: 'checkout'; invitado: boolean; minimo: number | null }
  | { tipo: 'pagos'; nombres: string[] }
  | { tipo: 'envios'; zonas: number; tarifaPlana: number | null }
  | { tipo: 'cupones'; activos: number }
  | { tipo: 'pedidos'; pendientes: number }
  | { tipo: 'reservas'; recibiendo: string[]; total: number }
  | { tipo: 'pasarela'; proveedor: string | null; firmaVerificada: boolean };

/** Una tarjeta que no se pudo leer (error parcial, B/10-03). */
export interface TarjetaVentaError {
  tema: TemaVenta;
  error: true;
}

export type EntradaTablero = TarjetaVenta | TarjetaVentaError;

export function esTarjetaError(t: EntradaTablero): t is TarjetaVentaError {
  return (t as TarjetaVentaError).error === true;
}

// ─── Hechos que lee el servidor ──────────────────────────────────────────────

export interface HechosCheckout {
  modo: 'steps' | 'one_page';
  tiposEntrega: string[];
  /** `null` = la columna aún no existe (migración pendiente): el sitio hoy siempre deja comprar sin cuenta. */
  invitado: boolean | null;
  /** `undefined` = la columna aún no existe. `null` = sin mínimo. */
  pedidoMinimo: number | null | undefined;
  sellos: boolean;
  logosPago: boolean;
  ventaEnLinea: boolean;
  /** Hay fila de `website_settings` del sitio principal. */
  hayAjustes: boolean;
  editable: boolean;
}

export interface MetodoPagoWeb {
  nombre: string;
  visible: boolean;
  activo: boolean;
  conPasarela: boolean;
}

export interface HechosEnvios {
  enlace: EnlaceVenta;
  envioActivo: boolean;
  tiposEntrega: string[];
  tarifaPlana: number | null;
  envioGratisDesde: number | null;
  /** Tarifas activas de Transporte con `show_on_website`. */
  tarifasZonaWeb: number;
}

export interface HechosCupones {
  enlace: EnlaceVenta;
  cuponesUsables: number;
  promocionesWeb: number;
}

export interface HechosPedidos {
  enlace: EnlaceVenta;
  ventaEnLinea: boolean;
  pendientes: number;
  pagadosHoy: number;
  totalHoy: number;
  /**
   * Canales reales con los que se avisa al cliente («Avisos al cliente», B/10-01).
   * El correo de estado del pedido sale por `orderStatusEmailService` con la
   * clave de correo de la plataforma; no hay envío por WhatsApp de pedidos
   * web, así que no se anuncia.
   */
  avisosCliente: CanalAviso[];
}

export interface HechosReservas {
  enlace: EnlaceVenta;
  sedes: { nombre: string; recibiendo: boolean }[];
}

export interface ConexionPago {
  proveedor: string;
  estado: string;
  entorno: string | null;
}

export interface HechosPasarela {
  enlace: EnlaceVenta;
  conexiones: ConexionPago[];
  /** `tienePasarela()` del Resumen: un método visible en la web enlazado a una conexión. */
  enlazadaAlSitio: boolean;
  firma: 'match' | 'mismatch' | null;
  ultimoPago: string | null;
}

// ─── Tarjetas ────────────────────────────────────────────────────────────────

const ENTREGA_DOMICILIO = new Set(['delivery_own', 'delivery_third_party']);

export function tarjetaCheckout(h: HechosCheckout): TarjetaVenta {
  const invitado = h.invitado ?? true;
  const minimo = h.pedidoMinimo ?? null;
  const filas: FilaVenta[] = [
    { clave: 'compraInvitado', marca: invitado ? 'ok' : 'neutro', valor: { tipo: 'si_no', valor: invitado } },
    { clave: 'pedidoMinimo', marca: minimo ? 'ok' : 'neutro', valor: { tipo: 'importe', valor: minimo } },
    { clave: 'sellosLogos', marca: h.sellos || h.logosPago ? 'ok' : 'neutro', valor: { tipo: 'visible', valor: h.sellos || h.logosPago } },
  ];
  return {
    tema: 'checkout',
    estado: h.hayAjustes ? 'configurado' : 'falta',
    falta: h.hayAjustes ? undefined : 'checkout',
    filas,
    origen: 'checkout',
    enlace: null,
    editable: h.editable && h.hayAjustes,
    resumen: { tipo: 'checkout', invitado, minimo },
  };
}

export function tarjetaPagos(metodos: readonly MetodoPagoWeb[], enlace: EnlaceVenta): TarjetaVenta {
  const activos = metodos.filter((m) => m.activo);
  const visibles = activos.filter((m) => m.visible);
  return {
    tema: 'pagos',
    estado: visibles.length > 0 ? 'configurado' : enlace.visible ? 'falta' : 'disponible',
    falta: visibles.length > 0 ? undefined : 'pagos',
    filas: activos.map((m) => ({
      clave: 'metodo',
      etiquetaLibre: m.nombre,
      marca: m.visible ? 'ok' : 'neutro',
      valor: { tipo: 'visible', valor: m.visible },
    })),
    origen: 'pagos',
    enlace,
    resumen: { tipo: 'pagos', nombres: visibles.map((m) => m.nombre) },
  };
}

/**
 * Envíos: si el sitio no ofrece domicilio, es opcional. Con domicilio, está
 * listo si hay tarifas por zona visibles en la web (Transporte); si Transporte
 * no está disponible, la tarifa plana del sitio es la alternativa (B/10-04
 * nota 3). Con Transporte y sin tarifas por zona, falta (la captura: «hoy solo
 * tarifa plana»).
 */
export function tarjetaEnvios(h: HechosEnvios): TarjetaVenta {
  const conDomicilio = h.envioActivo && h.tiposEntrega.some((t) => ENTREGA_DOMICILIO.has(t));
  const conPlana = h.tarifaPlana !== null && h.tarifaPlana !== undefined;
  let estado: EstadoTarjetaVenta;
  let falta: string | undefined;
  if (!conDomicilio) estado = 'opcional';
  else if (h.tarifasZonaWeb > 0) estado = 'configurado';
  else if (!h.enlace.visible) {
    estado = conPlana ? 'configurado' : 'disponible';
  } else {
    estado = 'falta';
    falta = conPlana ? 'enviosSoloPlana' : 'envios';
  }
  const filas: FilaVenta[] = [
    { clave: 'tarifaPlana', marca: conPlana ? 'ok' : 'neutro', valor: { tipo: 'importe', valor: h.tarifaPlana } },
    { clave: 'envioGratisDesde', marca: h.envioGratisDesde ? 'ok' : 'neutro', valor: { tipo: 'importe', valor: h.envioGratisDesde } },
  ];
  if (h.enlace.visible) {
    filas.push({
      clave: 'tarifasZona',
      marca: h.tarifasZonaWeb > 0 ? 'ok' : conDomicilio ? 'alerta' : 'neutro',
      valor: { tipo: 'numero', valor: h.tarifasZonaWeb },
    });
  }
  return {
    tema: 'envios',
    estado,
    falta,
    filas,
    origen: h.enlace.visible ? 'envios' : 'enviosPlana',
    enlace: h.enlace,
    resumen: { tipo: 'envios', zonas: h.tarifasZonaWeb, tarifaPlana: h.tarifaPlana },
  };
}

/**
 * Cupones y promociones nunca bloquean la venta: siempre «Opcional» (B/10-01).
 *
 * DECISIÓN PENDIENTE (captura B/10-01, fila «Promoción destacada en el
 * inicio: Ninguna»): hoy no hay fuente para ese dato. `promotions` no tiene
 * una marca de «destacada» y las secciones `promo_banners` del documento V2
 * son banners libres, no enlazados a una promoción. Mientras el dueño no
 * decida de dónde sale (una columna `promotions.is_featured_web` o una
 * sección del inicio que apunte a una promoción), se muestra el conteo real
 * de «Promociones activas en la web» en lugar de inventar «Ninguna».
 */
export function tarjetaCupones(h: HechosCupones): TarjetaVenta {
  return {
    tema: 'cupones',
    estado: h.enlace.visible ? 'opcional' : 'disponible',
    filas: [
      { clave: 'cuponesUsables', marca: h.cuponesUsables > 0 ? 'ok' : 'neutro', valor: { tipo: 'numero', valor: h.cuponesUsables } },
      { clave: 'promocionesWeb', marca: h.promocionesWeb > 0 ? 'ok' : 'neutro', valor: { tipo: 'numero', valor: h.promocionesWeb } },
    ],
    origen: 'cupones',
    enlace: h.enlace,
    resumen: { tipo: 'cupones', activos: h.cuponesUsables },
  };
}

export function tarjetaPedidos(h: HechosPedidos): TarjetaVenta {
  return {
    tema: 'pedidos',
    estado: h.ventaEnLinea ? (h.enlace.visible ? 'configurado' : 'disponible') : 'falta',
    falta: h.ventaEnLinea ? undefined : 'pedidos',
    filas: [
      { clave: 'pendientes', marca: h.pendientes > 0 ? 'alerta' : 'ok', valor: { tipo: 'numero', valor: h.pendientes } },
      { clave: 'pagadosHoy', marca: 'ok', valor: { tipo: 'pedidos_hoy', cantidad: h.pagadosHoy, total: h.totalHoy } },
      // «Pedidos en línea: Sí/No» ya lo dice el estado «Falta» de la tarjeta; la captura pide los avisos.
      { clave: 'avisosCliente', marca: h.avisosCliente.length > 0 ? 'ok' : 'alerta', valor: { tipo: 'avisos', canales: h.avisosCliente } },
    ],
    origen: 'pedidos',
    enlace: h.enlace,
    resumen: { tipo: 'pedidos', pendientes: h.pendientes },
  };
}

/** Reservas en la web: opcional mientras ninguna sede las recibe. */
export function tarjetaReservas(h: HechosReservas, editable: boolean): TarjetaVenta {
  const recibiendo = h.sedes.filter((s) => s.recibiendo).map((s) => s.nombre);
  return {
    tema: 'reservas',
    estado: recibiendo.length > 0 ? 'configurado' : 'opcional',
    filas: h.sedes.map((s) => ({
      clave: 'sede',
      etiquetaLibre: s.nombre,
      marca: s.recibiendo ? 'ok' : 'neutro',
      valor: { tipo: 'estado_sede', recibiendo: s.recibiendo },
    })),
    origen: 'reservas',
    enlace: h.enlace,
    interruptor: { valor: recibiendo.length > 0, habilitado: editable && h.sedes.length > 0 },
    resumen: { tipo: 'reservas', recibiendo, total: h.sedes.length },
  };
}

export function tarjetaPasarela(h: HechosPasarela): TarjetaVenta {
  const conectada = h.conexiones.find((c) => c.estado === 'connected') ?? null;
  const lista = !!conectada && h.enlazadaAlSitio;
  const veredicto = h.firma === 'match' ? 'verificada' : h.firma === 'mismatch' ? 'no_coincide' : 'sin_eventos';
  const filas: FilaVenta[] = [];
  if (conectada) {
    filas.push({ clave: 'conectada', etiquetaLibre: conectada.proveedor, marca: 'ok', valor: { tipo: 'entorno', valor: conectada.entorno } });
    filas.push({
      clave: 'firmaEventos',
      marca: veredicto === 'verificada' ? 'ok' : veredicto === 'no_coincide' ? 'alerta' : 'neutro',
      valor: { tipo: 'firma', veredicto, ultimoPago: h.ultimoPago },
    });
  } else {
    filas.push({ clave: 'sinPasarela', marca: 'alerta', valor: { tipo: 'si_no', valor: false } });
  }
  if (conectada && !h.enlazadaAlSitio) {
    filas.push({ clave: 'pasarelaNoVisible', marca: 'alerta', valor: { tipo: 'visible', valor: false } });
  }
  return {
    tema: 'pasarela',
    estado: lista ? 'configurado' : h.enlace.visible ? 'falta' : 'disponible',
    falta: lista ? undefined : 'pasarela',
    filas,
    origen: 'pasarela',
    enlace: h.enlace,
    resumen: { tipo: 'pasarela', proveedor: conectada?.proveedor ?? null, firmaVerificada: veredicto === 'verificada' },
  };
}

// ─── Conteo «N de M listos para vender» ─────────────────────────────────────

export interface ProgresoVentas {
  listos: number;
  total: number;
  /** Claves de lo que falta (de las tarjetas en «Falta»), en el orden del tablero. */
  faltan: string[];
  /** Ninguna tarjeta obligatoria está configurada: vacío «Tu sitio todavía no vende». */
  sinVender: boolean;
}

/**
 * «5 de 6 listos»: cuentan las tarjetas obligatorias (Configurado o Falta).
 * Opcional y «Disponible con …» no suman ni restan (B/10-04 nota 2). Una
 * tarjeta con error no cuenta: no sabemos su estado.
 */
export function progresoVentas(tarjetas: readonly EntradaTablero[]): ProgresoVentas {
  const leidas = tarjetas.filter((t): t is TarjetaVenta => !esTarjetaError(t));
  const obligatorias = leidas.filter((t) => t.estado === 'configurado' || t.estado === 'falta');
  const listos = obligatorias.filter((t) => t.estado === 'configurado').length;
  const faltan = obligatorias.filter((t) => t.estado === 'falta').map((t) => t.falta ?? t.tema);
  return {
    listos,
    total: obligatorias.length,
    faltan,
    sinVender: obligatorias.length > 0 && listos === 0 && leidas.length === tarjetas.length,
  };
}

/** Ordena las tarjetas en el orden de la captura, sin importar el orden en que se leyeron. */
export function ordenarTablero<T extends { tema: TemaVenta }>(tarjetas: readonly T[]): T[] {
  return [...tarjetas].sort((a, b) => TEMAS_VENTA.indexOf(a.tema) - TEMAS_VENTA.indexOf(b.tema));
}

// ─── Checkout: validación del PUT ───────────────────────────────────────────

/**
 * Tipos de entrega de `website_settings.available_delivery_types` (text[], sin CHECK; verificado
 * por MCP). `dine_in` = «Comer aquí» del restaurante: el checkout del sitio lo ofrece si está aquí
 * o si el cliente escaneó el QR de una mesa. Solo no basta: el sitio necesita retiro o domicilio.
 */
export const TIPOS_ENTREGA = ['pickup', 'delivery_own', 'delivery_third_party', 'dine_in'] as const;
export type TipoEntrega = (typeof TIPOS_ENTREGA)[number];

export interface SelloConfianza {
  /** Icono que ya guarda el sitio público (se conserva tal cual; el ERP no lo cambia). */
  icono: string;
  texto: string;
}

export interface CambiosCheckout {
  modo?: 'steps' | 'one_page';
  tiposEntrega?: TipoEntrega[];
  invitado?: boolean;
  pedidoMinimo?: number | null;
  sellos?: boolean;
  listaSellos?: SelloConfianza[];
  logosPago?: boolean;
  ventaEnLinea?: boolean;
  envioActivo?: boolean;
  tarifaPlana?: number | null;
  envioGratisDesde?: number | null;
}

export const MAX_IMPORTE = 999_999_999_999;
export const MAX_SELLOS = 6;
export const MAX_TEXTO_SELLO = 60;

/**
 * Valida el cuerpo del PUT de checkout campo por campo (lista blanca). Devuelve
 * los cambios válidos o los nombres de los campos inválidos.
 */
export function validarCambiosCheckout(raw: unknown): { ok: true; cambios: CambiosCheckout } | { ok: false; campos: string[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, campos: ['cuerpo'] };
  const b = raw as Record<string, unknown>;
  const campos: string[] = [];
  const c: CambiosCheckout = {};
  const importe = (k: keyof CambiosCheckout) => {
    if (!(k in b)) return;
    const v = b[k];
    if (v === null) (c as Record<string, unknown>)[k] = null;
    else if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_IMPORTE) (c as Record<string, unknown>)[k] = v;
    else campos.push(k);
  };
  const booleano = (k: keyof CambiosCheckout) => {
    if (!(k in b)) return;
    if (typeof b[k] === 'boolean') (c as Record<string, unknown>)[k] = b[k];
    else campos.push(k);
  };
  if ('modo' in b) {
    if (b.modo === 'steps' || b.modo === 'one_page') c.modo = b.modo;
    else campos.push('modo');
  }
  if ('tiposEntrega' in b) {
    const v = b.tiposEntrega;
    if (Array.isArray(v) && v.some((t) => t !== 'dine_in') && v.every((t) => (TIPOS_ENTREGA as readonly unknown[]).includes(t))) {
      c.tiposEntrega = Array.from(new Set(v as TipoEntrega[]));
    } else campos.push('tiposEntrega');
  }
  if ('listaSellos' in b) {
    const v = b.listaSellos;
    if (
      Array.isArray(v) &&
      v.length <= MAX_SELLOS &&
      v.every(
        (s) =>
          typeof s === 'object' &&
          s !== null &&
          typeof (s as SelloConfianza).texto === 'string' &&
          (s as SelloConfianza).texto.trim().length > 0 &&
          (s as SelloConfianza).texto.trim().length <= MAX_TEXTO_SELLO &&
          typeof (s as SelloConfianza).icono === 'string' &&
          (s as SelloConfianza).icono.length <= 16,
      )
    ) {
      c.listaSellos = (v as SelloConfianza[]).map((s) => ({ icono: s.icono, texto: s.texto.trim() }));
    } else campos.push('listaSellos');
  }
  booleano('invitado');
  booleano('sellos');
  booleano('logosPago');
  booleano('ventaEnLinea');
  booleano('envioActivo');
  importe('pedidoMinimo');
  importe('tarifaPlana');
  importe('envioGratisDesde');
  const conocidas = new Set(['modo', 'tiposEntrega', 'invitado', 'pedidoMinimo', 'sellos', 'listaSellos', 'logosPago', 'ventaEnLinea', 'envioActivo', 'tarifaPlana', 'envioGratisDesde']);
  for (const k of Object.keys(b)) if (!conocidas.has(k)) campos.push(k);
  return campos.length > 0 ? { ok: false, campos } : { ok: true, cambios: c };
}

/** Columnas de `website_settings` de cada cambio (lista blanca; las dos últimas, migración pendiente). */
export const COLUMNAS_CHECKOUT: Readonly<Record<keyof CambiosCheckout, string>> = {
  modo: 'checkout_mode',
  tiposEntrega: 'available_delivery_types',
  invitado: 'checkout_guest_enabled',
  pedidoMinimo: 'checkout_min_order_amount',
  sellos: 'checkout_show_trust_badges',
  listaSellos: 'checkout_trust_badges',
  logosPago: 'checkout_show_payment_logos',
  ventaEnLinea: 'enable_online_ordering',
  envioActivo: 'enable_shipping',
  tarifaPlana: 'shipping_flat_rate',
  envioGratisDesde: 'free_shipping_threshold',
};

/** Columnas que agrega la migración pendiente `sitio_web_ventas_sedes`. */
export const COLUMNAS_PENDIENTES_CHECKOUT = new Set(['checkout_guest_enabled', 'checkout_min_order_amount']);

export function filaDeCambios(c: CambiosCheckout): Record<string, unknown> {
  const fila: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (v === undefined) continue;
    const col = COLUMNAS_CHECKOUT[k as keyof CambiosCheckout];
    fila[col] = k === 'listaSellos' ? (v as SelloConfianza[]).map((s) => ({ icon: s.icono, text: s.texto })) : v;
  }
  return fila;
}
