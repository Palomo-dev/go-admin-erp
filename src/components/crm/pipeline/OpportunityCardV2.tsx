'use client';

import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { AlarmClock, GripVertical, Mail, MessageCircle, Phone, Calendar, Bot, Clock } from 'lucide-react';
import { cn, formatCurrency } from '@/utils/Utils';
import { translateOpportunityStatus } from '@/utils/crmTranslations';
import { QuickActionsBar } from '@/components/crm/shared/QuickActionsBar';
import { relativeTime } from '@/components/crm/timeline/utils';
import { TemperatureDot } from './TemperatureDot';
import { ScoreBadge } from './ScoreBadge';
import type { KanbanOpportunity } from './hooks/useKanbanBoard';

/**
 * OpportunityCardV2 (FASE-09 §5.2): avatar/iniciales, temperatura, próxima
 * acción (rojo si vencida), última interacción con icono de canal, badges
 * score/ICP, pill won/lost y QuickActionsBar en hover/focus. Drag con handle
 * separado (GripVertical); el clic en la tarjeta abre el drawer (B17).
 */
export interface OpportunityCardV2Props {
  opportunity: KanbanOpportunity;
  index: number;
  onOpen: (id: string) => void;
  compact?: boolean;
}

const CHANNEL_ICON: Record<string, typeof Phone> = { call: Phone, phone: Phone, email: Mail, whatsapp: MessageCircle, meeting: Calendar, ai_call: Bot, voice_ai: Bot };
const CHANNEL_LABEL: Record<string, string> = { call: 'llamada', phone: 'llamada', email: 'email', whatsapp: 'WhatsApp', meeting: 'reunión', ai_call: 'llamada IA', sms: 'SMS', visit: 'visita' };

function initials(name?: string | null): string {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

function OpportunityCardV2Inner({ opportunity: o, index, onOpen, compact }: OpportunityCardV2Props) {
  const won = o.status === 'won';
  const lost = o.status === 'lost';
  const overdue = o.next_contact_at != null && Date.parse(o.next_contact_at) < Date.now() && !won && !lost;
  const LastIcon = o.contact_channel ? CHANNEL_ICON[o.contact_channel] ?? Clock : Clock;
  const customer = o.customer ?? null;

  return (
    <Draggable draggableId={o.id} index={index}>
      {(drag, snapshot) => (
        <div
          ref={drag.innerRef}
          {...drag.draggableProps}
          role="button"
          tabIndex={0}
          aria-label={`Abrir ${o.name}`}
          onClick={() => { if (!snapshot.isDragging) onOpen(o.id); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(o.id); } }}
          className={cn(
            'group relative mb-2 rounded-lg border p-2.5 pl-6 text-left shadow-sm transition-all cursor-pointer outline-none',
            'bg-white dark:bg-gray-800 hover:shadow focus-visible:ring-2 focus-visible:ring-blue-500',
            won ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
              : lost ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700',
            snapshot.isDragging && 'shadow-lg ring-2 ring-blue-400 rotate-[0.5deg]'
          )}
        >
          <span
            {...drag.dragHandleProps}
            aria-label="Arrastrar"
            onClick={(e) => e.stopPropagation()}
            className="absolute left-1 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing p-0.5"
          >
            <GripVertical className="h-4 w-4" />
          </span>

          <div className="flex items-start gap-2">
            <span className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white text-[10px] font-bold flex items-center justify-center overflow-hidden" aria-hidden>
              {customer?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={customer.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : initials(customer?.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{o.name}</h4>
                <TemperatureDot temperature={o.temperature} />
                {(won || lost) && (
                  <span className={cn('text-[10px] rounded-full px-1.5 py-0.5 shrink-0', won ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30' : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30')}>
                    {translateOpportunityStatus(o.status ?? '')}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{customer?.full_name || 'Cliente no especificado'}</p>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={cn('text-sm font-semibold', won ? 'text-green-600 dark:text-green-400' : lost ? 'text-red-500 dark:text-red-400' : 'text-blue-600 dark:text-blue-400')}>
              {formatCurrency(o.amount ?? 0, o.currency || 'COP')}
            </span>
            <div className="flex items-center gap-1">
              <ScoreBadge score={o.score_total} />
              {o.icp_band && <span className="text-[10px] rounded border border-gray-200 dark:border-gray-700 px-1 text-gray-600 dark:text-gray-300">ICP {o.icp_band}</span>}
            </div>
          </div>

          {!compact && (
            <div className="mt-1.5 space-y-0.5 text-[11px]">
              {(o.next_action || o.next_contact_at) && (
                <p className={cn('flex items-center gap-1 truncate', overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-400')}>
                  <AlarmClock className="h-3 w-3 shrink-0" />
                  <span className="truncate">{o.next_action || 'Próximo contacto'}{o.next_contact_at ? ` · ${overdue ? 'vencida' : relativeTime(o.next_contact_at)}` : ''}</span>
                </p>
              )}
              {o.last_contact_at && (
                <p className="flex items-center gap-1 text-gray-500 dark:text-gray-400 truncate">
                  <LastIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">Última: {o.contact_channel ? CHANNEL_LABEL[o.contact_channel] ?? o.contact_channel : 'contacto'} · {relativeTime(o.last_contact_at)}</span>
                </p>
              )}
              {!o.last_contact_at && o.expected_close_date && (
                <p className="flex items-center gap-1 text-gray-500 dark:text-gray-400"><Calendar className="h-3 w-3" />cierra {new Date(o.expected_close_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</p>
              )}
            </div>
          )}

          {/* F9-23: `opacity-0` no impide el clic; sin `pointer-events-none` una
              tarjeta sin hover abría un diálogo en vez del drawer. */}
          <div className="mt-1.5 flex justify-end opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity">
            <QuickActionsBar variant="card" opportunityId={o.id} customerId={o.customer_id ?? undefined} customer={customer} opportunityName={o.name} />
          </div>
        </div>
      )}
    </Draggable>
  );
}

export const OpportunityCardV2 = memo(OpportunityCardV2Inner);
export default OpportunityCardV2;
