/**
 * Lógica de `OpportunityCard` (Figma 759:22188). Sin React.
 *
 * Datos de `opportunities` (columnas verificadas por MCP el 2026-09-29):
 * `name`, `amount`, `currency`, `status`, `temperature` (D4: la «prioridad»
 * de la tarjeta es la temperatura), `score_total`, `next_contact_at`,
 * `next_action`, `last_contact_at`, `contact_channel`, `closed_at`,
 * `loss_reason`/`loss_reason_value`. «Días en etapa» sale del último
 * `opportunity_stage_history.changed_at` o, sin historia, de `created_at`.
 */
import type { TonoBadge } from '@/components/kit/estadoTono';
import { diaRelativo, diasDesde, yaPaso, type DiaRelativo } from './fechasCrm';

export type Temperatura = 'cold' | 'warm' | 'hot';

export interface OportunidadTarjeta {
  id: string;
  name: string;
  /** `customers.full_name` del cliente vinculado. */
  clienteNombre?: string | null;
  amount: number | string | null;
  currency: string | null;
  status: 'open' | 'won' | 'lost' | string | null;
  temperature?: string | null;
  score_total?: number | null;
  next_contact_at?: string | null;
  next_action?: string | null;
  last_contact_at?: string | null;
  /** `contact_channel` del último contacto (`whatsapp`, `call`, `email`…). */
  contact_channel?: string | null;
  closed_at?: string | null;
  /** Etiqueta del motivo de pérdida (catálogo `loss_reasons.label`). */
  motivoPerdida?: string | null;
  /** Número del documento al ganar («FV-1042»), si lo hay. */
  documentoGanada?: string | null;
  /** Instante en que entró a la etapa actual. */
  entroEtapaEn?: string | null;
  responsable?: { nombre: string; avatarUrl?: string | null } | null;
  /** Nombre de la etapa (solo densidad lista). */
  etapaNombre?: string | null;
  /** D2 (ola 3B): una de las oportunidades `record_type='lead'` heredadas; se etiqueta «Lead». */
  esLead?: boolean;
}

export type EstadoTarjeta = 'normal' | 'vencida' | 'ganada' | 'perdida';

/** Texto traducible: clave bajo `crm.kit.tarjeta` y sus valores. */
export interface TextoClave {
  clave: string;
  valores?: Record<string, string | number>;
}

export function temperaturaValida(v: string | null | undefined): Temperatura | null {
  return v === 'cold' || v === 'warm' || v === 'hot' ? v : null;
}

/**
 * D4: la «Prioridad» de la tarjeta (Baja · Media · Alta) es la temperatura.
 * Tono del badge del Figma: Alta en advertencia, Media en información, Baja neutra.
 */
export const TONO_PRIORIDAD: Record<Temperatura, TonoBadge> = { cold: 'neutro', warm: 'informacion', hot: 'advertencia' };

export function estadoTarjeta(op: OportunidadTarjeta, ahora: Date): EstadoTarjeta {
  if (op.status === 'won') return 'ganada';
  if (op.status === 'lost') return 'perdida';
  return yaPaso(op.next_contact_at, ahora) ? 'vencida' : 'normal';
}

/** «hoy 10:00» · «mañana 10:00» · «en 3 d» · «vencida hace 2 d». */
function textoRelativo(r: DiaRelativo, vencido: boolean): TextoClave {
  if (vencido) {
    if (r.tipo === 'hoy') return { clave: 'rel.vencidaHoy', valores: { hora: r.hora } };
    const dias = r.tipo === 'ayer' ? 1 : r.tipo === 'pasado' ? r.dias : 0;
    return { clave: 'rel.vencidaHace', valores: { dias } };
  }
  switch (r.tipo) {
    case 'hoy':
      return { clave: 'rel.hoy', valores: { hora: r.hora } };
    case 'manana':
      return { clave: 'rel.manana', valores: { hora: r.hora } };
    case 'ayer':
      return { clave: 'rel.hace', valores: { dias: 1 } };
    case 'futuro':
      return { clave: 'rel.en', valores: { dias: r.dias } };
    default:
      return { clave: 'rel.hace', valores: { dias: r.dias } };
  }
}

export interface VistaTarjeta {
  estado: EstadoTarjeta;
  temperatura: Temperatura | null;
  /** Línea del próximo contacto (o del cierre, si está cerrada). */
  proximo: { accion: string | null; cuando: TextoClave | null; vencido: boolean } | null;
  cierre: TextoClave | null;
  /** «Última: WhatsApp · hace 3 d». */
  ultimo: { canal: string | null; cuando: TextoClave } | null;
  diasEnEtapa: number | null;
}

export function vistaTarjeta(op: OportunidadTarjeta, ahora: Date, zona: string): VistaTarjeta {
  const estado = estadoTarjeta(op, ahora);
  const cerrada = estado === 'ganada' || estado === 'perdida';
  let proximo: VistaTarjeta['proximo'] = null;
  if (!cerrada && (op.next_contact_at || op.next_action)) {
    const r = diaRelativo(op.next_contact_at, ahora, zona);
    const vencido = estado === 'vencida';
    proximo = { accion: op.next_action?.trim() || null, cuando: r ? textoRelativo(r, vencido) : null, vencido };
  }
  let cierre: TextoClave | null = null;
  if (cerrada) {
    const detalle = (estado === 'ganada' ? op.documentoGanada : op.motivoPerdida)?.trim();
    cierre = detalle
      ? { clave: `cierre.${estado}`, valores: { detalle } }
      : { clave: `cierre.${estado}Solo` };
  }
  const rUltimo = cerrada ? null : diaRelativo(op.last_contact_at, ahora, zona);
  return {
    estado,
    temperatura: temperaturaValida(op.temperature),
    proximo,
    cierre,
    ultimo: rUltimo ? { canal: op.contact_channel ?? null, cuando: textoRelativo(rUltimo, false) } : null,
    diasEnEtapa: diasDesde(op.entroEtapaEn, ahora, zona),
  };
}

/** Canal de `contact_channel`/`activity_type` → clave de etiqueta; desconocido → «otro». */
export function claveCanal(canal: string | null | undefined): string {
  switch ((canal ?? '').toLowerCase()) {
    case 'whatsapp':
      return 'whatsapp';
    case 'call':
    case 'phone':
    case 'llamada':
      return 'llamada';
    case 'email':
    case 'correo':
      return 'correo';
    case 'meeting':
    case 'visit':
    case 'reunion':
      return 'reunion';
    case 'sms':
      return 'sms';
    default:
      return 'otro';
  }
}
