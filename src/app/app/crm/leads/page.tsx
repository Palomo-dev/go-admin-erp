'use client';

import { Suspense } from 'react';
import { LeadsPantalla } from '@/components/crm/leads/pantalla/LeadsPantalla';

/**
 * /app/crm/leads — Leads = clientes en etapa lead (CRM ola 3A, D2; plan §4.1).
 * La pantalla lista `GET /api/crm/leads` (clientes), no las oportunidades
 * 'lead' heredadas: esas se ven en Oportunidades con la etiqueta «Lead».
 */
export default function LeadsPage() {
  return <Suspense fallback={null}><LeadsPantalla /></Suspense>;
}
