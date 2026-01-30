'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import PayrollService from '@/lib/services/payrollService';
import PayrollCalculationService from '@/lib/services/payrollCalculationService';
import type { PayrollPeriod } from '@/lib/services/payrollService';
import { supabase } from '@/lib/supabase/config';
import { PeriodsTable } from '@/components/hrm/nomina';
import { formatCurrency } from '@/utils/Utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  RefreshCw,
  Calculator,
  Plus,
  Search,
  Calendar,
  DollarSign,
  Users,
  FileText,
  ArrowLeft,
  Play,
  Loader2,
} from 'lucide-react';

export default function NominaPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [stats, setStats] = useState({
    totalPeriods: 0,
    pendingPeriods: 0,
    totalGross: 0,
    totalNet: 0,
    totalEmployerCost: 0,
    totalEmployees: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [frequencyFilter, setFrequencyFilter] = useState<string>('all');

  // Dialog states
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showCalculateDialog, setShowCalculateDialog] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [isCalculating, setIsCalculating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Obtener usuario actual
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getUser();
  }, []);

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new PayrollService(organization.id);
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const filters: any = {};
      if (statusFilter && statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      if (frequencyFilter && frequencyFilter !== 'all') {
        filters.frequency = frequencyFilter;
      }

      const [periodsData, statsData] = await Promise.all([
        service.getPeriods(filters),
        service.getStats(),
      ]);

      // Filter by search term
      let filtered = periodsData;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = periodsData.filter(p =>
          p.name?.toLowerCase().includes(term)
        );
      }

      setPeriods(filtered);
      setStats(statsData);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los periodos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, searchTerm, statusFilter, frequencyFilter, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleChangeStatus = async (period: PayrollPeriod, status: string) => {
    const service = getService();
    if (!service) return;

    try {
      await service.changePeriodStatus(period.id, status);
      toast({ title: `Periodo ${status === 'approved' ? 'aprobado' : status === 'paid' ? 'marcado como pagado' : 'actualizado'}` });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const service = getService();
    if (!service) return;

    try {
      await service.deletePeriod(deleteId);
      toast({ title: 'Periodo eliminado' });
      setDeleteId(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el periodo',
        variant: 'destructive',
      });
    }
  };

  // Calcular nómina desde timesheets
  const handleCalculatePayroll = async () => {
    if (!organization?.id || !selectedPeriodId || !currentUserId) return;

    setIsCalculating(true);
    try {
      const calculationService = new PayrollCalculationService(organization.id);
      const result = await calculationService.calculatePeriod(selectedPeriodId, currentUserId);

      toast({
        title: 'Cálculo completado',
        description: `Colillas creadas: ${result.created}, Errores: ${result.errors}. Total neto: ${formatCurrency(result.totals.net_pay, 'COP')}`,
      });

      setShowCalculateDialog(false);
      setSelectedPeriodId('');
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error en cálculo',
        description: error.message || 'No se pudo calcular la nómina',
        variant: 'destructive',
      });
    } finally {
      setIsCalculating(false);
    }
  };

  const statuses = getService()?.getPeriodStatuses() || [];
  const frequencies = getService()?.getFrequencies() || [];
  
  // Períodos disponibles para cálculo (open, draft o reviewing)
  const calculablePeriods = periods.filter(p => ['open', 'draft', 'reviewing'].includes(p.status || ''));

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/hrm">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Calculator className="h-7 w-7 text-blue-600" />
              Nómina
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Nómina / Periodos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowCalculateDialog(true)}
            disabled={calculablePeriods.length === 0}
          >
            <Play className="mr-2 h-4 w-4" />
            Calcular Nómina
          </Button>
          <Link href="/app/hrm/nomina/colillas">
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              Ver Colillas
            </Button>
          </Link>
          <Link href="/app/hrm/nomina/periodos/nuevo">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Periodo
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Periodos</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.totalPeriods}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg">
                <Calculator className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pendientes</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.pendingPeriods}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Bruto</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(stats.totalGross, 'COP')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <DollarSign className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Neto</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(stats.totalNet, 'COP')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-100 dark:bg-cyan-900 rounded-lg">
                <DollarSign className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Costo Empleador</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(stats.totalEmployerCost, 'COP')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Empleados</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.totalEmployees}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800">
                <SelectItem value="all">Todos</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={frequencyFilter} onValueChange={setFrequencyFilter}>
              <SelectTrigger className="w-full md:w-40 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Frecuencia" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800">
                <SelectItem value="all">Todas</SelectItem>
                {frequencies.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <PeriodsTable
            periods={periods}
            onChangeStatus={handleChangeStatus}
            onDelete={(period) => setDeleteId(period.id)}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm">
              <Button variant="outline" size="sm">
                ← Volver a HRM
              </Button>
            </Link>
            <Link href="/app/hrm/nomina/colillas">
              <Button variant="outline" size="sm">
                Ver Colillas
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar periodo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. Solo se pueden eliminar periodos en borrador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Calculate Payroll Dialog */}
      <AlertDialog open={showCalculateDialog} onOpenChange={setShowCalculateDialog}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <Calculator className="h-5 w-5 text-blue-600" />
              Calcular Nómina
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Genera colillas automáticamente desde los timesheets aprobados del período.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Seleccionar Período
              </label>
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger className="w-full bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Selecciona un período..." />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  {calculablePeriods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>
                      {period.name || `${period.period_start} - ${period.period_end}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <p><strong>¿Qué hace el cálculo?</strong></p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Toma los timesheets del período seleccionado</li>
                <li>Calcula salario base proporcional a días trabajados</li>
                <li>Calcula horas extras diurnas y nocturnas</li>
                <li>Aplica deducciones (salud, pensión, solidaridad)</li>
                <li>Calcula aportes del empleador</li>
                <li>Genera una colilla por cada empleado</li>
              </ul>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCalculating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCalculatePayroll}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={isCalculating || !selectedPeriodId}
            >
              {isCalculating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Calculando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Calcular
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
