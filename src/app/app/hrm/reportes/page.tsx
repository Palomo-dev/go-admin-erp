'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import HRMReportsService from '@/lib/services/hrmReportsService';
import type { ReportFilters as Filters, ReportSummary as Summary } from '@/lib/services/hrmReportsService';
import { ReportFilters, ReportTable, ReportSummary } from '@/components/hrm/reportes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import {
  RefreshCw,
  FileBarChart,
  ArrowLeft,
  Download,
  Clock,
  Calendar,
  DollarSign,
  Banknote,
} from 'lucide-react';

export default function ReportesHRMPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [reportType, setReportType] = useState('attendance');
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalRecords: 0 });

  // Filter data
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  // Current filters
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const [currentFilters, setCurrentFilters] = useState<Filters>({
    dateFrom: firstDay.toISOString().split('T')[0],
    dateTo: lastDay.toISOString().split('T')[0],
  });

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new HRMReportsService(organization.id);
  }, [organization?.id]);

  const loadFilterData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    try {
      const [branchesData, departmentsData] = await Promise.all([
        service.getBranches(),
        service.getDepartments(),
      ]);
      setBranches(branchesData);
      setDepartments(departmentsData);
    } catch (error) {
      console.error('Error loading filter data:', error);
    }
  }, [getService]);

  const loadReport = useCallback(async (filters: Filters) => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      let result;
      switch (reportType) {
        case 'attendance':
          result = await service.getAttendanceReport(filters);
          break;
        case 'absences':
          result = await service.getAbsenceReport(filters);
          break;
        case 'payroll':
          result = await service.getPayrollReport(filters);
          break;
        case 'loans':
          result = await service.getLoansReport(filters);
          break;
        default:
          result = { data: [], summary: { totalRecords: 0 } };
      }

      setData(result.data);
      setSummary(result.summary);
    } catch (error: any) {
      console.error('Error loading report:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el reporte',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, reportType, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadFilterData();
    }
  }, [organization?.id, orgLoading, loadFilterData]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadReport(currentFilters);
    }
  }, [organization?.id, orgLoading, reportType, loadReport, currentFilters]);

  const handleApplyFilters = (filters: Filters) => {
    setCurrentFilters(filters);
    loadReport(filters);
  };

  const handleExportCSV = () => {
    const service = getService();
    if (!service || data.length === 0) {
      toast({
        title: 'Sin datos',
        description: 'No hay datos para exportar',
        variant: 'destructive',
      });
      return;
    }

    service.exportToCSV(data, `reporte_${reportType}`);
    toast({ title: 'Reporte exportado correctamente' });
  };

  const reportTypes = getService()?.getReportTypes() || [
    { value: 'attendance', label: 'Asistencia', icon: 'Clock' },
    { value: 'absences', label: 'Ausencias', icon: 'Calendar' },
    { value: 'payroll', label: 'Nómina', icon: 'DollarSign' },
    { value: 'loans', label: 'Préstamos', icon: 'Banknote' },
  ];

  const getTabIcon = (icon: string) => {
    switch (icon) {
      case 'Clock': return <Clock className="h-4 w-4 mr-2" />;
      case 'Calendar': return <Calendar className="h-4 w-4 mr-2" />;
      case 'DollarSign': return <DollarSign className="h-4 w-4 mr-2" />;
      case 'Banknote': return <Banknote className="h-4 w-4 mr-2" />;
      default: return null;
    }
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/hrm">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileBarChart className="h-7 w-7 text-blue-600" />
              Reportes HRM
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Reportes Operativos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => loadReport(currentFilters)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={data.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <Tabs value={reportType} onValueChange={setReportType} className="space-y-6">
        <TabsList className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-1">
          {reportTypes.map((type) => (
            <TabsTrigger
              key={type.value}
              value={type.value}
              className="data-[state=active]:bg-blue-100 dark:data-[state=active]:bg-blue-900 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-300"
            >
              {getTabIcon(type.icon)}
              {type.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Filters */}
        <ReportFilters
          branches={branches}
          departments={departments}
          onApply={handleApplyFilters}
          isLoading={isLoading}
        />

        {/* Summary */}
        <ReportSummary
          reportType={reportType}
          summary={summary}
        />

        {/* Results */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-gray-900 dark:text-white">
              <span>Resultados ({data.length})</span>
              {data.length > 0 && (
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  {currentFilters.dateFrom} - {currentFilters.dateTo}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Each report type has same content structure */}
            <TabsContent value="attendance" className="mt-0">
              <ReportTable
                reportType="attendance"
                data={data}
                isLoading={isLoading}
              />
            </TabsContent>
            <TabsContent value="absences" className="mt-0">
              <ReportTable
                reportType="absences"
                data={data}
                isLoading={isLoading}
              />
            </TabsContent>
            <TabsContent value="payroll" className="mt-0">
              <ReportTable
                reportType="payroll"
                data={data}
                isLoading={isLoading}
              />
            </TabsContent>
            <TabsContent value="loans" className="mt-0">
              <ReportTable
                reportType="loans"
                data={data}
                isLoading={isLoading}
              />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm">
              <Button variant="outline" size="sm">
                ← Volver a HRM
              </Button>
            </Link>
            <Link href="/app/hrm/nomina">
              <Button variant="outline" size="sm">
                Nómina
              </Button>
            </Link>
            <Link href="/app/hrm/asistencia">
              <Button variant="outline" size="sm">
                Asistencia
              </Button>
            </Link>
            <Link href="/app/hrm/ausencias">
              <Button variant="outline" size="sm">
                Ausencias
              </Button>
            </Link>
            <Link href="/app/hrm/prestamos">
              <Button variant="outline" size="sm">
                Préstamos
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
