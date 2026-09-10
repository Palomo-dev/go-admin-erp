'use client';

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, BarChart3, BedDouble, Bot, FileText, ListTodo, Package, Paperclip, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { CustomerEditDialog } from '@/components/crm/shared/CustomerEditDialog';
import { useOpportunityData } from '@/components/crm/pipeline/hooks/useOpportunityData';
import { ActividadTab } from '@/components/crm/pipeline/drawer/tabs/ActividadTab';
import { TareasTab } from '@/components/crm/pipeline/drawer/tabs/TareasTab';
import { NotasTab } from '@/components/crm/pipeline/drawer/tabs/NotasTab';
import { IATab } from '@/components/crm/pipeline/drawer/tabs/IATab';
import { opportunitiesService } from './opportunitiesService';
import { OpportunityDocuments } from './OpportunityDocuments';
import type { OpportunityCustomLine, OpportunityProduct, OpportunitySpace } from './types';
import { DetailHeader } from './detail/DetailHeader';
import { DetailSidebar } from './detail/DetailSidebar';
import { LineItemsTab, toItems } from './detail/LineItemsTab';
import { AnalyticsTab } from './detail/AnalyticsTab';
import { useStageFlow } from './detail/useStageFlow';

/**
 * OpportunityDetail (FASE-09 §5.1): header + embudo + QuickActionsBar; tabs
 * Actividad (timeline unificado) · Tareas · Notas · Documentos · IA compartidas
 * con el drawer, más Productos · Espacios · Conceptos · Analítica propias.
 * Sin merge manual de timeline ni ActivityActions.
 */
type DetailTab = 'activity' | 'tasks' | 'notes' | 'documents' | 'ia' | 'products' | 'spaces' | 'custom' | 'analytics';

const TABS: Array<{ id: DetailTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'activity', label: 'Actividad', icon: Activity },
  { id: 'tasks', label: 'Tareas', icon: ListTodo },
  { id: 'notes', label: 'Notas', icon: StickyNote },
  { id: 'documents', label: 'Documentos', icon: Paperclip },
  { id: 'ia', label: 'IA', icon: Bot },
  { id: 'products', label: 'Productos', icon: Package },
  { id: 'spaces', label: 'Espacios', icon: BedDouble },
  { id: 'custom', label: 'Conceptos', icon: FileText },
  { id: 'analytics', label: 'Analítica', icon: BarChart3 },
];

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

