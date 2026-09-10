'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Key, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { TransportCarrier } from '@/lib/services/transportService';

interface SecretEstado {
  purpose: 'primary' | 'webhook_secret';
  keyPrefix: string | null;
  status: string;
  rotatedAt: string | null;
  inVault: boolean;
}

interface CredencialesEstado {
  connectionId: string | null;
  environment: 'production' | 'sandbox' | null;
  status: string | null;
  username: string | null;
  accountNumber: string | null;
  lastHealthCheckAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  secrets: SecretEstado[];
}

interface ApiCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carrier: TransportCarrier | null;
  /** Se llama tras guardar con éxito, para que el padre recargue la lista. */
  onSaved?: () => void;
}

const ETIQUETA_SECRETO: Record<SecretEstado['purpose'], string> = {
  primary: 'Clave de API',
  webhook_secret: 'Secreto de webhook',
};

/**
 * Credenciales de API de una transportadora.
 *
 * Este diálogo NO escribe en la base de datos: llama a
 * `/api/transport/carriers/[id]/credentials`, que corre con service role y manda los
 * secretos a Vault. Antes escribía la `api_key` en claro en `transport_carriers.metadata`
 * desde el navegador mientras decía que se guardaban "de forma segura".
 *
 * Un secreto guardado no se puede volver a leer, ni aquí ni en ningún sitio: sólo se ve su
 * prefijo. Dejar un campo vacío significa "no cambiar", no "borrar".
 */
export function ApiCredentialsDialog({
  open,
  onOpenChange,
  carrier,
  onSaved,
}: ApiCredentialsDialogProps) {
  const [estado, setEstado] = useState<CredencialesEstado | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [environment, setEnvironment] = useState<'production' | 'sandbox'>('sandbox');
  const [username, setUsername] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');

  const cargar = useCallback(async () => {
    if (!carrier) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/transport/carriers/${carrier.id}/credentials`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || 'No se pudo cargar el estado de las credenciales');
      }
      const item = json.item as CredencialesEstado;
      setEstado(item);
      setPuedeEditar(json.can_edit !== false);
      setEnvironment(item.environment ?? 'sandbox');
      setUsername(item.username ?? '');
      setAccountNumber(item.accountNumber ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setCargando(false);
    }
  }, [carrier]);

  useEffect(() => {
    if (open && carrier) {
      // Los campos de secreto siempre arrancan vacíos: no se precargan nunca.
      setApiKey('');
      setWebhookSecret('');
      cargar();
    }
  }, [open, carrier, cargar]);

  const guardar = async () => {
    if (!carrier) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/transport/carriers/${carrier.id}/credentials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environment,
          username: username.trim() || null,
          accountNumber: accountNumber.trim() || null,
          apiKey: apiKey.trim() || null,
          webhookSecret: webhookSecret.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || 'No se pudieron guardar las credenciales');
      }
      setEstado(json.item as CredencialesEstado);
      setApiKey('');
      setWebhookSecret('');
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setGuardando(false);
    }
  };

  const sinProveedor = !!carrier && !carrier.api_provider;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            Credenciales de API
          </DialogTitle>
          <DialogDescription>
            {carrier?.name ?? 'Transportadora'} — los secretos se cifran en Vault y no se
            pueden volver a leer desde aquí.
          </DialogDescription>
        </DialogHeader>

        {sinProveedor ? (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            role="status"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Esta transportadora no tiene proveedor de API asignado. Edítala y elige uno
              antes de guardar credenciales.
            </span>
          </div>
        ) : cargando ? (
          <div className="space-y-3" aria-live="polite" aria-busy="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : (
          <div className="space-y-4">
            {estado && estado.secrets.length > 0 && (
              <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck
                    className="h-4 w-4 text-green-600 dark:text-green-400"
                    aria-hidden="true"
                  />
                  Secretos guardados
                </div>
                <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  {estado.secrets.map((s) => (
                    <li key={s.purpose} className="flex items-center justify-between gap-2">
                      <span>{ETIQUETA_SECRETO[s.purpose] ?? s.purpose}</span>
                      <span className="font-mono text-xs">
                        {s.keyPrefix ?? '—'}
                        {!s.inVault && (
                          <span className="ml-2 font-sans text-amber-600 dark:text-amber-400">
                            pendiente de migrar a Vault
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <Label htmlFor="cred-environment">Entorno</Label>
              <Select
                value={environment}
                onValueChange={(v) => setEnvironment(v as 'production' | 'sandbox')}
                disabled={!puedeEditar}
              >
                <SelectTrigger id="cred-environment" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Pruebas (sandbox)</SelectItem>
                  <SelectItem value="production">Producción</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cred-username">Usuario</Label>
                <Input
                  id="cred-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={!puedeEditar}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cred-account">Número de cuenta</Label>
                <Input
                  id="cred-account"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  disabled={!puedeEditar}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="cred-apikey">Clave de API</Label>
              <Input
                id="cred-apikey"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Déjalo vacío para no cambiarla"
                disabled={!puedeEditar}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="cred-webhook">Secreto de webhook</Label>
              <Input
                id="cred-webhook"
                type="password"
                autoComplete="off"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="Déjalo vacío para no cambiarlo"
                disabled={!puedeEditar}
                className="mt-1"
              />
            </div>

            {!puedeEditar && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Solo un administrador de la organización puede guardar credenciales.
              </p>
            )}

            {estado?.lastErrorMessage && (
              <div
                className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                role="status"
              >
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Último error de la conexión: {estado.lastErrorMessage}</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <p
            className="text-sm text-red-600 dark:text-red-400"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || cargando || !puedeEditar || sinProveedor}>
            {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ApiCredentialsDialog;
