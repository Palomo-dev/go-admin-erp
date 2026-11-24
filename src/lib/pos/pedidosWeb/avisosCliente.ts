/**
 * Avisos al cliente de los pedidos web (Figma «Pedidos online — avisos al
 * cliente (Nuevo)», 464:241316): seis momentos con interruptor por canal.
 *
 * Puro (sin Supabase ni Next): lo comparten la pantalla de configuración, la
 * ruta que guarda los ajustes, el envío del servidor y los tests.
 */
import { z } from 'zod';
import type { EstimacionEnZona } from '@/lib/utils/dateDisplay';

export const MOMENTOS_AVISO = ['recibido', 'confirmado', 'listo', 'en_camino', 'entregado', 'rechazado'] as const;
export type MomentoAviso = (typeof MOMENTOS_AVISO)[number];

export const CANALES_AVISO = ['email', 'whatsapp'] as const;
export type CanalAviso = (typeof CANALES_AVISO)[number];

export const ESTADOS_REGISTRO_AVISO = ['queued', 'sent', 'delivered', 'failed', 'no_data'] as const;
export type EstadoRegistroAviso = (typeof ESTADOS_REGISTRO_AVISO)[number];

export type MomentosAviso = Record<MomentoAviso, Record<CanalAviso, boolean>>;

export interface AjustesAvisos {
  momentos: MomentosAviso;
  nombreVisible: string | null;
  responderA: string | null;
  whatsapp: string | null;
}

/** Los valores del Figma (464:241318) cuando la organización no ha guardado nada. */
export const MOMENTOS_POR_DEFECTO: MomentosAviso = {
  recibido: { email: true, whatsapp: false },
  confirmado: { email: true, whatsapp: true },
  listo: { email: true, whatsapp: true },
  en_camino: { email: false, whatsapp: true },
  entregado: { email: true, whatsapp: false },
  rechazado: { email: true, whatsapp: true },
};

export const AJUSTES_POR_DEFECTO: AjustesAvisos = {
  momentos: MOMENTOS_POR_DEFECTO,
  nombreVisible: null,
  responderA: null,
  whatsapp: null,
};

/**
 * Momento del aviso según el estado del pedido. `preparing` no es un momento
 * propio: el cliente ya recibió «confirmado» con la hora en que estará listo.
 */
export function momentoDeEstado(estado: string | null | undefined): MomentoAviso | null {
  switch (estado) {
    case 'pending':
      return 'recibido';
    case 'confirmed':
      return 'confirmado';
    case 'ready':
      return 'listo';
    case 'in_delivery':
      return 'en_camino';
    case 'delivered':
      return 'entregado';
    case 'cancelled':
    case 'rejected':
      return 'rechazado';
    default:
      return null;
  }
}

/** Normaliza el jsonb guardado: claves desconocidas fuera, las que falten con el valor por defecto. */
export function normalizarMomentos(valor: unknown): MomentosAviso {
  const fuente = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const out = {} as MomentosAviso;
  for (const m of MOMENTOS_AVISO) {
    const fila = fuente[m] && typeof fuente[m] === 'object' ? (fuente[m] as Record<string, unknown>) : {};
    out[m] = {
      email: typeof fila.email === 'boolean' ? fila.email : MOMENTOS_POR_DEFECTO[m].email,
      whatsapp: typeof fila.whatsapp === 'boolean' ? fila.whatsapp : MOMENTOS_POR_DEFECTO[m].whatsapp,
    };
  }
  return out;
}

const canales = z.object({ email: z.boolean(), whatsapp: z.boolean() }).strict();

export const ajustesAvisosSchema = z
  .object({
    momentos: z.object(Object.fromEntries(MOMENTOS_AVISO.map((m) => [m, canales])) as Record<MomentoAviso, typeof canales>).strict(),
    nombreVisible: z.string().trim().min(1).max(80).nullable(),
    responderA: z.string().trim().email().max(200).nullable(),
    whatsapp: z.string().trim().regex(/^\+?[0-9 ()-]{7,30}$/).nullable(),
  })
  .strict();

/** Variables de la plantilla (las chips de la vista previa 465:85523). */
export const VARIABLES_PLANTILLA = ['cliente', 'numero', 'listo_aprox', 'entrega_aprox', 'lineas', 'total', 'sucursal', 'motivo', 'conductor'] as const;

