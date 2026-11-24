'use client';

/**
 * Celdas compartidas de la lista y del historial de automatizaciones (Figma
 * 1373:17 y 1373:1161): «Cuando» con su icono, «Acciones» resumidas y la fecha
 * corta «Hoy 10:12 / Ayer 17:22 / 27/09 9:14» en la zona de la organización.
 */

import { useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Bell,
  Bot,
  CalendarClock,
  ClipboardList,
  Clock,
  Columns3,
  GitBranch,
  Hand,
  Mail,
  MessageSquare,
  PencilLine,
  Phone,
  Plus,
  Timer,
  Webhook,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { diaRelativo } from '@/components/crm/kit/fechasCrm';
import { cn } from '@/utils/Utils';
import { claveCuando, iconoCuando, tiposDeAcciones, type IconoCuando } from '@/lib/services/crm/automation/automationListaLogica';

const ICONO_CUANDO: Record<IconoCuando, LucideIcon> = {
  etapa: Columns3,
  crear: Plus,
  llamada: Phone,
  correo: Mail,
  whatsapp: MessageSquare,
  tarea: Clock,
  campo: PencilLine,
  programada: CalendarClock,
  manual: Hand,
  sla: Timer,
  evento: Zap,
};

const ICONO_ACCION: Record<string, LucideIcon> = {
  create_task: ClipboardList,
  create_activity: ClipboardList,
  send_email: Mail,
  send_whatsapp: MessageSquare,
  send_sms: MessageSquare,
  notify_user: Bell,
  enroll_sequence: GitBranch,
  unenroll_sequence: GitBranch,
  move_stage: Columns3,
  update_field: PencilLine,
  start_ai_agent: Bot,
  ai_draft_email: Bot,
  book_meeting_request: CalendarClock,
  webhook_out: Webhook,
};

export function iconoAccion(tipo: string): LucideIcon {
  return ICONO_ACCION[tipo] ?? Zap;
}

type ReglaCelda = { trigger_type: string; event?: string | null; actions?: ReadonlyArray<{ type?: unknown }> | null };

/** Texto corto del disparador («Cambia de etapa», «WhatsApp entrante»). */
export function useTextoCuando(): (rule: ReglaCelda) => string {
  const t = useTranslations('crm.automatizaciones.lista.cuando');
  return useCallback(
    (rule) => {
      const clave = claveCuando(rule);
      return t.has(clave) ? t(clave) : rule.event || rule.trigger_type;
    },
    [t],
  );
}

export function CeldaCuando({ rule }: { rule: ReglaCelda }) {
  const texto = useTextoCuando();
  const Icono = ICONO_CUANDO[iconoCuando(rule)];
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-fg">
      <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      <span className="truncate">{texto(rule)}</span>
    </span>
  );
}

/** «Crear tarea + correo»: la primera acción con verbo, las demás como sustantivo. */
export function useTextoAcciones(): (actions: ReglaCelda['actions']) => string {
  const t = useTranslations('crm.automatizaciones.lista.acciones');
  return useCallback(
    (actions) => {
      const tipos = tiposDeAcciones(actions);
      if (tipos.length === 0) return t('ninguna');
      const primera = t.has(`primera.${tipos[0]}`) ? t(`primera.${tipos[0]}`) : tipos[0];
      const resto = tipos.slice(1).map((x) => (t.has(`siguiente.${x}`) ? t(`siguiente.${x}`) : x));
      return [primera, ...resto].join(' + ');
    },
    [t],
  );
}

export function CeldaAcciones({ actions, conError }: { actions: ReglaCelda['actions']; conError?: boolean }) {
  const texto = useTextoAcciones();
  const tipos = tiposDeAcciones(actions);
  const Icono = conError ? AlertTriangle : iconoAccion(tipos[0] ?? '');
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-fg">
      <Icono aria-hidden="true" className={cn('size-4 shrink-0', conError ? 'text-danger-text' : 'text-fg-secondary')} strokeWidth={1.5} />
      <span className="truncate">{texto(actions)}</span>
    </span>
  );
}

/** «Hoy 10:12», «Ayer 17:22» o «27/09 9:14», en la zona de la organización. */
export function useFechaCorta(): (valor: string | null | undefined) => string {
  const t = useTranslations('crm.automatizaciones.lista');
  const { timezone } = useFormatDate();
  const locale = useLocale();
  return useCallback(
    (valor) => {
      if (!valor) return '';
      const rel = diaRelativo(valor, new Date(), timezone);
      if (!rel) return '';
      if (rel.tipo === 'hoy') return t('hoy', { hora: rel.hora });
      if (rel.tipo === 'ayer') return t('ayer', { hora: rel.hora });
      return `${formatDateInTz(valor, timezone, { locale, day: '2-digit', month: '2-digit' })} ${rel.hora}`;
    },
    [t, timezone, locale],
  );
}
