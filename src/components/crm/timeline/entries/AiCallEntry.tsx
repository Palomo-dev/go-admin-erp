'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CallPlayer } from '@/components/voice/CallPlayer';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';
import { formatDuration } from '../utils';

/**
 * AiCallEntry — agente, resultado, duración/turnos, conversación colapsable
 * (voice_agent_calls.conversation_log) y player si hay grabación.
 * `voice_agent_tool_runs` no existe aún en BD (F6); se mostrará al crearse.
 */
type AiLike = Extract<TimelineEntry, { kind: 'ai_call' }>;

interface Turn { role?: string; speaker?: string; content?: string; text?: string; at?: string; timestamp?: string }

const STATUS_LABEL: Record<string, string> = { pending: 'Pendiente', in_progress: 'En curso', completed: 'Completada', failed: 'Fallida', transferred: 'Transferida' };

export function AiCallEntry({ entry, compact }: { entry: AiLike; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const v = entry.voice_agent_call;
  const call = entry.call;
  const log: Turn[] = Array.isArray(v?.conversation_log) ? (v!.conversation_log as Turn[]) : Array.isArray((v?.conversation_log as { turns?: Turn[] } | null)?.turns) ? ((v!.conversation_log as { turns: Turn[] }).turns) : [];
  const duration = v?.duration_seconds ?? call?.duration_seconds ?? entry.activity?.duration_seconds ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="font-medium text-gray-900 dark:text-gray-100">Llamada del agente IA{v?.agent?.name ? ` · ${v.agent.name}` : ''}</span>
        {v?.status && <Badge variant={v.status === 'completed' ? 'success' : v.status === 'failed' ? 'destructive' : 'info'} className="text-[11px]">{STATUS_LABEL[v.status] ?? v.status}</Badge>}
        {(v?.outcome || entry.activity?.outcome) && <Badge variant="secondary" className="text-[11px]">{v?.outcome ?? entry.activity?.outcome}</Badge>}
        {duration != null && duration > 0 && <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{formatDuration(duration)}</span>}
        {v && v.turns_count > 0 && <span className="text-xs text-gray-500 dark:text-gray-400">{v.turns_count} turnos</span>}
      </div>
      {entry.activity?.notes && !compact && <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-4">{entry.activity.notes}</p>}
      {call?.recording_enabled && call.recording && <CallPlayer callId={call.id} recordingEnabled className="max-w-md" />}
      {log.length > 0 && (
        <div>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}Conversación ({log.length} turnos)
          </button>
          {open && (
            <ul className="mt-1.5 max-h-72 overflow-y-auto space-y-1">
              {log.map((t, i) => {
                const role = (t.role ?? t.speaker ?? '').toLowerCase();
                const isAgent = role === 'assistant' || role === 'agent' || role === 'ai';
                return (
                  <li key={i} className={`text-xs ${isAgent ? 'text-violet-700 dark:text-violet-300' : 'text-gray-800 dark:text-gray-200'}`}>
                    <span className="font-semibold mr-1">{isAgent ? 'Agente IA' : 'Cliente'}:</span>{t.content ?? t.text ?? ''}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
