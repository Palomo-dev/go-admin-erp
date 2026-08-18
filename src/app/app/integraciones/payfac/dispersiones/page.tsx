'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Banknote,
  Plus,
  RefreshCw,
  Loader2,
  Inbox,
  Eye,
  XCircle,
  Play,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/utils/Utils';

// Tipos
type ProviderCode = 'wompi' | 'bancolombia' | 'breb' | 'redeban';
type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
type PayoutMethod = 'breb' | 'ach' | 'manual' | 'mono_turbo';
type TabKey = 'pending' | 'processed' | 'all';

interface PayoutItem {
  payment_id: string;
  gross: number;
  commission: number;
  net: number;
  reference: string;
}

interface Payout {
  id: number;
  reference: string;
  organization_id: number;
  organization_name?: string;
  provider_code: ProviderCode;
  total_gross: number;
  total_commission: number;
  total_net: number;
  status: PayoutStatus;
  method: PayoutMethod;
  period_start: string;
  period_end: string;
  created_at: string;
  processed_at?: string;
  items?: PayoutItem[];
}

const PROVIDER_LABELS: Record<ProviderCode, string> = {
  wompi: 'Wompi',
  bancolombia: 'Bancolombia',
  breb: 'BREB',
  redeban: 'Redeban',
};

const METHOD_LABELS: Record<PayoutMethod, string> = {
  breb: 'BREB',
  ach: 'ACH',
  manual: 'Manual',
  mono_turbo: 'Mono Turbo',
};

// Configuracion de badges por estado
const STATUS_BADGE: Record<PayoutStatus, { label: string; variant: 'warning' | 'info' | 'success' | 'destructive' | 'secondary' }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  processing: { label: 'Procesando', variant: 'info' },
  completed: { label: 'Completado', variant: 'success' },
  failed: { label: 'Fallido', variant: 'destructive' },
  cancelled: { label: 'Cancelado', variant: 'secondary' },
};

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'processed', label: 'Procesadas' },
  { key: 'all', label: 'Todas' },
];

