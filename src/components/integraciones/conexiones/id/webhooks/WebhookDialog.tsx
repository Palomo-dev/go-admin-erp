'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IntegrationWebhook } from '@/lib/services/integrationsService';

export interface WebhookFormData {
  direction: 'inbound' | 'outbound';
  url: string;
  events: string[];
  secret_ref?: string;
  signing_method: string;
}

interface WebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook: IntegrationWebhook | null;
  mode: 'create' | 'edit' | 'duplicate';
  onSave: (data: WebhookFormData) => Promise<boolean>;
}

export function WebhookDialog({
  open,
  onOpenChange,
  webhook,
  mode,
  onSave,
}: WebhookDialogProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<WebhookFormData>({
    direction: 'inbound',
    url: '',
    events: [],
    secret_ref: '',
    signing_method: 'hmac-sha256',
  });
  const [eventsText, setEventsText] = useState('');

  useEffect(() => {
    if (open) {
      if (mode === 'create') {
        setFormData({
          direction: 'inbound',
          url: '',
          events: [],
          secret_ref: '',
          signing_method: 'hmac-sha256',
        });
        setEventsText('');
      } else if (webhook) {
        setFormData({
          direction: webhook.direction,
          url: webhook.url,
          events: webhook.events || [],
          secret_ref: '',
          signing_method: webhook.signing_method || 'hmac-sha256',
        });
        setEventsText((webhook.events || []).join(', '));
      }
    }
  }, [open, mode, webhook]);

  const handleSave = async () => {
    if (!formData.url) return;
    const events = eventsText
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);

    setSaving(true);
    const success = await onSave({
      ...formData,
      events,
      secret_ref: formData.secret_ref || undefined,
    });
    setSaving(false);
    if (success) {
      onOpenChange(false);
    }
  };

  const title =
    mode === 'create' ? 'Nuevo webhook' :
    mode === 'edit' ? 'Editar webhook' :
    'Duplicar webhook';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Dirección</Label>
            <Select
              value={formData.direction}
              onValueChange={(v: 'inbound' | 'outbound') => setFormData({ ...formData, direction: v })}
            >
              <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="inbound">Entrante (recibir)</SelectItem>
                <SelectItem value="outbound">Saliente (enviar)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">URL</Label>
            <Input
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              placeholder="https://ejemplo.com/webhook"
            />
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Eventos (separados por coma)</Label>
            <Input
              value={eventsText}
              onChange={(e) => setEventsText(e.target.value)}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              placeholder="order.created, order.updated, payment.completed"
            />
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Método de firma</Label>
            <Select
              value={formData.signing_method}
              onValueChange={(v) => setFormData({ ...formData, signing_method: v })}
            >
              <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="hmac-sha256">HMAC SHA-256</SelectItem>
                <SelectItem value="hmac-sha1">HMAC SHA-1</SelectItem>
                <SelectItem value="none">Sin firma</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Secreto (opcional)</Label>
            <Input
              type="password"
              value={formData.secret_ref}
              onChange={(e) => setFormData({ ...formData, secret_ref: e.target.value })}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              placeholder="Secreto para validar firma"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="dark:border-gray-600 dark:text-gray-300"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !formData.url}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
