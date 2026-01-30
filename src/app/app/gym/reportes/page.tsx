'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import {
  ReportsHeader,
  StatsCards,
  RevenueByPlan,
  PeakHoursChart,
  ClassAttendanceChart,
  DateRange,
} from '@/components/gym/reportes';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { GymReportStats, GymReportFilters, getGymReportStats } from '@/lib/services/gymService';
import { supabase } from '@/lib/supabase/config';

interface Branch {
  id: number;
  name: string;
}

export default function ReportesPage() {
  const { organization } = useOrganization();
  const [stats, setStats] = useState<GymReportStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);

  // Filtros
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const from = subDays(to, 29);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  });
  const [selectedBranch, setSelectedBranch] = useState<number | 'all'>('all');

  const loadBranches = async () => {
    if (!organization?.id) return;
    try {
      const { data } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organization.id)
        .order('name');
      setBranches(data || []);
    } catch (error) {
      console.error('Error cargando sucursales:', error);
    }
  };

  const loadStats = async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const filters: GymReportFilters = {
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
        branchId: selectedBranch,
      };
      const data = await getGymReportStats(organization.id, filters);
      setStats(data);
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
      toast.error('Error al cargar las estadísticas');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, [organization?.id]);

  useEffect(() => {
    loadStats();
  }, [organization?.id, dateRange, selectedBranch]);

  const handleExport = (exportFormat: 'csv' | 'pdf') => {
    if (!stats) return;

    if (exportFormat === 'csv') {
      const dateRangeStr = `${format(dateRange.from, 'dd/MM/yyyy')} - ${format(dateRange.to, 'dd/MM/yyyy')}`;
      const branchName = selectedBranch === 'all' ? 'Todas las sedes' : branches.find(b => b.id === selectedBranch)?.name || '';

      const csvContent = [
        ['Reporte Operativo del Gimnasio'],
        [`Período: ${dateRangeStr}`],
        [`Sede: ${branchName}`],
        [''],
        ['RESUMEN DE MEMBRESÍAS'],
        ['Métrica', 'Valor'],
        ['Total Membresías', stats.totalMemberships.toString()],
        ['Membresías Activas', stats.activeMemberships.toString()],
        ['Renovaciones del Período', stats.renewedThisMonth.toString()],
        ['Cancelaciones del Período', stats.cancelledThisMonth.toString()],
        ['Tasa de Retención', `${stats.retentionRate.toFixed(1)}%`],
        ['Tasa de Abandono (Churn)', `${stats.churnRate.toFixed(1)}%`],
        [''],
        ['INGRESOS POR PLAN'],
        ['Plan', 'Miembros Activos', 'Ingresos Estimados'],
        ...stats.revenueByPlan.map((p) => [p.plan_name, p.count.toString(), `$${p.revenue.toLocaleString()}`]),
        [''],
        ['HORAS PICO (Check-ins por hora)'],
        ['Hora', 'Check-ins'],
        ...stats.peakHours.map((p) => [`${p.hour}:00`, p.checkins.toString()]),
        [''],
        ['ASISTENCIA POR TIPO DE CLASE'],
        ['Tipo de Clase', 'Total Reservaciones', 'Asistieron', 'Tasa de Asistencia'],
        ...stats.classAttendance.map((c) => [c.class_type, c.total.toString(), c.attended.toString(), `${c.rate.toFixed(1)}%`]),
      ]
        .map((row) => row.join(','))
        .join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `reporte-gym-${format(dateRange.from, 'yyyyMMdd')}-${format(dateRange.to, 'yyyyMMdd')}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);

      toast.success('Reporte CSV exportado');
    } else {
      toast.info('Exportación a PDF próximamente');
    }
  };

  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range);
  };

  const handleBranchChange = (branchId: number | 'all') => {
    setSelectedBranch(branchId);
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <ReportsHeader 
        onRefresh={loadStats} 
        onExport={handleExport} 
        isLoading={isLoading}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        branches={branches}
        selectedBranch={selectedBranch}
        onBranchChange={handleBranchChange}
      />

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : !stats ? (
        <div className="text-center py-12 text-gray-500">
          No se pudieron cargar las estadísticas
        </div>
      ) : (
        <>
          <StatsCards stats={stats} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevenueByPlan data={stats.revenueByPlan} />
            <PeakHoursChart data={stats.peakHours} />
          </div>

          <ClassAttendanceChart data={stats.classAttendance} />
        </>
      )}
    </div>
  );
}
