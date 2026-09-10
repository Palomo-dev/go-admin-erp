'use client';

/**
 * ComposeWhatsAppDialog (FASE-16 §5.2) — individual y masivo.
 * Individual: canal · ventana 24 h · Texto | Plantilla · adjunto · programar → POST /api/crm/whatsapp/send.
 * Masivo (`mode='bulk'`, `recipients`): crea campaña `manual` → materialize → launch.
 *
 * Sustituye a la v1 de F9 (src/components/crm/shared/ComposeWhatsAppDialog.tsx):
 * en QuickActionsBar cambiar el import dinámico a
 *   dynamic(() => import('@/components/crm/whatsapp/ComposeWhatsAppDialog').then((m) => m.ComposeWhatsAppDialog))
 * (mismas props: open, onOpenChange, opportunityId, customerId, customer, conversationId, channelId, onSent).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, MessageCircle, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { ChannelSelect } from './compose/ChannelSelect';
import { WindowBadge } from './compose/WindowBadge';
import { MessageForm } from './compose/MessageForm';
import { TemplatePicker } from './compose/TemplatePicker';
import { BubblePreview } from './compose/BubblePreview';
import { BulkAudience, type BulkRecipient } from './compose/BulkAudience';
import { useWhatsAppCompose } from './compose/useWhatsAppCompose';
import { useBulkSend } from './compose/useBulkSend';
import { ApiError } from './api';

export interface ComposeWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: 'single' | 'bulk';
  opportunityId?: string;
  customerId?: string;
  customer?: { id?: string; full_name?: string | null; first_name?: string | null; phone?: string | null } | null;
  conversationId?: string;
  channelId?: string;
  recipients?: BulkRecipient[];
  onSent?: (result: { message_id?: string; conversation_id?: string; campaign_id?: string; scheduled?: boolean }) => void;
}

export function ComposeWhatsAppDialog(props: ComposeWhatsAppDialogProps) {
  const { open, onOpenChange, opportunityId, customer, conversationId, onSent } = props;
  const mode = props.mode ?? 'single';
  const customerId = props.customerId ?? customer?.id ?? (mode === 'bulk' ? props.recipients?.[0]?.customerId : undefined) ?? null;
  const c = useWhatsAppCompose({ customerId: mode === 'single' ? customerId : null, opportunityId: mode === 'single' ? opportunityId ?? null : null, conversationId: conversationId ?? null, channelId: props.channelId ?? null, enabled: open });
  const bulk = useBulkSend({ recipients: props.recipients ?? [], channelId: c.channelId, templateId: c.templateId, text: c.text, tab: c.tab, purpose: c.preview?.category === 'marketing' ? 'marketing' : 'utility', enabled: open && mode === 'bulk' });
  const [outsideHours, setOutsideHours] = useState<string | null>(null);
  const firstName = customer?.first_name ?? customer?.full_name?.split(' ')[0] ?? null;

  useEffect(() => { if (!open) setOutsideHours(null); }, [open]);

  const textDisabledReason = useMemo(() => {
    if (!c.window) return undefined;
    if (!c.window.can_contact) return 'Este contacto pidió no recibir WhatsApp';
    if (!c.window.is_open && c.window.channel.provider !== 'baileys') return 'Han pasado más de 24 h desde su último mensaje: usa una plantilla';
    return undefined;
  }, [c.window]);

  const previewBody = c.tab === 'template' ? c.preview?.body ?? '' : c.text.replace(/\{\{\s*contact\.first_name[^}]*\}\}/g, firstName ?? 'cliente');

  const handleSend = async (force = false) => {
    try {
      if (mode === 'bulk') {
        const r = await bulk.launch();
        toast({ title: 'Campaña lanzada', description: `${r.pending} mensajes en cola. Sigue el progreso en Campañas.` });
        onSent?.({ campaign_id: r.campaign_id });
        onOpenChange(false);
        return;
      }
      const r = await c.send({ force });
      toast({ title: r.scheduled ? 'WhatsApp programado' : 'WhatsApp enviado', description: r.scheduled ? 'Se enviará a la hora indicada.' : 'Se despacha por el canal seleccionado; verás el estado en el timeline.' });
      onSent?.({ message_id: r.message_id, conversation_id: r.conversation_id, scheduled: r.scheduled });
      onOpenChange(false);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.code === 'OUTSIDE_HOURS') { setOutsideHours((err.details as { next_slot?: string } | null)?.next_slot ?? null); return; }
      toast({ title: 'No se pudo enviar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    }
  };

  const busy = c.sending || bulk.busy;
  // El envío masivo crea y LANZA una campaña, y `POST /campaigns/[id]/launch`
  // exige admin de organización: sin ese rol el botón se deshabilita y se
  // explica, en vez de fallar con un 403 al pulsarlo (tester r1 · fallo 8).
  const needsAdmin = mode === 'bulk' && !c.loadingChannels && !c.canManage;
  const canSend = mode === 'bulk'
    ? !needsAdmin && bulk.canLaunch && (c.tab === 'template' ? !!c.templateId : c.text.trim().length > 0)
    : c.canSend;
  const noChannel = !c.loadingChannels && c.channels.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl bg-white dark:bg-gray-900 max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <MessageCircle className="h-5 w-5 text-emerald-500" aria-hidden="true" />
            {mode === 'bulk' ? `WhatsApp masivo a ${props.recipients?.length ?? 0} contactos` : `WhatsApp a ${customer?.full_name ?? 'cliente'}${c.window?.recipient ? ` (+${c.window.recipient})` : customer?.phone ? ` (${customer.phone})` : ''}`}
          </DialogTitle>
          <DialogDescription>{mode === 'bulk' ? 'Se crea una campaña con la selección y se lanza al instante.' : 'Queda en el timeline de la oportunidad y en la bandeja de chat.'}</DialogDescription>
        </DialogHeader>

        {noChannel ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm">
            <p className="font-medium">Conecta un canal de WhatsApp</p>
            <Link href="/app/chat/canales" className="text-blue-600 dark:text-blue-400 hover:underline text-xs">Ir a Chat › Canales</Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]"><ChannelSelect channels={c.channels} value={c.channelId} onChange={c.setChannelId} loading={c.loadingChannels} disabled={!!props.channelId || busy} /></div>
                {mode === 'single' && <WindowBadge window={c.window} error={c.windowError} />}
              </div>
              {c.window && !c.window.can_contact && (
                <div role="alert" className="rounded-md bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-xs p-2 flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />Este contacto pidió no recibir WhatsApp (opt-out). Un administrador puede registrar consentimiento manual desde la ficha del cliente.</div>
              )}
              {outsideHours && (
                <div role="alert" className="rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 text-xs p-2 space-y-1">
                  <p>Fuera del horario permitido de contacto.</p>
                  <div className="flex gap-2">
                    {outsideHours && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => { c.setScheduledAt(outsideHours); setOutsideHours(null); void handleSend(); }}>Programar para {new Date(outsideHours).toLocaleString('es-CO', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</Button>}
                    {c.preview?.category !== 'marketing' && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void handleSend(true)}>Enviar ahora igualmente</Button>}
                  </div>
                </div>
              )}
              <Tabs value={c.tab} onValueChange={(v) => c.setTab(v as 'text' | 'template')}>
                <TabsList className="h-8">
                  <TabsTrigger value="text" className="text-xs" disabled={!!textDisabledReason && mode === 'single'} aria-disabled={!!textDisabledReason} title={textDisabledReason}>Texto</TabsTrigger>
                  <TabsTrigger value="template" className="text-xs" disabled={!c.capabilities.templates} title={!c.capabilities.templates ? 'El canal QR no admite plantillas' : undefined}>Plantilla</TabsTrigger>
                </TabsList>
                <TabsContent value="text" className="mt-2">
                  <MessageForm value={c.text} onChange={c.setText} disabled={!!textDisabledReason && mode === 'single'} disabledReason={textDisabledReason} media={c.media} onMedia={c.setMedia} allowMedia={c.capabilities.media && mode === 'single'} opportunityId={opportunityId} scheduledAt={c.scheduledAt} onScheduledAt={c.setScheduledAt} firstName={firstName} />
                  {mode === 'bulk' && <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">Texto libre solo llega a contactos con ventana de 24 h abierta; el resto se excluye. Usa una plantilla para llegar a todos.</p>}
                </TabsContent>
                <TabsContent value="template" className="mt-2">
                  <TemplatePicker templates={c.templates} loading={c.loadingTemplates} value={c.templateId} onChange={c.setTemplateId} variables={c.variables} onVariable={c.setVariable} preview={c.preview} previewing={c.previewing} />
                </TabsContent>
              </Tabs>
              {mode === 'bulk' && (
                <BulkAudience recipients={props.recipients ?? []} result={bulk.result} calculating={bulk.calculating} onCalculate={() => void bulk.calculate()} throttle={bulk.throttle} onThrottle={bulk.setThrottle} respectHours={bulk.respectHours} onRespectHours={bulk.setRespectHours} optinConfirmed={bulk.optinConfirmed} onOptinConfirmed={bulk.setOptinConfirmed} requireOptin={c.preview?.category === 'marketing'} disabled={busy} />
              )}
              {needsAdmin && (
                <div role="alert" className="rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 text-xs p-2 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  El envío masivo lanza una campaña y eso requiere rol de administrador de la organización. Pide a un administrador que la lance desde Campañas.
                </div>
              )}
              {c.error && c.error.code !== 'OUTSIDE_HOURS' &&<p role="alert" className="text-xs text-red-600 dark:text-red-400">{c.error.message}{c.error.code === 'NO_CREDITS' && <> · <Link href="/app/configuracion?modulo=crm&tab=creditos" className="underline">Créditos</Link></>}</p>}
            </div>
            <div className="rounded-lg bg-[#efeae2] dark:bg-[#0b141a] p-3 flex items-start justify-end min-h-[160px]">
              <BubblePreview header={c.tab === 'template' ? c.preview?.header : null} body={previewBody} footer={c.tab === 'template' ? c.preview?.footer : null} buttons={c.tab === 'template' ? c.preview?.buttons : []} media={c.tab === 'text' ? c.media : null} status="sent" />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button type="button" onClick={() => void handleSend()} disabled={!canSend || busy || noChannel} title={needsAdmin ? 'Requiere rol de administrador de la organización' : undefined} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" aria-hidden="true" />}
            {mode === 'bulk' ? `Enviar a ${bulk.result?.pending ?? props.recipients?.length ?? 0}` : c.scheduledAt ? 'Programar' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ComposeWhatsAppDialog;
