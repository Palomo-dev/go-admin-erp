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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
  templateName: string;
}

export function TestSendDialog({ open, onOpenChange, templateId, templateName }: Props) {
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const valid = !to.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  const send = async () => {
    if (!templateId || !valid) return;
    setSending(true);
    try {
      const r = await testSendTemplate(templateId, { to: to.trim() || undefined });
      toast({ title: 'Prueba enviada', description: `A ${r.data.to_email}${r.missing.length ? ` · variables vacías: ${r.missing.join(', ')}` : ''}` });
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'No se pudo enviar la prueba', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle>Enviar prueba</DialogTitle>
          <DialogDescription>Se envía “{templateName}” con datos de ejemplo. Deja el campo vacío para usar tu propio correo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="test-to" className="text-xs">Correo de destino</Label>
          <Input id="test-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="tu@correo.com" aria-invalid={!valid} className="dark:bg-gray-800" />
          {!valid && <p className="text-xs text-red-600 dark:text-red-400">Correo inválido</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={send} disabled={sending || !valid || !templateId} className="gap-1">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />} Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
