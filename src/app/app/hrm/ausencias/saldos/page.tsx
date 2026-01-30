'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import LeaveBalancesService from '@/lib/services/leaveBalancesService';
import type { LeaveBalance, LeaveBalanceFilters, LeaveBalanceStats } from '@/lib/services/leaveBalancesService';
import { LeaveBalancesTable } from '@/components/hrm/ausencias/saldos';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  RefreshCw,
  PiggyBank,
  ArrowLeft,
  Users,
  Calendar,
  TrendingUp,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';

export default function SaldosPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<{ id: string; code: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<LeaveBalanceStats>({
    totalEmployees: 0,
    totalAvailable: 0,
    totalUsed: 0,
    totalPending: 0,
    totalExpired: 0,
  });

  // Filtros
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');

  // Adjust dialog
  const [adjustingBalance, setAdjustingBalance] = useState<LeaveBalance | null>(null);
  const [adjustmentValue, setAdjustmentValue] = useState('');

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new LeaveBalancesService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const filters: LeaveBalanceFilters = {
        year: yearFilter ? parseInt(yearFilter) : undefined,
        leaveTypeId: leaveTypeFilter !== 'all' ? leaveTypeFilter : undefined,
        employmentId: employeeFilter !== 'all' ? employeeFilter : undefined,
      };

      const [balancesData, typesData, employeesData, yearsData, statsData] = await Promise.all([
        service.getAll(filters),
        service.getLeaveTypes(),
        service.getEmployees(),
        service.getYears(),
        service.getStats(filters),
      ]);

      setBalances(balancesData);
      setLeaveTypes(typesData);
      setEmployees(employeesData);
      setYears(yearsData.length > 0 ? yearsData : [new Date().getFullYear()]);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading balances:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los saldos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, yearFilter, leaveTypeFilter, employeeFilter, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleAdjust = (id: string) => {
    const balance = balances.find((b) => b.id === id);
    if (balance) {
      setAdjustingBalance(balance);
      setAdjustmentValue(balance.initial_balance.toString());
    }
  };

  const handleSaveAdjustment = async () => {
    if (!adjustingBalance) return;
    const service = getService();
    if (!service) return;

    try {
      await service.update(adjustingBalance.id, {
        initial_balance: parseFloat(adjustmentValue),
      });
      toast({ title: 'Saldo ajustado correctamente' });
      setAdjustingBalance(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo ajustar el saldo',
        variant: 'destructive',
      });
    }
  };

  const handleRecalculate = async (id: string) => {
    toast({ title: 'Recalculando saldo...' });
    // TODO: Implementar recálculo
    await loadData();
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
            <Link href="/app/hrm/ausencias">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <PiggyBank className="h-7 w-7 text-blue-600" />
              Saldos de Ausencias
            </h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400 ml-12">
            Consulta y ajusta los saldos de días disponibles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalEmployees}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Empleados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.totalAvailable}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Disponibles</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {stats.totalUsed}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Usados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {stats.totalPending}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pendientes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-900/30 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {stats.totalExpired}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Expirados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[120px] bg-white dark:bg-gray-900">
                <SelectValue placeholder="Año" />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={leaveTypeFilter} onValueChange={setLeaveTypeFilter}>
              <SelectTrigger className="w-[180px] bg-white dark:bg-gray-900">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {leaveTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.code} - {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="w-[200px] bg-white dark:bg-gray-900">
                <SelectValue placeholder="Empleado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los empleados</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name}
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
          <LeaveBalancesTable
            balances={balances}
            onAdjust={handleAdjust}
            onRecalculate={handleRecalculate}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm/ausencias">
              <Button variant="outline" size="sm">
                ← Solicitudes
              </Button>
            </Link>
            <Link href="/app/hrm/ausencias/tipos">
              <Button variant="outline" size="sm">
                Tipos de Ausencia
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Adjust Dialog */}
      <Dialog open={!!adjustingBalance} onOpenChange={() => setAdjustingBalance(null)}>
        <DialogContent className="bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Ajustar Saldo Inicial
            </DialogTitle>
          </DialogHeader>
          {adjustingBalance && (
            <div className="space-y-4">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                <p><strong>Empleado:</strong> {adjustingBalance.employee_name}</p>
                <p><strong>Tipo:</strong> {adjustingBalance.leave_type_name}</p>
                <p><strong>Año:</strong> {adjustingBalance.year}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Saldo Inicial</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={adjustmentValue}
                  onChange={(e) => setAdjustmentValue(e.target.value)}
                  className="bg-white dark:bg-gray-900"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustingBalance(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveAdjustment}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
