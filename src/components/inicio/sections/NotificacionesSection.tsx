'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import {
  NotificacionesKPIs,
  AlertasRecientes,
  CanalesNotificacion,
  UltimasNotificaciones,
} from '@/components/notificaciones/dashboard';
import {
  NotificacionesDashboardService,
  type NotificacionesKPIs as KPIsType,
  type SystemAlert,
  type NotificationChannel,
  type NotificationRow,
} from '@/lib/services/notificacionesDashboardService';
import type {
  SectionExportData,
  SectionKPI,
  SectionColumn,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

const PERIODO_LABEL = 'Últimas notificaciones';

function buildExportData(
  kpis: KPIsType | null,
  notifications: NotificationRow[],
): SectionExportData | null {
  if (!kpis) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Pendientes', value: String(kpis.pendientes), kind: 'neutro' },
    { label: 'Enviadas hoy', value: String(kpis.enviadasHoy), kind: 'ingreso' },
    { label: 'Fallidas', value: String(kpis.fallidas), kind: 'egreso' },
    { label: 'Entregadas', value: String(kpis.entregadas), kind: 'ingreso' },
    { label: 'Leídas', value: String(kpis.leidas), kind: 'neutro' },
  ];

  const columnas: SectionColumn[] = [
    { key: 'titulo', label: 'Título' },
    { key: 'canal', label: 'Canal' },
    { key: 'destinatario', label: 'Destinatario' },
    { key: 'estado', label: 'Estado' },
    { key: 'fecha', label: 'Fecha' },
  ];

  const filas: SectionDataRow[] = notifications.map((n) => ({
    titulo: (n.payload?.title || n.payload?.type || '—') as string,
    canal: n.channel,
    destinatario:
      (n.recipient_email || n.recipient_phone || (n.recipient_user_id ? 'Individual' : 'Todos (Org)')) as string,
    estado: n.read_at ? 'Leída' : n.status,
    fecha: n.created_at,
  }));

  return {
    titulo: 'Dashboard Notificaciones',
    periodo: PERIODO_LABEL,
    kpis: kpiList,
    columnas,
    filas,
  };
}

export default function NotificacionesSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIsType | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
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
        const [
          kpisData,
          alertsData,
          channelsData,
          notificationsData,
          orgData,
        ] = await Promise.all([
          NotificacionesDashboardService.getKPIs(organizationId),
          NotificacionesDashboardService.getRecentAlerts(organizationId, 10),
          NotificacionesDashboardService.getChannels(organizationId),
          NotificacionesDashboardService.getLatestNotifications(organizationId, 20),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        setKpis(kpisData);
        setAlerts(alertsData);
        setChannels(channelsData);
        setNotifications(notificationsData);

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
        console.error('Error cargando dashboard de notificaciones:', err);
        toastError('Error', 'No se pudo cargar el dashboard de notificaciones');
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
    () => buildExportData(kpis, notifications),
    [kpis, notifications],
  );

  return (
    <ModuloSection
      moduleCode="notifications"
      moduleName="Notificaciones"
      icon={Bell}
      accentColor="text-yellow-600 dark:text-yellow-400"
      accentBg="bg-yellow-100 dark:bg-yellow-900/30"
      hasReportes={false}
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        <NotificacionesKPIs data={kpis} isLoading={isLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AlertasRecientes alerts={alerts} isLoading={isLoading} maxItems={10} />
          <CanalesNotificacion channels={channels} isLoading={isLoading} />
        </div>

        <UltimasNotificaciones notifications={notifications} isLoading={isLoading} maxItems={20} />
      </div>
    </ModuloSection>
  );
}
