/**
 * Guía / rótulo de envío estándar de Logística — Figma «21 Logística», sección 3223:15627
 * (componente 10 × 15 cm 3223:15636, térmica 80 mm 3223:16129, variantes 3224:15679, diálogo y
 * hoja A4 3226:15989, lámina 3228:16613). Aprobado por el dueño el 2026-11-25.
 *
 * UNA sola plantilla para todo: la vista previa del diálogo, el PDF (`/imprimir/guias`, 10 × 15,
 * 80 mm o A4 con cuatro por hoja) y la térmica, que imprime la IMAGEN de ese mismo rótulo. Este
 * módulo es puro: arma los datos (`datosRotuloDeEnvio`), los reparte por paquete y copia
 * (`rotulosParaImprimir`) y resuelve todos los textos (`textosRotulo`), que son los que pinta el
 * componente `RotuloEnvio` y los que viajan al agente como respaldo en texto.
 *
 * Reglas aprobadas: en el papel un solo número, la guía (`shipment_number`; el TRK interno no se
 * imprime); sin productos, precios, SKU ni textos internos; campos vacíos no salen; contraentrega
 * como «COBRAR AL ENTREGAR $ saldo» (ya restado el anticipo pagado) y, sin cobro, «PAGADO · NO
 * COBRAR»; marca de la tienda o sede, nunca la de GO Admin.
 */
import type { MonochromeRaster, ShipmentGuidePrintPayload, ShipmentLabelPayload } from '@printing';
import { limpiarIndicaciones } from './indicacionesEntrega';

export const FORMATOS_ROTULO = ['80mm', '10x15', 'a4'] as const;
export type FormatoRotulo = (typeof FORMATOS_ROTULO)[number];

export function esFormatoRotulo(v: unknown): v is FormatoRotulo {
  return typeof v === 'string' && (FORMATOS_ROTULO as readonly string[]).includes(v);
}

/** Rótulo estándar: 100 × 150 mm (Figma: 400 × 600 px, 1 px = 0,25 mm). */
export const ROTULO_MM = { ancho: 100, alto: 150 } as const;
/** Térmica de 80 mm: 72 mm útiles (576 puntos a 203 ppp), alto variable. */
export const TERMICA_MM = { ancho: 72, papel: 80 } as const;
/** Hoja A4 con cuatro rótulos de 10 × 15 al 97 % (2 × 145,5 mm caben en 297 mm). */
export const A4_MM = { ancho: 210, alto: 297 } as const;
export const ROTULOS_POR_HOJA = 4;
export const ESCALA_A4 = 0.97;

/** Prefijo del trabajo que la página `/imprimir/guias` lee del almacenamiento local. */
export const CLAVE_TRABAJO_ROTULOS = 'go-admin:rotulos:';
/** Último formato elegido, por sede (el diálogo lo recuerda). */
export const CLAVE_FORMATO_ROTULO = 'go-admin:rotulos:formato:';

export type TipoEntrega = 'propio' | 'transportadora' | 'recoger';

/** Momento que cuenta el pie: despachado, entregado a la transportadora o, sin fecha, impreso. */
export type MomentoRotulo = 'despachado' | 'transportadora' | 'impreso';

export interface DatosRotulo {
  /** Id del envío (`shipments.id`). */
  id: string;
  /** La guía impresa: `shipment_number`, con sufijo `-k` cuando el envío tiene varios paquetes. */
  numero: string;
  /** Contenido del QR: el seguimiento de la tienda si se pudo firmar; si no, la propia guía. */
  qr: string;
  qrEsSeguimiento: boolean;
  remitente: {
    tienda: string | null;
    iniciales: string;
    logo: string | null;
    sede: string | null;
    ciudad: string | null;
    telefono: string | null;
  };
  destinatario: {
    nombre: string | null;
    direccion: string | null;
    barrio: string | null;
    ciudad: string | null;
    departamento: string | null;
    telefono: string | null;
    indicaciones: string | null;
  };
  paquete: { numero: number; total: number };
  pesoKg: number | null;
  entrega: { tipo: TipoEntrega; transportadora: string | null };
  /** Guía de la transportadora (su propio código), solo en envíos por transportadora. */
  guiaExterna: { transportadora: string | null; numero: string } | null;
  cobro: {
    /** Saldo a cobrar en la puerta, formateado; null = no se cobra («PAGADO · NO COBRAR»). */
    monto: string | null;
    anticipoPagado: boolean;
    pedirCodigo: boolean;
  };
  pie: {
    momento: MomentoRotulo;
    fecha: string | null;
    /** Número del pedido web (`metadata.web_order_number`). */
    pedido: string | null;
    vehiculo: { tipo: string | null; placa: string } | null;
  };
}

