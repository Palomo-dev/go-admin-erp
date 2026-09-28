'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  TipsList,
  TipsHeader,
  TipForm,
  ServerSummary,
  PropinasService,
  type Tip,
  type TipFilters,
  type Mesero,
  type PermisosPropinas,
} from '@/components/pos/propinas';
import { calcularKpis, codigoErrorPropina, resumirPorMesero } from './propinasLogica';
import { useOrganization, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { toast } from 'sonner';

const SIN_PERMISOS: PermisosPropinas = { registrar: false, anular: false, liquidar: false };

export function PropinasContent({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations('posPropinas');
  const { organization, isLoading: orgLoading } = useOrganization();
  const { branchFilter } = useBranch();

  const [tips, setTips] = useState<Tip[]>([]);
  // Meseros para el filtro (sucursal de la vista) y para registrar (sucursal activa).
  const [servers, setServers] = useState<Mesero[]>([]);
  const [formServers, setFormServers] = useState<Mesero[]>([]);
  const [loading, setLoading] = useState(true);
  const [permisos, setPermisos] = useState<PermisosPropinas>(SIN_PERMISOS);

  const [filters, setFilters] = useState<TipFilters>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTip, setEditingTip] = useState<Tip | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Distribuir: confirmación y bloqueo mientras corre (sin doble clic).
  const [porDistribuir, setPorDistribuir] = useState<string[] | null>(null);
  const [distribuyendo, setDistribuyendo] = useState(false);
  const distribuyendoRef = useRef(false);

  const sinNombre = t('sinNombre');

  // KPI y resumen salen de las mismas propinas que pinta la tabla.
  const stats = useMemo(() => calcularKpis(tips), [tips]);
  const summaries = useMemo(() => resumirPorMesero(tips, sinNombre), [tips, sinNombre]);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setLoading(true);
    try {
      const sucursalRegistro = getCurrentBranchId();
      const [tipsData, serversData, formServersData] = await Promise.all([
        PropinasService.getAll(filters, branchFilter),
        PropinasService.getServers(branchFilter, sinNombre),
        sucursalRegistro && sucursalRegistro !== branchFilter
          ? PropinasService.getServers(sucursalRegistro, sinNombre)
          : Promise.resolve(null),
      ]);

      setTips(tipsData);
      setServers(serversData);
      setFormServers(formServersData ?? serversData);
    } catch (error: unknown) {
      console.error('Error loading tips:', error);
      toast.error(t(`errores.${codigoErrorPropina(error)}`));
    } finally {
      setLoading(false);
    }
  }, [organization?.id, filters, branchFilter, sinNombre, t]);

  useEffect(() => {
    if (organization?.id) {
      void loadData();
    }
  }, [organization?.id, loadData]);

  // Permisos del usuario de la sesión, resueltos en la base.
  useEffect(() => {
    if (!organization?.id) return;
    let vigente = true;
    PropinasService.getPermisos()
      .then((p) => { if (vigente) setPermisos(p); })
      .catch(() => { if (vigente) setPermisos(SIN_PERMISOS); });
    return () => { vigente = false; };
  }, [organization?.id]);

  const handleEdit = (tip: Tip) => {
    setEditingTip(tip);
    setShowForm(true);
  };

  const handleNewTip = () => {
    setEditingTip(null);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    void loadData();
    setSelectedIds([]);
  };

  const pedirDistribucion = (ids: string[]) => {
    if (ids.length === 0 || distribuyendoRef.current) return;
    setPorDistribuir(ids);
  };

  const confirmarDistribucion = async () => {
    const ids = porDistribuir;
    if (!ids || ids.length === 0 || distribuyendoRef.current) return;

    distribuyendoRef.current = true;
    setDistribuyendo(true);
    try {
      const liquidadas = await PropinasService.markMultipleAsDistributed(ids);
      if (liquidadas > 0) toast.success(t('toast.distribuidas', { count: liquidadas }));
      else toast.info(t('toast.ningunaDistribuida'));
      setSelectedIds([]);
      setPorDistribuir(null);
      void loadData();
    } catch (error: unknown) {
      toast.error(t(`errores.${codigoErrorPropina(error)}`));
    } finally {
      distribuyendoRef.current = false;
      setDistribuyendo(false);
    }
  };

  if (orgLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-4' : 'min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6'}>
      <TipsHeader
        filters={filters}
        onFiltersChange={setFilters}
        onRefresh={loadData}
        onNewTip={permisos.registrar ? handleNewTip : undefined}
        servers={servers}
        stats={stats}
        loading={loading}
        selectedCount={selectedIds.length}
        onDistributeSelected={permisos.liquidar ? () => pedirDistribucion(selectedIds) : undefined}
        distributing={distribuyendo}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-6">
              <TipsList
                tips={tips}
                loading={loading}
                onRefresh={loadData}
                onEdit={permisos.registrar ? handleEdit : undefined}
                onMarkDistributed={permisos.liquidar ? (tip) => pedirDistribucion([tip.id]) : undefined}
                puedeAnular={permisos.anular}
                selectedIds={selectedIds}
                onSelectionChange={permisos.liquidar ? setSelectedIds : undefined}
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <ServerSummary summaries={summaries} loading={loading} />
        </div>
      </div>

      <TipForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingTip(null);
        }}
        tip={editingTip}
        servers={formServers}
        onSuccess={handleFormSuccess}
      />

      <AlertDialog
        open={porDistribuir !== null}
        onOpenChange={(open) => { if (!open && !distribuyendo) setPorDistribuir(null); }}
      >
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              {t('distribuir.titulo', { count: porDistribuir?.length ?? 0 })}
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              {t('distribuir.descripcion')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={distribuyendo}
              className="dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
            >
              {t('distribuir.cancelar')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmarDistribucion(); }}
              disabled={distribuyendo}
              className="bg-green-600 hover:bg-green-700"
            >
              {distribuyendo ? t('distribuir.distribuyendo') : t('distribuir.confirmar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
