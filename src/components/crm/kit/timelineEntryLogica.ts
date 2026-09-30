/**
 * Lógica de `TimelineEntry` (Figma 329:109173, sección Clientes; el CRM lo
 * reutiliza con `Tipo=reunión` y `Tipo=llamada IA`). Sin React.
 *
 * Once tipos: los 9 chips del filtro de la línea de tiempo más venta,
 * reserva y pedido, que vienen de otros módulos. La hora se pinta en la zona
 * de la organización. El menú «⋯» (Editar, Duplicar, Eliminar) solo en las
 * filas que el usuario puede tocar (lo resuelve el servidor: autor o
 * `crm.activities.edit_any`, M8).
 */
import type { TonoBadge } from '@/components/kit/estadoTono';
import { diaRelativo, fechaCortaInstante } from './fechasCrm';

export const TIPOS_ENTRADA = [
  'venta',
  'reserva',
  'pedido',
  'llamada',
  'email',
  'whatsapp',
  'nota',
  'tarea',
  'sistema',
  'reunion',
  'llamadaIa',
] as const;
export type TipoEntrada = (typeof TIPOS_ENTRADA)[number];

/** `activities.activity_type` → tipo de entrada. */
export function tipoDesdeActividad(tipo: string | null | undefined): TipoEntrada {
  switch (tipo) {
    case 'call':
    case 'sms':
      return 'llamada';
    case 'email':
      return 'email';
    case 'whatsapp':
      return 'whatsapp';
    case 'meeting':
    case 'visit':
      return 'reunion';
    case 'note':
      return 'nota';
    case 'task':
      return 'tarea';
    case 'ai_call':
      return 'llamadaIa';
    default:
      return 'sistema';
  }
}

/** Tono del ícono por tipo (tokens del manual, sin hex). */
export const TONO_TIPO: Record<TipoEntrada, TonoBadge> = {
  venta: 'exito',
  reserva: 'informacion',
  pedido: 'informacion',
  llamada: 'marca',
  email: 'marca',
  whatsapp: 'exito',
  nota: 'advertencia',
  tarea: 'informacion',
  sistema: 'neutro',
  reunion: 'marca',
  llamadaIa: 'neutro',
};

export interface EntradaLinea {
  id: string;
  tipo: TipoEntrada;
  titulo: string;
  detalle?: string | null;
  /** Instante (`timestamptz`). */
  ocurrioEn: string | null;
  autor?: string | null;
  estado?: { etiqueta: string; tono: TonoBadge } | null;
  /** Se puede editar/duplicar/eliminar (resuelto en el servidor). */
  editable?: boolean;
}

/** «Hoy 10:24» · «Ayer 18:02» · «20 sep 09:11»: clave + valores. */
export function cuandoEntrada(valor: string | null | undefined, ahora: Date, zona: string, idioma: string): { clave: 'hoy' | 'ayer' | 'fecha'; valores: Record<string, string> } | null {
  const r = diaRelativo(valor, ahora, zona);
  if (!r) return null;
  if (r.tipo === 'hoy') return { clave: 'hoy', valores: { hora: r.hora } };
  if (r.tipo === 'ayer') return { clave: 'ayer', valores: { hora: r.hora } };
  return { clave: 'fecha', valores: { fecha: fechaCortaInstante(valor, zona, idioma), hora: r.hora } };
}
