'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Send } from 'lucide-react';
import type { NotificationTemplate } from './types';

interface TestSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: NotificationTemplate | null;
  onSend: (template: NotificationTemplate, variables: Record<string, string>) => Promise<boolean>;
}

export function TestSendDialog({ open, onOpenChange, template, onSend }: TestSendDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (template) {
      const defaults: Record<string, string> = {};
      (template.variables || []).forEach((v) => { defaults[v] = ''; });
      setValues(defaults);
    }
  }, [template, open]);

  if (!template) return null;

  const handleSend = async () => {
    setIsSending(true);
    const ok = await onSend(template, values);
    setIsSending(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle>Probar Envío</DialogTitle>
          <DialogDescription>
            Plantilla: {template.name} ({template.channel})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {template.variables && template.variables.length > 0 ? (
            template.variables.map((v) => (
              <div key={v} className="space-y-1">
                <Label className="text-xs text-gray-600 dark:text-gray-400">
                  {'{{' + v + '}}'}
                </Label>
                <Input
                  value={values[v] || ''}
                  onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                  placeholder={`Valor de prueba para ${v}`}
                  className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-sm"
                />
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Esta plantilla no tiene variables. Se enviará tal cual.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar Prueba
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