export default function DispersionesPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('pending');

  // Filtros
  const [filterOrg, setFilterOrg] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPayout, setDetailPayout] = useState<Payout | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Campos del formulario de creacion
  const [fOrgId, setFOrgId] = useState<string>('');
  const [fProvider, setFProvider] = useState<ProviderCode>('wompi');
  const [fPeriodStart, setFPeriodStart] = useState<string>('');
  const [fPeriodEnd, setFPeriodEnd] = useState<string>('');
  const [fMethod, setFMethod] = useState<PayoutMethod>('breb');

  // Mapear tab a status para la API
  const tabToStatus = (tab: TabKey): string => {
    if (tab === 'pending') return 'pending';
    if (tab === 'processed') return 'completed';
    return 'all';
  };

  // Cargar payouts segun tab
  const loadPayouts = useCallback(async () => {
    setLoading(true);
    try {
      const status = tabToStatus(activeTab);
      const url = status === 'all'
        ? '/api/integrations/payfac/payouts'
        : `/api/integrations/payfac/payouts?status=${status}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Error al cargar payouts');
      const data = await res.json();
      setPayouts(Array.isArray(data) ? data : data.data ?? []);
    } catch (error) {
      console.error('Error loading payouts:', error);
      toast.error('No se pudieron cargar las dispersiones');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadPayouts();
  }, [loadPayouts]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadPayouts();
  };

  // Filtrado en cliente
  const filteredPayouts = payouts.filter((p) => {
    if (filterOrg.trim()) {
      const q = filterOrg.toLowerCase();
      const match =
        String(p.organization_id).includes(q) ||
        (p.organization_name?.toLowerCase().includes(q) ?? false);
      if (!match) return false;
    }
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    return true;
  });

  // Crear payout
  const createPayout = async () => {
    const orgId = Number(fOrgId);
    if (!orgId || Number.isNaN(orgId)) {
      toast.error('El ID de organizacion es obligatorio');
      return;
    }
    if (!fPeriodStart || !fPeriodEnd) {
      toast.error('Debe seleccionar el periodo completo');
      return;
    }
    if (new Date(fPeriodEnd) < new Date(fPeriodStart)) {
      toast.error('La fecha final no puede ser anterior a la inicial');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        organization_id: orgId,
        provider_code: fProvider,
        period_start: fPeriodStart,
        period_end: fPeriodEnd,
        method: fMethod,
      };

      const res = await fetch('/api/integrations/payfac/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al crear payout');
      }

      toast.success('Payout creado');
      setCreateOpen(false);
      setFOrgId('');
      setFProvider('wompi');
      setFPeriodStart('');
      setFPeriodEnd('');
      setFMethod('breb');
      loadPayouts();
    } catch (error) {
      console.error('Error creating payout:', error);
      toast.error(error instanceof Error ? error.message : 'Error al crear payout');
    } finally {
      setSaving(false);
    }
  };

  // Procesar payout
  const processPayout = async (id: number) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/integrations/payfac/payouts/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al procesar');
      }
      toast.success('Payout en proceso');
      loadPayouts();
    } catch (error) {
      console.error('Error processing payout:', error);
      toast.error(error instanceof Error ? error.message : 'Error al procesar payout');
    } finally {
      setActionLoading(null);
    }
  };

  // Cancelar payout
  const cancelPayout = async (id: number) => {
    if (!confirm('¿Cancelar este payout?')) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/integrations/payfac/payouts/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: 'Cancelado por admin' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al cancelar');
      }
      toast.success('Payout cancelado');
      loadPayouts();
    } catch (error) {
      console.error('Error cancelling payout:', error);
      toast.error(error instanceof Error ? error.message : 'Error al cancelar payout');
    } finally {
      setActionLoading(null);
    }
  };

  // Ver detalle de payout
  const getPayoutDetail = async (id: number) => {
    setDetailOpen(true);
    setLoadingDetail(true);
    setDetailPayout(null);
    try {
      const res = await fetch(`/api/integrations/payfac/payouts/${id}`);
      if (!res.ok) throw new Error('Error al cargar detalle');
      const data = await res.json();
      setDetailPayout(data);
    } catch (error) {
      console.error('Error loading payout detail:', error);
      toast.error('No se pudo cargar el detalle');
    } finally {
      setLoadingDetail(false);
    }
  };

  const openCreate = () => {
    setCreateOpen(true);
  };

  // Skeleton de carga
  if (loading) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-6">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              <div className="space-y-2">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-56" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-72" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 animate-pulse h-16" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Banknote className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Dispersiones (Payouts)
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Gestiona las dispersiones de fondos a las organizaciones
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refrescar
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nuevo payout
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">Organizacion</Label>
            <Input
              value={filterOrg}
              onChange={(e) => setFilterOrg(e.target.value)}
              placeholder="ID o nombre"
              className="w-48"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">Estado</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="processing">Procesando</SelectItem>
                <SelectItem value="completed">Completado</SelectItem>
                <SelectItem value="failed">Fallido</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(filterOrg || filterStatus !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterOrg('');
                setFilterStatus('all');
              }}
            >
              <Filter className="h-4 w-4" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Tabla de payouts */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-6">
        <Card className="dark:bg-gray-900 dark:border-gray-800">
          <CardContent className="p-0">
            {filteredPayouts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Inbox className="h-10 w-10 text-gray-400 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No hay dispersiones para mostrar
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Organizacion</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Comision</TableHead>
                    <TableHead>Neto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayouts.map((payout) => {
                    const statusCfg = STATUS_BADGE[payout.status];
                    return (
                      <TableRow key={payout.id}>
                        <TableCell className="font-mono text-xs dark:text-gray-300">
                          {payout.reference}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium dark:text-gray-100">
                            {payout.organization_name || `Org #${payout.organization_id}`}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-500">
                            ID: {payout.organization_id}
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {PROVIDER_LABELS[payout.provider_code] ?? payout.provider_code}
                        </TableCell>
                        <TableCell className="font-medium dark:text-gray-100">
                          {formatCurrency(payout.total_gross)}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {formatCurrency(payout.total_commission)}
                        </TableCell>
                        <TableCell className="font-medium dark:text-gray-100">
                          {formatCurrency(payout.total_net)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {METHOD_LABELS[payout.method] ?? payout.method}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                          {new Date(payout.period_start).toLocaleDateString('es-CO')} - {new Date(payout.period_end).toLocaleDateString('es-CO')}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {new Date(payout.created_at).toLocaleDateString('es-CO')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {payout.status === 'pending' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => processPayout(payout.id)}
                                  disabled={actionLoading === payout.id}
                                  className="text-green-600 hover:text-green-700 dark:text-green-400"
                                  title="Procesar"
                                >
                                  {actionLoading === payout.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Play className="h-4 w-4" />
                                  )}
                                  Procesar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => cancelPayout(payout.id)}
                                  disabled={actionLoading === payout.id}
                                  className="text-red-600 hover:text-red-700 dark:text-red-400"
                                  title="Cancelar"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {payout.status === 'completed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => getPayoutDetail(payout.id)}
                                title="Ver detalle"
                              >
                                <Eye className="h-4 w-4" />
                                Detalle
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog crear payout */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="md:max-w-lg dark:bg-gray-900 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Nuevo payout</DialogTitle>
            <DialogDescription>
              Cree una dispersion de fondos para una organizacion
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p_org_id">ID de organizacion</Label>
              <Input
                id="p_org_id"
                type="number"
                value={fOrgId}
                onChange={(e) => setFOrgId(e.target.value)}
                placeholder="Ej: 123"
              />
            </div>

            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Select value={fProvider} onValueChange={(v) => setFProvider(v as ProviderCode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROVIDER_LABELS) as ProviderCode[]).map((p) => (
                    <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p_start">Periodo inicio</Label>
                <Input
                  id="p_start"
                  type="date"
                  value={fPeriodStart}
                  onChange={(e) => setFPeriodStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p_end">Periodo fin</Label>
                <Input
                  id="p_end"
                  type="date"
                  value={fPeriodEnd}
                  onChange={(e) => setFPeriodEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Metodo de dispersion</Label>
              <Select value={fMethod} onValueChange={(v) => setFMethod(v as PayoutMethod)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione metodo" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(METHOD_LABELS) as PayoutMethod[]).map((m) => (
                    <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createPayout} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog detalle de payout */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="md:max-w-2xl dark:bg-gray-900 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Detalle del payout</DialogTitle>
            <DialogDescription>
              {detailPayout?.reference ?? 'Cargando...'}
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : detailPayout ? (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Bruto</p>
                  <p className="text-sm font-semibold dark:text-white">
                    {formatCurrency(detailPayout.total_gross)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Comision</p>
                  <p className="text-sm font-semibold dark:text-white">
                    {formatCurrency(detailPayout.total_commission)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Neto</p>
                  <p className="text-sm font-semibold dark:text-white">
                    {formatCurrency(detailPayout.total_net)}
                  </p>
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Items del payout
                </p>
                {detailPayout.items && detailPayout.items.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment ID</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Bruto</TableHead>
                        <TableHead>Comision</TableHead>
                        <TableHead>Neto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailPayout.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs dark:text-gray-300">
                            {item.payment_id}
                          </TableCell>
                          <TableCell className="text-xs dark:text-gray-400">
                            {item.reference}
                          </TableCell>
                          <TableCell className="dark:text-gray-200">
                            {formatCurrency(item.gross)}
                          </TableCell>
                          <TableCell className="dark:text-gray-200">
                            {formatCurrency(item.commission)}
                          </TableCell>
                          <TableCell className="font-medium dark:text-gray-100">
                            {formatCurrency(item.net)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                    Sin items disponibles
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
              No se pudo cargar el detalle
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