type Uno<T> = T | T[] | null | undefined;

/** Fila de `shipments` con los embeds que lee `enviosParaGuias` (columnas verificadas por MCP 2026-11-25). */
export interface EnvioParaRotulo {
  id: string;
  shipment_number: string | null;
  tracking_number?: string | null;
  external_tracking_url?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  created_at?: string | null;
  dispatched_at?: string | null;
  fulfillment_mode?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_department?: string | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  delivery_instructions?: string | null;
  package_count?: number | string | null;
  weight_kg?: number | string | null;
  cod_amount?: number | string | null;
  cod_status?: string | null;
  currency?: string | null;
  delivery_code_required?: boolean | null;
  metadata?: Record<string, unknown> | null;
  customer?: Uno<{ full_name?: string | null; phone?: string | null }>;
  branch?: Uno<{ name?: string | null; city?: string | null; phone?: string | null; website_logo_url?: string | null }>;
  organization?: Uno<{ name?: string | null; logo_url?: string | null; phone?: string | null }>;
  carrier?: Uno<{ name?: string | null }>;
}

/** Lo que solo el servidor sabe: el enlace firmado de seguimiento y si el anticipo está pagado. */
export interface DatosServidorRotulo {
  seguimiento: string | null;
  anticipoPagado: boolean;
}

export interface ContextoRotulo {
  /** Formatea un monto en la moneda del envío (o la base de la organización). */
  formatearMonto: (monto: number, moneda: string | null) => string;
  /** Fecha y hora de un `timestamptz` en la zona de la organización («25 nov 2026, 10:40»). */
  formatearFecha: (iso: string) => string;
  /** Instante de impresión (para el pie cuando el envío aún no sale). */
  ahora?: string;
  /** Por id de envío; si falta, el QR lleva la guía y no se sabe del anticipo. */
  servidor?: Readonly<Record<string, DatosServidorRotulo>>;
}

const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const texto = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return s === '' ? null : s;
};
const positivo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** La guía impresa es `shipment_number`; el tracking interno (TRK…) nunca sale en el papel. */
export function numeroGuia(e: Pick<EnvioParaRotulo, 'id' | 'shipment_number'>): string {
  return texto(e.shipment_number) ?? e.id;
}

/** Contraentrega pendiente: ya cobrada o consignada no se vuelve a pedir en la puerta. */
export function contraentregaPendiente(e: Pick<EnvioParaRotulo, 'cod_amount' | 'cod_status'>): number {
  if (e.cod_status === 'collected' || e.cod_status === 'remitted') return 0;
  return positivo(e.cod_amount) ?? 0;
}

export function inicialesDe(nombre: string | null | undefined): string {
  const palabras = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  return (palabras.slice(0, 2).map((p) => Array.from(p)[0] ?? '').join('') || '·').toUpperCase();
}

const MODOS_TRANSPORTADORA = new Set(['national_carrier', 'last_mile', 'marketplace']);

export function tipoEntregaDe(e: Pick<EnvioParaRotulo, 'fulfillment_mode' | 'metadata'>): TipoEntrega {
  const tipo = texto(e.metadata?.delivery_type);
  if (tipo === 'pickup') return 'recoger';
  if (tipo === 'delivery_third_party' || MODOS_TRANSPORTADORA.has(String(e.fulfillment_mode ?? ''))) return 'transportadora';
  return 'propio';
}

function vehiculoDe(meta: Record<string, unknown>): DatosRotulo['pie']['vehiculo'] {
  const v = meta.vehiculo;
  if (!v || typeof v !== 'object') return null;
  const placa = texto((v as Record<string, unknown>).placa);
  return placa ? { tipo: texto((v as Record<string, unknown>).tipo), placa } : null;
}

