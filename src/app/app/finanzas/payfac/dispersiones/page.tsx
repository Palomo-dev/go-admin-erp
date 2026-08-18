'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  RefreshCw,
  Banknote,
  TrendingUp,
  Percent,
  Clock,
  Inbox,
  ArrowRightLeft,
} from 'lucide-react';

// --- Tipos ---

// Estado de una dispersion
type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

// Filtro de estado aplicable a la lista
type StatusFilter = 'all' | 'pending' | 'processing' | 'failed';

// Resumen de montos de dispersiones
interface PayoutSummary {
  total_gross: number;
  total_commission: number;
  total_net: number;
  pending: number;
  currency?: string;
}

// Item individual dentro de una dispersion
interface PayoutItem {
  id: string;
  payment_id: string;
  gross: number;
  commission: number;
  net: number;
  reference?: string | null;
}

// Dispersion (payout) recibida del ERP admin
interface Payout {
  id: string;
  reference: string;
  provider: string;
  gross: number;
  commission: number;
  net: number;
  status: PayoutStatus;
  method?: string | null;
  period?: string | null;
  created_at: string;
  currency?: string;
  items?: PayoutItem[];
}

// --- Configuracion estatica ---

// Mapeo de estado -> variante de Badge y etiqueta
const STATUS_CONFIG: Record<
  PayoutStatus,
  { variant: 'warning' | 'info' | 'success' | 'destructive' | 'secondary'; label: string }
> = {
  pending: { variant: 'warning', label: 'Pendiente' },
  processing: { variant: 'info', label: 'Procesando' },
  completed: { variant: 'success', label: 'Completada' },
  failed: { variant: 'destructive', label: 'Fallida' },
  cancelled: { variant: 'secondary', label: 'Cancelada' },
};

// Opciones de filtro por estado
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'processing', label: 'Procesadas' },
  { value: 'failed', label: 'Fallidas' },
];

// Formatea una fecha ISO a formato legible en español (Colombia)
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return '-';
  }
}

