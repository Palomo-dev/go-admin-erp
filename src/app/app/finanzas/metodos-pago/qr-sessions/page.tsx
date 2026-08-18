'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/Utils';
import {
  QrCode,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  RefreshCw,
} from 'lucide-react';

// Tipo de estado de sesion QR
type SessionStatus = 'pending' | 'paid' | 'rejected' | 'expired' | 'cancelled';

// Tipo de filtro de estado
type StatusFilter = 'all' | SessionStatus;

// Interface de una sesion QR segun la tabla payment_qr_sessions
interface QrSession {
  id: string;
  organization_id: number;
  branch_id: number | null;
  provider_code: string | null;
  connector_code: string | null;
  reference: string | null;
  external_qr_id: string | null;
  amount: number | null;
  currency: string | null;
  source: string | null;
  source_id: string | null;
  status: SessionStatus;
  expires_at: string | null;
  paid_at: string | null;
  payment_id: string | null;
  created_at: string;
  updated_at: string;
}

// Opciones de filtro de estado disponibles
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'paid', label: 'Pagados' },
  { value: 'expired', label: 'Expirados' },
  { value: 'rejected', label: 'Rechazados' },
  { value: 'cancelled', label: 'Cancelados' },
];

// Mapeo de estado a variante de Badge y etiqueta
const STATUS_CONFIG: Record<
  SessionStatus,
  { variant: 'warning' | 'success' | 'secondary' | 'destructive'; label: string }
> = {
  pending: { variant: 'warning', label: 'Pendiente' },
  paid: { variant: 'success', label: 'Pagado' },
  expired: { variant: 'secondary', label: 'Expirado' },
  rejected: { variant: 'destructive', label: 'Rechazado' },
  cancelled: { variant: 'secondary', label: 'Cancelado' },
};

// Formatea una fecha ISO a formato legible en español (Colombia)
function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

export default function QrSessionsPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const [sessions, setSessions] = useState<QrSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Carga las sesiones QR desde Supabase filtrando por organizacion
  const loadSessions = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_qr_sessions')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setSessions((data as QrSession[]) ?? []);
    } catch (error) {
      console.error('Error al cargar sesiones QR:', error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  // Cargar sesiones al montar o cambiar organizacion
  useEffect(() => {
    if (orgId) {
      loadSessions();
    }
  }, [orgId, loadSessions]);

  // Filtra sesiones en cliente por estado y referencia
  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      // Filtro por estado
      if (filterStatus !== 'all' && session.status !== filterStatus) {
        return false;
      }
      // Filtro por referencia (busqueda parcial, insensible a mayusculas)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const reference = (session.reference ?? '').toLowerCase();
        if (!reference.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [sessions, filterStatus, searchQuery]);

  // Renderiza el Badge correspondiente al estado de la sesion
  const renderStatusBadge = (status: SessionStatus) => {
    const config = STATUS_CONFIG[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // Icono segun estado para la tabla
  const renderStatusIcon = (status: SessionStatus) => {
    switch (status) {
      case 'paid':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'expired':
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-gray-400" />;
      default:
        return null;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header con titulo y boton de refrescar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <QrCode className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Historial de Pagos QR
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Finanzas / Metodos de Pago / Sesiones QR
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={loadSessions}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
          />
          Refrescar
        </Button>
      </div>

      {/* Filtros: estado + busqueda por referencia */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              variant={filterStatus === filter.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por referencia..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Card con tabla de sesiones */}
      <Card>
        <CardHeader>
          <CardTitle>Sesiones QR ({filteredSessions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            // Estado de carga: skeleton/spinner
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-500 dark:text-gray-400">
                Cargando sesiones...
              </span>
            </div>
          ) : filteredSessions.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <QrCode className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                No hay sesiones QR para mostrar
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                {sessions.length === 0
                  ? 'Aun no se han generado sesiones QR.'
                  : 'No hay sesiones que coincidan con los filtros seleccionados.'}
              </p>
            </div>
          ) : (
            // Tabla de sesiones
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="py-3 px-3 font-medium">Referencia</th>
                    <th className="py-3 px-3 font-medium">Proveedor</th>
                    <th className="py-3 px-3 font-medium text-right">Monto</th>
                    <th className="py-3 px-3 font-medium">Estado</th>
                    <th className="py-3 px-3 font-medium">Origen</th>
                    <th className="py-3 px-3 font-medium">Creado</th>
                    <th className="py-3 px-3 font-medium">Pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session) => (
                    <tr
                      key={session.id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="py-3 px-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                        {session.reference ?? '-'}
                      </td>
                      <td className="py-3 px-3 text-gray-700 dark:text-gray-300">
                        {session.provider_code ?? '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-gray-900 dark:text-white">
                        {session.amount != null
                          ? formatCurrency(session.amount, session.currency ?? 'COP')
                          : '-'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          {renderStatusIcon(session.status)}
                          {renderStatusBadge(session.status)}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-gray-700 dark:text-gray-300">
                        {session.source ?? '-'}
                      </td>
                      <td className="py-3 px-3 text-gray-600 dark:text-gray-400 text-xs">
                        {formatDate(session.created_at)}
                      </td>
                      <td className="py-3 px-3 text-gray-600 dark:text-gray-400 text-xs">
                        {formatDate(session.paid_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
