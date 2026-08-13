'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { toastError } from '@/components/ui/use-toast';
import ModuloSection from '../ModuloSection';
import {
  KPICards,
  IntegracionesList,
  WebhooksList,
  integracionesDashboardService,
  type IntegracionesKPI,
  type WebhookResumen,
} from '@/components/integraciones/dashboard';
import type { IntegrationConnection } from '@/lib/services/integrationsService';
import type {
  SectionExportData,
  SectionKPI,
  SectionDataRow,
  ExportOrganizationInfo,
} from '@/lib/services/inicio/dashboardSectionExport';

const PERIODO_LABEL = 'Estado actual';

function buildExportData(
  kpis: IntegracionesKPI | null,
  connections: IntegrationConnection[],
  webhooks: WebhookResumen[],
): SectionExportData | null {
  if (!kpis) return null;

  const kpiList: SectionKPI[] = [
    { label: 'Integraciones', value: String(kpis.totalIntegraciones), kind: 'neutro' },
    { label: 'Activas', value: String(kpis.integracionesActivas), kind: 'ingreso' },
    { label: 'Inactivas', value: String(kpis.integracionesInactivas), kind: 'egreso' },
    { label: 'Webhooks', value: String(kpis.webhooksConfigurados), kind: 'neutro' },
    { label: 'Eventos disponibles', value: String(kpis.eventosDisponibles), kind: 'neutro' },
  ];

  const filas: SectionDataRow[] = [
    ...connections.map((c) => {
      const connector = c.connector as IntegrationConnection['connector'];
      const provider = connector?.provider;
      return {
        tipo: 'Integración',
        nombre: c.name,
        proveedor: provider?.name || connector?.name || '—',
        estado: c.status,
      };
    }),
    ...webhooks.map((w) => ({
      tipo: 'Webhook',
      nombre: w.connectionName,
      proveedor: w.direction,
      estado: w.isActive ? 'activo' : 'inactivo',
    })),
  ];

  return {
    titulo: 'Dashboard Integraciones',
    periodo: PERIODO_LABEL,
    kpis: kpiList,
    columnas: [
      { key: 'tipo', label: 'Tipo' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'proveedor', label: 'Proveedor / Dirección' },
      { key: 'estado', label: 'Estado' },
    ],
    filas,
  };
}

export default function IntegracionesSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<IntegracionesKPI | null>(null);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookResumen[]>([]);
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
        const [kpisData, connectionsData, webhooksData, orgData] = await Promise.all([
          integracionesDashboardService.getKPIs(organizationId),
          integracionesDashboardService.getConnections(organizationId),
          integracionesDashboardService.getWebhooks(organizationId),
          supabase
            .from('organizations')
            .select('name, legal_name, tax_id, city, address, phone, email, logo_url')
            .eq('id', organizationId)
            .single(),
        ]);

        if (cancelled) return;

        setKpis(kpisData);
        setConnections(connectionsData);
        setWebhooks(webhooksData);

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
        console.error('Error cargando dashboard de integraciones:', err);
        toastError('Error', 'No se pudo cargar el dashboard de integraciones');
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
    () => buildExportData(kpis, connections, webhooks),
    [kpis, connections, webhooks],
  );

  return (
    <ModuloSection
      moduleCode="integrations"
      moduleName="Integraciones"
      icon={Zap}
      accentColor="text-purple-600 dark:text-purple-400"
      accentBg="bg-purple-100 dark:bg-purple-900/30"
      hasReportes={false}
      exportData={exportData}
      orgInfo={orgInfo}
      isLoading={isLoading}
    >
      <div className="space-y-6">
        <KPICards data={kpis} isLoading={isLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <IntegracionesList connections={connections} isLoading={isLoading} />
          <WebhooksList webhooks={webhooks} isLoading={isLoading} />
        </div>
      </div>
    </ModuloSection>
  );
}
