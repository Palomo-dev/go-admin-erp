'use client';

import { useEffect, useState } from 'react';
import { Loader2, Mail, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { toast } from '@/components/ui/use-toast';

/**
 * ComposeEmailDialog v1 (F9) — extraído de ActivityActions.EmailDialog con
 * RichTextEditor en lugar de textarea HTML. Envía por POST /api/email/send
 * (Resend); `emailService.sendEmail` crea la activity `email` → NO se registra
 * desde el cliente (B9). El selector de plantillas solo aparece si
 * GET /api/email/templates responde 200 (lo crea F7; hasta entonces oculto).
 * El editor de bloques/HTML/IA/adjuntos llega con F7.
 */
export interface ComposeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId?: string;
  customerId?: string;
  customer?: { id?: string; full_name?: string | null; email?: string | null } | null;
  defaultSubject?: string;
  replyTo?: { email_message_id: string; subject: string };
  /** `scheduled` = el envío quedó programado/encolado (202), no enviado. */
  onSent?: (result: { email_message_id?: string; scheduled?: boolean }) => void;
}

interface TemplateOption { id: string; name: string; subject?: string | null; body_html?: string | null }

export function ComposeEmailDialog({ open, onOpenChange, opportunityId, customerId, customer, defaultSubject, replyTo, onSent }: ComposeEmailDialogProps) {
  const [to, setTo] = useState(customer?.email ?? '');
  const [subject, setSubject] = useState(replyTo ? (replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`) : defaultSubject ?? '');
  const [body, setBody] = useState('');
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/email/templates', { cache: 'no-store' });
        if (!res.ok) return; // 404 hasta F7 → selector oculto
        const json = await res.json().catch(() => null);
        const list: TemplateOption[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
        if (!cancelled) setTemplates(list.filter((t) => t && t.id && t.name));
      } catch {
        /* sin plantillas */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t?.subject && !subject) setSubject(t.subject);
    if (t?.body_html && !body.trim()) setBody(t.body_html);
  };

  const valid = /\S+@\S+\.\S+/.test(to) && subject.trim().length > 0 && (body.replace(/<[^>]*>/g, '').trim().length > 0 || Boolean(templateId));

  const handleSend = async () => {
    if (!valid) return;
    setSending(true);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          html: body || undefined,
          template_id: templateId || undefined,
          to_customer_id: customerId ?? customer?.id,
          related_type: opportunityId ? 'opportunity' : 'customer',
          related_id: opportunityId ?? customerId ?? customer?.id,
          metadata: { source: 'quick_actions', ...(replyTo ? { in_reply_to: replyTo.email_message_id } : {}) },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) throw new Error(json.error || `Error ${res.status}`);
      // Gemelo del defecto de `CallPanels` (F4): `POST /api/email/send` responde
      // 202 con `scheduled:true` cuando el envío queda programado o encolado.
      // Decir "Email enviado" en ese caso promete algo que aún no ha ocurrido.
      const scheduled = res.status === 202 || json.scheduled === true;
      toast(
        scheduled
          ? { title: 'Email programado', description: `Se enviará a ${to} en cuanto corresponda.` }
          : { title: 'Email enviado', description: to }
      );
      onSent?.({ email_message_id: json.data?.id, scheduled });
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Error enviando email', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Mail className="h-5 w-5 text-green-500" />
            {replyTo ? 'Responder email' : 'Enviar email'}
          </DialogTitle>
          <DialogDescription>Se envía con Resend y queda registrado en el timeline de la {opportunityId ? 'oportunidad' : 'ficha del cliente'}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {templates.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Plantilla (opcional)</Label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Sin plantilla" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ce-to" className="text-xs">Para *</Label>
              <Input id="ce-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="cliente@ejemplo.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ce-subject" className="text-xs">Asunto *</Label>
              <Input id="ce-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del correo" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mensaje *</Label>
            <RichTextEditor value={body} onChange={setBody} placeholder="Escribe tu mensaje…" minHeight={180} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleSend} disabled={sending || !valid}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
