'use client';

import { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
import { API_SCOPES, type Channel } from '@/lib/services/inboxConfigService';

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: Channel[];
  onSave: (data: { name: string; channel_id?: string; scopes: string[]; expires_at?: string }) => Promise<{ rawKey: string } | void>;
}

export default function ApiKeyDialog({
  open,
  onOpenChange,
  channels,
  onSave
}: ApiKeyDialogProps) {
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState<string>('all');
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresIn, setExpiresIn] = useState<string>('never');
  const [saving, setSaving] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setChannelId('all');
      setScopes([]);
      setExpiresIn('never');
      setGeneratedKey(null);
    }
  }, [open]);

  const handleSave = async () => {
    if (!name.trim() || scopes.length === 0) return;

    setSaving(true);
    try {
      let expiresAt: string | undefined;
      if (expiresIn !== 'never') {
        const days = parseInt(expiresIn);
        const date = new Date();
        date.setDate(date.getDate() + days);
        expiresAt = date.toISOString();
      }

      const result = await onSave({
        name: name.trim(),
        channel_id: channelId || undefined,
        scopes,
        expires_at: expiresAt
      });

      if (result && 'rawKey' in result) {
        setGeneratedKey(result.rawKey);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCopyKey = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleScope = (scope: string) => {
    if (scopes.includes(scope)) {
      setScopes(scopes.filter(s => s !== scope));
    } else {
      setScopes([...scopes, scope]);
    }
  };

  const handleClose = () => {
    if (generatedKey) {
      setGeneratedKey(null);
    }
    onOpenChange(false);
  };

  if (generatedKey) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Llave de API Creada</DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    Guarda esta llave ahora
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    Esta es la única vez que verás la llave completa. Guárdala en un lugar seguro.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tu llave de API:</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-mono break-all text-gray-900 dark:text-gray-100">
                  {generatedKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyKey}
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
            <Button onClick={handleClose} className="bg-blue-600 hover:bg-blue-700 text-white">
              Entendido, ya la guardé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Llave de API</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Widget Web, Integración CRM..."
              className="bg-white dark:bg-gray-800"
            />
          </div>

          <div className="space-y-2">
            <Label>Canal (opcional)</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger className="bg-white dark:bg-gray-800">
                <SelectValue placeholder="Todos los canales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los canales</SelectItem>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {ch.name} ({ch.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Limita el acceso a un canal específico
            </p>
          </div>

          <div className="space-y-2">
            <Label>Permisos (scopes) *</Label>
            <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg max-h-[200px] overflow-y-auto">
              {API_SCOPES.map((scope) => (
                <div key={scope.value} className="flex items-start gap-3">
                  <Checkbox
                    id={scope.value}
                    checked={scopes.includes(scope.value)}
                    onCheckedChange={() => toggleScope(scope.value)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor={scope.value}
                      className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer"
                    >
                      {scope.label}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {scope.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Expiración</Label>
            <Select value={expiresIn} onValueChange={setExpiresIn}>
              <SelectTrigger className="bg-white dark:bg-gray-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Nunca expira</SelectItem>
                <SelectItem value="30">30 días</SelectItem>
                <SelectItem value="90">90 días</SelectItem>
                <SelectItem value="180">6 meses</SelectItem>
                <SelectItem value="365">1 año</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || scopes.length === 0 || saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              'Crear Llave'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
