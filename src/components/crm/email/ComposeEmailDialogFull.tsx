'use client';

/**
 * ComposeEmailDialogFull (FASE-07 §5.2): compositor completo — destinatarios
 * (to/cc/bcc), plantilla, "Redactar con IA", bloques | HTML | vista previa,
 * adjuntos desde documents, programar envío. Mismo contrato de props que
 * `src/components/crm/shared/ComposeEmailDialog.tsx` (v1 de F9): cuando F9
 * cierre, basta con re-exportar este componente desde ese archivo.
 * Envía por POST /api/email/send (el servidor crea la única activity).
 */

import { useState } from 'react';
import { Blocks, Code2, Eye, Loader2, Mail, Paperclip, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmailBlockEditor } from './editor/EmailBlockEditor';
import { EmailHtmlEditor } from './EmailHtmlEditor';
import { EmailPreview } from './EmailPreview';
import { TemplatePicker } from './TemplatePicker';
import { VariablePicker } from './VariablePicker';
import { AIDraftPopover } from './compose/AIDraftPopover';
import { AttachmentsPanel } from './compose/AttachmentsPanel';
import { ScheduleSendPopover } from './compose/ScheduleSendPopover';
import { useComposeEmail } from './compose/useComposeEmail';

export interface ComposeEmailDialogFullProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId?: string;
  customerId?: string;
  customer?: { id?: string; full_name?: string | null; email?: string | null } | null;
  defaultSubject?: string;
  replyTo?: { email_message_id: string; subject: string };
  onSent?: (result: { email_message_id?: string; scheduled?: boolean }) => void;
}

export function ComposeEmailDialogFull({ open, onOpenChange, opportunityId, customerId, customer, defaultSubject, replyTo, onSent }: ComposeEmailDialogFullProps) {
  const cid = customerId ?? customer?.id;
  const c = useComposeEmail({ opportunityId, customerId: cid, customerEmail: customer?.email ?? null, defaultSubject, replyTo }, open);
  const [showCc, setShowCc] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [tab, setTab] = useState<'blocks' | 'html' | 'preview'>('blocks');

  const handleSend = async () => {
    const r = await c.send();
    if (r) {
      onSent?.({ email_message_id: r.message.id, scheduled: r.scheduled });
      onOpenChange(false);
    }
  };

  const changeTab = (v: string) => {
    if (v === 'blocks' || v === 'html') c.setMode(v);
    setTab(v as typeof tab);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto bg-white sm:max-w-5xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Mail className="h-5 w-5 text-green-500" aria-hidden="true" /> {replyTo ? 'Responder email' : 'Enviar email'}
          </DialogTitle>
          <DialogDescription>Se envía con Resend desde el dominio de tu organización y queda registrado en el timeline{opportunityId ? ' de la oportunidad' : cid ? ' del cliente' : ''}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-1">
              <Label htmlFor="cf-to" className="text-xs">Para *</Label>
              <Input id="cf-to" value={c.to} onChange={(e) => c.setTo(e.target.value)} placeholder="cliente@empresa.com, otro@empresa.com" aria-invalid={c.invalid.length > 0} className="dark:bg-gray-800" />
            </div>
            <div className="flex items-end pb-1">
              <button type="button" onClick={() => setShowCc((v) => !v)} className="text-xs text-blue-600 hover:underline dark:text-blue-400" aria-expanded={showCc}>Cc / Cco</button>
            </div>
          </div>
          {showCc && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="cf-cc" className="text-xs">Cc</Label><Input id="cf-cc" value={c.cc} onChange={(e) => c.setCc(e.target.value)} className="dark:bg-gray-800" /></div>
              <div className="space-y-1"><Label htmlFor="cf-bcc" className="text-xs">Cco</Label><Input id="cf-bcc" value={c.bcc} onChange={(e) => c.setBcc(e.target.value)} className="dark:bg-gray-800" /></div>
            </div>
          )}
          {c.invalid.length > 0 && <p className="text-xs text-red-600 dark:text-red-400" role="alert">Direcciones inválidas: {c.invalid.join(', ')}</p>}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="cf-subject" className="text-xs">Asunto *</Label>
                <VariablePicker values={c.context} withDefault onInsert={(expr) => c.setSubject(`${c.subject}${c.subject && !c.subject.endsWith(' ') ? ' ' : ''}${expr}`)} trigger={<button type="button" className="text-[11px] text-blue-600 hover:underline dark:text-blue-400">+ variable</button>} />
              </div>
              <Input id="cf-subject" value={c.subject} onChange={(e) => c.setSubject(e.target.value)} className="dark:bg-gray-800" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cf-preheader" className="text-xs">Preheader</Label>
              <Input id="cf-preheader" value={c.preheader} onChange={(e) => c.setPreheader(e.target.value)} placeholder="Texto de vista previa (opcional)" className="dark:bg-gray-800" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TemplatePicker onPick={c.applyTemplate} />
            <AIDraftPopover opportunityId={opportunityId} customerId={cid} onDraft={c.applyDraft} />
            <Button type="button" variant={showAttachments ? 'secondary' : 'outline'} size="sm" onClick={() => setShowAttachments((v) => !v)} className="gap-1 dark:border-gray-600 dark:text-gray-200" aria-expanded={showAttachments}>
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" /> Adjuntos{c.attachments.length ? ` (${c.attachments.length})` : ''}
            </Button>
            <div className="ml-auto"><ScheduleSendPopover value={c.scheduledAt} onChange={c.setScheduledAt} /></div>
          </div>
          {showAttachments && <AttachmentsPanel opportunityId={opportunityId} customerId={cid} value={c.attachments} onChange={c.setAttachments} />}

          <Tabs value={tab} onValueChange={changeTab}>
            <TabsList aria-label="Modo de edición">
              <TabsTrigger value="blocks" className="gap-1"><Blocks className="h-3.5 w-3.5" aria-hidden="true" /> Bloques</TabsTrigger>
              <TabsTrigger value="html" className="gap-1"><Code2 className="h-3.5 w-3.5" aria-hidden="true" /> HTML</TabsTrigger>
              <TabsTrigger value="preview" className="gap-1"><Eye className="h-3.5 w-3.5" aria-hidden="true" /> Vista previa</TabsTrigger>
            </TabsList>
            <TabsContent value="blocks" className="mt-2">
              <EmailBlockEditor value={c.doc} onChange={c.setDoc} context={c.context} heightClassName="h-[48vh]" />
            </TabsContent>
            <TabsContent value="html" className="mt-2">
              <EmailHtmlEditor value={c.html} onChange={c.setHtml} context={c.context} minHeight={320} />
            </TabsContent>
            <TabsContent value="preview" className="mt-2">
              <EmailPreview data={c.preview} loading={c.previewLoading} error={c.previewError} heightClassName="h-[44vh]" />
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleSend} disabled={c.sending || !c.valid} className="gap-1">
            {c.sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            {c.scheduledAt ? 'Programar' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
