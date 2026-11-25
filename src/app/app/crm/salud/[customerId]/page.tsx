'use client';

import { useParams } from 'next/navigation';
import { SaludDetalle } from '@/components/crm/health/SaludDetalle';

/** /app/crm/salud/[customerId] — detalle de salud de un cliente (Figma 1424:17). */
export default function CrmSaludDetallePage() {
  const params = useParams<{ customerId: string }>();
  const customerId = params?.customerId ?? '';
  return <SaludDetalle key={customerId} customerId={customerId} />;
}
