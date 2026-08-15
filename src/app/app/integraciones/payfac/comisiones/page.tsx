'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Percent,
  Plus,
  RefreshCw,
  Pencil,
  Loader2,
  Inbox,
  DollarSign,
  Building2,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
type CommissionType = 'percentage' | 'fixed_amount';

interface Commission {
  id: number;
  organization_id: number;
  organization_name?: string;
  provider_code: ProviderCode;
  commission_type: CommissionType;
  commission_value: number;
  minimum_amount?: number | null;
  total_collected?: number;
  is_active: boolean;
  created_at?: string;
}

interface CommissionSummary {
  total_collected: number;
  total_commission: number;
  active_organizations: number;
}

const PROVIDER_LABELS: Record<ProviderCode, string> = {
  wompi: 'Wompi',
  bancolombia: 'Bancolombia',
  breb: 'BREB',
  redeban: 'Redeban',
};

export default function ComisionesPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Commission | null>(null);
  const [saving, setSaving] = useState(false);

  // Campos del formulario
  const [fOrgId, setFOrgId] = useState<string>('');
  const [fOrgName, setFOrgName] = useState<string>('');
  const [fProvider, setFProvider] = useState<ProviderCode>('wompi');
  const [fType, setFType] = useState<CommissionType>('percentage');
  const [fValue, setFValue] = useState<string>('');
  const [fMinimum, setFMinimum] = useState<string>('');

  // Cargar comisiones
  const loadCommissions = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/payfac/commission');
      if (!res.ok) throw new Error('Error al cargar comisiones');
      const data = await res.json();
      setCommissions(Array.isArray(data) ? data : data.data ?? []);
    } catch (error) {
      console.error('Error loading commissions:', error);
      toast.error('No se pudieron cargar las comisiones');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Cargar resumen
  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/payfac/commission/summary');
      if (!res.ok) throw new Error('Error al cargar resumen');
      const data = await res.json();
      setSummary(data);
    } catch (error) {
      console.error('Error loading summary:', error);
    }
  }, []);

  useEffect(() => {
    loadCommissions();
    loadSummary();
  }, [loadCommissions, loadSummary]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadCommissions();
    loadSummary();
  };

  const openCreate = () => {
    setEditing(null);
    setFOrgId('');
    setFOrgName('');
    setFProvider('wompi');
    setFType('percentage');
    setFValue('');
    setFMinimum('');
    setDialogOpen(true);
  };

  const openEdit = (comm: Commission) => {
    setEditing(comm);
    setFOrgId(String(comm.organization_id));
    setFOrgName(comm.organization_name ?? '');
    setFProvider(comm.provider_code);
    setFType(comm.commission_type);
    setFValue(String(comm.commission_value));
    setFMinimum(comm.minimum_amount != null ? String(comm.minimum_amount) : '');
    setDialogOpen(true);
  };

  // Guardar comision
  const saveCommission = async () => {
    const orgId = Number(fOrgId);
    if (!orgId || Number.isNaN(orgId)) {
      toast.error('El ID de organizacion es obligatorio y numerico');
      return;
    }
    const value = Number(fValue);
    if (Number.isNaN(value) || value < 0) {
      toast.error('El valor de comision es obligatorio');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: editing?.id,
        organization_id: orgId,
        organization_name: fOrgName || undefined,
        provider_code: fProvider,
        commission_type: fType,
        commission_value: value,
        minimum_amount: fMinimum ? Number(fMinimum) : null,
      };

      const res = await fetch('/api/integrations/payfac/commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al guardar comision');
      }

      toast.success(editing ? 'Comision actualizada' : 'Comision creada');
      setDialogOpen(false);
      loadCommissions();
      loadSummary();
    } catch (error) {
      console.error('Error saving commission:', error);
      toast.error(error instanceof Error ? error.message : 'Error al guardar comision');
    } finally {
      setSaving(false);
    }
  };

  const typeBadge = (type: CommissionType) =>
    type === 'percentage'
      ? <Badge variant="info">Porcentaje</Badge>
      : <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-700/30 dark:text-purple-100 border-transparent">Monto fijo</Badge>;

  const formatValue = (comm: Commission): string => {
    if (comm.commission_type === 'percentage') {
      return `${comm.commission_value}%`;
    }
    return formatCurrency(comm.commission_value);
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 animate-pulse h-28" />
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
              <Percent className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Comisiones por Organizacion
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Define y administra las comisiones que cobra el ERP a cada organizacion
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
              Nueva comision
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {/* Resumen superior */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Total recaudado
              </CardTitle>
              <DollarSign className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold dark:text-white">
                {formatCurrency(summary?.total_collected ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Total comision
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold dark:text-white">
                {formatCurrency(summary?.total_commission ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Organizaciones activas
              </CardTitle>
              <Building2 className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold dark:text-white">
                {summary?.active_organizations ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabla de comisiones */}
        <Card className="dark:bg-gray-900 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="dark:text-white">Comisiones configuradas</CardTitle>
            <CardDescription>
              {commissions.length} comision(es) registrada(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {commissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Inbox className="h-10 w-10 text-gray-400 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No hay comisiones configuradas
                </p>
                <Button size="sm" variant="outline" className="mt-4" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Crear primera comision
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organizacion</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Minimo</TableHead>
                    <TableHead>Total recaudado</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((comm) => (
                    <TableRow key={comm.id}>
                      <TableCell>
                        <div className="font-medium dark:text-gray-100">
                          {comm.organization_name || `Org #${comm.organization_id}`}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-500">
                          ID: {comm.organization_id}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {PROVIDER_LABELS[comm.provider_code] ?? comm.provider_code}
                      </TableCell>
                      <TableCell>{typeBadge(comm.commission_type)}</TableCell>
                      <TableCell className="font-medium dark:text-gray-100">
                        {formatValue(comm)}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {comm.minimum_amount != null ? formatCurrency(comm.minimum_amount) : '-'}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {comm.total_collected != null ? formatCurrency(comm.total_collected) : '-'}
                      </TableCell>
                      <TableCell>
                        {comm.is_active
                          ? <Badge variant="success">Activa</Badge>
                          : <Badge variant="secondary">Inactiva</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(comm)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="md:max-w-lg dark:bg-gray-900 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="dark:text-white">
              {editing ? 'Editar comision' : 'Nueva comision'}
            </DialogTitle>
            <DialogDescription>
              Configure la comision que el ERP cobra a la organizacion
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* ID organizacion */}
            <div className="space-y-2">
              <Label htmlFor="org_id">ID de organizacion</Label>
              <Input
                id="org_id"
                type="number"
                value={fOrgId}
                onChange={(e) => setFOrgId(e.target.value)}
                placeholder="Ej: 123"
                disabled={!!editing}
              />
            </div>

            {/* Nombre organizacion (opcional) */}
            <div className="space-y-2">
              <Label htmlFor="org_name">Nombre de organizacion (opcional)</Label>
              <Input
                id="org_name"
                type="text"
                value={fOrgName}
                onChange={(e) => setFOrgName(e.target.value)}
                placeholder="Ej: Mi Empresa SAS"
              />
            </div>

            {/* Proveedor */}
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

            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo de comision</Label>
              <Select value={fType} onValueChange={(v) => setFType(v as CommissionType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                  <SelectItem value="fixed_amount">Monto fijo (COP)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Valor */}
            <div className="space-y-2">
              <Label htmlFor="comm_value">
                Valor {fType === 'percentage' ? '(%)' : '(COP)'}
              </Label>
              <Input
                id="comm_value"
                type="number"
                step={fType === 'percentage' ? '0.01' : '100'}
                value={fValue}
                onChange={(e) => setFValue(e.target.value)}
                placeholder={fType === 'percentage' ? 'Ej: 2.5' : 'Ej: 1000'}
              />
            </div>

            {/* Minimo (opcional) */}
            <div className="space-y-2">
              <Label htmlFor="comm_min">Monto minimo (opcional, COP)</Label>
              <Input
                id="comm_min"
                type="number"
                value={fMinimum}
                onChange={(e) => setFMinimum(e.target.value)}
                placeholder="Ej: 500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveCommission} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
