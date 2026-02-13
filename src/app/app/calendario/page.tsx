'use client';

import { useOrganization } from '@/lib/hooks/useOrganization';
import { CalendarView } from '@/components/calendario';

export default function CalendarioPage() {
  const { organization } = useOrganization();

  return (
    <div className="h-[calc(100vh-60px)] overflow-hidden">
      <CalendarView organizationId={organization?.id ?? null} />
    </div>
  );
}
