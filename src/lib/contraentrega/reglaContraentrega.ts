/**
 * Contraentrega con condiciones (Figma «05 POS y ventas» 3014:194407 y «16 Sitio web» 3019:76125,
 * aprobado por el dueño el 2026-11-24). Módulo PURO y SIN imports.
 *
 * El MISMO archivo, byte a byte, vive en los dos repos:
 *   - ERP:    src/lib/contraentrega/reglaContraentrega.ts  (diálogo «Condiciones», Pedidos online)
 *   - tienda: lib/contraentrega/reglaContraentrega.ts      (checkout, /api/orders, carrito, ficha)
 * Lo vigilan `scripts/verify-copias-erp.mjs` y `scripts/verify-contraentrega.mjs` en la tienda y
 * `src/lib/contraentrega/__tests__/reglaContraentrega.test.ts` en el ERP. Si cambias algo aquí,
 * copia el archivo tal cual al otro repo.
 *
 * ─── Qué es ───────────────────────────────────────────────────────────────────────────────────
 * La contraentrega ES el método «Efectivo» (`cash`) que ya existe en la web, con condiciones
 * encima. Las condiciones viven en `organization_payment_methods.settings.contraentrega` de la
 * fila `cash`, POR SEDE (la sede del pedido decide):
 *
 *   settings.contraentrega = { version: 1, sedes: { "<branch_id>": CondicionesContraentrega } }
 *
 * Sin condiciones para la sede (o sin la clave), TODO funciona EXACTAMENTE como hoy: se ofrece,
 * sin anticipo y se cobra el total al recibir. Las condiciones solo aplican a la entrega a
 * domicilio (propia o con transportadora): con «Recoger en la tienda» o «Comer aquí» el efectivo
 * es «Pagar al recoger» y nunca lleva condiciones.
 *
 * ─── Una sola regla ───────────────────────────────────────────────────────────────────────────
 * `evaluarContraentrega` responde «¿se ofrece y con qué anticipo?». La tienda la evalúa en el
 * SERVIDOR con los montos del servidor (el navegador nunca decide el monto del anticipo) y el ERP
 * la usa para la vista previa del diálogo. Los motivos salen en el orden en que el cliente los
 * puede resolver: monto → productos → dirección → historial.
 */

/** Medios con que el domiciliario cobra en la puerta (= CHECK shipments_cod_collected_method_check). */
export const MEDIOS_AL_RECIBIR = ['cash', 'card', 'transfer', 'qr'] as const;
export type MedioAlRecibir = (typeof MEDIOS_AL_RECIBIR)[number];

export const TIPOS_ANTICIPO = ['ninguno', 'envio', 'porcentaje', 'fijo'] as const;
export type TipoAnticipo = (typeof TIPOS_ANTICIPO)[number];

/** Plazo para pagar el anticipo (decisión del dueño, 2026-11-24). */
export const PLAZO_ANTICIPO_MINUTOS = 30;
/** Largo máximo del texto que ve el cliente bajo la opción. */
export const MAX_TEXTO_CLIENTE = 160;

export interface CondicionesContraentrega {
  /** «Ofrecer pago contra entrega en la tienda». Apagado: el efectivo no se ofrece a domicilio. */
  ofrecer: boolean;
  /** Valor de los productos con descuentos, sin el envío. `null` = sin límite. */
  montoMinimo: number | null;
  montoMaximo: number | null;
  /** Zonas de domicilio propio (Logística › Zonas). */
  zonas: { modo: 'todas' } | { modo: 'algunas'; ids: string[] };
  /** También con transportadora (envío nacional). Decisión del dueño: sí, por defecto. */
  transportadora: boolean;
  /** A qué productos aplica: todos, solo algunos o todos menos algunos (categorías o productos). */
  productos: { modo: 'todos' | 'solo' | 'excepto'; categorias: number[]; productos: number[] };
  /** Con qué puede pagar al recibir. */
  medios: MedioAlRecibir[];
  anticipo: {
    tipo: TipoAnticipo;
    /** 1–100, sobre el total con envío. */
    porcentaje: number | null;
    /** Valor fijo para todos los pedidos. */
    valorFijo: number | null;
    /** Con anticipo «el envío» y envío gratis: no pedir anticipo o pedir un valor fijo. */
    siEnvioGratis: 'sin_anticipo' | 'valor_fijo';
    valorEnvioGratis: number | null;
    /** Pasarela con que se cobra; `null` = cualquiera de las activas (el cliente elige). */
    pasarela: string | null;
    plazoMinutos: number;
  };
  /** Si el cliente no recibe el pedido: se le devuelve el anticipo o la tienda se lo queda. */
  siNoRecibe: 'devolver' | 'retener';
  /** Texto que ve el cliente bajo la opción (máx. 160). `null` = el texto por defecto. */
  texto: string | null;
  /** Apagadas por defecto (decisión del dueño). */
  soloClientesConEntregas: boolean;
  noOfrecerARechazados: boolean;
}

