'use client';

import { useOrganization } from '@/lib/hooks/useOrganization';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/kit/EmptyState';
import { SaludView } from '@/components/crm/health/SaludView';

/**
 * Pagina de Salud de Clientes del CRM (FASE 4 - Post-venta).
 * Panel de salud con scores, bandas e indicadores.
 */
export default function CrmSaludPage() {
  const t = useTranslations('crm.salud');
  const { organization, error, isLoading } = useOrganization();
  const orgId = organization?.id;
  if (!isLoading && (error || !orgId)) return <EmptyState variante="error" titulo={t('loadError')} onReintentar={() => window.location.reload()} />;

  if (!orgId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-fg-secondary">{t('loading')}</p>
      </div>
    );
  }

  return <SaludView organizationId={orgId} />;
}
