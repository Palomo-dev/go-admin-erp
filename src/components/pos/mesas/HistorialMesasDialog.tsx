'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { History, Loader2, Users, DollarSign, Clock, ListChecks, RefreshCcw, ChevronDown, ChevronRight, Trash2, Unlock } from 'lucide-react';
import { cn, formatCurrency } from '@/utils/Utils';
import {
  MesasHistorialService,
  type HistorialSesion,
  type HistorialItemEliminado,
  type HistorialLiberacion,
} from './mesasHistorialService';

interface HistorialMesasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type QuickRange = 'today' | 'yesterday' | '7d' | '15d' | '30d' | 'custom';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: 'Activa', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  bill_requested: { label: 'Cuenta solicitada', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  completed: { label: 'Completada', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

const QUICK_RANGES: { key: QuickRange; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: '7d', label: '7 días' },
  { key: '15d', label: '15 días' },
  { key: '30d', label: '30 días' },
];

function rangeFromQuick(key: QuickRange): { from: Date; to: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (key) {
    case 'yesterday': {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return { from: d, to: d };
    }
    case '7d': {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from, to: today };
    }
    case '15d': {
      const from = new Date(today);
      from.setDate(from.getDate() - 14);
      return { from, to: today };
    }
    case '30d': {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from, to: today };
    }
    default:
      return { from: today, to: today };
  }
}