export interface DatosAviso {
  cliente: string;
  numero: string;
  negocio: string;
  sucursal?: string | null;
  /** Promesas en la zona de la org (con día): nunca solo la hora. */
  listoAprox?: EstimacionEnZona | null;
  entregaAprox?: EstimacionEnZona | null;
  zonaHoraria?: string | null;
  /** Restaurante prepara; una tienda alista para envío o para recoger. Sin dato: redacción de restaurante. */
  rubro?: 'restaurante' | 'tienda' | null;
  lineas?: string | null;
  total?: string | null;
  pagado?: boolean;
  motivo?: string | null;
  conductor?: string | null;
  url?: string | null;
  /**
   * Logística Fase 1 (Figma 2805:5220): contraentrega propia. El código de entrega solo viaja en el
   * aviso «en camino» y solo si el envío es contraentrega (lo emite la base); `pagaAlRecibir` es el
   * valor ya formateado en la moneda del pedido.
   */
  codigoEntrega?: string | null;
  pagaAlRecibir?: string | null;
  /** «Entregado»: quién recibió y cómo pagó en la puerta (ya traducido). */
  recibio?: string | null;
  medioCobro?: string | null;
}

/** Momentos de envío que avisa logística (`web_order_notices.moment`); `novedad` no tiene interruptor propio. */
export const MOMENTOS_AVISO_ENVIO = ['en_camino', 'entregado', 'novedad'] as const;
export type MomentoAvisoEnvio = (typeof MOMENTOS_AVISO_ENVIO)[number];

/** Motivo de la novedad en palabras del cliente (`shipments.exception_reason`). */
export const MOTIVO_NOVEDAD_CLIENTE: Record<string, string> = {
  not_home: 'no había nadie para recibirlo',
  wrong_address: 'la dirección no corresponde',
  incomplete_address: 'faltan datos en la dirección',
  rejected: 'el pedido fue rechazado al entregarlo',
  damaged: 'el paquete se dañó',
  lost: 'el paquete se extravió',
  access_denied: 'no nos dejaron entrar',
  business_closed: 'el lugar estaba cerrado',
  weather: 'el clima no lo permitió',
  vehicle_issue: 'tuvimos un problema con el vehículo',
  customer_request: 'nos pediste cambiar la entrega',
  other: 'tuvimos un inconveniente',
};

export function motivoNovedadCliente(codigo: string | null | undefined): string {
  return (codigo && MOTIVO_NOVEDAD_CLIENTE[codigo]) || MOTIVO_NOVEDAD_CLIENTE.other;
}

/** Rubro para la redacción a partir de `organization_types.name`: solo `restaurant` prepara. */
export function rubroDeTipoOrg(nombreTipo: string | null | undefined): DatosAviso['rubro'] {
  if (!nombreTipo) return null;
  return nombreTipo === 'restaurant' ? 'restaurante' : 'tienda';
}

/**
 * Promesa redactada para una frase: "hoy alrededor de las 14:26",
 * "mañana alrededor de las 14:26" o "alrededor del mié 11 nov a las 14:26".
 */
export function fraseEstimacion(e: EstimacionEnZona): string {
  return e.relativo ? `${e.relativo} alrededor de las ${e.hora}` : `alrededor del ${e.fecha} a las ${e.hora}`;
}

