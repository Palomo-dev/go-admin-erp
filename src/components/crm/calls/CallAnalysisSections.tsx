'use client';

/**
 * Sub-secciones del CallAnalysisPanel: score con desglose, objeciones y discovery.
 */

import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { AnalysisDto } from './useCallIntelligence';

const BREAKDOWN_LABELS: Record<string, string> = {
  greeting: 'Apertura',
  discovery: 'Discovery',
  pitch: 'Pitch',
  objection_handling: 'Objeciones',
  closing: 'Cierre',
  professionalism: 'Profesionalismo',
};

function scoreColor(v: number): string {
  if (v >= 80) return 'text-green-700 dark:text-green-300';
  if (v >= 50) return 'text-yellow-700 dark:text-yellow-300';
  return 'text-red-700 dark:text-red-300';
}

export function AnalysisScore({ analysis }: { analysis: AnalysisDto }) {
  if (analysis.quality_score === null) return null;
  const bd = analysis.quality_breakdown ?? {};
  return (
    <div className="rounded-md border border-gray-100 p-2 dark:border-gray-700">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Calidad</span>
        <span className={cn('text-lg font-bold tabular-nums', scoreColor(analysis.quality_score))}>{analysis.quality_score}/100</span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-3">
        {Object.entries(BREAKDOWN_LABELS).map(([k, label]) =>
          typeof bd[k] === 'number' ? (
            <div key={k} className="flex items-center justify-between gap-2">
              <span>{label}</span>
              <span className="flex items-center gap-1 tabular-nums">
                <span className="h-1.5 w-12 overflow-hidden rounded bg-gray-200 dark:bg-gray-700" aria-hidden>
                  <span className="block h-full rounded bg-blue-500 dark:bg-blue-400" style={{ width: `${Math.min(100, bd[k])}%` }} />
                </span>
                {bd[k]}
              </span>
            </div>
          ) : null,
        )}
      </div>
      <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
        Habla agente {Math.round((analysis.talk_ratio_agent ?? 0) * 100)} % / cliente {Math.round((analysis.talk_ratio_customer ?? 0) * 100)} %
        {typeof analysis.questions_asked === 'number' && ` · ${analysis.questions_asked} preguntas`}
        {typeof analysis.longest_monologue_seconds === 'number' && ` · monólogo máx. ${analysis.longest_monologue_seconds}s`}
      </p>
    </div>
  );
}

export function AnalysisObjections({ analysis, catalog }: { analysis: AnalysisDto; catalog: Array<{ id: string; title: string; recommended_response: string | null }> }) {
  const list = analysis.detected_objections ?? [];
  if (list.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Objeciones</h4>
      <ul className="space-y-1">
        {list.map((o, i) => {
          const cat = o.objection_id ? catalog.find((c) => c.id === o.objection_id) : null;
          return (
            <li key={i} className="rounded border border-red-100 bg-red-50/60 px-2 py-1 text-xs dark:border-red-900/60 dark:bg-red-900/10">
              <span className="font-medium text-red-800 dark:text-red-200">{cat?.title ?? o.label}</span>
              {o.quote && <span className="text-gray-600 dark:text-gray-300"> — “{o.quote}”</span>}
              <span className="text-gray-400"> ({Math.round(o.confidence * 100)} %)</span>
              {cat?.recommended_response && <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Respuesta sugerida: {cat.recommended_response}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const DISCOVERY_LABELS: Record<string, string> = {
  budget: 'Presupuesto',
  authority: 'Autoridad',
  need: 'Necesidad',
  timeline: 'Plazo',
  goals: 'Objetivos',
  obstacles: 'Obstáculos',
  consequences: 'Consecuencias',
};

export function AnalysisDiscovery({ analysis, applied }: { analysis: AnalysisDto; applied: boolean }) {
  const d = analysis.discovery_fields ?? {};
  const entries = Object.entries(DISCOVERY_LABELS).filter(([k]) => d[k]);
  if (entries.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
        Discovery {applied && <CheckCircle2 size={12} className="text-green-600 dark:text-green-400" aria-label="Aplicado a la oportunidad" />}
      </h4>
      <dl className="grid grid-cols-1 gap-x-3 gap-y-0.5 text-xs sm:grid-cols-2">
        {entries.map(([k, label]) => (
          <div key={k} className="flex gap-1">
            <dt className="shrink-0 font-medium text-gray-500 dark:text-gray-400">{label}:</dt>
            <dd className="text-gray-700 dark:text-gray-200">{d[k]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