// Renderiza el Badge correspondiente al estado
function renderStatusBadge(status: PayoutStatus) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export default function DispersionesPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const orgId = organization?.id;

  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Carga el resumen de montos desde la API
  const loadSummary = useCallback(async () => {
    if (!orgId) return;
    setLoadingSummary(true);
    try {
      const res = await fetch(
        `/api/integrations/payfac/payouts/summary?organizationId=${orgId}`
      );
      if (!res.ok) throw new Error('Error al obtener resumen');
      const data: PayoutSummary = await res.json();
      setSummary(data);
    } catch (error) {
      console.error('Error cargando resumen de dispersiones:', error);
      toast.error('No se pudo cargar el resumen de dispersiones');
    } finally {
      setLoadingSummary(false);
    }
  }, [orgId]);

  // Carga la lista de dispersiones filtrada por estado
  const loadPayouts = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ organizationId: String(orgId) });
      if (filterStatus !== 'all') {
        params.set('status', filterStatus);
      }
      const res = await fetch(
        `/api/integrations/payfac/payouts?${params.toString()}`
      );
      if (!res.ok) throw new Error('Error al obtener dispersiones');
      const data: Payout[] = await res.json();
      setPayouts(data);
    } catch (error) {
      console.error('Error cargando dispersiones:', error);
      toast.error('No se pudieron cargar las dispersiones');
      setPayouts([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, filterStatus]);

  // Carga el detalle de una dispersion al hacer clic
  const getPayoutDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/integrations/payfac/payouts/${id}`);
      if (!res.ok) throw new Error('Error al obtener detalle');
      const data: Payout = await res.json();
      setSelectedPayout(data);
    } catch (error) {
      console.error('Error cargando detalle de dispersion:', error);
      toast.error('No se pudo cargar el detalle de la dispersion');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Cargar datos al montar o cambiar organizacion/filtro
  useEffect(() => {
    if (orgId) {
      loadSummary();
      loadPayouts();
    }
  }, [orgId, loadSummary, loadPayouts]);

  // Spinner mientras carga la organizacion
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">
          Cargando organizacion...
        </span>
      </div>
    );
  }

  // Sin organizacion activa
  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <Inbox className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">
          No hay organizacion activa
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Selecciona una organizacion para ver tus dispersiones.
        </p>
      </div>
    );
  }

  const currency = summary?.currency ?? 'COP';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <ArrowRightLeft className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Mis Dispersiones
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Pagos recibidos del procesador
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            loadSummary();
            loadPayouts();
          }}
          disabled={loading || loadingSummary}
          className="flex items-center gap-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading || loadingSummary ? 'animate-spin' : ''}`}
          />
          Refrescar
        </Button>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total recaudado (gross) */}
        <Card className="dark:bg-gray-800/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Recaudado
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
            ) : (
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(summary?.total_gross ?? 0, currency)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Total comision */}
        <Card className="dark:bg-gray-800/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Comision
            </CardTitle>
            <Percent className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
            ) : (
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(summary?.total_commission ?? 0, currency)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Total dispersado (neto) */}
        <Card className="dark:bg-gray-800/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Dispersado
            </CardTitle>
            <Banknote className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
            ) : (
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(summary?.total_net ?? 0, currency)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pendiente de dispersion */}
        <Card className="dark:bg-gray-800/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Pendiente de Dispersion
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
            ) : (
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(summary?.pending ?? 0, currency)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filtros por estado */}
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

      {/* Tabla de dispersiones */}
      <Card className="dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900 dark:text-white">
            Dispersiones ({payouts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            // Estado de carga
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-500 dark:text-gray-400">
                Cargando dispersiones...
              </span>
            </div>
          ) : payouts.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                No hay dispersiones para mostrar
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Aun no se han registrado dispersiones para esta organizacion.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Comision</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Metodo</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow
                    key={payout.id}
                    className="cursor-pointer"
                    onClick={() => getPayoutDetail(payout.id)}
                  >
                    <TableCell className="font-mono text-xs text-gray-700 dark:text-gray-300">
                      {payout.reference}
                    </TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      {payout.provider}
                    </TableCell>
                    <TableCell className="text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(payout.gross, payout.currency ?? currency)}
                    </TableCell>
                    <TableCell className="text-right text-orange-600 dark:text-orange-400">
                      {formatCurrency(payout.commission, payout.currency ?? currency)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                      {formatCurrency(payout.net, payout.currency ?? currency)}
                    </TableCell>
                    <TableCell>{renderStatusBadge(payout.status)}</TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      {payout.method ?? '-'}
                    </TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      {payout.period ?? '-'}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400 text-xs">
                      {formatDate(payout.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de detalle de dispersion */}
      <Dialog
        open={!!selectedPayout || detailLoading}
        onOpenChange={(open) => {
          if (!open) setSelectedPayout(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-500 dark:text-gray-400">
                Cargando detalle...
              </span>
            </div>
          ) : selectedPayout ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Dispersion {selectedPayout.reference}
                  {renderStatusBadge(selectedPayout.status)}
                </DialogTitle>
                <DialogDescription>
                  Detalle de la dispersion recibida del procesador.
                </DialogDescription>
              </DialogHeader>

              {/* Resumen de la dispersion */}
              <div className="grid grid-cols-3 gap-4 py-2">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Total Recaudado
                  </p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {formatCurrency(
                      selectedPayout.gross,
                      selectedPayout.currency ?? currency
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Comision
                  </p>
                  <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                    {formatCurrency(
                      selectedPayout.commission,
                      selectedPayout.currency ?? currency
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Neto Recibido
                  </p>
                  <p className="text-sm font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(
                      selectedPayout.net,
                      selectedPayout.currency ?? currency
                    )}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Items de la dispersion */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Items de la dispersion
                </h4>
                {selectedPayout.items && selectedPayout.items.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment ID</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead className="text-right">Bruto</TableHead>
                        <TableHead className="text-right">Comision</TableHead>
                        <TableHead className="text-right">Neto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPayout.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs text-gray-700 dark:text-gray-300">
                            {item.payment_id}
                          </TableCell>
                          <TableCell className="text-gray-700 dark:text-gray-300">
                            {item.reference ?? '-'}
                          </TableCell>
                          <TableCell className="text-right text-gray-900 dark:text-white">
                            {formatCurrency(
                              item.gross,
                              selectedPayout.currency ?? currency
                            )}
                          </TableCell>
                          <TableCell className="text-right text-orange-600 dark:text-orange-400">
                            {formatCurrency(
                              item.commission,
                              selectedPayout.currency ?? currency
                            )}
                          </TableCell>
                          <TableCell className="text-right text-green-600 dark:text-green-400">
                            {formatCurrency(
                              item.net,
                              selectedPayout.currency ?? currency
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                    Esta dispersion no tiene items detallados.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
