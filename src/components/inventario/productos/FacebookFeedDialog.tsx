'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, RefreshCw, Check, Globe, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface FacebookFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number | undefined;
}

export function FacebookFeedDialog({
  open,
  onOpenChange,
  organizationId,
}: FacebookFeedDialogProps) {
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const feedUrl = token && organizationId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/facebook-feed?org_id=${organizationId}&token=${token}`
    : '';

  useEffect(() => {
    if (open && organizationId) {
      fetchToken();
    }
  }, [open, organizationId]);

  const fetchToken = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/facebook-feed/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId, action: 'get' }),
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
      } else {
        toast.error('Error al obtener el token del feed');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!organizationId) return;
    setRegenerating(true);
    try {
      const res = await fetch('/api/facebook-feed/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId, action: 'regenerate' }),
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        toast.success('Token regenerado. La URL anterior ya no funciona.');
      } else {
        toast.error('Error al regenerar el token');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = () => {
    if (!feedUrl) return;
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('URL copiada al portapapeles');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-600" />
            URL Feed de Catálogo para Facebook
          </DialogTitle>
          <DialogDescription>
            Pega esta URL en Facebook Commerce Manager para que Facebook lea tu catálogo automáticamente.
            La URL se mantiene actualizada con tus productos en tiempo real.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  URL del Feed (CSV)
                </label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={feedUrl}
                    className="font-mono text-xs"
                    placeholder="Generando URL..."
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    disabled={!feedUrl}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-4 space-y-2">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                  Cómo usar esta URL en Facebook:
                </p>
                <ol className="text-xs text-blue-800 dark:text-blue-300 space-y-1 list-decimal list-inside">
                  <li>Ve a Facebook Commerce Manager</li>
                  <li>Selecciona tu catálogo de productos</li>
                  <li>Ve a &quot;Fuentes de datos&quot; → &quot;Agregar fuente de datos&quot;</li>
                  <li>Selecciona &quot;Feed programado&quot; y elige &quot;CSV&quot;</li>
                  <li>Pega esta URL en el campo &quot;URL del archivo&quot;</li>
                  <li>Configura la frecuencia de actualización (recomendado: diaria)</li>
                </ol>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  El token garantiza que solo Facebook pueda acceder a tu catálogo.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                >
                  {regenerating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Regenerar token
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {feedUrl && (
            <Button
              onClick={() => window.open(feedUrl, '_blank')}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Vista previa
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
