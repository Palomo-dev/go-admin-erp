'use client';

/**
 * CallLinkPanel — acciones para vincular/crear cliente y oportunidad
 * en una llamada que no los tenía registrados.
 *
 * Se muestra en CallRowDetail cuando:
 * - No hay customer_id → "Vincular cliente" o "Crear cliente"
 * - Hay cliente pero no opportunity_id → "Crear oportunidad"
 */

import { useState } from 'react';
import { UserPlus, Search, Briefcase, X, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { telefonoOpcionalValido } from '@/lib/utils/telefono';
import { describeError, logError } from '@/lib/utils/errorMessage';
import { fetchJson } from '@/lib/utils/fetchJson';
import { useCrmLookups } from '@/components/crm/shared/useCrmLookups';
import { EntitySelect } from '@/components/crm/shared/EntitySelect';

interface CallLinkPanelProps {
  callId: string;
  customerId: string | null;
  opportunityId: string | null;
  /** Número al que se llamó (para pre-llenar al crear cliente). */
  phoneNumber: string;
  /** Display name del cliente si ya existe (para mostrarlo). */
  customerName?: string | null;
  onLinked: () => void;
}

interface CustomerSearchResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

export function CallLinkPanel({
  callId,
  customerId,
  opportunityId,
  phoneNumber,
  customerName,
  onLinked,
}: CallLinkPanelProps) {
  const [mode, setMode] = useState<'idle' | 'search' | 'create' | 'createOpp'>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setSubmitting(true);
    setError(null);
    try {
      await fetchJson(`/api/crm/calls/${callId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: custId }),
      });
      setMode('idle');
      onLinked();
    } catch (err) {
      logError('[CallLinkPanel] vincular', err);
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const createCustomer = async () => {
    if (!newFirstName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await fetchJson(`/api/crm/calls/${callId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          create_customer: {
            first_name: newFirstName.trim(),
            last_name: newLastName.trim() || null,
            phone: newPhone.trim(),
          },
        }),
      });
      setMode('idle');
      setNewFirstName('');
      setNewLastName('');
      onLinked();
    } catch (err) {
      logError('[CallLinkPanel] crear cliente', err);
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const createOpportunity = async () => {
    if (!oppName.trim() || !oppPipelineId || !oppStageId) return;
    setSubmitting(true);
    setError(null);
    try {
      await fetchJson(`/api/crm/calls/${callId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          create_opportunity: {
            name: oppName.trim(),
            pipeline_id: oppPipelineId,
            stage_id: oppStageId,
          },
        }),
      });
      setMode('idle');
      setOppName('');
      setOppPipelineId(null);
      setOppStageId(null);
      onLinked();
    } catch (err) {
      logError('[CallLinkPanel] crear oportunidad', err);
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Si ya hay cliente y oportunidad, no mostrar nada
  if (customerId && opportunityId) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
      {/* Resumen de estado */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-blue-800 dark:text-blue-300">Vinculación:</span>
        {customerId ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-300">
            <Check size={10} /> {customerName || 'Cliente vinculado'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <X size={10} /> Sin cliente
          </span>
        )}
        {opportunityId ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-300">
            <Check size={10} /> Oportunidad
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <X size={10} /> Sin oportunidad
          </span>
        )}
      </div>

      {/* Botones de acción (modo idle) */}
      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {!customerId && (
            <>
              <Button size="sm" variant="outline" onClick={() => setMode('search')} className="text-xs">
                <Search size={12} className="mr-1" /> Vincular cliente
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMode('create')} className="text-xs">
                <UserPlus size={12} className="mr-1" /> Crear cliente
              </Button>
            </>
          )}
          {customerId && !opportunityId && (
            <Button size="sm" variant="outline" onClick={() => setMode('createOpp')} className="text-xs">
              <Briefcase size={12} className="mr-1" /> Crear oportunidad
            </Button>
          )}
        </div>
      )}

      {/* Buscar cliente existente */}
      {mode === 'search' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchCustomers()}
              placeholder="Nombre o teléfono…"
              aria-label="Buscar cliente"
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="sm" onClick={searchCustomers} disabled={searching || !searchQuery.trim()} className="h-8 shrink-0">
              {searching ? '…' : 'Buscar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')} className="h-8 shrink-0">
              <X size={14} />
            </Button>
          </div>
          {searchResults.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {searchResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => linkExisting(c.id)}
                  disabled={submitting}
                  className="flex w-full items-center justify-between rounded-md border border-gray-200 bg-white px-2 py-1.5 text-left text-xs hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-blue-950/30"
                >
                  <div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || 'Sin nombre'}
                    </span>
                    {c.phone && <span className="ml-2 font-mono text-gray-500 dark:text-gray-400">{c.phone}</span>}
                  </div>
                  <ChevronRight size={12} className="text-gray-400" />
                </button>
              ))}
            </div>
          )}
          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Sin resultados. <button onClick={() => setMode('create')} className="text-blue-600 underline">Crear cliente nuevo</button>
            </p>
          )}
        </div>
      )}

      {/* Crear cliente nuevo */}
      {mode === 'create' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="link-first-name" className="text-xs">Nombre</Label>
              <Input
                id="link-first-name"
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="link-last-name" className="text-xs">Apellido</Label>
              <Input
                id="link-last-name"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="link-phone" className="text-xs">Teléfono</Label>
            <PhoneInput
              id="link-phone"
              value={newPhone}
              onChange={setNewPhone}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={createCustomer} disabled={submitting || !newFirstName.trim() || !telefonoOpcionalValido(newPhone)} className="h-8">
              {submitting ? 'Guardando…' : 'Crear y vincular'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')} className="h-8">
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Crear oportunidad */}
      {mode === 'createOpp' && (
        <div className="space-y-2">
          <div>
            <Label htmlFor="opp-name" className="text-xs">Nombre de la oportunidad</Label>
            <Input
              id="opp-name"
              value={oppName}
              onChange={(e) => setOppName(e.target.value)}
              placeholder="Ej: Venta Plan Business"
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs">Pipeline</Label>
            {lookupsLoading ? (
              <p className="text-xs text-gray-500">Cargando pipelines…</p>
            ) : (
              <EntitySelect
                value={oppPipelineId}
                onChange={(id) => {
                  setOppPipelineId(id);
                  setOppStageId(null);
                }}
                options={pipelines}
                placeholder="Selecciona un pipeline"
                emptyMessage="No hay pipelines creados."
              />
            )}
          </div>
          {oppPipelineId && (
            <div>
              <Label className="text-xs">Etapa</Label>
              {lookupsLoading ? (
                <p className="text-xs text-gray-500">Cargando etapas…</p>
              ) : (
                <EntitySelect
                  value={oppStageId}
                  onChange={(id) => setOppStageId(id)}
                  options={stagesOfPipeline}
                  placeholder="Selecciona una etapa"
                  emptyMessage="No hay etapas en este pipeline."
                />
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={createOpportunity}
              disabled={submitting || !oppName.trim() || !oppPipelineId || !oppStageId}
              className="h-8"
            >
              {submitting ? 'Guardando…' : 'Crear oportunidad'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')} className="h-8">
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
