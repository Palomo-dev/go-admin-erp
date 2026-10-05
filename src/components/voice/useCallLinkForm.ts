'use client';
import { useRef, useState } from 'react';
import { describeError, logError } from '@/lib/utils/errorMessage';
import { fetchJson } from '@/lib/utils/fetchJson';
import { useCrmLookups } from '@/components/crm/shared/useCrmLookups';
interface CustomerSearchResult { id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; }
/** Mismos escritores e intención idempotente del panel; presentación separada. */
export function useCallLinkForm(callId: string, phoneNumber: string, onLinked: () => void) {
  const [mode, setMode] = useState<'idle' | 'search' | 'create' | 'createOpp'>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  const saving = useRef(false);

  const payloadWithIntent = (payload: Record<string, unknown>) => {
    const fingerprint = JSON.stringify({ callId, payload });
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() };
    return { ...payload, idempotency_key: intent.current.key };
  };

  // Form crear cliente
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPhone, setNewPhone] = useState(phoneNumber);

  // Form crear oportunidad
  const [oppName, setOppName] = useState('');
  const [oppPipelineId, setOppPipelineId] = useState<string | null>(null);
  const [oppStageId, setOppStageId] = useState<string | null>(null);
  const { pipelines, stages, loading: lookupsLoading } = useCrmLookups();

  const stagesOfPipeline = stages.filter((s) => s.pipeline_id === oppPipelineId);

  const searchCustomers = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      // Buscar en customers por nombre o teléfono
      const params = new URLSearchParams({ q: searchQuery.trim(), limit: '10' });
      const data = await fetchJson<{ data?: CustomerSearchResult[] }>(
        `/api/crm/customers/search?${params.toString()}`
      );
      setSearchResults(data.data ?? []);
    } catch (err) {
      logError('[CallLinkPanel] buscar clientes', err);
      setError(describeError(err));
    } finally {
      setSearching(false);
    }
  };

  const linkExisting = async (custId: string) => {
    if (saving.current) return;
    saving.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await fetchJson(`/api/crm/calls/${callId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithIntent({ customer_id: custId })),
      });
      setMode('idle');
      onLinked();
      intent.current = null;
    } catch (err) {
      logError('[CallLinkPanel] vincular', err);
      setError(describeError(err));
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  };

  const createCustomer = async () => {
    if (!newFirstName.trim() || saving.current) return;
    saving.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await fetchJson(`/api/crm/calls/${callId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithIntent({
          create_customer: {
            first_name: newFirstName.trim(),
            last_name: newLastName.trim() || null,
            phone: newPhone.trim(),
          },
        })),
      });
      setMode('idle');
      setNewFirstName('');
      setNewLastName('');
      onLinked();
      intent.current = null;
    } catch (err) {
      logError('[CallLinkPanel] crear cliente', err);
      setError(describeError(err));
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  };

  const createOpportunity = async () => {
    if (!oppName.trim() || !oppPipelineId || !oppStageId || saving.current) return;
    saving.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await fetchJson(`/api/crm/calls/${callId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithIntent({
          create_opportunity: {
            name: oppName.trim(),
            pipeline_id: oppPipelineId,
            stage_id: oppStageId,
          },
        })),
      });
      setMode('idle');
      setOppName('');
      setOppPipelineId(null);
      setOppStageId(null);
      onLinked();
      intent.current = null;
    } catch (err) {
      logError('[CallLinkPanel] crear oportunidad', err);
      setError(describeError(err));
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  };

  return { mode, setMode, searchQuery, setSearchQuery, searchResults, searching, submitting, error, newFirstName, setNewFirstName, newLastName, setNewLastName, newPhone, setNewPhone, oppName, setOppName, oppPipelineId, setOppPipelineId, oppStageId, setOppStageId, pipelines, lookupsLoading, stagesOfPipeline, searchCustomers, linkExisting, createCustomer, createOpportunity };
}