export const CONDICIONES_POR_DEFECTO: CondicionesContraentrega = {
  ofrecer: true,
  montoMinimo: null,
  montoMaximo: null,
  zonas: { modo: 'todas' },
  transportadora: true,
  productos: { modo: 'todos', categorias: [], productos: [] },
  medios: ['cash', 'card', 'transfer', 'qr'],
  anticipo: {
    tipo: 'ninguno',
    porcentaje: null,
    valorFijo: null,
    siEnvioGratis: 'sin_anticipo',
    valorEnvioGratis: null,
    pasarela: null,
    plazoMinutos: PLAZO_ANTICIPO_MINUTOS,
  },
  siNoRecibe: 'devolver',
  texto: null,
  soloClientesConEntregas: false,
  noOfrecerARechazados: false,
};

export interface AjustesContraentrega {
  version: 1;
  sedes: Record<string, CondicionesContraentrega>;
}

// ─── Lectura tolerante del jsonb ──────────────────────────────────────────────────────────────

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function montoONulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function enteros(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<number>();
  for (const x of v) {
    const n = Number(x);
    if (Number.isInteger(n) && n > 0) vistos.add(n);
  }
  return Array.from(vistos);
}

function textos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())));
}

/** Condiciones de una sede desde lo guardado; cualquier campo ausente o inválido toma el defecto. */
export function normalizarCondiciones(crudo: unknown): CondicionesContraentrega {
  const d = CONDICIONES_POR_DEFECTO;
  if (!esObjeto(crudo)) return { ...d, zonas: { modo: 'todas' }, productos: { ...d.productos }, medios: [...d.medios], anticipo: { ...d.anticipo } };
  const zonasCrudo = esObjeto(crudo.zonas) ? crudo.zonas : {};
  const idsZonas = textos(zonasCrudo.ids);
  const productosCrudo = esObjeto(crudo.productos) ? crudo.productos : {};
  const modoProductos = productosCrudo.modo === 'solo' || productosCrudo.modo === 'excepto' ? productosCrudo.modo : 'todos';
  const anticipoCrudo = esObjeto(crudo.anticipo) ? crudo.anticipo : {};
  const tipo = (TIPOS_ANTICIPO as readonly string[]).includes(String(anticipoCrudo.tipo)) ? (anticipoCrudo.tipo as TipoAnticipo) : 'ninguno';
  const porcentaje = montoONulo(anticipoCrudo.porcentaje);
  const medios = textos(crudo.medios).filter((m): m is MedioAlRecibir => (MEDIOS_AL_RECIBIR as readonly string[]).includes(m));
  const plazo = Number(anticipoCrudo.plazoMinutos);
  const texto = typeof crudo.texto === 'string' && crudo.texto.trim() ? crudo.texto.trim().slice(0, MAX_TEXTO_CLIENTE) : null;
  return {
    ofrecer: crudo.ofrecer !== false,
    montoMinimo: montoONulo(crudo.montoMinimo),
    montoMaximo: montoONulo(crudo.montoMaximo),
    zonas: zonasCrudo.modo === 'algunas' ? { modo: 'algunas', ids: idsZonas } : { modo: 'todas' },
    transportadora: crudo.transportadora !== false,
    productos: { modo: modoProductos, categorias: enteros(productosCrudo.categorias), productos: enteros(productosCrudo.productos) },
    medios: medios.length > 0 ? medios : [...d.medios],
    anticipo: {
      tipo,
      porcentaje: porcentaje !== null && porcentaje > 0 && porcentaje <= 100 ? porcentaje : null,
      valorFijo: montoONulo(anticipoCrudo.valorFijo),
      siEnvioGratis: anticipoCrudo.siEnvioGratis === 'valor_fijo' ? 'valor_fijo' : 'sin_anticipo',
      valorEnvioGratis: montoONulo(anticipoCrudo.valorEnvioGratis),
      pasarela: typeof anticipoCrudo.pasarela === 'string' && anticipoCrudo.pasarela.trim() ? anticipoCrudo.pasarela.trim() : null,
      plazoMinutos: Number.isInteger(plazo) && plazo >= 5 && plazo <= 1440 ? plazo : PLAZO_ANTICIPO_MINUTOS,
    },
    siNoRecibe: crudo.siNoRecibe === 'retener' ? 'retener' : 'devolver',
    texto,
    soloClientesConEntregas: crudo.soloClientesConEntregas === true,
    noOfrecerARechazados: crudo.noOfrecerARechazados === true,
  };
}

