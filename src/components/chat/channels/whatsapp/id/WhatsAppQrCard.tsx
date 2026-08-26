'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Loader2, QrCode, Power, LogOut, ShieldAlert } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface WhatsAppQrCardProps {
  channelId: string;
}

type QrStatus = 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'reconnecting' | 'banned' | 'error';

interface QrState {
  status: QrStatus;
  qr: string | null;
  phone?: string | null;
}

const STATUS_LABELS: Record<QrStatus, string> = {
  disconnected: 'Desconectado',
  connecting: 'Conectando...',
  qr_ready: 'Escanea el QR',
  connected: 'Conectado',
  reconnecting: 'Reconectando...',
  banned: 'Cuenta baneada',
  error: 'Error',
};

const STATUS_COLORS: Record<QrStatus, string> = {
  disconnected: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  connecting: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  qr_ready: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  connected: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  reconnecting: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  banned: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

export default function WhatsAppQrCard({ channelId }: WhatsAppQrCardProps) {
  const [acceptedRisk, setAcceptedRisk] = useState(false);
  const [state, setState] = useState<QrState>({ status: 'disconnected', qr: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/whatsapp/qr/status?channel_id=${channelId}`);
      if (!res.ok) return;
      const data = await res.json();
      setState(data);
    } catch {
      /* noop */
    }
  }, [channelId]);

  // Polling mientras está connecting o qr_ready
  useEffect(() => {
    if (state.status !== 'connecting' && state.status !== 'reconnecting' && state.status !== 'qr_ready') {
      return;
    }
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [state.status, fetchStatus]);

  // Carga inicial
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Polling de despacho de mensajes pendientes cuando está conectado
  useEffect(() => {
    if (state.status !== 'connected') return;
    const dispatchPending = async () => {
      try {
        await fetch('/api/integrations/whatsapp/qr/dispatch-pending', { method: 'POST' });
      } catch {
        /* noop */
      }
    };
    dispatchPending();
    const interval = setInterval(dispatchPending, 5000);
    return () => clearInterval(interval);
  }, [state.status]);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/whatsapp/qr/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error iniciando sesión');
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    setError(null);
    try {
      await fetch('/api/integrations/whatsapp/qr/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId }),
      });
      setState({ status: 'disconnected', qr: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setShowLogoutDialog(false);
    setLoading(true);
    setError(null);
    try {
      await fetch('/api/integrations/whatsapp/qr/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId }),
      });
      setState({ status: 'disconnected', qr: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const isConnected = state.status === 'connected';
  const isActive = state.status === 'connected' || state.status === 'connecting' || state.status === 'qr_ready' || state.status === 'reconnecting';

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg text-gray-900 dark:text-white flex items-center gap-2">
              <QrCode className="h-5 w-5" /> Conexión por QR (Baileys)
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              Vincula tu WhatsApp escaneando un código QR
            </CardDescription>
          </div>
          <Badge className={STATUS_COLORS[state.status]}>
            {STATUS_LABELS[state.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Advertencia de riesgo */}
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-semibold">Conexión no oficial – Riesgo de ban permanente</p>
              <p>
                Esta conexión usa Baileys, una librería no autorizada por Meta. WhatsApp puede
                detectarla y <strong>banear el número permanentemente</strong> sin previo aviso.
                Un número baneado no se puede reusar en WhatsApp Business API.
              </p>
              <p className="text-xs">Usa esta opción solo con números de prueba o internos. Para producción usa Cloud API o Coexistence.</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedRisk}
              onChange={(e) => setAcceptedRisk(e.target.checked)}
              className="rounded border-amber-400"
            />
            Entiendo el riesgo y quiero continuar
          </label>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
          </div>
        )}

        {/* QR display */}
        {state.qr && state.status === 'qr_ready' && (
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="p-4 bg-white rounded-xl border-2 border-gray-200 dark:border-gray-700">
              {state.qr.startsWith('data:image') ? (
                <img src={state.qr} alt="QR WhatsApp" width={220} height={220} />
              ) : (
                <QRCodeSVG value={state.qr} size={220} level="M" />
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-xs">
              Abre WhatsApp en tu teléfono → Ajustes → Dispositivos vinculados → Vincular dispositivo → Escanea este QR
            </p>
          </div>
        )}

        {/* Info cuando conectado */}
        {isConnected && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-800 dark:text-green-300">
              WhatsApp conectado{state.phone ? `: ${state.phone.replace(/@s\.whatsapp\.net$/, '')}` : ''}.
              Los mensajes entrantes aparecerán en la bandeja y la IA puede responder según el modo configurado.
            </p>
          </div>
        )}

        {/* Controles */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {!isActive && (
            <Button
              onClick={handleStart}
              disabled={!acceptedRisk || loading}
              className="bg-[#25D366] hover:bg-[#1DA851] text-white"
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Power className="h-4 w-4 mr-2" />}
              Iniciar sesión
            </Button>
          )}
          {isActive && !isConnected && (
            <Button onClick={handleStop} disabled={loading} variant="outline">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Power className="h-4 w-4 mr-2" />}
              Cancelar
            </Button>
          )}
          {isConnected && (
            <Button onClick={handleStop} disabled={loading} variant="outline">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Power className="h-4 w-4 mr-2" />}
              Detener
            </Button>
          )}
          {(isConnected || state.status === 'disconnected') && (
            <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
              <AlertDialogTrigger asChild>
                <Button disabled={loading} variant="ghost" className="text-red-600 hover:text-red-700">
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
                  Borrar sesión
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Borrar sesión de WhatsApp?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminarán las credenciales de la conexión. Deberás escanear el código QR nuevamente para volver a conectar. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLogout}
                    disabled={loading}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
                    Borrar sesión
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
