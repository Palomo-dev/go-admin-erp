'use client';

/**
 * SoftphoneDock — Widget flotante de softphone para el CRM.
 * GO Admin ERP — Fase 3 (Telefonía CRM)
 *
 * Se monta fijo en la esquina inferior derecha del layout.
 * Muestra estado del dispositivo, dial pad integrado, duración
 * de llamada en vivo, y botones de llamar/colgar/aceptar/rechazar.
 *
 * Debe usarse dentro de <SoftphoneProvider>.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneCall,
  Minus,
  X,
  Delete,
  Mic,
  MicOff,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useSoftphone, type CallStatus } from './SoftphoneProvider';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const DIAL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

const STATUS_LABELS: Record<CallStatus, string> = {
  idle: 'Inactivo',
  connecting: 'Conectando…',
  connected: 'En llamada',
  ended: 'Finalizada',
};

const STATUS_VARIANTS: Record<CallStatus, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  idle: 'secondary',
  connecting: 'warning',
  connected: 'success',
  ended: 'destructive',
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function SoftphoneDock() {
  const {
    callStatus,
    deviceState,
    activeNumber,
    hasIncoming,
    makeCall,
    hangup,
    acceptIncoming,
    rejectIncoming,
    currentCall,
  } = useSoftphone();

  const [number, setNumber] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Cronómetro de duración ─────────────────────────────────────────────────
  useEffect(() => {
    if (callStatus === 'connected') {
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (callStatus === 'idle' || callStatus === 'ended') {
        setDuration(0);
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [callStatus]);

  // ─── Mute toggle ───────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (currentCall) {
      const newMuted = !muted;
      currentCall.mute(newMuted);
      setMuted(newMuted);
    }
  }, [currentCall, muted]);

  // ─── Dial pad input ────────────────────────────────────────────────────────
  const handleDialPress = (key: string) => {
    setNumber((prev) => prev + key);
    // Enviar DTMF si hay llamada conectada
    if (currentCall && callStatus === 'connected') {
      currentCall.sendDigits(key);
    }
  };

  const handleDelete = () => {
    setNumber((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setNumber('');
  };

  const handleCall = () => {
    const trimmed = number.trim();
    if (!trimmed) return;
    makeCall(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCall();
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center h-12 w-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg transition-all dark:bg-blue-600 dark:hover:bg-blue-700"
        aria-label="Abrir softphone"
        title="Abrir softphone"
      >
        <PhoneCall size={22} />
        {callStatus === 'connected' && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-500 animate-pulse" />
        )}
        {hasIncoming && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-yellow-500 animate-ping" />
        )}
      </button>
    );
  }

  const isBusy = callStatus === 'connecting' || callStatus === 'connected';
  const deviceLabel =
    deviceState === 'registered'
      ? 'En línea'
      : deviceState === 'registering'
        ? 'Conectando…'
        : deviceState === 'error'
          ? 'Error'
          : 'Desconectado';

  return (
    <Card className="fixed bottom-6 right-6 z-50 w-72 shadow-2xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="relative">
            <PhoneCall size={18} className="text-blue-600 dark:text-blue-400" />
            {deviceState === 'registered' && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500" />
            )}
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Softphone
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant={STATUS_VARIANTS[callStatus]} className="text-[10px]">
            {STATUS_LABELS[callStatus]}
          </Badge>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            aria-label="Minimizar"
          >
            <Minus size={14} />
          </button>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="p-4 space-y-3">
        {/* Estado del dispositivo */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">Dispositivo</span>
          <span
            className={
              deviceState === 'registered'
                ? 'text-green-600 dark:text-green-400'
                : deviceState === 'error'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400'
            }
          >
            {deviceLabel}
          </span>
        </div>

        {/* Llamada entrante */}
        {hasIncoming && callStatus === 'connecting' && (
          <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 space-y-2">
            <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
              <PhoneIncoming size={16} />
              <span className="text-sm font-medium">Llamada entrante</span>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={acceptIncoming}
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
              >
                <Phone size={14} className="mr-1" />
                Aceptar
              </Button>
              <Button
                onClick={rejectIncoming}
                size="sm"
                variant="destructive"
                className="flex-1"
              >
                <PhoneOff size={14} className="mr-1" />
                Rechazar
              </Button>
            </div>
          </div>
        )}

        {/* Duración en vivo */}
        {(callStatus === 'connected' || callStatus === 'connecting') && (
          <div className="flex items-center justify-center py-2">
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                {callStatus === 'connected' ? (
                  <PhoneCall size={16} className="text-green-600 dark:text-green-400 animate-pulse" />
                ) : (
                  <PhoneOutgoing size={16} className="text-yellow-600 dark:text-yellow-400" />
                )}
                <span className="text-2xl font-mono font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {formatDuration(duration)}
                </span>
              </div>
              {activeNumber && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {activeNumber}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Input de número + Dial Pad (solo si no hay llamada activa) */}
        {!isBusy && !hasIncoming && (
          <>
            <div className="flex items-center gap-1">
              <Input
                type="tel"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ingresa el número…"
                className="text-center font-mono text-lg"
                autoFocus
              />
              {number && (
                <button
                  onClick={handleDelete}
                  className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                  aria-label="Borrar último"
                >
                  <Delete size={16} />
                </button>
              )}
            </div>

            {/* Dial Pad */}
            <div className="grid grid-cols-3 gap-1.5">
              {DIAL_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => handleDialPress(key)}
                  className="h-11 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 text-lg font-mono font-semibold text-gray-900 dark:text-gray-100 transition-colors"
                >
                  {key}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Controles de llamada activa */}
        {callStatus === 'connected' && (
          <div className="flex items-center justify-center gap-2">
            <Button
              onClick={toggleMute}
              size="icon"
              variant={muted ? 'destructive' : 'outline'}
              aria-label={muted ? 'Activar micrófono' : 'Silenciar'}
              title={muted ? 'Activar micrófono' : 'Silenciar'}
            >
              {muted ? <MicOff size={16} /> : <Mic size={16} />}
            </Button>
          </div>
        )}
      </div>

      {/* Footer con botones de acción */}
      <div className="flex items-center gap-2 p-3 border-t border-gray-200 dark:border-gray-700">
        {/* Llamar / Colgar */}
        {!isBusy && !hasIncoming ? (
          <Button
            onClick={handleCall}
            disabled={!number.trim() || deviceState !== 'registered'}
            className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
          >
            <Phone size={16} className="mr-2" />
            Llamar
          </Button>
        ) : (
          <Button
            onClick={hangup}
            variant="destructive"
            className="flex-1"
          >
            <PhoneOff size={16} className="mr-2" />
            Colgar
          </Button>
        )}

        {/* Limpiar número */}
        {!isBusy && !hasIncoming && number && (
          <Button
            onClick={handleClear}
            size="icon"
            variant="ghost"
            aria-label="Limpiar"
            title="Limpiar"
          >
            <X size={16} />
          </Button>
        )}
      </div>
    </Card>
  );
}
