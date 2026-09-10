'use client';

import { DocumentUploader } from '@/components/crm/documents/DocumentUploader';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { DrawerTabProps } from './types';

/** Pestaña Documentos: DocumentUploader existente (bucket privado crm-documents). */
export function DocumentosTab({ opportunity, active }: DrawerTabProps) {
  if (!active) return null;
  const orgId = opportunity.organization_id || getOrganizationId();
  if (!orgId) return <p className="text-sm text-gray-500 dark:text-gray-400">Sin organización activa.</p>;
  return <DocumentUploader organizationId={orgId} relatedType="opportunity" relatedId={opportunity.id} title="Documentos de la oportunidad" />;
}
