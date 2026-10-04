'use client';

import { OpportunityTimeline } from '@/components/crm/timeline/OpportunityTimeline';
import type { EntryActionContext } from '@/components/crm/timeline/TimelineEntryCard';

/** Un solo lector para actividad, oportunidades y registros comerciales del cliente. */
export default function TimelineTab({ clienteId, cliente }: { clienteId: string; organizationId: number; cliente?: EntryActionContext['customer'] }) {
  return <OpportunityTimeline entityType="customer" entityId={clienteId}
    context={{ customerId: clienteId, customer: cliente }} />;
}