/**
 * Condiciones de la sede del pedido, o `null` si esa sede no tiene (= como hoy). `settings` es la
 * columna `organization_payment_methods.settings` de la fila `cash`.
 */
export function condicionesDeSede(settings: unknown, branchId: number | string | null | undefined): CondicionesContraentrega | null {
  if (!esObjeto(settings) || !esObjeto(settings.contraentrega)) return null;
  const sedes = settings.contraentrega.sedes;
  if (!esObjeto(sedes) || branchId === null || branchId === undefined) return null;
  const propias = sedes[String(branchId)];
  return esObjeto(propias) ? normalizarCondiciones(propias) : null;
}

/** `settings` con las condiciones de una sede puestas (o quitadas con `null`), sin tocar lo demás. */
export function conCondicionesDeSede(
  settings: unknown,
  branchId: number,
  condiciones: CondicionesContraentrega | null,
): Record<string, unknown> {
  const base = esObjeto(settings) ? { ...settings } : {};
  const previo = esObjeto(base.contraentrega) ? base.contraentrega : {};
  const sedes = esObjeto(previo.sedes) ? { ...previo.sedes } : {};
  if (condiciones) sedes[String(branchId)] = normalizarCondiciones(condiciones);
  else delete sedes[String(branchId)];
  base.contraentrega = { ...previo, version: 1, sedes };
  return base;
}

// ─── Evaluación ───────────────────────────────────────────────────────────────────────────────

export type TipoEntregaPedido = 'delivery_own' | 'delivery_third_party' | 'pickup' | 'dine_in';

export interface LineaContraentrega {
  productoId: number;
  categoriaId: number | null;
  /** Producto padre de una variante: si el padre está excluido, la variante también. */
  productoPadreId?: number | null;
  nombre?: string;
  total?: number;
}

export interface EntradaContraentrega {
  condiciones: CondicionesContraentrega | null;
  tipoEntrega: TipoEntregaPedido;
  /** Valor de los productos con descuentos, sin el envío (lo que cuentan mínimo y máximo). */
  subtotalProductos: number;
  envio: number;
  /** Total del pedido (con envío, impuesto, propina y descuentos): lo que paga el cliente. */
  total: number;
  /** Zona con que el servidor cotizó el domicilio propio; `null` = sin zonas o sin cotizar. */
  zonaId: string | null;
  /** Nombres de las zonas permitidas, para el motivo (opcional). */
  nombresZonas?: string[];
  lineas: LineaContraentrega[];
  /** Historial del cliente de la SESIÓN; `null` = invitado o no se supo. */
  cliente: { pedidosEntregados: number; rechazosEnPuerta: number } | null;
  /** Pasarelas activas de la tienda (códigos), para el anticipo. */
  pasarelasActivas: string[];
}

export type MotivoNoDisponible =
  | { codigo: 'apagada' }
  | { codigo: 'monto_minimo'; minimo: number; faltan: number }
  | { codigo: 'monto_maximo'; maximo: number; total: number }
  | { codigo: 'productos'; productoIds: number[] }
  | { codigo: 'zona'; zonas: string[] }
  | { codigo: 'transportadora' }
  | { codigo: 'primera_compra' }
  | { codigo: 'rechazo_previo' }
  | { codigo: 'sin_pasarela' };

