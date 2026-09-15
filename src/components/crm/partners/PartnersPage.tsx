'use client';

/**
 * /app/crm/partners — partners de la organización (FASE-12, brief UX). Una
 * acción principal («Nuevo partner»), búsqueda y filtro arriba, tarjetas con
 * tier/tasa/deals/comisión, deals y transiciones en hoja lateral, tiers en
 * otra. Rutas: `/api/crm/partners/**`; el navegador no escribe en la base y
 * ninguna comisión es dinero movido.
 */

import { useMemo, useRef, useState } from 'react';
import { Award, Plus, Search } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { FadeIn } from '@/components/shared/motion/primitives';
import { CrmPageHeader } from '@/components/crm/shared/CrmPageHeader';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import type { PartnerView } from '@/lib/services/crm/partnerService';
import { EMPTY_PARTNER_FILTERS, filterPartners, type PartnerListFilters } from '@/lib/services/crm/partnerModel';
import { PartnerDealList } from './PartnerDealList';
import { PartnerEditor } from './PartnerEditor';
import { PartnerList } from './PartnerList';
import { TierEditor } from './TierEditor';
import { usePartners } from './usePartners';

export function PartnersPage() {
  const { partners, tiers, canManage, loading, loaded, error, reload, savePartner, deletePartner, saveTier, deleteTier, loadDeals, registerDeal, transitionDeal } = usePartners();
  const [filters, setFilters] = useState<PartnerListFilters>(EMPTY_PARTNER_FILTERS);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerView | null>(null);
  const [dealsTarget, setDealsTarget] = useState<PartnerView | null>(null);
  const [tiersOpen, setTiersOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PartnerView | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const tiersButtonRef = useRef<HTMLButtonElement>(null);
  const fallback = () => newButtonRef.current;
  const onDeleteClose = useReturnFocus(deleteTarget !== null, fallback);

  const shown = useMemo(() => filterPartners(partners, filters), [partners, filters]);
  // La hoja de deals se queda con la fila viva: tras registrar un deal, el tier y las cifras cambian.
  const dealsPartner = dealsTarget ? partners.find((p) => p.id === dealsTarget.id) ?? dealsTarget : null;

  const openEditor = (p: PartnerView | null) => {
    setEditing(p);
    setEditorOpen(true);
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePartner(deleteTarget.id);
      toast({ title: `Partner «${deleteTarget.name}» eliminado` });
    } catch (err) {
      toast({ title: 'No se pudo eliminar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-5 p-4 sm:p-6">
        <CrmPageHeader
          title="Partners"
          description="Consultores, integradores y revendedores que traen deals. Su tier sube solo con resultados; su comisión queda registrada por deal."
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          secondary={{ label: `Tiers${tiers.length ? ` (${tiers.length})` : ''}`, icon: Award, onClick: () => setTiersOpen(true), buttonRef: tiersButtonRef }}
          primary={{ label: 'Nuevo partner', icon: Plus, onClick: () => openEditor(null), buttonRef: newButtonRef }}
        />

        {error && (
          <Alert variant="destructive">
            <AlertTitle>{loaded ? 'No se pudo actualizar la lista' : 'No se pudieron cargar los partners'}</AlertTitle>
            <AlertDescription>{error}. {loaded ? 'Se muestra la última lista conocida; pulsa' : 'Pulsa'} «Actualizar» para reintentar.</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Cargando partners">
            <Skeleton className="h-9 w-full max-w-md" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-52 w-full rounded-xl" />)}</div>
          </div>
        ) : partners.length === 0 && (loaded || !error) ? (
          <FadeIn className="mx-auto max-w-xl rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/60"><Award className="h-7 w-7 text-blue-600 dark:text-blue-400" aria-hidden="true" /></div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Vende con quien ya vende</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Da de alta a un consultor o integrador, asígnale un tier y registra los deals que trae: la comisión se calcula sola y el tier sube con los resultados.</p>
            <Button type="button" className="mt-5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => openEditor(null)}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Crear el primer partner</Button>
          </FadeIn>
        ) : partners.length === 0 ? null : (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-full max-w-md">
                <Label htmlFor="partners-search" className="text-xs text-gray-700 dark:text-gray-300">Buscar</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                  <Input id="partners-search" type="search" autoComplete="off" className="pl-9" placeholder="Nombre, empresa, correo o tier" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch id="partners-only-active" checked={filters.onlyActive} onCheckedChange={(v) => setFilters({ ...filters, onlyActive: v })} />
                <Label htmlFor="partners-only-active" className="text-sm text-gray-900 dark:text-gray-100">Solo activos</Label>
              </div>
              <p className="pb-2 text-sm text-gray-600 dark:text-gray-400" aria-live="polite">{shown.length === partners.length ? `${partners.length} partner${partners.length === 1 ? '' : 's'}` : `${shown.length} de ${partners.length} partners`}</p>
            </div>
            {shown.length === 0 ? (
              <FadeIn className="rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
                <p className="font-medium text-gray-900 dark:text-gray-100">Ningún partner coincide con los filtros</p>
                <Button type="button" variant="outline" className="mt-3" onClick={() => setFilters(EMPTY_PARTNER_FILTERS)}>Quitar filtros</Button>
              </FadeIn>
            ) : (
              <PartnerList partners={shown} canManage={canManage} onEdit={openEditor} onDeals={(p) => setDealsTarget(p)} onDelete={(p) => setDeleteTarget(p)} />
            )}
          </>
        )}

        <PartnerEditor open={editorOpen} partner={editing} tiers={tiers} onOpenChange={setEditorOpen} onSave={savePartner} returnFocusFallback={fallback} />
        <TierEditor open={tiersOpen} tiers={tiers} onOpenChange={setTiersOpen} onSave={saveTier} onDelete={deleteTier} returnFocusFallback={() => tiersButtonRef.current} />
        <PartnerDealList open={dealsPartner !== null} partner={dealsPartner} canManage={canManage} onOpenChange={(o) => { if (!o) setDealsTarget(null); }} loadDeals={loadDeals} onRegister={registerDeal} onTransition={transitionDeal} returnFocusFallback={fallback} />
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
          title="Eliminar partner"
          description={`Se eliminará «${deleteTarget?.name ?? ''}» y sus ${deleteTarget?.commissions.count ?? 0} deal${deleteTarget?.commissions.count === 1 ? '' : 's'} con sus comisiones registradas. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          variant="destructive"
          onConfirm={onDelete}
          onCloseAutoFocus={onDeleteClose}
        />
      </div>
    </MotionConfig>
  );
}
