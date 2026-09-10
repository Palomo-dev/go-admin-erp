'use client';

/**
 * CallsTable — historial de llamadas (FASE-03 §5.2).
 * GET /api/crm/calls (CallListRow: cliente, oportunidad, usuario, grabaciones).
 * Columnas: fecha, dirección/modo, contacto, usuario, duración, resultado, estado, grabación.
 * Filtros: rango, dirección, modo, "mis llamadas", resultado, con grabación, búsqueda.
 * Fila expandible → CallRowDetail (player + transcripción + análisis, F4).
 */

import { useState, useEffect, useCallback } from 'react';
import { PhoneOutgoing, RefreshCw, Mic } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadErrorState } from '@/components/common/LoadErrorState';
import { describeError, logError } from '@/lib/utils/errorMessage';
import { fetchJson } from '@/lib/utils/fetchJson';
import { CallRow, MODE_ICONS, STATUS_LABELS } from './CallRow';
import type { CallListRow } from '@/lib/services/crm/callManagementService';
import { DISPOSITION_LABELS } from '@/lib/services/crm/callDispositionService';

// La fila (celdas, `data-*`, atajos y detalle) vive en `CallRow.tsx`; se
// reexporta `STATUS_LABELS` para no romper a quien lo importe desde aquí.
export { STATUS_LABELS };

export interface CallsTableFilters {
  direction: string;
  mode: string;
  outcome: string;
  mine: boolean;
  hasRecording: boolean;
  q: string;
  fromDate: string;
  toDate: string;
}

const EMPTY_FILTERS: CallsTableFilters = { direction: '', mode: '', outcome: '', mine: false, hasRecording: false, q: '', fromDate: '', toDate: '' };

interface CallsTableProps {
  initialFilters?: Partial<CallsTableFilters>;
  limit?: number;
  /** Abre esta llamada expandida (deep link ?call=). */
  openCallId?: string | null;
  refreshKey?: number;
}

export function CallsTable({ initialFilters, limit = 50, openCallId, refreshKey }: CallsTableProps) {
  const [calls, setCalls] = useState<CallListRow[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CallsTableFilters>({ ...EMPTY_FILTERS, ...initialFilters });
  const [expanded, setExpanded] = useState<string | null>(openCallId ?? null);

  const loadCalls = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (filters.direction) params.set('direction', filters.direction);
      if (filters.mode) params.set('mode', filters.mode);
      if (filters.outcome) params.set('outcome', filters.outcome);
      if (filters.mine) params.set('user_id', 'me');
      if (filters.hasRecording) params.set('has_recording', 'true');
      if (filters.q.trim()) params.set('q', filters.q.trim());
      if (filters.fromDate) params.set('from_date', `${filters.fromDate}T00:00:00.000Z`);
      if (filters.toDate) params.set('to_date', `${filters.toDate}T23:59:59.999Z`);
      params.set('limit', String(limit));
      const data = await fetchJson<{ data?: CallListRow[]; count?: number }>(`/api/crm/calls?${params.toString()}`);
      setCalls(data.data ?? []);
      setCount(data.count ?? 0);
    } catch (err) {
      logError('[CallsTable] cargar llamadas', err);
      // Sin esto, un fallo de red se veía igual que "aún no hay llamadas".
      setCalls([]);
      setCount(0);
      setLoadError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  }, [filters, limit]);

  useEffect(() => {
    void loadCalls();
  }, [loadCalls, refreshKey]);

  useEffect(() => {
    if (openCallId) setExpanded(openCallId);
  }, [openCallId]);

  const set = <K extends keyof CallsTableFilters>(key: K, value: CallsTableFilters[K]) => setFilters((prev) => ({ ...prev, [key]: value }));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const selectClass = 'h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200';

  return (
    <Card className="border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Historial de llamadas
          {count > 0 && <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">({count})</span>}
        </CardTitle>
        <Button onClick={() => void loadCalls()} variant="outline" size="sm" disabled={isLoading}>
          <RefreshCw size={14} className={`mr-1.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Actualizar
        </Button>
      </CardHeader>

      <div className="flex flex-wrap items-end gap-2 border-b border-gray-200 px-4 pb-3 dark:border-gray-700" role="search" aria-label="Filtros de llamadas">
        <Input type="search" value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Buscar número…" aria-label="Buscar por número" className="h-9 w-40" />
        <select value={filters.direction} onChange={(e) => set('direction', e.target.value)} className={selectClass} aria-label="Dirección">
          <option value="">Todas</option>
          <option value="inbound">Entrantes</option>
          <option value="outbound">Salientes</option>
        </select>
        <select value={filters.mode} onChange={(e) => set('mode', e.target.value)} className={selectClass} aria-label="Modo">
          <option value="">Todos los modos</option>
          {Object.entries(MODE_ICONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select value={filters.outcome} onChange={(e) => set('outcome', e.target.value)} className={selectClass} aria-label="Resultado">
          <option value="">Todos los resultados</option>
          {Object.entries(DISPOSITION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Input type="date" value={filters.fromDate} onChange={(e) => set('fromDate', e.target.value)} aria-label="Desde" className="h-9 w-36" />
        <Input type="date" value={filters.toDate} onChange={(e) => set('toDate', e.target.value)} aria-label="Hasta" className="h-9 w-36" />
        <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={filters.mine} onChange={(e) => set('mine', e.target.checked)} /> Mis llamadas
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={filters.hasRecording} onChange={(e) => set('hasRecording', e.target.checked)} /> Con grabación
        </label>
        {hasFilters && (
          <Button onClick={() => setFilters(EMPTY_FILTERS)} variant="ghost" size="sm" className="text-gray-500 dark:text-gray-400">
            Limpiar
          </Button>
        )}
      </div>

      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 dark:border-gray-700">
              <TableHead className="w-8" />
              <TableHead className="w-[120px]">Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead className="w-[80px]">Duración</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[70px] text-center">
                <Mic size={14} className="mx-auto" aria-label="Grabación" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j}>
                      <div className="h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : loadError ? (
              <TableRow>
                <TableCell colSpan={9} className="p-4">
                  <LoadErrorState
                    title="No se pudieron cargar las llamadas"
                    message={loadError}
                    onRetry={() => void loadCalls()}
                    isRetrying={isLoading}
                  />
                </TableCell>
              </TableRow>
            ) : calls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-gray-500 dark:text-gray-400">
                  <PhoneOutgoing size={32} className="mx-auto mb-2 opacity-40" aria-hidden="true" />
                  <p className="text-sm">Aún no hay llamadas. Llama desde el pipeline, la oportunidad o el softphone.</p>
                </TableCell>
              </TableRow>
            ) : (
              calls.map((call) => (
                <CallRow
                  key={call.id}
                  call={call}
                  isOpen={expanded === call.id}
                  onToggle={() => setExpanded(expanded === call.id ? null : call.id)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
