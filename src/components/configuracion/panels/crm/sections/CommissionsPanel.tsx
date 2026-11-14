'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Save, RefreshCw, DollarSign, Calculator, User, Trash2 } from 'lucide-react';
import { commissionService, type VendorCommissionRate } from '@/lib/services/crm/commissionService';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { describeError } from '@/lib/utils/errorMessage';

export function CommissionsPanel() {
  const t = useTranslations('configuracionTextos.commissionsPanel');
  const { toast } = useToast();
  const { formatear: formatearMonedaBase } = useMonedaOrganizacion();

  const [generalRate, setGeneralRate] = useState<number>(0);
  const [vendorRates, setVendorRates] = useState<VendorCommissionRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Override dialog
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [editingOverride, setEditingOverride] = useState<VendorCommissionRate | null>(null);
  const [overrideForm, setOverrideForm] = useState({
    salesperson_id: '',
    rate: 0,
  });
  const [savingOverride, setSavingOverride] = useState(false);

  // Simulator
  const [simAmount, setSimAmount] = useState<number>(10000000);
  const [simResult, setSimResult] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [general, allRates] = await Promise.all([
        commissionService.getOrgDefaultRate(),
        commissionService.listVendorRates(),
      ]);
      setGeneralRate(general);
      setVendorRates(allRates);
    } catch (error) {
      console.error('Error cargando comisiones:', error);
      toast({ title: t('toast.error'), description: describeError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Simulador: calcula comision con la tasa general
  useEffect(() => {
    if (simAmount > 0) {
      setSimResult((simAmount * generalRate) / 100);
    } else {
      setSimResult(null);
    }
  }, [simAmount, generalRate]);

  const handleSaveGeneral = async () => {
    setSavingGeneral(true);
    try {
      await commissionService.saveOrgDefaultRate(generalRate);
      toast({
        title: t('toast.generalGuardada'),
        description: t('toast.tasaGeneral', { tasa: String(generalRate) }),
      });
    } catch (error) {
      console.error('Error guardando comision general:', error);
      toast({ title: t('toast.error'), description: describeError(error), variant: 'destructive' });
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleCreateOverride = () => {
    setEditingOverride(null);
    setOverrideForm({ salesperson_id: '', rate: generalRate });
    setOverrideDialogOpen(true);
  };

  const handleEditOverride = (override: VendorCommissionRate) => {
    setEditingOverride(override);
    setOverrideForm({
      salesperson_id: override.salesperson_id || '',
      rate: override.rate,
    });
    setOverrideDialogOpen(true);
  };

  const handleDeleteOverride = async (override: VendorCommissionRate) => {
    if (!confirm(t('confirmarEliminar'))) return;
    try {
      await commissionService.deleteOverride(override.id);
      toast({
        title: t('toast.overrideEliminado'),
        description: t('toast.overrideEliminadoDesc'),
      });
      loadData();
    } catch (error) {
      console.error('Error eliminando override:', error);
      toast({ title: t('toast.error'), description: describeError(error), variant: 'destructive' });
    }
  };

  const handleSaveOverride = async () => {
    if (!overrideForm.salesperson_id.trim()) {
      toast({ title: t('toast.validacion'), description: t('toast.faltaVendedor'), variant: 'destructive' });
      return;
    }
    setSavingOverride(true);
    try {
      await commissionService.saveVendorRate(
        overrideForm.salesperson_id.trim(),
        overrideForm.rate,
        editingOverride?.id ?? null
      );
      toast({
        title: editingOverride ? t('toast.overrideActualizado') : t('toast.overrideCreado'),
        description: t('toast.overrideGuardadoDesc'),
      });
      setOverrideDialogOpen(false);
      loadData();
    } catch (error) {
      console.error('Error guardando override:', error);
      toast({ title: t('toast.error'), description: describeError(error), variant: 'destructive' });
    } finally {
      setSavingOverride(false);
    }
  };

  // Simulación en la moneda base de la organización (nunca 'COP' cableado).
  const formatCurrency = (amount: number) => formatearMonedaBase(amount);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t('titulo')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('descripcion')}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Tasa general */}
      <Card className="border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-500" />
            {t('general.titulo')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('general.descripcion')}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={generalRate}
                onChange={(e) => setGeneralRate(Number(e.target.value))}
                min={0}
                max={100}
                step={0.5}
                className="w-24 text-center"
              />
              <span className="text-lg font-medium text-gray-700 dark:text-gray-300">%</span>
            </div>
            <Button onClick={handleSaveGeneral} disabled={savingGeneral} size="sm">
              <Save className="h-4 w-4 mr-1" />
              {savingGeneral ? t('guardando') : t('guardar')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Overrides por vendedor */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">{t('overrides.titulo')}</h4>
          <Button size="sm" onClick={handleCreateOverride}>
            <DollarSign className="h-4 w-4 mr-1" />
            {t('overrides.nuevo')}
          </Button>
        </div>

        {vendorRates.length === 0 ? (
          <div className="text-center py-8 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            <User className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('overrides.vacio')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {vendorRates.map((override) => (
              <Card key={override.id} className="border-gray-200 dark:border-gray-700">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0 bg-green-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {override.salesperson_name
                            || (override.salesperson_id ? `${override.salesperson_id.substring(0, 8)}...` : t('overrides.vendedor'))}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('overrides.tasa', { tasa: String(override.rate) })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEditOverride(override)}>
                        <DollarSign className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteOverride(override)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Simulador */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4 text-blue-500" />
            {t('simulador.titulo')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="sim-amount">{t('simulador.monto')}</Label>
            <Input
              id="sim-amount"
              type="number"
              value={simAmount}
              onChange={(e) => setSimAmount(Number(e.target.value))}
              min={0}
              step={1000000}
              placeholder="10000000"
            />
          </div>
          <div className="rounded-lg bg-white dark:bg-gray-900 p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('simulador.tasaAplicable')}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {generalRate}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('simulador.comisionEstimada')}</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                  {simResult != null ? formatCurrency(simResult) : '—'}
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('simulador.nota')}
          </p>
        </CardContent>
      </Card>

      {/* Dialog override */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOverride ? t('dialogo.tituloEditar') : t('dialogo.tituloNuevo')}</DialogTitle>
            <DialogDescription>
              {editingOverride
                ? t('dialogo.descripcionEditar')
                : t('dialogo.descripcionNuevo')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="override-salesperson">{t('dialogo.idVendedor')}</Label>
              <Input
                id="override-salesperson"
                value={overrideForm.salesperson_id}
                onChange={(e) => setOverrideForm((prev) => ({ ...prev, salesperson_id: e.target.value }))}
                placeholder={t('dialogo.idVendedorPlaceholder')}
                disabled={!!editingOverride}
              />
              <p className="text-xs text-gray-500">
                {t('dialogo.idVendedorAyuda')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="override-rate">{t('dialogo.tasa')}</Label>
              <Input
                id="override-rate"
                type="number"
                value={overrideForm.rate}
                onChange={(e) => setOverrideForm((prev) => ({ ...prev, rate: Number(e.target.value) }))}
                min={0}
                max={100}
                step={0.5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>{t('cancelar')}</Button>
            <Button onClick={handleSaveOverride} disabled={savingOverride}>
              {savingOverride ? t('guardando') : t('guardar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
