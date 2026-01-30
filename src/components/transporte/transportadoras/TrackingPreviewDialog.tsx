'use client';

import { useState } from 'react';
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
import { ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { TransportCarrier } from '@/lib/services/transportService';

interface TrackingPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carrier: TransportCarrier | null;
}

export function TrackingPreviewDialog({
  open,
  onOpenChange,
  carrier,
}: TrackingPreviewDialogProps) {
  const [trackingNumber, setTrackingNumber] = useState('TEST123456');
  const [copied, setCopied] = useState(false);

  if (!carrier) return null;

  const getPreviewUrl = () => {
    if (!carrier.tracking_url_template) return '';
    return carrier.tracking_url_template.replace('{tracking_number}', trackingNumber);
  };

  const previewUrl = getPreviewUrl();

  const handleCopy = async () => {
    if (previewUrl) {
      await navigator.clipboard.writeText(previewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenUrl = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Probar URL de Tracking - {carrier.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template">Plantilla URL</Label>
            <Input
              id="template"
              value={carrier.tracking_url_template || ''}
              readOnly
              className="bg-gray-50 dark:bg-gray-800 font-mono text-sm"
            />
            <p className="text-xs text-gray-500">
              La variable {'{tracking_number}'} será reemplazada por el número de guía
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tracking">Número de Guía de Prueba</Label>
            <Input
              id="tracking"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Ingresa un número de guía"
            />
          </div>

          <div className="space-y-2">
            <Label>URL Generada</Label>
            <div className="flex gap-2">
              <Input
                value={previewUrl}
                readOnly
                className="bg-gray-50 dark:bg-gray-800 font-mono text-sm flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                title="Copiar URL"
              >
                {copied ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {carrier.api_provider && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Proveedor API:</strong> {carrier.api_provider}
              </p>
              {carrier.metadata && (
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                  Credenciales configuradas
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            onClick={handleOpenUrl}
            disabled={!previewUrl}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Abrir en Nueva Pestaña
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
