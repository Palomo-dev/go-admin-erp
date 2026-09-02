'use client';

/**
 * CallsTable — Tabla de historial de llamadas.
 * GO Admin ERP — Fase 3 (Telefonía CRM)
 *
 * Fetch a /api/crm/calls con filtros por fecha y dirección.
 * Columnas: fecha, número, dirección, duración, estado, grabación.
 * Usa shadcn/ui Table.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  PhoneIncoming,
  PhoneOutgoing,
  RefreshCw,
  Filter,
  Calendar,
  ArrowDownUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { CallPlayer } from './CallPlayer';
import type { CallRecord, CallDirection, CallStatus } from '@/lib/services/crm/callManagementService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

const STATUS_VARIANTS: Record<CallStatus, 'secondary' | 'success' | 'destructive' | 'warning' | 'info'> = {
  queued: 'secondary',
  ringing: 'warning',
  'in-progress': 'info',
  completed: 'success',
  failed: 'destructive',
  'no-answer': 'secondary',
  busy: 'destructive',
  canceled: 'secondary',
};

const STATUS_LABELS: Record<CallStatus, string> = {
  queued: 'En cola',
  ringing: 'Sonando',
  'in-progress': 'En curso',
  completed: 'Completada',
  failed: 'Fallida',
  'no-answer': 'Sin respuesta',
  busy: 'Ocupado',
  canceled: 'Cancelada',
};

// ─── Componente ──────────────────────────────────────────────────────────────

interface CallsTableProps {
  /** Filtros iniciales. */
  initialFilters?: {
    direction?: CallDirection;
    fromDate?: string;
    toDate?: string;
  };
  /** Límite de registros. */
  limit?: number;
}

export function CallsTable({ initialFilters, limit = 50 }: CallsTableProps) {
  const { toast } = useToast();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    direction: initialFilters?.direction ?? '',
    fromDate: initialFilters?.fromDate ?? '',
    toDate: initialFilters?.toDate ?? '',
  });

  // ─── Fetch llamadas ────────────────────────────────────────────────────────
  const loadCalls = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.direction) params.set('direction', filters.direction);
      if (filters.fromDate) params.set('from_date', filters.fromDate);
      if (filters.toDate) params.set('to_date', filters.toDate);
      params.set('limit', String(limit));

      const res = await fetch(`/api/crm/calls?${params.toString()}`);
      if (!res.ok) throw new Error('Error al cargar llamadas');
      const data = await res.json();

      setCalls(data.data ?? []);
      setCount(data.count ?? 0);
    } catch (err) {
      console.error('[CallsTable] Error:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las llamadas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [filters, limit, toast]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({ direction: '', fromDate: '', toDate: '' });
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Historial de Llamadas
          {count > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
              ({count} {count === 1 ? 'registro' : 'registros'})
            </span>
          )}
        </CardTitle>
        <Button
          onClick={loadCalls}
          variant="outline"
          size="sm"
          disabled={isLoading}
        >
          <RefreshCw size={14} className={`mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </CardHeader>

      {/* Filtros */}
      <div className="px-6 pb-4 flex flex-wrap items-end gap-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Filter size={12} /> Dirección
          </label>
          <select
            value={filters.direction}
            onChange={(e) => handleFilterChange('direction', e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">Todas</option>
            <option value="inbound">Entrantes</option>
            <option value="outbound">Salientes</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Calendar size={12} /> Desde
          </label>
          <Input
            type="date"
            value={filters.fromDate}
            onChange={(e) => handleFilterChange('fromDate', e.target.value)}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Calendar size={12} /> Hasta
          </label>
          <Input
            type="date"
            value={filters.toDate}
            onChange={(e) => handleFilterChange('toDate', e.target.value)}
            className="w-40"
          />
        </div>

        {(filters.direction || filters.fromDate || filters.toDate) && (
          <Button
            onClick={handleClearFilters}
            variant="ghost"
            size="sm"
            className="text-gray-500 dark:text-gray-400"
          >
            Limpiar
          </Button>
        )}
      </div>

      {/* Tabla */}
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 dark:border-gray-700">
              <TableHead className="w-[160px]">Fecha</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Número</TableHead>
              <TableHead className="w-[100px]">Duración</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[80px] text-center">Grabación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Skeleton rows
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={`skeleton-${i}-${j}`}>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : calls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <PhoneOutgoing size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No hay llamadas registradas</p>
                </TableCell>
              </TableRow>
            ) : (
              calls.map((call) => (
                <TableRow key={call.id} className="border-gray-200 dark:border-gray-700">
                  <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                    {formatDate(call.started_at ?? call.created_at)}
                  </TableCell>
                  <TableCell>
                    {call.direction === 'inbound' ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <PhoneIncoming size={14} />
                        <span className="text-xs">Entrante</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                        <PhoneOutgoing size={14} />
                        <span className="text-xs">Saliente</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-900 dark:text-gray-100">
                    {call.direction === 'inbound' ? call.from_number : call.to_number}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-gray-300 tabular-nums">
                    {formatDuration(call.duration_seconds)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[call.status]} className="text-[10px]">
                      {STATUS_LABELS[call.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <CallPlayer
                      callId={call.id}
                      recordingEnabled={call.recording_enabled}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
