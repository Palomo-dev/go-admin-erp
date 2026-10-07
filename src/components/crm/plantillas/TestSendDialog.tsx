'use client';

/**
 * Envío de prueba de una plantilla guardada (POST /api/email/templates/[id]/test-send).
 * Sin activity ni comprobación de consentimiento (kind 'system', tag test).
 */

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { testSendTemplate } from '@/components/crm/email/emailApi';
import { useTranslations } from 'next-intl';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
  templateName: string;
}

export function TestSendDialog({ open, onOpenChange, templateId, templateName }: Props) {
  const t = useTranslations('crm.plantillas');
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const valid = !to.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  const send = async () => {
    if (!templateId || !valid) return;
    setSending(true);
    try {
      const r = await testSendTemplate(templateId, { to: to.trim() || undefined });
      toast({ title: t('testSendDialog.pruebaEnviada'), description: r.missing.length ? t('testSendDialog.destinoConVacias', { correo: r.data.to_email, variables: r.missing.join(', ') }) : t('testSendDialog.destino', { correo: r.data.to_email }) });
      onOpenChange(false);
    } catch (err) {
      toast({ title: t('testSendDialog.noPudoEnviarPrueba'), description: err instanceof Error ? err.message : t('templateList.error'), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle>{t('templateEditorHeader.enviarPrueba')}</DialogTitle>
          <DialogDescription>{t('testSendDialog.enviaDatosEjemploDeja', { templateName })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="test-to" className="text-xs">{t('testSendDialog.correoDestino')}</Label>
          <Input id="test-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="tu@correo.com" aria-invalid={!valid} className="dark:bg-gray-800" />
          {!valid && <p className="text-xs text-red-600 dark:text-red-400">{t('testSendDialog.correoInvalido')}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('testSendDialog.cancelar')}</Button>
          <Button type="button" onClick={send} disabled={sending || !valid || !templateId} className="gap-1">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />} {t('testSendDialog.enviar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
