'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import TimesheetsService from '@/lib/services/timesheetsService';
import TimesheetConsolidationService from '@/lib/services/timesheetConsolidationService';
import type { Timesheet, TimesheetFilters, TimesheetStats, TimesheetStatus } from '@/lib/services/timesheetsService';
import { TimesheetTable, TimesheetFilters as Filters, TimesheetDetailDrawer } from '@/components/hrm/asistencia/timesheets';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Lock,
  Send,
  ArrowLeft,
  Timer,
  Moon,
  AlertTriangle,
  Play,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/config';

export default function TimesheetsPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<TimesheetStats>({
    total: 0,
    open: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    locked: 0,
    totalWorkedMinutes: 0,
    totalOvertimeMinutes: 0,
    totalNightMinutes: 0,
    totalLateMinutes: 0,
  });

  // Filtros
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');

  // Dialogs
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [showConsolidateDialog, setShowConsolidateDialog] = useState(false);
  const [consolidateDate, setConsolidateDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);

  // Obtener usuario actual
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getUser();
  }, []);

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new TimesheetsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const filters: TimesheetFilters = {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        branchId: branchFilter !== 'all' ? parseInt(branchFilter) : undefined,
        status: statusFilter !== 'all' ? (statusFilter as TimesheetStatus) : undefined,
      };

      const [timesheetsData, branchesData, statsData] = await Promise.all([
        service.getAll(filters),
        service.getBranches(),
        service.getStats(filters),
      ]);

      setTimesheets(timesheetsData);
      setBranches(branchesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading timesheets:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los timesheets',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, dateFrom, dateTo, statusFilter, branchFilter, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleApprove = async (id: string) => {
    if (!currentUserId) return;
    const service = getService();
    if (!service) return;

    try {
      await service.approve(id, currentUserId);
      toast({ title: 'Timesheet aprobado' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo aprobar',
        variant: 'destructive',
      });
    }
  };

  const handleReject = async () => {
    if (!rejectId || !currentUserId || !rejectReason.trim()) return;
    const service = getService();
    if (!service) return;

    try {
      await service.reject(rejectId, currentUserId, rejectReason);
      toast({ title: 'Timesheet rechazado' });
      setRejectId(null);
      setRejectReason('');
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo rechazar',
        variant: 'destructive',
      });
    }
  };

  const handleLock = async (id: string) => {
    const service = getService();
    if (!service) return;

    try {
      await service.lock(id);
      toast({ title: 'Timesheet bloqueado' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo bloquear',
        variant: 'destructive',
      });
    }
  };

  const handleCreateAdjustment = (timesheetId: string) => {
    router.push(`/app/hrm/asistencia/ajustes/nuevo?timesheet=${timesheetId}`);
  };

  const handleView = (id: string) => {
    const timesheet = timesheets.find(t => t.id === id);
    if (timesheet) {
      setSelectedTimesheet(timesheet);
      setShowDetailDrawer(true);
    }
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
    setBranchFilter('all');
  };

  // Consolidar timesheets desde marcaciones
  const handleConsolidate = async () => {
    if (!organization?.id) return;

    setIsConsolidating(true);
    try {
      const consolidationService = new TimesheetConsolidationService(organization.id);
      const result = await consolidationService.consolidateDay(
        consolidateDate,
        branchFilter !== 'all' ? parseInt(branchFilter) : undefined
      );

      toast({
        title: 'Consolidación completada',
        description: `Creados: ${result.created}, Actualizados: ${result.updated}, Omitidos: ${result.skipped}, Errores: ${result.errors}`,
      });

      setShowConsolidateDialog(false);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error en consolidación',
        description: error.message || 'No se pudo consolidar',
        variant: 'destructive',
      });
    } finally {
      setIsConsolidating(false);
    }
  };

  const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/app/hrm/marcacion">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="h-7 w-7 text-blue-600" />
              Timesheets
            </h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400 ml-12">
            Gestiona y aprueba los registros de tiempo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setShowConsolidateDialog(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Play className="h-4 w-4 mr-2" />
            Consolidar
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Link href="/app/hrm/asistencia/ajustes">
            <Button size="sm" variant="outline">
              Ver Ajustes
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {stats.open}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Abiertos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Send className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {stats.submitted}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Enviados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.approved}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Aprobados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Timer className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {formatMinutes(stats.totalOvertimeMinutes)}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Horas Extra</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <Moon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {formatMinutes(stats.totalNightMinutes)}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Nocturno</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatMinutes(stats.totalLateMinutes)}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Tardanzas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <Filters
            dateFrom={dateFrom}
            dateTo={dateTo}
            status={statusFilter}
            branchId={branchFilter}
            branches={branches}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onStatusChange={setStatusFilter}
            onBranchChange={setBranchFilter}
            onClearFilters={handleClearFilters}
          />
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <TimesheetTable
            timesheets={timesheets}
            onApprove={handleApprove}
            onReject={(id) => setRejectId(id)}
            onLock={handleLock}
            onCreateAdjustment={handleCreateAdjustment}
            onView={handleView}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm/marcacion">
              <Button variant="outline" size="sm">
                ← Marcación
              </Button>
            </Link>
            <Link href="/app/hrm/marcacion/dispositivos">
              <Button variant="outline" size="sm">
                Dispositivos
              </Button>
            </Link>
            <Link href="/app/hrm/asistencia/ajustes">
              <Button variant="outline" size="sm">
                Ajustes →
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <AlertDialog open={!!rejectId} onOpenChange={() => setRejectId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Rechazar timesheet?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Ingresa la razón del rechazo
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Razón del rechazo..."
            className="min-h-[100px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-red-600 hover:bg-red-700"
              disabled={!rejectReason.trim()}
            >
              Rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Consolidate Dialog */}
      <AlertDialog open={showConsolidateDialog} onOpenChange={setShowConsolidateDialog}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <Play className="h-5 w-5 text-blue-600" />
              Consolidar Timesheets
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Genera timesheets automáticamente desde los eventos de marcación del día seleccionado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fecha a consolidar
              </label>
              <input
                type="date"
                value={consolidateDate}
                onChange={(e) => setConsolidateDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <p><strong>¿Qué hace la consolidación?</strong></p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Toma los eventos de check-in/check-out del día</li>
                <li>Calcula horas trabajadas, descansos y extras</li>
                <li>Crea o actualiza timesheets automáticamente</li>
                <li>No modifica timesheets ya aprobados</li>
              </ul>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConsolidating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConsolidate}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={isConsolidating}
            >
              {isConsolidating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Consolidar
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Drawer */}
      <TimesheetDetailDrawer
        open={showDetailDrawer}
        onOpenChange={setShowDetailDrawer}
        timesheet={selectedTimesheet}
      />
    </div>
  );
}
