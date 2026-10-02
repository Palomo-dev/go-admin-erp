'use client';

/**
 * CallLinkPanel — acciones para vincular/crear cliente y oportunidad
 * en una llamada que no los tenía registrados.
 *
 * Se muestra en CallRowDetail cuando:
 * - No hay customer_id → {t('vincularCliente')} o {t('crearCliente')}
 * - Hay cliente pero no opportunity_id → {t('crearOportunidad')}
 */

import { useCallLinkForm } from './useCallLinkForm';
import { useTranslations } from 'next-intl';
import { CallLinkedEntities } from './CallLinkedEntities';
import { UserPlus, Search, Briefcase, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { telefonoOpcionalValido } from '@/lib/utils/telefono';
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
  opportunityName?: string | null;
  opportunityStage?: string | null;
  opportunityAmount?: string | null;
  embedded?: boolean;
}

export function CallLinkPanel({
  callId,
  customerId,
  opportunityId,
  phoneNumber,
  customerName,
  onLinked,
  opportunityName, opportunityStage, opportunityAmount, embedded = false,
}: CallLinkPanelProps) {
  const t = useTranslations('crm.llamadas.ficha');
  const { mode, setMode, searchQuery, setSearchQuery, searchResults, searching, submitting, error, newFirstName, setNewFirstName, newLastName, setNewLastName, newPhone, setNewPhone, oppName, setOppName, oppPipelineId, setOppPipelineId, oppStageId, setOppStageId, pipelines, lookupsLoading, stagesOfPipeline, searchCustomers, linkExisting, createCustomer, createOpportunity } = useCallLinkForm(callId, phoneNumber, onLinked);

  // Si ya hay cliente y oportunidad, no mostrar nada
  if (customerId && opportunityId) return <CallLinkedEntities customerId={customerId} opportunityId={opportunityId} customerName={customerName} opportunityName={opportunityName} opportunityStage={opportunityStage} opportunityAmount={opportunityAmount} />;

  return (
    <div className={embedded ? 'space-y-2.5' : 'rounded-xl border border-line bg-surface p-4'}>
      <CallLinkedEntities customerId={customerId} opportunityId={opportunityId} customerName={customerName} opportunityName={opportunityName} opportunityStage={opportunityStage} opportunityAmount={opportunityAmount} />
      {/* Botones de acción (modo idle) */}
      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {!customerId && (
            <>
              <Button size="sm" variant="outline" onClick={() => setMode('search')} className="text-xs">
                <Search size={12} className="mr-1" /> {t('vincularCliente')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMode('create')} className="text-xs">
                <UserPlus size={12} className="mr-1" /> {t('crearCliente')}
              </Button>
            </>
          )}
          {customerId && !opportunityId && (
            <Button size="sm" variant="outline" onClick={() => setMode('createOpp')} className="text-xs">
              <Briefcase size={12} className="mr-1" /> {t('crearOportunidad')}
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
              placeholder={t('nombreTelefono')}
              aria-label={t('buscarCliente')}
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="sm" onClick={searchCustomers} disabled={searching || !searchQuery.trim()} className="h-8 shrink-0">
              {searching ? '…' : t('buscar')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')} disabled={submitting} className="h-8 shrink-0" aria-label={t('cerrar')}>
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
                  className="flex w-full items-center justify-between rounded-md border border-line bg-surface px-2 py-1.5 text-left text-xs hover:bg-hover"
                >
                  <div>
                    <span className="font-medium text-fg">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || t('sinNombre')}
                    </span>
                    {c.phone && <span className="ml-2 font-mono text-fg-secondary">{c.phone}</span>}
                  </div>
                  <ChevronRight size={12} className="text-fg-muted" />
                </button>
              ))}
            </div>
          )}
          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="text-xs text-fg-secondary">
              {t('sinResultados')} <button onClick={() => setMode('create')} className="text-brand underline">{t('crearClienteNuevo')}</button>
            </p>
          )}
        </div>
      )}

      {/* Crear cliente nuevo */}
      {mode === 'create' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="link-first-name" className="text-xs">{t('nombre')}</Label>
              <Input
                id="link-first-name"
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                disabled={submitting}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="link-last-name" className="text-xs">{t('apellido')}</Label>
              <Input
                id="link-last-name"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                disabled={submitting}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="link-phone" className="text-xs">{t('telefono')}</Label>
            <PhoneInput
              id="link-phone"
              value={newPhone}
              onChange={setNewPhone}
              disabled={submitting}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={createCustomer} disabled={submitting || !newFirstName.trim() || !telefonoOpcionalValido(newPhone)} className="h-8">
              {submitting ? t('guardando') : t('crearVincular')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')} disabled={submitting} className="h-8">
              {t('cancelar')}
            </Button>
          </div>
        </div>
      )}

      {/* Crear oportunidad */}
      {mode === 'createOpp' && (
        <div className="space-y-2">
          <div>
            <Label htmlFor="opp-name" className="text-xs">{t('nombreOportunidad')}</Label>
            <Input
              id="opp-name"
              value={oppName}
              onChange={(e) => setOppName(e.target.value)}
              disabled={submitting}
              placeholder={t('ejemploOportunidad')}
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs">{t('pipeline')}</Label>
            {lookupsLoading ? (
              <p className="text-xs text-fg-secondary">{t('cargandoPipelines')}</p>
            ) : (
              <EntitySelect
                value={oppPipelineId}
                disabled={submitting}
                onChange={(id) => {
                  setOppPipelineId(id);
                  setOppStageId(null);
                }}
                options={pipelines}
                placeholder={t('seleccionarPipeline')}
                emptyMessage={t('sinPipelines')}
              />
            )}
          </div>
          {oppPipelineId && (
            <div>
              <Label className="text-xs">{t('etapaCampo')}</Label>
              {lookupsLoading ? (
                <p className="text-xs text-fg-secondary">{t('cargandoEtapas')}</p>
              ) : (
                <EntitySelect
                  value={oppStageId}
                  disabled={submitting}
                  onChange={(id) => setOppStageId(id)}
                  options={stagesOfPipeline}
                  placeholder={t('seleccionarEtapa')}
                  emptyMessage={t('sinEtapas')}
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
              {submitting ? t('guardando') : t('crearOportunidad')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')} disabled={submitting} className="h-8">
              {t('cancelar')}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-danger-text">{error}</p>
      )}
    </div>
  );
}
