'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FolderKanban } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import { PMKPICards } from '@/components/pm/dashboard/PMKPICards';
import { PMQuickNav } from '@/components/pm/dashboard/PMQuickNav';
import { PMRecentActivity } from '@/components/pm/dashboard/PMRecentActivity';
import {
  pmService,
  type PMDashboardStats,
  type PMTask,
  TASK_STATUS_LABELS,
  PRIORITY_LABELS,
} from '@/lib/services/pmService';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

const PERIODO_LABEL = 'Estado actual';

function buildExportData(
  stats: PMDashboardStats | null,
  tasks: PMTask[],
): SectionExportData | null {
  if (!stats) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Proyectos totales', value: String(stats.projects.total), kind: 'neutro' },
    { label: 'Proyectos activos', value: String(stats.projects.active), kind: 'ingreso' },
    { label: 'Proyectos completados', value: String(stats.projects.completed), kind: 'ingreso' },
    { label: 'Metas activas', value: String(stats.goals.active), kind: 'neutro' },
    { label: 'Metas logradas', value: String(stats.goals.achieved), kind: 'ingreso' },
    { label: 'Tareas totales', value: String(stats.tasks.total), kind: 'neutro' },
    { label: 'Tareas pendientes', value: String(stats.tasks.open), kind: 'neutro' },
    { label: 'Tareas en progreso', value: String(stats.tasks.inProgress), kind: 'neutro' },
    { label: 'Tareas completadas', value: String(stats.tasks.done), kind: 'ingreso' },
    { label: 'Tareas vencidas', value: String(stats.tasks.overdue), kind: 'egreso' },
    { label: 'Hitos totales', value: String(stats.milestones.total), kind: 'neutro' },
    { label: 'Hitos completados', value: String(stats.milestones.completed), kind: 'ingreso' },
    { label: 'Hitos pendientes', value: String(stats.milestones.pending), kind: 'neutro' },
  ];

  const filas: SectionDataRow[] = tasks.map((t) => ({
    titulo: t.title,
    estado: TASK_STATUS_LABELS[t.status] ?? t.status,
    prioridad: PRIORITY_LABELS[t.priority] ?? t.priority,
    proyecto: t.projects?.name ?? '—',
  }));

  return {
    titulo: 'Dashboard PM',
    periodo: PERIODO_LABEL,
    kpis: kpiList,
    columnas: [
      { key: 'titulo', label: 'Título' },
      { key: 'estado', label: 'Estado' },
      { key: 'prioridad', label: 'Prioridad' },
      { key: 'proyecto', label: 'Proyecto' },
    ],
    filas,
  };
}

export default function PmSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<PMDashboardStats | null>(null);
  const [tasks, setTasks] = useState<PMTask[]>([]);
  const [orgInfo, setOrgInfo] = useState<ExportOrganizationInfo | null>(null);

  useEffect(() => {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadAll() {
      setIsLoading(true);
      try {
        const [statsData, tasksData, orgData] = await Promise.all([
          pmService.getDashboardStats(),
          pmService.getRecentTasks(5),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        setStats(statsData);
        setTasks(tasksData);

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
        console.error('Error cargando dashboard de PM:', err);
        toastError('Error', 'No se pudo cargar el dashboard de Project Management');
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
    () => buildExportData(stats, tasks),
    [stats, tasks],
  );

  return (
    <ModuloSection
      moduleCode="pm"
      moduleName="Project Management"
      icon={FolderKanban}
      accentColor="text-sky-600 dark:text-sky-400"
      accentBg="bg-sky-100 dark:bg-sky-900/30"
      hasReportes={false}
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        <PMKPICards stats={stats} isLoading={isLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PMQuickNav />
          <PMRecentActivity tasks={tasks} isLoading={isLoading} />
        </div>
      </div>
    </ModuloSection>
  );
}
