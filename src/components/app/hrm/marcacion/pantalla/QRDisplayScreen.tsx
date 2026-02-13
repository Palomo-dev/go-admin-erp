'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { RefreshCw, Wifi, WifiOff, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QRDisplayScreenProps {
  deviceId: string;
  deviceName: string;
  branchName: string | null;
  organizationId: number;
  initialToken: string | null;
  initialExpiresAt: string | null;
  onRegenerateToken: () => Promise<{ token: string; expires_at: string } | null>;
}

export function QRDisplayScreen({
  deviceId,
  deviceName,
  branchName,
  organizationId,
  initialToken,
  initialExpiresAt,
  onRegenerateToken,
}: QRDisplayScreenProps) {
  const [currentToken, setCurrentToken] = useState(initialToken);
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [regenError, setRegenError] = useState(false);

  const timeLeft = expiresAt
    ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - currentTime.getTime()) / 1000))
    : 0;

  const regenerateToken = useCallback(async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    setRegenError(false);
    try {
      const result = await onRegenerateToken();
      if (result) {
        setCurrentToken(result.token);
        setExpiresAt(result.expires_at);
        setRegenError(false);
      } else {
        console.error('regenerateToken devolvió null');
        setRegenError(true);
      }
    } catch (error) {
      console.error('Error regenerando token:', error);
      setRegenError(true);
    } finally {
      setIsRegenerating(false);
    }
  }, [onRegenerateToken, isRegenerating]);

  // Actualizar reloj cada segundo
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Inicializar - si no hay token, generar uno
  useEffect(() => {
    if (!hasInitialized) {
      setHasInitialized(true);
      if (!currentToken) {
        regenerateToken();
      }
    }
  }, [hasInitialized, currentToken, regenerateToken]);

  // Auto-regenerar cuando expira
  useEffect(() => {
    if (hasInitialized && timeLeft <= 0 && currentToken && !isRegenerating) {
      regenerateToken();
    }
  }, [hasInitialized, timeLeft, currentToken, isRegenerating, regenerateToken]);

  // Regenerar automáticamente 30 segundos antes de expirar
  useEffect(() => {
    if (hasInitialized && timeLeft === 30 && !isRegenerating) {
      regenerateToken();
    }
  }, [hasInitialized, timeLeft, isRegenerating, regenerateToken]);

  // Reintentar automáticamente cada 5s si hubo error
  useEffect(() => {
    if (!regenError || isRegenerating) return;
    const timer = setTimeout(() => regenerateToken(), 5000);
    return () => clearTimeout(timer);
  }, [regenError, isRegenerating, regenerateToken]);

  // Detectar estado de conexión
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const qrValue = currentToken
    ? JSON.stringify({
        type: 'attendance',
        device_id: deviceId,
        token: currentToken,
        org: organizationId,
      })
    : '';

  const isExpired = timeLeft <= 0;
  const isWarning = timeLeft > 0 && timeLeft <= 60;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex flex-col items-center justify-center p-4 md:p-8">
      {/* Header con información */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
        <div className="text-white">
          <h1 className="text-xl md:text-2xl font-bold">{deviceName}</h1>
          {branchName && (
            <p className="text-blue-200 flex items-center gap-1 text-sm md:text-base">
              <MapPin className="h-4 w-4" />
              {branchName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Wifi className="h-5 w-5 text-green-400" />
          ) : (
            <WifiOff className="h-5 w-5 text-red-400" />
          )}
        </div>
      </div>

      {/* Reloj grande */}
      <div className="text-center mb-8">
        <div className="text-6xl md:text-8xl font-bold text-white tracking-tight">
          {format(currentTime, 'HH:mm')}
        </div>
        <div className="text-xl md:text-2xl text-blue-200 mt-2">
          {format(currentTime, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
        </div>
      </div>

      {/* QR Code */}
      <div className="relative">
        {currentToken && !isExpired ? (
          <div
            className={cn(
              'bg-white p-4 md:p-6 rounded-2xl shadow-2xl transition-all duration-300',
              isWarning && 'ring-4 ring-yellow-400 animate-pulse'
            )}
          >
            <QRCodeSVG
              value={qrValue}
              size={280}
              level="H"
              includeMargin
              className="md:w-[320px] md:h-[320px]"
            />
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur p-6 md:p-8 rounded-2xl flex flex-col items-center justify-center w-[312px] h-[312px] md:w-[352px] md:h-[352px]">
            <RefreshCw
              className={cn(
                'h-16 w-16 text-white mb-4',
                isRegenerating && 'animate-spin'
              )}
              onClick={() => !isRegenerating && regenerateToken()}
              style={{ cursor: 'pointer' }}
            />
            <p className="text-white text-lg">
              {isRegenerating ? 'Generando nuevo código...' : 'Código expirado'}
            </p>
            {regenError && (
              <p className="text-yellow-300 text-sm mt-2 text-center">
                Error al regenerar. Reintentando...
              </p>
            )}
          </div>
        )}
      </div>

      {/* Timer y estado */}
      <div className="mt-8 text-center">
        {currentToken && !isExpired && (
          <div
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-full text-lg font-medium',
              timeLeft > 60
                ? 'bg-green-500/20 text-green-300'
                : timeLeft > 30
                ? 'bg-yellow-500/20 text-yellow-300'
                : 'bg-red-500/20 text-red-300'
            )}
          >
            <Clock className="h-5 w-5" />
            Nuevo código en {formatTimeLeft(timeLeft)}
          </div>
        )}

        <p className="text-blue-200 mt-4 text-sm md:text-base max-w-md">
          Escanea este código con tu celular para registrar tu entrada o salida
        </p>
      </div>

      {/* Instrucciones */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="bg-white/10 backdrop-blur rounded-lg p-3 md:p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-white text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>Sistema de marcación activo</span>
            </div>
            <div className="text-blue-200">
              Abre <span className="font-mono bg-white/10 px-2 py-0.5 rounded">/marcar</span> en tu navegador
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QRDisplayScreen;
