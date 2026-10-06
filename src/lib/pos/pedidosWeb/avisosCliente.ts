/**
 * Avisos al cliente de los pedidos web (Figma «Pedidos online — avisos al
 * cliente (Nuevo)», 464:241316): seis momentos con interruptor por canal.
 *
 * Puro (sin Supabase ni Next): lo comparten la pantalla de configuración, la
 * ruta que guarda los ajustes, el envío del servidor y los tests.
 */
import { z } from 'zod';

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
  listoAprox?: string | null;
  entregaAprox?: string | null;
  zonaHoraria?: string | null;
  lineas?: string | null;
  total?: string | null;
  pagado?: boolean;
  motivo?: string | null;
  conductor?: string | null;
  url?: string | null;
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
      partes.push(`Ya estamos preparando tu pedido ${d.numero}.`);
      const horas = [
        d.listoAprox ? `Estará listo alrededor de las ${d.listoAprox}` : null,
        d.entregaAprox ? `llegará a tu dirección alrededor de las ${d.entregaAprox}` : null,
      ].filter(Boolean).join(' y ');
      if (horas) partes.push(`${horas}${d.zonaHoraria ? ` (${d.zonaHoraria})` : ''}.`);
      break;
    }
    case 'listo':
      partes.push(`Tu pedido ${d.numero} está listo. Ya puedes recogerlo o sale para tu dirección.`);
      break;
    case 'en_camino':
      partes.push(d.conductor ? `${d.conductor} lleva tu pedido ${d.numero}.` : `Tu pedido ${d.numero} va en camino.`);
      if (d.entregaAprox) partes.push(`Llega alrededor de las ${d.entregaAprox}.`);
      break;
    case 'entregado':
      partes.push(`Gracias por tu compra. Tu pedido ${d.numero} fue entregado.`);
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
