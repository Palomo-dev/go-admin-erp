'use client';

/**
 * Catálogo visual de los canales de un paso (brief UX 6.3).
 * Un solo sitio para icono, etiqueta, descripción y color, usado por la lista
 * (mini-línea de tiempo), el editor (línea vertical) y la inscripción.
 *
 * Colores: cada canal lleva icono + texto, nunca solo color (daltonismo).
 * Las parejas fondo/texto cumplen AA en claro y oscuro.
 */

import {
  CheckSquare,
  Clock,
  GitBranch,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  type LucideIcon,
} from 'lucide-react';
import { channelLabel } from '@/lib/services/crm/sequenceTimeline';

export interface ChannelMeta {
  value: string;
  label: string;
  /** Qué hace el paso, para el selector y el lector de pantalla. */
  description: string;
  icon: LucideIcon;
  /** Clases del nodo (fondo + texto) en claro y oscuro. */
  tone: string;
  /** Borde/anillo del nodo, para la línea de tiempo. */
  ring: string;
}

export const CHANNEL_META: Record<string, ChannelMeta> = {
  email: {
    value: 'email',
    label: 'Email',
    description: 'Envía un correo al cliente',
    icon: Mail,
    tone: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-100',
    ring: 'ring-blue-300 dark:ring-blue-700',
  },
  whatsapp: {
    value: 'whatsapp',
    label: 'WhatsApp',
    description: 'Envía un mensaje de WhatsApp al cliente',
    icon: MessageCircle,
    tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100',
    ring: 'ring-emerald-300 dark:ring-emerald-700',
  },
  call: {
    value: 'call',
    label: 'Llamada',
    description: 'Crea una tarea de llamada con guion para el vendedor',
    icon: Phone,
    tone: 'bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-100',
    ring: 'ring-violet-300 dark:ring-violet-700',
  },
  task: {
    value: 'task',
    label: 'Tarea',
    description: 'Crea una tarea interna para el vendedor',
    icon: CheckSquare,
    tone: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
    ring: 'ring-slate-300 dark:ring-slate-600',
  },
  wait: {
    value: 'wait',
    label: 'Espera',
    description: 'No hace nada: solo deja pasar el tiempo',
    icon: Clock,
    tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
    ring: 'ring-gray-300 dark:ring-gray-600',
  },
  condition: {
    value: 'condition',
    label: 'Condición',
    description: 'Bifurcación: si no se cumple, la secuencia se corta aquí',
    icon: GitBranch,
    tone: 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100',
    ring: 'ring-amber-300 dark:ring-amber-700',
  },
  sms: {
    value: 'sms',
    label: 'SMS',
    description: 'Sin proveedor configurado: el paso fallará',
    icon: MessageSquare,
    tone: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-100',
    ring: 'ring-rose-300 dark:ring-rose-700',
  },
};

/** Orden del selector de canal (los útiles primero, SMS al final). */
export const CHANNEL_OPTIONS: ChannelMeta[] = ['email', 'whatsapp', 'call', 'task', 'wait', 'condition', 'sms']
  .map((c) => CHANNEL_META[c]);

const FALLBACK: ChannelMeta = {
  value: 'unknown',
  label: 'Paso',
  description: '',
  icon: CheckSquare,
  tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  ring: 'ring-gray-300 dark:ring-gray-600',
};

export function channelMeta(channel: string): ChannelMeta {
  return CHANNEL_META[channel] ?? { ...FALLBACK, value: channel, label: channelLabel(channel) };
}

const SIZES = {
  sm: { box: 'h-6 w-6', icon: 'h-3.5 w-3.5' },
  md: { box: 'h-9 w-9', icon: 'h-4 w-4' },
} as const;

interface ChannelIconProps {
  channel: string;
  size?: keyof typeof SIZES;
  /** Por defecto el icono es decorativo (el texto va al lado). */
  labelled?: boolean;
  className?: string;
}

/** Nodo redondo con el icono del canal. Una condición se dibuja como rombo. */
export function ChannelIcon({ channel, size = 'md', labelled = false, className = '' }: ChannelIconProps) {
  const meta = channelMeta(channel);
  const Icon = meta.icon;
  const s = SIZES[size];
  const shape = channel === 'condition' ? 'rounded-md rotate-45' : 'rounded-full';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ring-2 ${shape} ${s.box} ${meta.tone} ${meta.ring} ${className}`}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? meta.label : undefined}
      aria-hidden={labelled ? undefined : true}
      title={meta.label}
    >
      <Icon className={`${s.icon} ${channel === 'condition' ? '-rotate-45' : ''}`} aria-hidden="true" />
    </span>
  );
}