/** Convierte una fila de `shipments` en los datos del rótulo (uno por envío; los paquetes se reparten después). */
export function datosRotuloDeEnvio(e: EnvioParaRotulo, ctx: ContextoRotulo): DatosRotulo {
  const meta = e.metadata ?? {};
  const cliente = uno(e.customer);
  const sede = uno(e.branch);
  const org = uno(e.organization);
  const numero = numeroGuia(e);
  const servidor = ctx.servidor?.[e.id];
  const seguimiento = texto(servidor?.seguimiento) ?? (e.source_type === 'web_order' ? null : texto(e.external_tracking_url));
  const entrega = tipoEntregaDe(e);
  const transportadora = texto(uno(e.carrier)?.name) ?? texto(meta.delivery_partner);
  const cod = contraentregaPendiente(e);
  const tienda = texto(org?.name);
  const despacho = texto(e.dispatched_at);
  return {
    id: e.id,
    numero,
    qr: seguimiento ?? numero,
    qrEsSeguimiento: seguimiento != null,
    remitente: {
      tienda,
      iniciales: inicialesDe(tienda),
      logo: texto(sede?.website_logo_url) ?? texto(org?.logo_url),
      sede: texto(sede?.name),
      ciudad: texto(sede?.city),
      telefono: texto(sede?.phone) ?? texto(org?.phone),
    },
    destinatario: {
      nombre: texto(e.delivery_contact_name) ?? texto(cliente?.full_name),
      direccion: texto(e.delivery_address),
      barrio: texto(meta.delivery_neighborhood) ?? texto(meta.barrio),
      ciudad: texto(e.delivery_city),
      departamento: texto(e.delivery_department) ?? texto(meta.delivery_state),
      telefono: texto(e.delivery_contact_phone) ?? texto(cliente?.phone),
      indicaciones: limpiarIndicaciones(e.delivery_instructions),
    },
    paquete: { numero: 1, total: Math.min(Math.max(1, Math.floor(Number(e.package_count) || 1)), 50) },
    pesoKg: positivo(e.weight_kg),
    entrega: { tipo: entrega, transportadora: entrega === 'transportadora' ? transportadora : null },
    guiaExterna: entrega === 'transportadora' && texto(e.tracking_number) ? { transportadora, numero: texto(e.tracking_number) as string } : null,
    cobro: {
      monto: cod > 0 ? ctx.formatearMonto(cod, texto(e.currency)) : null,
      anticipoPagado: cod > 0 && servidor?.anticipoPagado === true,
      pedirCodigo: e.delivery_code_required === true,
    },
    pie: {
      momento: despacho ? (entrega === 'transportadora' ? 'transportadora' : 'despachado') : 'impreso',
      fecha: despacho ? ctx.formatearFecha(despacho) : ctx.ahora ? ctx.formatearFecha(ctx.ahora) : null,
      pedido: texto(meta.web_order_number),
      vehiculo: entrega === 'propio' ? vehiculoDe(meta) : null,
    },
  };
}

/**
 * Lo que sale en papel, en orden: un rótulo por paquete («1 de 3», «2 de 3»… con la guía y el
 * sufijo `-k`) y cada uno repetido seguido según «Copias por envío» (de 1 a 10).
 */
export function rotulosParaImprimir(datos: readonly DatosRotulo[], copias: number): DatosRotulo[] {
  const n = Math.min(Math.max(Math.floor(Number(copias) || 1), 1), 10);
  return datos.flatMap((d) => {
    const total = Math.max(1, d.paquete.total);
    const paquetes =
      total === 1
        ? [{ ...d, paquete: { numero: 1, total: 1 } }]
        : Array.from({ length: total }, (_, i) => ({ ...d, numero: `${d.numero}-${i + 1}`, paquete: { numero: i + 1, total } }));
    return paquetes.flatMap((p) => Array.from({ length: n }, () => p));
  });
}

/** Grupos de cuatro para la hoja A4 (el último puede quedar con cuartos libres). */
export function hojasA4<T>(rotulos: readonly T[]): T[][] {
  const hojas: T[][] = [];
  for (let i = 0; i < rotulos.length; i += ROTULOS_POR_HOJA) hojas.push(rotulos.slice(i, i + ROTULOS_POR_HOJA));
  return hojas;
}

/** Traductor de `logistica.rotulo` (el de next-intl encaja). */
export type TraducirRotulo = (clave: string, valores?: Record<string, string | number>) => string;

const CLAVE_VEHICULO: Record<string, string> = { motorcycle: 'vehiculoMoto', car: 'vehiculoCarro', van: 'vehiculoFurgon' };

/**
 * Todos los textos del rótulo, resueltos en el idioma de la organización. Los pinta
 * `RotuloEnvio` y viajan al agente (`payload.label`) como respaldo en texto: el papel y la
 * vista previa no pueden decir cosas distintas.
 */