export function OpportunityDetail({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const initialTab = search?.get('tab');
  const data = useOpportunityData(opportunityId);
  const { opportunity, customer, stages, loading, error } = data;
  const [tab, setTab] = useState<DetailTab>(initialTab && VALID_TABS.has(initialTab) ? (initialTab as DetailTab) : 'activity');
  const [products, setProducts] = useState<OpportunityProduct[]>([]);
  const [spaces, setSpaces] = useState<OpportunitySpace[]>([]);
  const [customLines, setCustomLines] = useState<OpportunityCustomLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [editCustomer, setEditCustomer] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  /**
   * F9-19: al cambiar de pestaña se conservan el resto de query params
   * (`router.replace('?tab=…')` los descartaba: filtros, utm, from…).
   */
  const goToTab = useCallback((v: DetailTab) => {
    setTab(v);
    const params = new URLSearchParams(search?.toString() ?? '');
    params.set('tab', v);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, search]);
  const refetchOpp = useCallback(() => { void data.refetch.opportunity(); }, [data.refetch]);
  const flow = useStageFlow(opportunityId, opportunity?.name, refetchOpp, {
    currentWinData: opportunity?.win_data,
    lossFallback: (d) => opportunitiesService.markAsLost(opportunityId, d).then(() => undefined),
    wonFallback: () => opportunitiesService.markAsWon(opportunityId).then(() => undefined),
  });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      opportunitiesService.getOpportunityProducts(opportunityId),
      opportunitiesService.getOpportunitySpaces(opportunityId),
      opportunitiesService.getOpportunityCustomLines(opportunityId),
    ]).then(([p, s, c]) => {
      if (cancelled) return;
      if (p.status === 'fulfilled') setProducts(p.value);
      if (s.status === 'fulfilled') setSpaces(s.value as OpportunitySpace[]);
      if (c.status === 'fulfilled') setCustomLines(c.value);
    });
    return () => { cancelled = true; };
  }, [opportunityId]);

  const totals = useMemo(() => {
    const t = { products: products.reduce((s, p) => s + (p.total_price || 0), 0), spaces: spaces.reduce((s, x) => s + (x.total_price || 0), 0), custom: customLines.reduce((s, c) => s + (c.total_price || 0), 0), items: products.length + spaces.length + customLines.length };
    return t;
  }, [products, spaces, customLines]);
  const lineTotal = totals.products + totals.spaces + totals.custom;
  const displayAmount = lineTotal > 0 ? lineTotal : Number(opportunity?.amount ?? 0);

  const handleDuplicate = async () => {
    setBusy(true);
    try {
      const n = await opportunitiesService.duplicateOpportunity(opportunityId);
      toast({ title: 'Oportunidad duplicada' });
      router.push(`/app/crm/oportunidades/${n.id}`);
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudo duplicar', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de eliminar esta oportunidad?')) return;
    setBusy(true);
    try {
      await opportunitiesService.deleteOpportunity(opportunityId);
      toast({ title: 'Oportunidad eliminada' });
      router.push('/app/crm/oportunidades');
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudo eliminar', variant: 'destructive' });
      setBusy(false);
    }
  };

  if (loading && !opportunity) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-8 w-64" /></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><Skeleton className="h-64 lg:col-span-2" /><Skeleton className="h-64" /></div>
      </div>
    );
  }
  if (!opportunity) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">{error ?? 'Oportunidad no encontrada'}</p>
        <Button onClick={() => router.back()} className="mt-4">Volver</Button>
      </div>
    );
  }

  const tabProps = { opportunity, customer, data };
  const counts: Partial<Record<DetailTab, number>> = { products: products.length, spaces: spaces.length, custom: customLines.length };

  return (
    <div className="space-y-6">
      <DetailHeader opportunity={opportunity} customer={customer} stages={stages} displayAmount={displayAmount} busy={busy || flow.busy}
        onStageClick={(id) => void flow.change(id)} onWon={flow.markWon} onLost={flow.markLost} onDuplicate={handleDuplicate} onDelete={handleDelete}
        onActionCompleted={(k) => { if (k !== 'call') { goToTab('activity'); setRefreshToken((n) => n + 1); } }} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={tab} onValueChange={(v) => goToTab(v as DetailTab)} className="w-full">
            <div className="overflow-x-auto">
              <TabsList className="bg-transparent h-auto p-0 gap-1">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <TabsTrigger key={id} value={id} className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:shadow-none dark:data-[state=active]:bg-primary/20">
                    <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 transition-colors group-data-[state=active]:bg-primary"><Icon className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 transition-colors group-data-[state=active]:text-white" /></div>
                    <span className="whitespace-nowrap text-gray-600 dark:text-gray-400 transition-colors group-data-[state=active]:text-primary font-medium">{label}{counts[id] != null ? ` (${counts[id]})` : ''}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="activity"><Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"><CardContent className="pt-6"><ActividadTab {...tabProps} active={tab === 'activity'} compact={false} refreshToken={refreshToken} /></CardContent></Card></TabsContent>
            <TabsContent value="tasks"><Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"><CardContent className="pt-6"><TareasTab {...tabProps} active={tab === 'tasks'} /></CardContent></Card></TabsContent>
            <TabsContent value="notes"><Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"><CardContent className="pt-6"><NotasTab {...tabProps} active={tab === 'notes'} /></CardContent></Card></TabsContent>
            <TabsContent value="documents"><Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"><CardContent className="pt-6"><OpportunityDocuments opportunityId={opportunity.id} organizationId={opportunity.organization_id} /></CardContent></Card></TabsContent>
            <TabsContent value="ia"><IATab {...tabProps} active={tab === 'ia'} /></TabsContent>
            <TabsContent value="products"><LineItemsTab kind="products" items={toItems('products', products)} /></TabsContent>
            <TabsContent value="spaces"><LineItemsTab kind="spaces" items={toItems('spaces', spaces)} /></TabsContent>
            <TabsContent value="custom"><LineItemsTab kind="custom" items={toItems('custom', customLines)} /></TabsContent>
            <TabsContent value="analytics"><AnalyticsTab opportunity={opportunity} displayAmount={displayAmount} active={tab === 'analytics'} /></TabsContent>
          </Tabs>
        </div>
        <DetailSidebar opportunity={opportunity} customer={customer} totals={totals} displayAmount={displayAmount} onEditCustomer={() => setEditCustomer(true)} />
      </div>

      {flow.dialogs}
      {opportunity.customer_id && <CustomerEditDialog customerId={opportunity.customer_id} open={editCustomer} onOpenChange={setEditCustomer} onSaved={() => void data.refetch.all()} editMode />}
    </div>
  );
}
