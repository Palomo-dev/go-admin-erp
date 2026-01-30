'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import PayrollService from '@/lib/services/payrollService';
import type { PayrollPeriod, PayrollRun } from '@/lib/services/payrollService';
import { RunsTable } from '@/components/hrm/nomina/periodos/[id]';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  ArrowLeft,
  Calculator,
  RefreshCw,
  Play,
  CheckCircle,
  Calendar,
  DollarSign,
  Users,
  Lock,
  Unlock,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  calculating: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  reviewing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  paid: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const statusLabels: Record<string, string> = {
  draft: 'Borrador',
  calculating: 'Calculando',
  reviewing: 'En Revisión',
  approved: 'Aprobado',
  paid: 'Pagado',
  cancelled: 'Cancelado',
};

const frequencyLabels: Record<string, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
};

export default function PeriodoDetallePage() {
  const params = useParams();
  const router = useRouter();
  const periodId = params.id as string;

  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog states
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [markFinalRun, setMarkFinalRun] = useState<PayrollRun | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new PayrollService(organization.id);
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const [periodData, runsData] = await Promise.all([
        service.getPeriodById(periodId),
        service.getRuns(periodId),
      ]);

      if (!periodData) {
        toast({
          title: 'Error',
          description: 'Periodo no encontrado',
          variant: 'destructive',
        });
        router.push('/app/hrm/nomina');
        return;
      }

      setPeriod(periodData);
      setRuns(runsData);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el periodo',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, periodId, router, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && periodId) {
      loadData();
    }
  }, [organization?.id, orgLoading, periodId, loadData]);

  // Handlers
  const handleExecuteRun = async () => {
    const service = getService();
    if (!service) return;

    try {
      const run = await service.createRun(periodId, 'current-user');
      toast({ title: 'Cálculo de nómina iniciado' });
      setRunDialogOpen(false);
      // Simulate calculation completion
      setTimeout(async () => {
        await service.updateRunStatus(run.id, 'completed');
        await loadData();
        toast({ title: 'Cálculo completado' });
      }, 2000);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo ejecutar el cálculo',
        variant: 'destructive',
      });
    }
  };

  const handleMarkFinal = async () => {
    if (!markFinalRun) return;
    const service = getService();
    if (!service) return;

    try {
      await service.markRunAsFinal(markFinalRun.id);
      toast({ title: 'Run marcado como final' });
      setMarkFinalRun(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo marcar como final',
        variant: 'destructive',
      });
    }
  };

  const handleApprove = async () => {
    const service = getService();
    if (!service || !period) return;

    try {
      await service.changePeriodStatus(period.id, 'approved');
      toast({ title: 'Periodo aprobado' });
      setApproveOpen(false);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo aprobar el periodo',
        variant: 'destructive',
      });
    }
  };

  const handleChangeStatus = async (status: string) => {
    const service = getService();
    if (!service || !period) return;

    try {
      await service.changePeriodStatus(period.id, status);
      toast({ title: 'Estado actualizado' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    }
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!period) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">Periodo no encontrado</p>
      </div>
    );
  }

  const canExecuteRun = period.status === 'draft' || period.status === 'calculating';
  const canApprove = period.status === 'reviewing';
  const hasFinalRun = runs.some(r => r.is_final);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/hrm/nomina">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Calculator className="h-7 w-7 text-blue-600" />
              {period.name || 'Periodo'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Nómina / Detalle Periodo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canExecuteRun && (
            <Button
              onClick={() => setRunDialogOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Play className="mr-2 h-4 w-4" />
              Ejecutar Cálculo
            </Button>
          )}
          {canApprove && (
            <Button
              onClick={() => setApproveOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Aprobar Periodo
            </Button>
          )}
          {period.status === 'approved' && (
            <Button
              onClick={() => handleChangeStatus('paid')}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <DollarSign className="mr-2 h-4 w-4" />
              Marcar Pagado
            </Button>
          )}
        </div>
      </div>

      {/* Period Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="text-gray-900 dark:text-white">Información del Periodo</span>
              <Badge className={statusColors[period.status || 'draft']}>
                {statusLabels[period.status || 'draft']}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Frecuencia</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {frequencyLabels[period.frequency] || period.frequency}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Rango</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatDate(period.period_start)} - {formatDate(period.period_end)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fecha Pago</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {period.payment_date ? formatDate(period.payment_date) : '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Empleados</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {period.total_employees || 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Lock/Unlock Status */}
            <div className="flex items-center gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              {period.status === 'approved' || period.status === 'paid' ? (
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                  <Lock className="mr-1 h-3 w-3" />
                  Bloqueado
                </Badge>
              ) : (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  <Unlock className="mr-1 h-3 w-3" />
                  Abierto para cambios
                </Badge>
              )}
              {hasFinalRun && (
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Run Final
                </Badge>
              )}
            </div>

            {period.notes && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Notas</p>
                <p className="text-gray-900 dark:text-white">{period.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Card */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-blue-900 dark:text-blue-100">
              Resumen Financiero
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Total Bruto</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {formatCurrency(period.total_gross || 0, 'COP')}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Total Deducciones</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">
                -{formatCurrency(period.total_deductions || 0, 'COP')}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Total Neto</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(period.total_net || 0, 'COP')}
              </p>
            </div>
            <div className="pt-4 border-t border-blue-200 dark:border-blue-700">
              <p className="text-sm text-blue-700 dark:text-blue-300">Costo Empleador</p>
              <p className="text-xl font-bold text-blue-900 dark:text-blue-100">
                {formatCurrency(period.total_employer_cost || 0, 'COP')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Runs */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Play className="h-5 w-5 text-blue-600" />
            Ejecuciones de Cálculo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RunsTable
            runs={runs}
            periodId={periodId}
            onMarkFinal={(run) => setMarkFinalRun(run)}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm/nomina">
              <Button variant="outline" size="sm">
                ← Volver a Periodos
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

      {/* Execute Run Dialog */}
      <AlertDialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Ejecutar cálculo de nómina?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Se generarán las colillas para todos los empleados activos del periodo.
              Esto puede tomar unos minutos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExecuteRun}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Ejecutar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Final Dialog */}
      <AlertDialog open={!!markFinalRun} onOpenChange={() => setMarkFinalRun(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Marcar como run final?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Una vez marcado como final, este será el run oficial para el periodo
              y no se podrán ejecutar más cálculos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkFinal}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Marcar Final
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve Dialog */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Aprobar periodo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Al aprobar, el periodo quedará bloqueado y listo para pago.
              Las colillas no podrán ser modificadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Aprobar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
