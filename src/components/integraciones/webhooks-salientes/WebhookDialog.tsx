'use client';

import React, { useState, useEffect } from 'react';
import { Send, Copy, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { WebhookEndpoint } from '@/lib/services/integrationsService';

interface WebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint?: WebhookEndpoint | null;
  onSave: (data: WebhookFormData) => Promise<{ success: boolean; secret?: string }>;
  onRegenerateSecret?: () => Promise<string | null>;
}

export interface WebhookFormData {
  name: string;
  targetUrl: string;
  events: string[];
}

const AVAILABLE_EVENTS = [
  { id: 'order.created', label: 'Orden creada', description: 'Cuando se crea una nueva orden' },
  { id: 'order.updated', label: 'Orden actualizada', description: 'Cuando se modifica una orden' },
  { id: 'order.completed', label: 'Orden completada', description: 'Cuando se completa una orden' },
  { id: 'order.cancelled', label: 'Orden cancelada', description: 'Cuando se cancela una orden' },
  { id: 'product.created', label: 'Producto creado', description: 'Cuando se crea un producto' },
  { id: 'product.updated', label: 'Producto actualizado', description: 'Cuando se modifica un producto' },
  { id: 'product.deleted', label: 'Producto eliminado', description: 'Cuando se elimina un producto' },
  { id: 'inventory.low_stock', label: 'Stock bajo', description: 'Cuando el stock baja del mínimo' },
  { id: 'inventory.updated', label: 'Inventario actualizado', description: 'Cuando cambia el inventario' },
  { id: 'customer.created', label: 'Cliente creado', description: 'Cuando se registra un cliente' },
  { id: 'payment.received', label: 'Pago recibido', description: 'Cuando se recibe un pago' },
  { id: 'payment.refunded', label: 'Reembolso', description: 'Cuando se hace un reembolso' },
];

export function WebhookDialog({
  open,
  onOpenChange,
  endpoint,
  onSave,
  onRegenerateSecret,
}: WebhookDialogProps) {
  const isEdit = !!endpoint;
  
  const [formData, setFormData] = useState<WebhookFormData>({
    name: '',
    targetUrl: '',
    events: [],
  });
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      if (endpoint) {
        setFormData({
          name: endpoint.name,
          targetUrl: endpoint.target_url,
          events: endpoint.events || [],
        });
      } else {
        setFormData({
          name: '',
          targetUrl: '',
          events: ['order.created', 'order.updated'],
        });
      }
      setErrors({});
      setGeneratedSecret(null);
      setCopied(false);
    }
  }, [open, endpoint]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }
    if (!formData.targetUrl.trim()) {
      newErrors.targetUrl = 'La URL es requerida';
    } else {
      try {
        const url = new URL(formData.targetUrl);
        if (!url.protocol.startsWith('http')) {
          newErrors.targetUrl = 'La URL debe ser HTTP o HTTPS';
        }
      } catch {
        newErrors.targetUrl = 'URL inválida';
      }
    }
    if (formData.events.length === 0) {
      newErrors.events = 'Selecciona al menos un evento';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleEventChange = (eventId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      events: checked
        ? [...prev.events, eventId]
        : prev.events.filter((e) => e !== eventId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSaving(true);
    try {
      const result = await onSave(formData);
      if (result.success && result.secret && !isEdit) {
        setGeneratedSecret(result.secret);
      } else if (result.success) {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCopySecret = () => {
    if (generatedSecret) {
      navigator.clipboard.writeText(generatedSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerateSecret = async () => {
    if (!onRegenerateSecret) return;
    
    setRegenerating(true);
    try {
      const newSecret = await onRegenerateSecret();
      if (newSecret) {
        setGeneratedSecret(newSecret);
      }
    } finally {
      setRegenerating(false);
    }
  };

  const handleClose = () => {
    setGeneratedSecret(null);
    onOpenChange(false);
  };

  // Vista de secret generado
  if (generatedSecret && !isEdit) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px] dark:bg-gray-900 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-white">
              <Send className="h-5 w-5 text-green-500" />
              Webhook Creado
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Guarda el secret en un lugar seguro para validar las firmas de los webhooks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Este secret se usa para validar que los webhooks provienen de GoAdmin. Guárdalo de forma segura.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-gray-300">Webhook Secret</Label>
              <div className="flex gap-2">
                <Input
                  value={generatedSecret}
                  readOnly
                  className="font-mono text-sm bg-gray-100 dark:bg-gray-800"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopySecret}
                  className="flex-shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleClose}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Entendido, lo guardé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[550px] dark:bg-gray-900 dark:border-gray-800"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-white">
            <Send className="h-5 w-5 text-cyan-500" />
            {isEdit ? 'Editar Webhook' : 'Nuevo Webhook Saliente'}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {isEdit
              ? 'Modifica la configuración del endpoint'
              : 'Configura un endpoint para recibir notificaciones de eventos'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="name" className="dark:text-gray-300">
              Nombre
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="ej: Notificaciones a ERP"
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="targetUrl" className="dark:text-gray-300">
              URL de destino
            </Label>
            <Input
              id="targetUrl"
              value={formData.targetUrl}
              onChange={(e) => setFormData({ ...formData, targetUrl: e.target.value })}
              placeholder="https://api.example.com/webhooks"
              className={`font-mono ${errors.targetUrl ? 'border-red-500' : ''}`}
            />
            {errors.targetUrl && <p className="text-xs text-red-500">{errors.targetUrl}</p>}
          </div>

          {/* Regenerar secret (solo en edición) */}
          {isEdit && onRegenerateSecret && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Secret</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Regenera el secret si necesitas uno nuevo
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateSecret}
                  disabled={regenerating}
                  className="dark:border-gray-700"
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${regenerating ? 'animate-spin' : ''}`} />
                  Regenerar
                </Button>
              </div>
              {generatedSecret && (
                <div className="mt-3 flex gap-2">
                  <Input
                    value={generatedSecret}
                    readOnly
                    className="font-mono text-sm bg-white dark:bg-gray-900"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopySecret}
                    className="flex-shrink-0"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Eventos */}
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Eventos a suscribir</Label>
            {errors.events && <p className="text-xs text-red-500">{errors.events}</p>}
            <div className="grid grid-cols-1 gap-1 max-h-[180px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2">
              {AVAILABLE_EVENTS.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Checkbox
                    id={event.id}
                    checked={formData.events.includes(event.id)}
                    onCheckedChange={(checked) =>
                      handleEventChange(event.id, checked as boolean)
                    }
                  />
                  <div className="flex-1">
                    <label
                      htmlFor={event.id}
                      className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer"
                    >
                      {event.label}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {event.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="dark:border-gray-700 dark:text-gray-300"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Webhook'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default WebhookDialog;
