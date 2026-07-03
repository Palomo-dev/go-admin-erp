'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, X, Timer } from 'lucide-react';
import { pmService, type TaskTimeEntry } from '@/lib/services/pmService';
import { useToast } from '@/components/ui/use-toast';

interface TaskTimerProps {
  taskId: string;
  estimatedHours?: number | null;
  /** compact: solo botón + tiempo (para tarjetas/lista). full: con totales y estimado (para el drawer) */
  variant?: 'compact' | 'full';
  /** callback opcional para refrescar el contenedor tras registrar tiempo (sin recargar) */
  onChange?: () => void;
  /**
   * Sesión activa provista por el contenedor (para listas/kanban): evita una consulta por tarjeta.
   * `undefined` = el componente la consulta por sí mismo. `null` = sin sesión activa (no consulta).
   */
  providedRunning?: TaskTimeEntry | null;
}

// Formatea segundos a HH:MM:SS
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function TaskTimer({ taskId, estimatedHours, variant = 'compact', onChange, providedRunning }: TaskTimerProps) {
  const { toast } = useToast();
  const [running, setRunning] = useState<TaskTimeEntry | null>(null);
  const [totalSeconds, setTotalSeconds] = useState(0); // sesiones cerradas
  const [elapsed, setElapsed] = useState(0); // sesión activa en curso
  const [busy, setBusy] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      if (variant === 'full') {
        const [run, summary] = await Promise.all([
          pmService.getRunningTimeEntry(taskId),
          pmService.getTaskTimeSummary(taskId),
        ]);
        setRunning(run);
        setTotalSeconds(summary.totalSeconds);
        if (run) setElapsed((Date.now() - new Date(run.started_at).getTime()) / 1000);
      } else {
        const run = await pmService.getRunningTimeEntry(taskId);
        setRunning(run);
        if (run) setElapsed((Date.now() - new Date(run.started_at).getTime()) / 1000);
      }
    } catch {
      /* silencioso: no bloquear la UI si falla la lectura */
    }
  }, [taskId, variant]);

  useEffect(() => {
    // Si el contenedor provee la sesión activa (listas/kanban), evitamos consultar por tarjeta
    if (providedRunning !== undefined) {
      setRunning(providedRunning);
      setElapsed(providedRunning ? (Date.now() - new Date(providedRunning.started_at).getTime()) / 1000 : 0);
      return;
    }
    load();
  }, [load, providedRunning]);

  // Tick en vivo mientras hay una sesión activa
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed((Date.now() - new Date(running.started_at).getTime()) / 1000);
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const entry = await pmService.startTimer(taskId);
      setRunning(entry);
      setElapsed(0);
      onChange?.();
    } catch (error: any) {
      toast({ title: 'Error al iniciar', description: error.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!running) return;
    setBusy(true);
    try {
      const secs = await pmService.stopTimer(running.id);
      setRunning(null);
      setElapsed(0);
      setTotalSeconds(prev => prev + secs);
      toast({ title: 'Tiempo registrado', description: `+${formatDuration(secs)} en horas reales` });
      onChange?.();
    } catch (error: any) {
      toast({ title: 'Error al detener', description: error.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!running) return;
    setBusy(true);
    try {
      await pmService.cancelTimer(running.id);
      setRunning(null);
      setElapsed(0);
      onChange?.();
    } catch (error: any) {
      toast({ title: 'Error al cancelar', description: error.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  // Vista compacta (tarjetas Kanban / lista)
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {running ? (
          <>
            <span className="text-[10px] font-mono text-green-600 dark:text-green-400 tabular-nums">{formatDuration(elapsed)}</span>
            <button type="button" onClick={handleStop} disabled={busy} title="Pausar y guardar"
              className="h-5 w-5 rounded-full flex items-center justify-center bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-400">
              <Pause className="h-3 w-3" />
            </button>
            <button type="button" onClick={handleCancel} disabled={busy} title="Cancelar sesión"
              className="h-5 w-5 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500">
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <button type="button" onClick={handleStart} disabled={busy} title="Iniciar cronómetro"
            className="h-5 w-5 rounded-full flex items-center justify-center text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
            <Play className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  // Vista completa (drawer)
  const totalWithCurrent = totalSeconds + (running ? elapsed : 0);
  const estSeconds = (Number(estimatedHours) || 0) * 3600;
  const overEstimate = estSeconds > 0 && totalWithCurrent > estSeconds;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Timer className="h-4 w-4 text-blue-600" />
          Cronómetro
        </div>
        <span className={`text-lg font-mono tabular-nums ${running ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-200'}`}>
          {formatDuration(running ? elapsed : 0)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {running ? (
          <>
            <button type="button" onClick={handleStop} disabled={busy}
              className="flex-1 h-9 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium flex items-center justify-center gap-1.5">
              <Pause className="h-4 w-4" />Pausar y guardar
            </button>
            <button type="button" onClick={handleCancel} disabled={busy}
              className="h-9 px-3 rounded-md border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-red-600 text-sm flex items-center gap-1">
              <X className="h-4 w-4" />Cancelar
            </button>
          </>
        ) : (
          <button type="button" onClick={handleStart} disabled={busy}
            className="flex-1 h-9 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center justify-center gap-1.5">
            <Play className="h-4 w-4" />{totalSeconds > 0 ? 'Reanudar' : 'Iniciar'}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>Total real: <strong className={overEstimate ? 'text-red-500' : 'text-gray-700 dark:text-gray-200'}>{formatDuration(totalWithCurrent)}</strong></span>
        {Number(estimatedHours) > 0 && (
          <span>Estimado: <strong className="text-gray-700 dark:text-gray-200">{formatDuration(estSeconds)}</strong></span>
        )}
      </div>
    </div>
  );
}
