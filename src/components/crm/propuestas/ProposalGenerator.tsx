'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MotionConfig } from 'motion/react';
import { Calculator, FileText, Loader2, Mail, Printer, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { FadeIn } from '@/components/shared/motion/primitives';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { SECTION_KEYS, hasEditedSections, renderProposalHtml, formatMoney, type ProposalSections, type SectionKey } from '@/lib/services/crm/proposalNarrative';
import type { ProposalContextData, ProposalRecord } from '@/lib/services/crm/proposalServerService';
import { ProposalSectionCard } from './ProposalSectionCard';
import { RoiCalculator } from './RoiCalculator';
import { proposalApi } from './proposalApi';

const ComposeEmailDialog = dynamic(() => import('@/components/crm/shared/ComposeEmailDialog').then((m) => m.ComposeEmailDialog), { ssr: false });

/**
 * F10 — genera la propuesta narrativa desde la oportunidad (cliente, discovery
 * plano, objeciones, ROI, pricing) → `quotations` enlazada con `sections_json`.
 * Secciones editables en su sitio; PDF = vista imprimible (`@media print`, como
 * el resto del repo); «Enviar por email» abre el compositor de F7/F9 con la
 * propuesta como cuerpo y, al enviarse, marca la cotización `sent`, registra
 * la actividad y programa `next_contact_at` +24 h.
 */
export interface ProposalGeneratorProps {
  opportunityId: string;
  customer?: { id?: string; full_name?: string | null; email?: string | null } | null;
  organizationName?: string;
  /** Se invoca cuando la propuesta cambia (crear/regenerar) para que el resto de la pestaña se refresque. */
  onProposalChange?: (proposal: ProposalRecord | null) => void;
  onActivity?: () => void;
  /** Contexto cargado (vertical, cliente…) para los bloques vecinos de la pestaña. */
  onContextLoaded?: (context: ProposalContextData) => void;
}

const STATUS_LABEL: Record<string, string> = { draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada', converted: 'Facturada', expired: 'Vencida' };

export function ProposalGenerator({ opportunityId, customer, organizationName, onProposalChange, onContextLoaded, onActivity }: ProposalGeneratorProps) {
  const { formatDate } = useFormatDate();
  const [context, setContext] = useState<ProposalContextData | null>(null);
  const [proposal, setProposal] = useState<ProposalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roiOpen, setRoiOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  // «Regenerar» con secciones editadas a mano: se confirma antes de descartarlas (force).
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const generateButton = useRef<HTMLButtonElement>(null);
  // Tras generar, el botón se sustituye por «Regenerar»: el foco se restaura después del render.
  const [focusPending, setFocusPending] = useState(false);
  useEffect(() => { if (focusPending) { setFocusPending(false); generateButton.current?.focus(); } }, [focusPending]);
  // Los callbacks del padre van en refs: una lambda nueva por render no debe relanzar la carga.
  const callbacks = useRef({ onProposalChange, onContextLoaded });
  useEffect(() => { callbacks.current = { onProposalChange, onContextLoaded }; });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await proposalApi.load(opportunityId);
      setContext(data.context);
      callbacks.current.onContextLoaded?.(data.context);
      setProposal(data.proposal);
      callbacks.current.onProposalChange?.(data.proposal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la propuesta');
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => { void load(); }, [load]);

  const generate = async (roi?: { summary: string; outputs: Record<string, number> } | null, force = false) => {
    setBusy(true);
    try {
      const p = await proposalApi.generate(opportunityId, roi ?? null, force);
      setProposal(p);
      onProposalChange?.(p);
      onActivity?.();
      toast({ title: p.isNew ? `Propuesta ${p.number} creada` : `Propuesta ${p.number} regenerada`, description: p.isNew ? 'Revisa cada sección y ajusta el texto antes de enviarla.' : force ? 'Se redactó todo de nuevo; las ediciones anteriores se descartaron.' : 'Se redactaron de nuevo las secciones no editadas y se conservó lo que habías escrito a mano.' });
    } catch (e) {
      toast({ title: 'No se pudo generar la propuesta', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
      setFocusPending(true);
    }
  };

  const saveSection = async (key: SectionKey, content: string) => {
    if (!proposal?.sections) return;
    const current = proposal.sections[key];
    const updated = await proposalApi.saveSections(proposal.id, { [key]: { ...current, content } } as Partial<ProposalSections>);
    setProposal(updated);
    onProposalChange?.(updated);
  };

  const applyRoi = async (r: { summary: string; outputs: Record<string, number> }) => {
    if (!proposal?.sections) { await generate(r); return; }
    try {
      const updated = await proposalApi.saveSections(proposal.id, { roi: { ...proposal.sections.roi, content: r.summary, outputs: r.outputs } });
      setProposal(updated);
      onProposalChange?.(updated);
      toast({ title: 'ROI insertado en la propuesta' });
    } catch (e) {
      toast({ title: 'No se pudo guardar el ROI', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    }
  };

  const onEmailSent = async (r: { email_message_id?: string; scheduled?: boolean }) => {
    setEmailOpen(false);
    if (!proposal) return;
    try {
      const res = await proposalApi.markSent(proposal.id, r.email_message_id);
      setProposal({ ...proposal, status: 'sent' });
      onActivity?.();
      toast({ title: 'Propuesta marcada como enviada', description: `Próximo contacto programado: ${formatDate(res.next_contact_at)}.` });
    } catch (e) {
      toast({ title: 'El email salió, pero no se pudo marcar la propuesta como enviada', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    }
  };

  const openPrint = () => {
    if (!proposal) return;
    window.open(`/app/crm/propuestas/${proposal.id}/imprimir`, '_blank', 'noopener');
  };

  // Sin ediciones a mano regenera directo; con ediciones pregunta qué hacer con ellas.
  const onRegenerate = () => {
    if (hasEditedSections(proposal?.sections)) setConfirmRegenerate(true);
    else void generate();
  };

  if (loading) {
    return <div className="space-y-3" aria-busy="true"><Skeleton className="h-9 w-64" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>;
  }
  if (error || !context) {
    return (
      <Alert variant="destructive"><AlertTitle>No se pudo cargar la propuesta</AlertTitle><AlertDescription>{error ?? 'Sin datos'} <Button type="button" variant="link" className="h-auto p-0 ml-1" onClick={() => void load()}>Reintentar</Button></AlertDescription></Alert>
    );
  }

  const emailBody = proposal?.sections
    ? renderProposalHtml(proposal.sections, { number: proposal.number, customerName: context.customerName, organizationName: organizationName ?? '', validUntil: proposal.valid_until ? formatPlainDate(proposal.valid_until) : null, currency: proposal.currency })
    : '';
  const canEmail = Boolean(proposal?.sections) && Boolean(customer?.email || context.customerEmail);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"><FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />Propuesta</h2>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {proposal
                ? <>{proposal.number} · <Badge variant="secondary" className="align-middle">{STATUS_LABEL[proposal.status] ?? proposal.status}</Badge> · {formatMoney(proposal.total, proposal.currency)}{proposal.valid_until ? ` · válida hasta ${formatPlainDate(proposal.valid_until)}` : ''}</>
                : `Para ${context.customerName ?? 'el cliente'} · ${context.pricing.lines.length} línea(s) · ${formatMoney(context.pricing.lines.length ? context.pricing.total : context.opportunityAmount, context.currency)}`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {proposal ? (
              <>
                <Button ref={generateButton} type="button" variant="outline" size="sm" onClick={onRegenerate} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden="true" />}Regenerar</Button>
                <Button type="button" variant="outline" size="sm" onClick={openPrint}><Printer className="h-4 w-4 mr-1.5" aria-hidden="true" />Imprimir / PDF</Button>
                <Button type="button" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setEmailOpen(true)} disabled={!canEmail} title={canEmail ? undefined : 'El cliente no tiene email'}>
                  <Mail className="h-4 w-4 mr-1.5" aria-hidden="true" />Enviar por email
                </Button>
              </>
            ) : (
              <Button ref={generateButton} type="button" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => void generate()} disabled={busy || !context.customerId} title={context.customerId ? undefined : 'Asigna un cliente a la oportunidad primero'}>
                {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4 mr-1.5" aria-hidden="true" />}Generar propuesta
              </Button>
            )}
          </div>
        </div>

        {!proposal && (
          <FadeIn className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-6 text-center">
            <Sparkles className="h-8 w-8 mx-auto text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">Aún no hay propuesta. Se redactará con lo que ya sabes del cliente: {context.discoveryFields.filter((f) => String(context.discovery[f.id] ?? '').trim()).length} respuesta(s) de discovery, {context.objections.length} objeción(es) y {context.pricing.lines.length} línea(s) de precio.</p>
            {!context.customerId && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">La oportunidad no tiene cliente asignado: asígnalo para poder generar la propuesta.</p>}
          </FadeIn>
        )}

        {proposal?.sections && (
          <div className="space-y-3">
            {SECTION_KEYS.map((key) => {
              const s = proposal.sections![key];
              return (
                <FadeIn key={key}>
                  <ProposalSectionCard
                    sectionKey={key}
                    title={s.title}
                    content={s.content}
                    disabled={busy}
                    onSave={(c) => saveSection(key, c)}
                    action={key === 'roi' ? <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setRoiOpen(true)}><Calculator className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Calcular ROI</Button> : undefined}
                  >
                    {key === 'pricing' && proposal.sections!.pricing.lines.length > 0 && (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="text-left text-xs text-gray-600 dark:text-gray-400"><th scope="col" className="py-1">Concepto</th><th scope="col" className="py-1 text-right">Cant.</th><th scope="col" className="py-1 text-right">Total</th></tr></thead>
                          <tbody>{proposal.sections!.pricing.lines.map((l, i) => <tr key={i} className="border-t border-gray-100 dark:border-gray-700"><td className="py-1 text-gray-800 dark:text-gray-200">{l.description}</td><td className="py-1 text-right">{l.qty}</td><td className="py-1 text-right">{formatMoney(l.total, proposal.currency)}</td></tr>)}</tbody>
                        </table>
                      </div>
                    )}
                  </ProposalSectionCard>
                </FadeIn>
              );
            })}
          </div>
        )}

        <RoiCalculator open={roiOpen} onOpenChange={setRoiOpen} verticalSlug={context.verticalSlug} currency={context.currency} onApply={(r) => void applyRoi(r)} />
        <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Regenerar la propuesta</AlertDialogTitle>
              <AlertDialogDescription>Hay secciones que editaste a mano. Puedes redactar de nuevo solo las que no tocaste (se conserva lo tuyo) o volver a generar todo desde cero y perder esas ediciones.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <Button type="button" variant="outline" onClick={() => { setConfirmRegenerate(false); void generate(); }}>Conservar lo editado</Button>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => void generate(null, true)}>Regenerar todo</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {emailOpen && proposal && (
          <ComposeEmailDialog
            open
            onOpenChange={(o) => !o && setEmailOpen(false)}
            opportunityId={opportunityId}
            customerId={context.customerId ?? undefined}
            customer={{ id: context.customerId ?? undefined, full_name: context.customerName, email: customer?.email ?? context.customerEmail }}
            defaultSubject={`Propuesta ${proposal.number} — ${context.opportunityName}`}
            defaultBody={emailBody}
            onSent={(r) => void onEmailSent(r)}
          />
        )}
      </div>
    </MotionConfig>
  );
}
