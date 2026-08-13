'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import {
  HRMKPICards,
  HRMAlerts,
  HRMQuickActions,
  HRMPayrollStatus,
  type HRMKPIs,
  type HRMAlert,
  type PayrollPeriodInfo,
  type PayrollRunInfo,
} from '@/components/hrm';
import HRMDashboardService, {
  type DepartmentSummary,
} from '@/lib/services/hrmDashboardService';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

const CURRENCY_CODE = 'COP';
const PERIODO_LABEL = 'Estado actual';

const emptyKPIs: HRMKPIs = {
  activeEmployees: 0,
  absencesToday: 0,
  shiftsToday: 0,
  pendingTimesheets: 0,
  payrollInProcess: 0,
  activeLoans: 0,
};

function buildExportData(
  kpis: HRMKPIs | null,
  departments: DepartmentSummary[],
  currentPeriod: PayrollPeriodInfo | null,
): SectionExportData | null {
  if (!kpis) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Empleados activos', value: String(kpis.activeEmployees), kind: 'neutro' },
    { label: 'Ausencias hoy', value: String(kpis.absencesToday), kind: 'neutro' },
    { label: 'Turnos hoy', value: String(kpis.shiftsToday), kind: 'neutro' },
    { label: 'Timesheets pendientes', value: String(kpis.pendingTimesheets), kind: 'neutro' },
    { label: 'Nómina en proceso', value: String(kpis.payrollInProcess), kind: 'neutro' },
    { label: 'Préstamos activos', value: String(kpis.activeLoans), kind: 'neutro' },
  ];

  if (currentPeriod?.totalNet) {
    kpiList.push({
      label: 'Nómina del período',
      value: formatCurrency(currentPeriod.totalNet, CURRENCY_CODE),
      kind: 'egreso',
    });
  }

  const filas: SectionDataRow[] = departments.map((d) => ({
    departamento: d.name,
    empleados: d.employeeCount,
  }));

  return {
    titulo: 'Dashboard HRM',
    periodo: PERIODO_LABEL,
    kpis: kpiList,
    columnas: [
      { key: 'departamento', label: 'Departamento' },
      { key: 'empleados', label: 'Empleados', align: 'right' },
    ],
    filas,
  };
}

export default function HrmSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<HRMKPIs | null>(null);
  const [alerts, setAlerts] = useState<HRMAlert[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<PayrollPeriodInfo | null>(null);
  const [recentRuns, setRecentRuns] = useState<PayrollRunInfo[]>([]);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [orgInfo, setOrgInfo] = useState<ExportOrganizationInfo | null>(null);

  useEffect(() => {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const service = new HRMDashboardService(organizationId);

    async function loadAll() {
      setIsLoading(true);
      try {
        const [
          kpisData,
          alertsData,
          periodData,
          runsData,
          departmentsData,
          orgData,
        ] = await Promise.all([
          service.getKPIs(),
          service.getAlerts(),
          service.getCurrentPayrollPeriod(),
          service.getRecentPayrollRuns(),
          service.getDepartmentsSummary(),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        setKpis(kpisData);
        setAlerts(alertsData);
        setCurrentPeriod(periodData);
        setRecentRuns(runsData);
        setDepartments(departmentsData);

        if (orgData.data) {
          setOrgInfo({
            name: orgData.data.name || 'Organización',
            legalName: orgData.data.legal_name || undefined,
            nit: orgData.data.tax_id || undefined,
            city: orgData.data.city || undefined,
            address: orgData.data.address || undefined,
            phone: orgData.data.phone || undefined,
            email: orgData.data.email || undefined,
            logoUrl: orgData.data.logo_url || undefined,
          });
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error cargando dashboard de HRM:', err);
        toastError('Error', 'No se pudo cargar el dashboard de HRM');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, []);

  const exportData = useMemo(
    () => buildExportData(kpis, departments, currentPeriod),
    [kpis, departments, currentPeriod],
  );

  return (
    <ModuloSection
      moduleCode="hrm"
      moduleName="HRM"
      icon={Users}
      accentColor="text-rose-600 dark:text-rose-400"
      accentBg="bg-rose-100 dark:bg-rose-900/30"
      hasReportes={false}
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        <HRMKPICards kpis={kpis ?? emptyKPIs} isLoading={isLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <HRMPayrollStatus
            currentPeriod={currentPeriod}
            recentRuns={recentRuns}
            isLoading={isLoading}
          />
          <HRMAlerts alerts={alerts} isLoading={isLoading} />
        </div>

        <HRMQuickActions />
      </div>
    </ModuloSection>
  );
}