/** Texto del aviso por WhatsApp (y versión de texto del correo), por momento. */
export function textoAviso(momento: MomentoAviso, d: DatosAviso): string {
  const nombre = d.cliente.trim().split(/\s+/)[0] || 'cliente';
  const pie = [d.negocio, d.sucursal].filter(Boolean).join(' · ');
  const partes: string[] = [`Hola ${nombre},`];
  switch (momento) {
    case 'recibido':
      partes.push(`Recibimos tu pedido ${d.numero}. Te avisamos en cuanto lo confirmemos.`);
      break;
    case 'confirmado': {
      partes.push(d.rubro === 'tienda' ? `Ya estamos alistando tu pedido ${d.numero}.` : `Ya estamos preparando tu pedido ${d.numero}.`);
      const horas = [
        d.listoAprox ? `Estará listo ${fraseEstimacion(d.listoAprox)}` : null,
        d.entregaAprox ? `llegará a tu dirección ${fraseEstimacion(d.entregaAprox)}` : null,
      ].filter(Boolean).join(' y ');
      if (horas) partes.push(`${horas}${d.zonaHoraria ? ` (${d.zonaHoraria})` : ''}.`);
      break;
    }
    case 'listo':
      partes.push(`Tu pedido ${d.numero} está listo. Ya puedes recogerlo o sale para tu dirección.`);
      break;
    case 'en_camino':
      partes.push(d.conductor ? `${d.conductor} lleva tu pedido ${d.numero}.` : `Tu pedido ${d.numero} va en camino.`);
      if (d.entregaAprox) partes.push(`Llega ${fraseEstimacion(d.entregaAprox)}${d.zonaHoraria ? ` (${d.zonaHoraria})` : ''}.`);
      // Contraentrega (Figma 2805:5220): el código y el valor a pagar en la puerta.
      if (d.codigoEntrega) partes.push(`Tu código de entrega es ${d.codigoEntrega}. Dáselo a quien te entregue.`);
      if (d.pagaAlRecibir) partes.push(`Pagas al recibir: ${d.pagaAlRecibir}.`);
      break;
    case 'entregado':
      partes.push(
        d.recibio
          ? `Tu pedido ${d.numero} fue entregado y lo recibió ${d.recibio}. Gracias por tu compra.`
          : `Gracias por tu compra. Tu pedido ${d.numero} fue entregado.`,
      );
      if (d.pagaAlRecibir) partes.push(`Pagaste ${d.pagaAlRecibir}${d.medioCobro ? ` en ${d.medioCobro}` : ''}.`);
      break;
    case 'rechazado':
      partes.push(`No pudimos atender tu pedido ${d.numero}.${d.motivo ? ` Motivo: ${d.motivo}.` : ''} Si ya pagaste, te devolvemos el dinero.`);
      break;
  }
  if (d.lineas && (momento === 'confirmado' || momento === 'recibido')) {
    partes.push(`${d.lineas}${d.total ? `\n${d.pagado ? 'Total pagado' : 'Total'}: ${d.total}` : ''}`);
  }
  if (d.url) partes.push(`Sigue tu pedido aquí: ${d.url}`);
  partes.push(momento === 'confirmado' ? 'Si algo cambia te avisamos por aquí mismo.' : '');
  if (pie) partes.push(pie);
  return partes.filter(Boolean).join('\n\n');
}

/** Asunto del correo por momento (vista previa y envío). */
export function asuntoAviso(momento: MomentoAviso, numero: string): string {
  switch (momento) {
    case 'recibido':
      return `Recibimos tu pedido ${numero}`;
    case 'confirmado':
      return `Tu pedido ${numero} está confirmado`;
    case 'listo':
      return `Tu pedido ${numero} está listo`;
    case 'en_camino':
      return `Tu pedido ${numero} va en camino`;
    case 'entregado':
      return `Gracias por tu compra · pedido ${numero}`;
    case 'rechazado':
      return `No pudimos atender tu pedido ${numero}`;
  }
}

export interface DatosNovedad {
  cliente: string;
  numero: string;
  negocio: string;
  /** Código de `shipments.exception_reason` (se dice en palabras del cliente). */
  motivo: string | null;
  /** «mañana», «el jue 26 nov»: día del nuevo intento ya formateado; null = la tienda te contacta. */
  nuevoIntento?: string | null;
  url?: string | null;
}

/** Aviso «novedad» (Figma 2805:5220): no pudimos entregar, por qué y qué sigue. */
export function textoAvisoNovedad(d: DatosNovedad): string {
  const nombre = d.cliente.trim().split(/\s+/)[0] || 'cliente';
  const partes = [
    `Hola ${nombre},`,
    `Pasamos a entregar tu pedido ${d.numero} y no pudimos: ${motivoNovedadCliente(d.motivo)}.`,
    d.nuevoIntento ? `Lo intentamos de nuevo ${d.nuevoIntento}.` : 'Te contactamos para acordar una nueva entrega.',
    d.url ? `Si quieres cambiar la dirección o la hora, respóndenos aquí o entra a ${d.url}` : 'Si quieres cambiar la dirección o la hora, respóndenos aquí.',
    d.negocio,
  ];
  return partes.filter(Boolean).join('\n\n');
}

export function asuntoAvisoNovedad(numero: string): string {
  return `No pudimos entregar tu pedido ${numero}`;
}
