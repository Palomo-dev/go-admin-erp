'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useOrganization, getCurrentUserId } from '@/lib/hooks/useOrganization';
import EmployeeLoansService from '@/lib/services/employeeLoansService';
import type { EmployeeLoan } from '@/lib/services/employeeLoansService';
import { LoansTable } from '@/components/hrm/prestamos';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  RefreshCw,
  Banknote,
  Plus,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  DollarSign,
} from 'lucide-react';

export default function PrestamosPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [loans, setLoans] = useState<EmployeeLoan[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    pending: 0,
    paid: 0,
    totalDisbursed: 0,
    totalBalance: 0,
    overdueInstallments: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Dialog states
  const [approveId, setApproveId] = useState<string | null>(null);
  const [rejectLoan, setRejectLoan] = useState<EmployeeLoan | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new EmployeeLoansService(organization.id);
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

      const [loansData, statsData] = await Promise.all([
        service.getAll(filters),
        service.getStats(),
      ]);

      // Filter by search term
      let filtered = loansData;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = loansData.filter(l =>
          l.employee_name?.toLowerCase().includes(term) ||
          l.loan_number?.toLowerCase().includes(term) ||
          l.employee_code?.toLowerCase().includes(term)
        );
      }

      setLoans(filtered);
      setStats(statsData);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los préstamos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, searchTerm, statusFilter, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleApprove = async () => {
    if (!approveId) return;
    const service = getService();
    if (!service) return;

    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        toast({ title: 'Error', description: 'No se pudo obtener el usuario actual', variant: 'destructive' });
        return;
      }
      await service.approve(approveId, userId);
      toast({ title: 'Préstamo aprobado y activado' });
      setApproveId(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo aprobar el préstamo',
        variant: 'destructive',
      });
    }
  };

  const handleReject = async () => {
    if (!rejectLoan || !rejectReason.trim()) return;
    const service = getService();
    if (!service) return;

    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        toast({ title: 'Error', description: 'No se pudo obtener el usuario actual', variant: 'destructive' });
        return;
      }
      await service.reject(rejectLoan.id, userId, rejectReason);
      toast({ title: 'Préstamo rechazado' });
      setRejectLoan(null);
      setRejectReason('');
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo rechazar el préstamo',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    const service = getService();
    if (!service) return;

    try {
      await service.cancel(cancelId);
      toast({ title: 'Préstamo cancelado' });
      setCancelId(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo cancelar el préstamo',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const service = getService();
    if (!service) return;

    try {
      await service.delete(deleteId);
      toast({ title: 'Préstamo eliminado' });
      setDeleteId(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el préstamo',
        variant: 'destructive',
      });
    }
  };

  const statuses = getService()?.getLoanStatuses() || [];

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
              <Banknote className="h-7 w-7 text-blue-600" />
              Préstamos a Empleados
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Préstamos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/app/hrm/prestamos/nuevo">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Préstamo
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Banknote className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Activos</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pendientes</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pagados</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.paid}</p>
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
                <p className="text-xs text-gray-500 dark:text-gray-400">Desembolsado</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(stats.totalDisbursed, 'COP')}
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
                <p className="text-xs text-gray-500 dark:text-gray-400">Saldo</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(stats.totalBalance, 'COP')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Vencidas</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.overdueInstallments}</p>
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
                placeholder="Buscar por empleado o número..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800">
                <SelectItem value="all">Todos los estados</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
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
          <LoansTable
            loans={loans}
            onEdit={() => {}} // Edit in detail page
            onApprove={(loan) => setApproveId(loan.id)}
            onReject={(loan) => setRejectLoan(loan)}
            onCancel={(loan) => setCancelId(loan.id)}
            onDelete={(loan) => setDeleteId(loan.id)}
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
          </div>
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <AlertDialog open={!!approveId} onOpenChange={() => setApproveId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Aprobar préstamo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Al aprobar, se activará el préstamo y se generará el plan de cuotas automáticamente.
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

      {/* Reject Dialog */}
      <AlertDialog open={!!rejectLoan} onOpenChange={() => setRejectLoan(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              Rechazar préstamo
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Indique el motivo del rechazo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label className="text-gray-700 dark:text-gray-300">Motivo *</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ingrese el motivo del rechazo"
              rows={3}
              className="mt-2 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason('')}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={!rejectReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog */}
      <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Cancelar préstamo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción cancelará el préstamo activo. Las cuotas pendientes quedarán sin efecto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, mantener</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Sí, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar préstamo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer.
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
    </div>
  );
}
