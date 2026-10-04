'use client';

/**
 * Envío de prueba de una plantilla guardada (POST /api/email/templates/[id]/test-send).
 * Reutiliza el envío nativo con activity de prueba (kind 'system', tag test).
 */

import { useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { testSendTemplate } from '@/components/crm/email/emailApi';
import type { TemplateContextIds } from './useTemplatePreview';
import { useTemplateText } from './useTemplateText';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
  templateName: string;
  canManage?: boolean;
  contextIds?: TemplateContextIds;
}

export function TestSendDialog({ open, onOpenChange, templateId, templateName, canManage = false, contextIds = {} }: Props) {
  const tr = useTemplateText();
  const pending = useRef(false);
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const valid = !to.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  const send = async () => {
    if (!templateId || !valid || !canManage || pending.current) return;
    pending.current = true; setSending(true);
    try {
      const r = await testSendTemplate(templateId, { to: to.trim() || undefined, context_ids: { customer_id: contextIds.customer_id, opportunity_id: contextIds.opportunity_id } });
      toast({ title: tr("Prueba enviada"), description: [tr('Enviado a {p0}', { p0: r.data.to_email }), ...(r.missing.length ? [tr('Variables sin valor: {p0}', { p0: r.missing.join(', ') })] : [])].join(' · ') });
      onOpenChange(false);
    } catch (err) {
      toast({ title: tr("No se pudo enviar la prueba"), description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      pending.current = false; setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!pending.current) onOpenChange(value); }}>
      <DialogContent className="sm:max-w-md ">
        <DialogHeader>
          <DialogTitle> {tr("Enviar prueba")} </DialogTitle>
          <DialogDescription>{tr('Envía una prueba con los cambios guardados de esta plantilla.')} {templateName} · {tr('Deja el campo vacío para usar tu propio correo.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="test-to" className="text-xs"> {tr("Correo de destino")} </Label>
          <Input id="test-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} disabled={sending || !canManage} placeholder="tu@correo.com" aria-invalid={!valid} className="bg-surface" />
          {!valid && <p className="text-xs text-danger-text dark:text-danger-text"> {tr("Correo inválido")} </p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={sending} onClick={() => onOpenChange(false)}> {tr("Cancelar")} </Button>
          <Button type="button" onClick={send} disabled={sending || !valid || !templateId || !canManage} className="gap-1">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}  {tr("Enviar")} </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
