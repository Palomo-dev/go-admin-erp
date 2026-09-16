'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileSignature } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { renderProposalHtml } from '@/lib/services/crm/proposalNarrative';
import type { ProposalRecord } from '@/lib/services/crm/proposalServerService';
import { ProposalGenerator } from '@/components/crm/propuestas/ProposalGenerator';
import { ContractSignDialog } from '@/components/crm/contratos/ContractSignDialog';
import { PaymentLinkButton } from '@/components/crm/contratos/PaymentLinkButton';
import { DemoScheduler } from '@/components/crm/demo/DemoScheduler';
import { contractApi, type ContractRow } from '@/components/crm/propuestas/proposalApi';
import type { Opportunity, CustomerDetails } from '../types';
import { formatPlainDate } from '@/lib/utils/dateDisplay';

/**
 * F10 — pestaña «Cierre» del detalle de oportunidad: demo → propuesta →
 * contrato → pago. Cada bloque es un componente propio; aquí solo se enlazan.
 */
export interface ClosingTabProps {
  opportunity: Opportunity;
  customer: CustomerDetails | null;
  organizationName?: string;
  active: boolean;
  onActivity?: () => void;
}

const CONTRACT_LABEL: Record<string, string> = { pending: 'Pendiente de envío', sent: 'Enviado', viewed: 'Visto', signed: 'Firmado', declined: 'Rechazado', expired: 'Vencido' };

export function ClosingTab({ opportunity, customer, organizationName, active, onActivity }: ClosingTabProps) {
  const { formatDateTime } = useFormatDate();
  const [proposal, setProposal] = useState<ProposalRecord | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [signOpen, setSignOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const signButton = useRef<HTMLButtonElement>(null);

  const loadContracts = useCallback(async () => {
    try { setContracts(await contractApi.list(opportunity.id)); } catch { /* sin contratos */ }
  }, [opportunity.id]);
  useEffect(() => { if (active) void loadContracts(); }, [active, loadContracts]);

  const onProposalChange = useCallback((p: ProposalRecord | null) => { setProposal(p); setRefreshToken((n) => n + 1); }, []);

  const customerName = customer?.full_name ?? null;
  const [verticalSlug, setVerticalSlug] = useState<string | null>(null);
  const onContextLoaded = useCallback((c: { verticalSlug: string | null }) => setVerticalSlug(c.verticalSlug), []);
  const proposalHtml = useMemo(
    () => (proposal?.sections ? renderProposalHtml(proposal.sections, { number: proposal.number, customerName, organizationName: organizationName ?? '', validUntil: proposal.valid_until ? formatPlainDate(proposal.valid_until) : null, currency: proposal.currency }) : null),
    [proposal, customerName, organizationName],
  );

  const card = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';

  return (
    <div className="space-y-4">
      <Card className={card}><CardContent className="pt-6">
        <DemoScheduler opportunityId={opportunity.id} verticalSlug={verticalSlug} defaultAttendee={{ name: customerName, email: customer?.email ?? null }} />
      </CardContent></Card>

      <Card className={card}><CardContent className="pt-6">
        <ProposalGenerator opportunityId={opportunity.id} customer={{ id: customer?.id, full_name: customerName, email: customer?.email ?? null }} organizationName={organizationName} onProposalChange={onProposalChange} onContextLoaded={onContextLoaded} onActivity={onActivity} />
      </CardContent></Card>

      <Card className={card}><CardContent className="pt-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"><FileSignature className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />Contrato</h2>
          <Button ref={signButton} type="button" size="sm" variant="outline" onClick={() => setSignOpen(true)} disabled={!proposal} title={proposal ? undefined : 'Genera la propuesta primero'}>Enviar a firma</Button>
        </div>
        {contracts.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">Sin contratos enviados. El contrato se firma electrónicamente sobre la propuesta aceptada.</p>
        ) : (
          <ul className="space-y-1.5">
            {contracts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                <Badge variant={c.status === 'signed' ? 'default' : 'secondary'} className={c.status === 'signed' ? 'bg-green-600 text-white' : ''}>{CONTRACT_LABEL[c.status] ?? c.status}</Badge>
                <span>{c.signers.map((s) => s.name).join(', ')}</span>
                <span className="text-gray-500 dark:text-gray-400">· {c.signed_at ? `firmado ${formatDateTime(c.signed_at)}` : c.sent_at ? `enviado ${formatDateTime(c.sent_at)}` : `creado ${formatDateTime(c.created_at)}`}</span>
              </li>
            ))}
          </ul>
        )}
        <ContractSignDialog open={signOpen} onOpenChange={setSignOpen} opportunityId={opportunity.id} quotationId={proposal?.id ?? null} proposalHtml={proposalHtml} proposalNumber={proposal?.number ?? null} defaultSigner={{ name: customerName, email: customer?.email ?? null }} onSent={() => { void loadContracts(); onActivity?.(); }} />
      </CardContent></Card>

      <Card className={card}><CardContent className="pt-6 space-y-2">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Pago en línea</h2>
        <PaymentLinkButton quotationId={proposal?.id ?? null} refreshToken={refreshToken} />
      </CardContent></Card>
    </div>
  );
}
