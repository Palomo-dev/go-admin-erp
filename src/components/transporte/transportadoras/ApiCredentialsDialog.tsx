'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Key, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { TransportCarrier } from '@/lib/services/transportService';

interface ApiCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carrier: TransportCarrier | null;
  onSave: (carrierId: string, credentials: ApiCredentials) => Promise<void>;
  isSaving?: boolean;
}

interface ApiCredentials {
  api_key?: string;
  api_secret?: string;
  username?: string;
  password?: string;
  sandbox_mode?: boolean;
  custom_config?: string;
}

export function ApiCredentialsDialog({
  open,
  onOpenChange,
  carrier,
  onSave,
  isSaving,
}: ApiCredentialsDialogProps) {
  const [credentials, setCredentials] = useState<ApiCredentials>({
    api_key: '',
    api_secret: '',
    username: '',
    password: '',
    sandbox_mode: true,
    custom_config: '',
  });
  const [showSecret, setShowSecret] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (carrier?.metadata) {
      const meta = carrier.metadata as Record<string, unknown>;
      setCredentials({
        api_key: (meta.api_key as string) || '',
        api_secret: '',
        username: (meta.api_username as string) || '',
        password: '',
        sandbox_mode: (meta.sandbox_mode as boolean) ?? true,
        custom_config: meta.custom_config ? JSON.stringify(meta.custom_config, null, 2) : '',
      });
    } else {
      setCredentials({
        api_key: '',
        api_secret: '',
        username: '',
        password: '',
        sandbox_mode: true,
        custom_config: '',
      });
    }
  }, [carrier]);

  if (!carrier) return null;

  const handleSave = async () => {
    await onSave(carrier.id, credentials);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-blue-600" />
            Credenciales API - {carrier.name}
          </DialogTitle>
          <DialogDescription>
            Configura las credenciales para integración con {carrier.api_provider || 'el proveedor'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              Las credenciales sensibles se almacenan de forma segura. Solo ingresa nuevos valores si deseas actualizarlas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="api_key">API Key</Label>
              <Input
                id="api_key"
                value={credentials.api_key}
                onChange={(e) => setCredentials({ ...credentials, api_key: e.target.value })}
                placeholder="Tu API Key"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api_secret">API Secret</Label>
              <div className="relative">
                <Input
                  id="api_secret"
                  type={showSecret ? 'text' : 'password'}
                  value={credentials.api_secret}
                  onChange={(e) => setCredentials({ ...credentials, api_secret: e.target.value })}
                  placeholder="••••••••"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Usuario (opcional)</Label>
              <Input
                id="username"
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                placeholder="Usuario de la API"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña (opcional)</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  placeholder="••••••••"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom_config">Configuración Personalizada (JSON)</Label>
            <Textarea
              id="custom_config"
              value={credentials.custom_config}
              onChange={(e) => setCredentials({ ...credentials, custom_config: e.target.value })}
              placeholder='{"webhook_url": "https://...", "timeout": 30}'
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex items-center gap-2">
              <Switch
                id="sandbox_mode"
                checked={credentials.sandbox_mode}
                onCheckedChange={(v) => setCredentials({ ...credentials, sandbox_mode: v })}
              />
              <Label htmlFor="sandbox_mode">Modo Sandbox / Pruebas</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar Credenciales
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
