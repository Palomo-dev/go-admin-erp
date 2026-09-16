'use client';

import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react';
import type { HealthAlert } from '@/lib/services/crm/healthBands';

/**
 * HealthAlerts (F11 §4.2): motivos de alerta calculados con los campos reales
 * de `fn_customer_health` (`buildHealthAlerts`): cartera vencida, sin
 * actividad N días, sin factura N días. Severidad con icono + texto.
 */
export interface HealthAlertsProps {
  alerts: HealthAlert[];
  className?: string;
  /** Texto cuando no hay alertas (por defecto «Sin alertas»). */
  emptyText?: string;
  /** Una sola línea truncada (tarjetas de la cuadrícula); el texto completo va en `title`. */
  compact?: boolean;
}

const SEVERITY = {
  red: {
    label: 'Crítico',
    box: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/60',
    text: 'text-red-800 dark:text-red-300',
    icon: AlertTriangle,
  },
  yellow: {
    label: 'Atención',
    box: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/60',
    text: 'text-amber-800 dark:text-amber-300',
    icon: CircleAlert,
  },
} as const;

export function HealthAlerts({ alerts, className = '', emptyText = 'Sin alertas: cartera al día y actividad reciente', compact = false }: HealthAlertsProps) {
  // En modo compacto solo se usan <span> (cabe dentro de un <button>).
  const Wrap = compact ? 'span' : 'p';
  if (alerts.length === 0) {
    return (
      <Wrap className={`inline-flex items-center gap-1.5 text-xs text-green-800 dark:text-green-300 ${className}`}>
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {emptyText}
      </Wrap>
    );
  }
  if (compact) {
    const a = alerts[0];
    const s = SEVERITY[a.severity];
    const Icon = s.icon;
    const rest = alerts.length - 1;
    return (
      <span className={`flex items-center gap-1.5 text-xs ${s.text} ${className}`} title={alerts.map((x) => `${SEVERITY[x.severity].label}: ${x.message}`).join(' · ')}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate"><span className="font-semibold">{s.label}: </span>{a.message}</span>
        {rest > 0 && <span className="shrink-0 text-gray-600 dark:text-gray-400">+{rest}</span>}
      </span>
    );
  }
  return (
    <ul className={`space-y-1.5 ${className}`} aria-label={`${alerts.length} alertas de salud`}>
      {alerts.map((a) => {
        const s = SEVERITY[a.severity];
        const Icon = s.icon;
        return (
          <li key={a.code} className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs ${s.box} ${s.text}`}>
            <Icon className="h-4 w-4 shrink-0 mt-px" aria-hidden="true" />
            <span className="min-w-0">
              <span className="font-semibold">{s.label}: </span>
              {a.message}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default HealthAlerts;
