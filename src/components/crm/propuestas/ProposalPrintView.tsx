'use client';

import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { renderProposalHtml } from '@/lib/services/crm/proposalNarrative';
import { proposalApi, type ProposalDetail } from './proposalApi';

/**
 * F10 — vista imprimible de la propuesta. El repo no tiene un generador de PDF
 * reutilizable (`/api/pdf/invoice` devuelve HTML): «PDF» = esta página con
 * `@media print` y el diálogo del navegador (Guardar como PDF). El HTML sale
 * de `renderProposalHtml` (todo escapado) y se inyecta como cadena ya segura.
 */
export function ProposalPrintView({ proposalId }: { proposalId: string }) {
  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    proposalApi.get(proposalId).then((p) => { if (!cancelled) setProposal(p); }).catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar'); });
    return () => { cancelled = true; };
  }, [proposalId]);

  if (error) return <p role="alert" className="p-6 text-sm text-red-700 dark:text-red-300">{error}</p>;
  if (!proposal) return <div className="p-6 space-y-3" aria-busy="true"><Skeleton className="h-8 w-72" /><Skeleton className="h-64 w-full" /></div>;
  if (!proposal.sections) return <p className="p-6 text-sm text-gray-700 dark:text-gray-300">Esta cotización no tiene secciones narrativas: genera la propuesta desde la oportunidad.</p>;

  const html = renderProposalHtml(proposal.sections, {
    number: proposal.number,
    customerName: proposal.customerName ?? null,
    organizationName: proposal.organizationName ?? '',
    // `valid_until` es columna `date`: se pinta tal cual (regla canónica 5), sin pasar por la zona horaria.
    validUntil: proposal.valid_until ? formatPlainDate(proposal.valid_until) : null,
    currency: proposal.currency,
  });

  return (
    <div className="mx-auto max-w-3xl p-6 bg-white text-gray-900 print:p-0">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } @page { margin: 18mm; } }`}</style>
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">Vista para imprimir o guardar como PDF desde el navegador.</p>
        <Button type="button" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" aria-hidden="true" />Imprimir / Guardar PDF</Button>
      </div>
      {/* Cadena generada por renderProposalHtml: todo el contenido del usuario pasa por escapeHtml. */}
      <article aria-label={`Propuesta ${proposal.number}`} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
