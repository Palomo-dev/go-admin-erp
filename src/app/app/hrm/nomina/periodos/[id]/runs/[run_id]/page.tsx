'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import PayrollService from '@/lib/services/payrollService';
import type { PayrollRun, PayrollSlip } from '@/lib/services/payrollService';
import { SlipsTable } from '@/components/hrm/nomina/periodos/[id]/runs/[run_id]';
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
  Play,
  RefreshCw,
  CheckCircle,
  FileText,
  AlertTriangle,
  Users,
  DollarSign,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  calculating: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  superseded: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const statusLabels: Record<string, string> = {
  calculating: 'Calculando',
  completed: 'Completado',
  error: 'Error',
  superseded: 'Reemplazado',
};

export default function RunDetallePage() {
  const params = useParams();
  const router = useRouter();
  const periodId = params.id as string;
  const runId = params.run_id as string;

  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [run, setRun] = useState<PayrollRun | null>(null);
  const [slips, setSlips] = useState<PayrollSlip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSlips, setSelectedSlips] = useState<string[]>([]);

  // Dialog states
  const [markFinalOpen, setMarkFinalOpen] = useState(false);
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
      const [runData, slipsData] = await Promise.all([
        service.getRunById(runId),
        service.getSlips({ run_id: runId }),
      ]);

      if (!runData) {
        toast({
          title: 'Error',
          description: 'Ejecución no encontrada',
          variant: 'destructive',
        });
        router.push(`/app/hrm/nomina/periodos/${periodId}`);
        return;
      }

      setRun(runData);
      setSlips(slipsData);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la ejecución',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, runId, periodId, router, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && runId) {
      loadData();
    }
  }, [organization?.id, orgLoading, runId, loadData]);

  // Handlers
  const handleMarkFinal = async () => {
    const service = getService();
    if (!service || !run) return;

    try {
      await service.markRunAsFinal(run.id);
      toast({ title: 'Run marcado como final' });
      setMarkFinalOpen(false);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo marcar como final',
        variant: 'destructive',
      });
    }
  };

  const handleApproveSelected = async () => {
    if (selectedSlips.length === 0) return;
    const service = getService();
    if (!service) return;

    try {
      await service.approveSlips(selectedSlips);
      toast({ title: `${selectedSlips.length} colilla(s) aprobada(s)` });
      setSelectedSlips([]);
      setApproveOpen(false);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudieron aprobar las colillas',
        variant: 'destructive',
      });
    }
  };

  // Summary calculations
  const summary = run?.summary || {};
  const totalGross = slips.reduce((sum, s) => sum + s.gross_pay, 0);
  const totalDeductions = slips.reduce((sum, s) => sum + s.total_deductions, 0);
  const totalNet = slips.reduce((sum, s) => sum + s.net_pay, 0);
  const totalEmployerCost = slips.reduce((sum, s) => sum + (s.total_employer_cost || 0), 0);

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">Ejecución no encontrada</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/app/hrm/nomina/periodos/${periodId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Play className="h-7 w-7 text-blue-600" />
              Run #{run.run_number}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {run.period_name || 'Periodo'} / Ejecución #{run.run_number}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {selectedSlips.length > 0 && (
            <Button
              onClick={() => setApproveOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Aprobar ({selectedSlips.length})
            </Button>
          )}
          {run.status === 'completed' && !run.is_final && (
            <Button
              onClick={() => setMarkFinalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Marcar Final
            </Button>
          )}
        </div>
      </div>

      {/* Run Info */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Estado</p>
                <Badge className={`mt-1 ${statusColors[run.status || 'calculating']}`}>
                  {statusLabels[run.status || 'calculating']}
                </Badge>
              </div>
              {run.is_final && (
                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  Final
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Colillas</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{slips.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Neto</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(totalNet, 'COP')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Ejecutado</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {run.executed_at ? formatDate(run.executed_at) : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Error Log */}
      {run.error_log && (
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <AlertTriangle className="h-5 w-5" />
              Errores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">
              {run.error_log}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-blue-900 dark:text-blue-100">
            Resumen de la Ejecución
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Total Bruto</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {formatCurrency(totalGross, 'COP')}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Total Deducciones</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                -{formatCurrency(totalDeductions, 'COP')}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Total Neto</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(totalNet, 'COP')}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Costo Empleador</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {formatCurrency(totalEmployerCost, 'COP')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Slips Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <FileText className="h-5 w-5 text-blue-600" />
            Colillas Generadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SlipsTable
            slips={slips}
            selectedIds={selectedSlips}
            onSelectChange={setSelectedSlips}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href={`/app/hrm/nomina/periodos/${periodId}`}>
              <Button variant="outline" size="sm">
                ← Volver al Periodo
              </Button>
            </Link>
            <Link href="/app/hrm/nomina/colillas">
              <Button variant="outline" size="sm">
                Ver Todas las Colillas
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Mark Final Dialog */}
      <AlertDialog open={markFinalOpen} onOpenChange={setMarkFinalOpen}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Marcar como run final?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Este será el run oficial para el periodo. No se podrán ejecutar más cálculos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkFinal}
              className="bg-blue-600 hover:bg-blue-700 text-white"
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
              ¿Aprobar {selectedSlips.length} colilla(s)?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Las colillas aprobadas estarán listas para pago.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApproveSelected}
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
