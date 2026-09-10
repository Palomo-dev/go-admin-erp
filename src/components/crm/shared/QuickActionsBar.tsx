'use client';

import { useState, type MouseEvent, type PointerEvent, type ReactElement } from 'react';
import dynamic from 'next/dynamic';
import { Phone, Mail, MessageCircle, Calendar, CheckSquare, StickyNote, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { useSoftphone } from '@/components/voice/SoftphoneProvider';
import {
  getCallModes,
  getQuickActions,
  normalizePhone,
  type CallMode,
  type QuickActionKind,
} from './quickActionsConfig';

/**
 * QuickActionsBar — Llamar (navegador | mi celular | agente IA), Email, WhatsApp,
 * Reunión, Tarea, Nota. Misma barra en tarjeta Kanban (hover), drawer, detalle
 * y clientes/[id] (FASE-09 §5.2). En `card` es icon-only y detiene la
 * propagación para no abrir el drawer ni iniciar el drag (B17).
 */

export type { QuickActionKind } from './quickActionsConfig';

export interface QuickActionsBarProps {
  variant: 'card' | 'drawer' | 'detail';
  opportunityId?: string;
  customerId?: string;
  customer?: { id?: string; full_name?: string | null; email?: string | null; phone?: string | null } | null;
  opportunityName?: string;
  actions?: QuickActionKind[];
  onActionCompleted?: (kind: QuickActionKind, result?: unknown) => void;
  className?: string;
}

const ComposeEmailDialog = dynamic(() => import('./ComposeEmailDialog').then((m) => m.ComposeEmailDialog), { ssr: false });
// F16: compositor definitivo (individual + masivo, ventana 24 h, plantillas HSM y costo).
// Sustituye al provisional de F9, que se elimina. Props compatibles (superconjunto).
const ComposeWhatsAppDialog = dynamic(() => import('@/components/crm/whatsapp/ComposeWhatsAppDialog').then((m) => m.ComposeWhatsAppDialog), { ssr: false });
const MeetingDialog = dynamic(() => import('./MeetingDialog').then((m) => m.MeetingDialog), { ssr: false });
// Diálogo unificado de tarea (compacto + completo). Sustituye a QuickTaskDialog.
const TaskDialog = dynamic(() => import('./TaskDialog').then((m) => m.TaskDialog), { ssr: false });
const QuickNoteDialog = dynamic(() => import('./QuickNoteDialog').then((m) => m.QuickNoteDialog), { ssr: false });
const MobileCallDialog = dynamic(() => import('./MobileCallDialog').then((m) => m.MobileCallDialog), { ssr: false });

/** Lee el softphone si el provider está montado; si no, null (sin lanzar). */
function useOptionalSoftphone() {
  // F3: useSoftphone() es seguro y devuelve { available: false } sin provider.
  const sp = useSoftphone();
  return sp.available ? sp : null;
}

const ICONS: Record<QuickActionKind, typeof Phone> = {
  call: Phone, email: Mail, whatsapp: MessageCircle, meeting: Calendar, task: CheckSquare, note: StickyNote,
};

const COLORS: Record<QuickActionKind, string> = {
  call: 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30',
  email: 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30',
  whatsapp: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30',
  meeting: 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30',
  task: 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
  note: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30',
};

type OpenDialog = 'email' | 'whatsapp' | 'meeting' | 'task' | 'note' | 'mobile' | null;

export function QuickActionsBar({
  variant, opportunityId, customerId, customer, opportunityName, actions, onActionCompleted, className,
}: QuickActionsBarProps) {
  const softphone = useOptionalSoftphone();
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [calling, setCalling] = useState(false);

  const resolvedCustomerId = customerId ?? customer?.id;
  const ctx = {
    customer,
    hasOpportunity: Boolean(opportunityId),
    hasCustomer: Boolean(resolvedCustomerId),
    softphone: softphone ? { deviceState: softphone.deviceState } : null,
    actions,
  };
  const items = getQuickActions(ctx);
  const callModes = getCallModes(ctx);
  const isCard = variant === 'card';

  const stop = (e: MouseEvent | PointerEvent) => {
    e.stopPropagation();
    if (isCard) e.preventDefault();
  };

  const handleCall = async (mode: CallMode) => {
    const to = normalizePhone(customer?.phone);
    if (mode === 'browser') {
      if (!softphone || !to) return;
      setCalling(true);
      try {
        await softphone.makeCall(to, { customerId: resolvedCustomerId, opportunityId });
        toast({ title: 'Llamando…', description: to });
        onActionCompleted?.('call', { mode });
      } catch (err) {
        toast({ title: 'No se pudo iniciar la llamada', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
      } finally {
        setCalling(false);
      }
      return;
    }
    if (mode === 'mobile') setOpenDialog('mobile');
  };

  const done = (kind: QuickActionKind, result?: unknown) => {
    setOpenDialog(null);
    onActionCompleted?.(kind, result);
  };

  const size = isCard ? 'h-7 w-7' : 'h-8';

  return (
    <TooltipProvider delayDuration={200}>
      <div
        role="toolbar"
        aria-label="Acciones rápidas"
        className={cn('flex items-center', isCard ? 'gap-0.5' : 'gap-1.5 flex-wrap', className)}
        onClick={stop}
        onMouseDown={stop}
        onPointerDown={stop}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {items.map((item) => {
          const Icon = ICONS[item.kind];
          const common = cn(size, isCard ? 'p-0' : 'px-2.5 text-xs', 'rounded-md', COLORS[item.kind], !item.enabled && 'opacity-40');
          const inner = (
            <>
              {item.kind === 'call' && calling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
              {!isCard && <span className="ml-1">{item.label}</span>}
              {!isCard && item.kind === 'call' && <ChevronDown className="h-3 w-3 ml-0.5 opacity-70" />}
            </>
          );
          const tip = item.enabled ? item.label : `${item.label}: ${item.reason}`;
          // F9-18: Radix Tooltip sobre un `<button disabled>` no recibe eventos
          // de puntero y el motivo no se veía nunca. Se envuelve en un <span>
          // que sí los recibe (y se anuncia con aria-describedby implícito).
          const wrap = (node: ReactElement): ReactElement =>
            item.enabled ? node : <span className="inline-flex cursor-not-allowed" tabIndex={0} aria-label={tip}>{node}</span>;

          if (item.kind === 'call') {
            return (
              <DropdownMenu key={item.kind} modal={false}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {wrap(
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="sm" className={common} disabled={!item.enabled || calling} aria-label="Llamar">
                          {inner}
                        </Button>
                      </DropdownMenuTrigger>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="top"><p className="text-xs">{tip}</p></TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" onClick={stop} onPointerDown={stop} className="bg-white dark:bg-gray-900">
                  {callModes.map((m) => (
                    <DropdownMenuItem
                      key={m.mode}
                      disabled={!m.enabled}
                      onSelect={() => void handleCall(m.mode)}
                      title={m.enabled ? undefined : m.reason}
                      className="text-sm"
                    >
                      <div className="flex flex-col">
                        <span>{m.label}</span>
                        {!m.enabled && m.reason && <span className="text-[11px] text-gray-500 dark:text-gray-400">{m.reason}</span>}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          return (
            <Tooltip key={item.kind}>
              <TooltipTrigger asChild>
                {wrap(
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={common}
                    disabled={!item.enabled}
                    aria-label={item.label}
                    onClick={(e) => {
                      stop(e);
                      setOpenDialog(item.kind as OpenDialog);
                    }}
                  >
                    {inner}
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent side="top"><p className="text-xs">{tip}</p></TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {openDialog === 'email' && (
        <ComposeEmailDialog open onOpenChange={(o) => !o && setOpenDialog(null)} opportunityId={opportunityId} customerId={resolvedCustomerId} customer={customer} onSent={(r) => done('email', r)} />
      )}
      {openDialog === 'whatsapp' && (
        <ComposeWhatsAppDialog open onOpenChange={(o) => !o && setOpenDialog(null)} opportunityId={opportunityId} customerId={resolvedCustomerId} customer={customer} onSent={(r) => done('whatsapp', r)} />
      )}
      {openDialog === 'meeting' && (
        <MeetingDialog open onOpenChange={(o) => !o && setOpenDialog(null)} opportunityId={opportunityId} customerId={resolvedCustomerId} customer={customer} opportunityName={opportunityName} onCreated={(r) => done('meeting', r)} />
      )}
      {openDialog === 'task' && (
        <TaskDialog open onOpenChange={(o) => !o && setOpenDialog(null)} mode="compact" relatedType={opportunityId ? 'opportunity' : 'customer'} relatedId={(opportunityId ?? resolvedCustomerId) as string} customerId={resolvedCustomerId} onCreated={(r) => done('task', r)} />
      )}
      {openDialog === 'note' && (
        <QuickNoteDialog open onOpenChange={(o) => !o && setOpenDialog(null)} relatedType={opportunityId ? 'opportunity' : 'customer'} relatedId={(opportunityId ?? resolvedCustomerId) as string} onCreated={(r) => done('note', r)} />
      )}
      {openDialog === 'mobile' && (
        <MobileCallDialog open onOpenChange={(o) => !o && setOpenDialog(null)} opportunityId={opportunityId} customerId={resolvedCustomerId} targetPhone={normalizePhone(customer?.phone) ?? ''} customerName={customer?.full_name ?? undefined} onStarted={(r) => done('call', r)} />
      )}
    </TooltipProvider>
  );
}

export default QuickActionsBar;
