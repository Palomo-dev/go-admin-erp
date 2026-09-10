'use client';

import { OpportunityTimeline } from '@/components/crm/timeline/OpportunityTimeline';
import type { DrawerTabProps } from './types';

/** Pestaña Actividad: el timeline unificado (compact en drawer). */
export function ActividadTab({ opportunity, customer, active, compact = true, refreshToken }: DrawerTabProps & { compact?: boolean; refreshToken?: number }) {
  if (!active) return null;
  return (
    <OpportunityTimeline
      entityType="opportunity"
      entityId={opportunity.id}
      compact={compact}
      refreshToken={refreshToken}
      showFilters
      context={{
        opportunityId: opportunity.id,
        customerId: opportunity.customer_id ?? undefined,
        customer: customer ? { id: customer.id, full_name: customer.full_name, email: customer.email, phone: customer.phone } : opportunity.customer ?? null,
      }}
    />
  );
}