export function textosRotulo(d: DatosRotulo, t: TraducirRotulo, formatearPeso: (kg: number) => string): ShipmentLabelPayload {
  const r = d.remitente;
  const x = d.destinatario;
  const destino = [x.ciudad, x.departamento].filter(Boolean).join(' · ').toUpperCase() || null;
  const varios = d.paquete.total > 1;
  const nota = (base: string) => (d.cobro.pedirCodigo ? `${base} ${t('notaCodigo')}` : base);
  const entrega =
    d.entrega.tipo === 'recoger'
      ? t('entregaRecoger')
      : d.entrega.tipo === 'transportadora'
        ? d.entrega.transportadora
          ? t('entregaTransportadora', { nombre: d.entrega.transportadora })
          : t('entregaTransportadoraSinNombre')
        : t('entregaPropio');
  const fecha = d.pie.fecha
    ? t(d.pie.momento === 'transportadora' ? 'pieTransportadora' : d.pie.momento === 'despachado' ? 'pieDespachado' : 'pieImpreso', { fecha: d.pie.fecha })
    : null;
  const vehiculo = d.pie.vehiculo ? t(CLAVE_VEHICULO[d.pie.vehiculo.tipo ?? ''] ?? 'vehiculoOtro', { placa: d.pie.vehiculo.placa }) : null;
  return {
    version: 2,
    senderLabel: t('remitente'),
    storeName: r.tienda,
    initials: r.iniciales,
    logoUrl: r.logo,
    branchLine: [r.sede, r.ciudad, r.telefono ? t('telefono', { telefono: r.telefono }) : null].filter(Boolean).join(' · ') || null,
    receiverLabel: t('destinatario'),
    receiverName: x.nombre,
    address: x.direccion,
    neighborhood: x.barrio,
    destination: destino,
    phone: x.telefono ? t('telefono', { telefono: x.telefono }) : null,
    instructions: x.indicaciones ? t('indicaciones', { texto: x.indicaciones }) : null,
    packageLabel: t('paquete'),
    packageText: t('paqueteDe', { numero: d.paquete.numero, total: d.paquete.total }),
    weightLabel: t('peso'),
    weightText: d.pesoKg != null ? t('pesoKg', { kg: formatearPeso(d.pesoKg) }) : null,
    deliveryLabel: t('entrega'),
    deliveryText: entrega,
    carrierGuideLabel: t('guiaTransportadora'),
    carrierGuideText: d.guiaExterna ? [d.guiaExterna.transportadora, d.guiaExterna.numero].filter(Boolean).join(' · ') : null,
    carrierGuideCode: d.guiaExterna?.numero ?? null,
    charge: d.cobro.monto
      ? {
          kind: 'collect',
          title: varios ? t('cobrarUnaVez') : t('cobrar'),
          amount: d.cobro.monto,
          note: nota(varios ? t('notaCobroPaquetes', { total: d.paquete.total }) : d.cobro.anticipoPagado ? t('notaCobroAnticipo') : t('notaCobro')),
        }
      : { kind: 'paid', title: t('pagado'), amount: null, note: nota(t('notaPagado')) },
    guideNumber: d.numero,
    guideLabel: t('guia'),
    qrData: d.qr,
    qrCaption: d.qrEsSeguimiento ? t('qrCorto') : null,
    qrCaptionLong: d.qrEsSeguimiento ? t('qrLargo') : null,
    footer: [fecha, d.pie.pedido ? t('pedidoWeb', { numero: d.pie.pedido }) : null, vehiculo].filter(Boolean).join(' · ') || null,
    cutLabel: t('corte'),
  };
}

/** Trabajo que el hook deja para la página `/imprimir/guias`: los textos ya resueltos. */
export interface TrabajoRotulos {
  version: 2;
  creadoEn: number;
  formato: FormatoRotulo;
  rotulos: ShipmentLabelPayload[];
}

export function esTrabajoRotulos(v: unknown): v is TrabajoRotulos {
  if (!v || typeof v !== 'object') return false;
  const t = v as Partial<TrabajoRotulos>;
  return (
    t.version === 2 &&
    esFormatoRotulo(t.formato) &&
    Array.isArray(t.rotulos) &&
    t.rotulos.every((r) => !!r && r.version === 2 && typeof r.guideNumber === 'string' && typeof r.qrData === 'string' && !!r.charge)
  );
}

/**
 * Payload de la estación de impresión (`print_jobs`, tipo `shipment_guide`). `label` lleva los
 * textos y, si se pudo generar, la imagen del rótulo al ancho de esa impresora (`raster`). Sin
 * productos, precios ni el tracking interno: el agente no tiene de dónde sacarlos.
 */
export function payloadAgenteDeRotulo(id: string, textos: ShipmentLabelPayload, raster?: MonochromeRaster | null): ShipmentGuidePrintPayload {
  return {
    shipmentId: id,
    shipmentNumber: textos.guideNumber,
    createdAt: new Date().toISOString(),
    businessName: textos.storeName ?? undefined,
    label: { ...textos, raster: raster ?? null },
  };
}