export interface AnticipoContraentrega {
  monto: number;
  base: 'envio' | 'porcentaje' | 'fijo' | 'envio_gratis_fijo';
  plazoMinutos: number;
  /** Pasarelas con que se puede pagar (la primera viene marcada). */
  pasarelas: string[];
  siNoRecibe: 'devolver' | 'retener';
}

export interface ResultadoContraentrega {
  /** ¿Aplican las condiciones? `false` = como hoy (sin condiciones, recoger o comer aquí). */
  conCondiciones: boolean;
  disponible: boolean;
  /** En orden: el primero es el que se muestra. */
  motivos: MotivoNoDisponible[];
  anticipo: AnticipoContraentrega | null;
  /** Lo que se cobra en la puerta: total − anticipo. */
  alRecibir: number;
  medios: MedioAlRecibir[];
  texto: string | null;
}

/** Redondeo a centavos sin arrastre binario. */
export function aCentavos(valor: number): number {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function esDomicilio(tipo: TipoEntregaPedido): boolean {
  return tipo === 'delivery_own' || tipo === 'delivery_third_party';
}

/** ¿El producto entra en la contraentrega según «A qué productos aplica»? */
export function productoAplica(
  condiciones: CondicionesContraentrega | null,
  linea: Pick<LineaContraentrega, 'productoId' | 'categoriaId' | 'productoPadreId'>,
): boolean {
  if (!condiciones || condiciones.productos.modo === 'todos') return true;
  const { categorias, productos } = condiciones.productos;
  const marcado =
    productos.includes(linea.productoId) ||
    (linea.productoPadreId !== null && linea.productoPadreId !== undefined && productos.includes(linea.productoPadreId)) ||
    (linea.categoriaId !== null && categorias.includes(linea.categoriaId));
  return condiciones.productos.modo === 'solo' ? marcado : !marcado;
}

/** Monto del anticipo según las condiciones, o 0 si no se pide. Nunca más que el total. */
export function montoAnticipo(
  condiciones: CondicionesContraentrega,
  envio: number,
  total: number,
): { monto: number; base: AnticipoContraentrega['base'] } | null {
  const a = condiciones.anticipo;
  const tope = Math.max(0, aCentavos(total));
  let monto = 0;
  let base: AnticipoContraentrega['base'] = 'envio';
  if (a.tipo === 'envio') {
    if (aCentavos(envio) > 0) {
      monto = aCentavos(envio);
    } else if (a.siEnvioGratis === 'valor_fijo' && (a.valorEnvioGratis ?? 0) > 0) {
      monto = aCentavos(a.valorEnvioGratis as number);
      base = 'envio_gratis_fijo';
    }
  } else if (a.tipo === 'porcentaje' && (a.porcentaje ?? 0) > 0) {
    monto = aCentavos((tope * (a.porcentaje as number)) / 100);
    base = 'porcentaje';
  } else if (a.tipo === 'fijo' && (a.valorFijo ?? 0) > 0) {
    monto = aCentavos(a.valorFijo as number);
    base = 'fijo';
  }
  monto = Math.min(monto, tope);
  return monto > 0 ? { monto, base } : null;
}

/** Pasarelas con que se cobra el anticipo: la configurada (si está activa) o todas las activas. */
export function pasarelasAnticipo(condiciones: CondicionesContraentrega, activas: string[]): string[] {
  const unicas = Array.from(new Set(activas.filter((p) => typeof p === 'string' && p.trim() !== '')));
  const fija = condiciones.anticipo.pasarela;
  if (fija) return unicas.includes(fija) ? [fija] : [];
  return unicas;
}

export function evaluarContraentrega(e: EntradaContraentrega): ResultadoContraentrega {
  const total = Math.max(0, aCentavos(e.total));
  const c = e.condiciones;
  // Sin condiciones, recoger o comer aquí: exactamente como hoy.
  if (!c || !esDomicilio(e.tipoEntrega)) {
    return {
      conCondiciones: false,
      disponible: true,
      motivos: [],
      anticipo: null,
      alRecibir: total,
      medios: c ? [...c.medios] : [...CONDICIONES_POR_DEFECTO.medios],
      texto: null,
    };
  }

  const motivos: MotivoNoDisponible[] = [];
  if (!c.ofrecer) motivos.push({ codigo: 'apagada' });

  const subtotal = aCentavos(e.subtotalProductos);
  if (c.montoMinimo !== null && subtotal < c.montoMinimo) {
    motivos.push({ codigo: 'monto_minimo', minimo: c.montoMinimo, faltan: aCentavos(c.montoMinimo - subtotal) });
  }
  if (c.montoMaximo !== null && subtotal > c.montoMaximo) {
    motivos.push({ codigo: 'monto_maximo', maximo: c.montoMaximo, total: subtotal });
  }

  const excluidos = e.lineas.filter((l) => !productoAplica(c, l)).map((l) => l.productoId);
  if (excluidos.length > 0) motivos.push({ codigo: 'productos', productoIds: Array.from(new Set(excluidos)) });

  if (e.tipoEntrega === 'delivery_third_party') {
    if (!c.transportadora) motivos.push({ codigo: 'transportadora' });
  } else if (c.zonas.modo === 'algunas') {
    // Domicilio propio sin zona cotizada (la tienda no usa zonas): no se puede comprobar → no se ofrece.
    if (!e.zonaId || !c.zonas.ids.includes(e.zonaId)) {
      motivos.push({ codigo: 'zona', zonas: e.nombresZonas && e.nombresZonas.length > 0 ? [...e.nombresZonas] : [] });
    }
  }

  if (c.soloClientesConEntregas && !(e.cliente && e.cliente.pedidosEntregados > 0)) {
    motivos.push({ codigo: 'primera_compra' });
  }
  if (c.noOfrecerARechazados && e.cliente && e.cliente.rechazosEnPuerta > 0) {
    motivos.push({ codigo: 'rechazo_previo' });
  }

  let anticipo: AnticipoContraentrega | null = null;
  const calculado = montoAnticipo(c, e.envio, total);
  if (calculado) {
    const pasarelas = pasarelasAnticipo(c, e.pasarelasActivas);
    if (pasarelas.length === 0) {
      // Piden anticipo y no hay con qué cobrarlo: no se ofrece (nunca se cobra todo en la puerta a escondidas).
      motivos.push({ codigo: 'sin_pasarela' });
    } else {
      anticipo = {
        monto: calculado.monto,
        base: calculado.base,
        plazoMinutos: c.anticipo.plazoMinutos,
        pasarelas,
        siNoRecibe: c.siNoRecibe,
      };
    }
  }

  const disponible = motivos.length === 0;
  return {
    conCondiciones: true,
    disponible,
    motivos,
    anticipo: disponible ? anticipo : null,
    alRecibir: disponible ? aCentavos(total - (anticipo?.monto ?? 0)) : total,
    medios: [...c.medios],
    texto: c.texto,
  };
}

/** Lo que falta para el mínimo en el carrito (aviso del cajón), o `null` si no aplica. */
export function faltaParaMinimo(condiciones: CondicionesContraentrega | null, subtotalProductos: number): { minimo: number; faltan: number } | null {
  if (!condiciones || !condiciones.ofrecer || condiciones.montoMinimo === null) return null;
  const faltan = aCentavos(condiciones.montoMinimo - aCentavos(subtotalProductos));
  return faltan > 0 ? { minimo: condiciones.montoMinimo, faltan } : null;
}

/**
 * Lo que el domiciliario o la transportadora cobra en la puerta de un pedido web: total − anticipo
 * PAGADO. Un anticipo pendiente o vencido no descuenta nada.
 */
export function cobroEnPuerta(total: number | string | null | undefined, anticipo: { monto: number | string | null | undefined; estado: string | null | undefined }): number {
  const t = Math.max(0, aCentavos(Number(total) || 0));
  const pagado = anticipo.estado === 'paid' ? Math.max(0, aCentavos(Number(anticipo.monto) || 0)) : 0;
  return Math.max(0, aCentavos(t - pagado));
}