export function HistorialMesasDialog({ open, onOpenChange }: HistorialMesasDialogProps) {
  const [quickRange, setQuickRange] = useState<QuickRange>('today');
  const [dateFrom, setDateFrom] = useState<Date>(() => rangeFromQuick('today').from);
  const [dateTo, setDateTo] = useState<Date>(() => rangeFromQuick('today').to);

  const [mesas, setMesas] = useState<{ id: string; name: string; zone: string | null }[]>([]);
  const [meseros, setMeseros] = useState<{ id: string; name: string }[]>([]);
  const [tableId, setTableId] = useState<string>('all');
  const [serverId, setServerId] = useState<string>('all');

  const [sesiones, setSesiones] = useState<HistorialSesion[]>([]);
  const [itemsEliminados, setItemsEliminados] = useState<Record<string, HistorialItemEliminado[]>>({});
  const [liberaciones, setLiberaciones] = useState<Record<string, HistorialLiberacion>>({});
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar filtros (mesas / meseros) una vez al abrir
  useEffect(() => {
    if (!open) return;
    MesasHistorialService.getMesas().then(setMesas).catch(() => setMesas([]));
    MesasHistorialService.getMeseros().then(setMeseros).catch(() => setMeseros([]));
  }, [open]);

  const handleQuickRange = (key: QuickRange) => {
    setQuickRange(key);
    const { from, to } = rangeFromQuick(key);
    setDateFrom(from);
    setDateTo(to);
  };

  const cargarHistorial = async () => {
    setLoading(true);
    setError(null);
    try {
      const filtrosFecha = {
        dateFrom: toDateInputValue(dateFrom),
        dateTo: toDateInputValue(dateTo),
      };
      const data = await MesasHistorialService.getHistorial({
        ...filtrosFecha,
        tableId: tableId === 'all' ? null : tableId,
        serverId: serverId === 'all' ? null : serverId,
      });
      setSesiones(data);

      const eventosMap = await MesasHistorialService.getItemsEliminados(
        data.map((s) => s.id),
        filtrosFecha
      );
      setItemsEliminados(eventosMap);

      const liberacionesMap = await MesasHistorialService.getLiberaciones(
        data.map((s) => s.id),
        filtrosFecha
      );
      setLiberaciones(liberacionesMap);
    } catch (err) {
      console.error('Error cargando historial de mesas:', err);
      setError('No se pudo cargar el historial de mesas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dateFrom, dateTo, tableId, serverId]);

  const stats = useMemo(() => MesasHistorialService.computeStats(sesiones), [sesiones]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-none sm:w-[90vw] sm:max-w-5xl md:max-w-6xl lg:max-w-7xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Historial de Mesas
          </DialogTitle>
        </DialogHeader>

        {/* Filtros */}
        <div className="space-y-3">
          {/* Rangos rápidos */}
          <div className="flex flex-wrap gap-2">
            {QUICK_RANGES.map((r) => (
              <Button
                key={r.key}
                size="sm"
                variant={quickRange === r.key ? 'default' : 'outline'}
                className={cn('h-8 text-xs', quickRange === r.key && 'bg-blue-600 hover:bg-blue-700 text-white')}
                onClick={() => handleQuickRange(r.key)}
              >
                {r.label}
              </Button>
            ))}
          </div>

          {/* Rango personalizado + mesa + mesero */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <DatePicker
              date={dateFrom}
              onSelect={(d) => {
                if (!d) return;
                setQuickRange('custom');
                setDateFrom(d);
              }}
            />
            <DatePicker
              date={dateTo}
              onSelect={(d) => {
                if (!d) return;
                setQuickRange('custom');
                setDateTo(d);
              }}
            />
            <Select value={tableId} onValueChange={setTableId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todas las mesas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las mesas</SelectItem>
                {mesas.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}{m.zone ? ` · ${m.zone}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={serverId} onValueChange={setServerId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todos los meseros" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los meseros</SelectItem>
                {meseros.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Sesiones</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{stats.totalSesiones}</p>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            <div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Facturado</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(stats.totalFacturado)}</p>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
            <div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Duración prom.</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatDuration(stats.duracionPromedioMin)}</p>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
            <div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Comensales</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{stats.comensalesTotales}</p>
            </div>
          </div>
        </div>

        {/* Resultados */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {sesiones.length} sesión(es) encontrada(s)
            </p>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={cargarHistorial} disabled={loading}>
              <RefreshCcw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          )}

          {!loading && error && (
            <p className="text-sm text-red-600 dark:text-red-400 py-6 text-center">{error}</p>
          )}

          {!loading && !error && sesiones.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
              No hay sesiones de mesa en el rango y filtros seleccionados.
            </p>
          )}

          {!loading && !error && sesiones.length > 0 && (
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-xs sm:text-sm min-w-[700px]">
                <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="w-8 px-2 py-2"></th>
                    <th className="text-left font-medium px-3 py-2">Mesa</th>
                    <th className="text-left font-medium px-3 py-2">Mesero</th>
                    <th className="text-center font-medium px-3 py-2 hidden sm:table-cell">Comensales</th>
                    <th className="text-left font-medium px-3 py-2">Apertura</th>
                    <th className="text-left font-medium px-3 py-2">Cierre</th>
                    <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Duración</th>
                    <th className="text-right font-medium px-3 py-2">Total</th>
                    <th className="text-center font-medium px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {sesiones.map((s) => {
                    const statusCfg = STATUS_CONFIG[s.status] || { label: s.status, className: 'bg-gray-100 text-gray-700' };
                    const eventos = itemsEliminados[s.id] || [];
                    const liberacion = liberaciones[s.id];
                    const hasDetails = eventos.length > 0 || liberacion;
                    const isExpanded = expandedSessionId === s.id;
                    return (
                      <React.Fragment key={s.id}>
                        <tr
                          className={cn(
                            'hover:bg-gray-50 dark:hover:bg-gray-800/40',
                            hasDetails && 'cursor-pointer'
                          )}
                          onClick={() => hasDetails && setExpandedSessionId(isExpanded ? null : s.id)}
                        >
                          <td className="px-2 py-2 text-center">
                            {hasDetails && (
                              isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-gray-400 inline" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-gray-400 inline" />
                              )
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-900 dark:text-white">{s.tableName}</p>
                            {s.zone && <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.zone}</p>}
                          </td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{s.serverName}</td>
                          <td className="px-3 py-2 text-center text-gray-700 dark:text-gray-300 hidden sm:table-cell">{s.customers}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{formatDateTime(s.openedAt)}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{formatDateTime(s.closedAt)}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap hidden md:table-cell">{formatDuration(s.durationMinutes)}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">
                            {s.saleTotal !== null ? formatCurrency(s.saleTotal) : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              <Badge className={cn('text-[10px] font-medium', statusCfg.className)}>
                                {statusCfg.label}
                              </Badge>
                              {liberaciones[s.id] && (
                                <Badge variant="outline" className="text-[10px] gap-0.5 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                                  <Unlock className="h-3 w-3" />{liberaciones[s.id].userName}
                                </Badge>
                              )}
                              {eventos.length > 0 && (
                                <Badge variant="outline" className="text-[10px] gap-0.5 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800">
                                  <Trash2 className="h-3 w-3" />{eventos.length}
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && hasDetails && (
                          <tr>
                            <td colSpan={9} className="px-3 py-2 bg-gray-50/80 dark:bg-gray-800/30">
                              <div className="space-y-2">
                                {liberacion && (
                                  <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1">
                                    <Unlock className="h-3 w-3" />
                                    Liberada por {liberacion.userName} · {formatDateTime(liberacion.releasedAt)}
                                  </p>
                                )}
                                {eventos.length > 0 && (
                                  <>
                                <p className="text-[11px] font-medium text-red-700 dark:text-red-400 mb-1">
                                  Productos eliminados/cancelados de esta sesión
                                </p>
                              <ul className="space-y-1">
                                {eventos.map((ev) => (
                                  <li key={ev.id} className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
                                    <span>
                                      <span className="font-medium">{ev.quantity}x {ev.productName}</span>
                                      {' — eliminado por '}
                                      <span className="font-medium">{ev.userName}</span>
                                      {ev.motivo && ` (${ev.motivo})`}
                                    </span>
                                    <span className="flex items-center gap-2 shrink-0">
                                      <span className="text-gray-500 dark:text-gray-400">{formatCurrency(ev.total)}</span>
                                      <span className="text-gray-400 dark:text-gray-500">{formatDateTime(ev.createdAt)}</span>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
