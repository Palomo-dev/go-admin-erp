'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import FoliosService, { type Folio } from '@/lib/services/foliosService';
import { useToast } from '@/components/ui/use-toast';

/** Descarta respuestas antiguas y abre solo un folio leído en la organización activa. */
export function useFoliosPagina(organizationId: number | undefined, branchId: number | null, branchLoading: boolean, enlace: { reservationId: string; folioId: string } | null) {
  const { toast } = useToast();
  const reservationId = enlace?.reservationId;
  const folioId = enlace?.folioId;
  const scope = `${organizationId}:${branchId}:${enlace?.reservationId ?? ''}:${enlace?.folioId ?? ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const revision = useRef(0);
  const [datos, setDatos] = useState<{ scope: string; folios: Folio[] }>({ scope: '', folios: [] });
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState<{ scope: string; id: string } | null>(null);
  const folios = datos.scope === scope ? datos.folios : [];
  const selectedFolioId = seleccion?.scope === scope && folios.some(f => f.id === seleccion.id) ? seleccion.id : null;
  const loadData = useCallback(async () => {
    if (!organizationId || branchLoading) return;
    const actual = ++revision.current;
    setCargando(true);
    try {
      const lista = await FoliosService.getFolios({ organizationId, branchId,
        reservation_id: reservationId, folioId });
      if (actual !== revision.current || scopeRef.current !== scope) return;
      setDatos({ scope, folios: lista });
      setSeleccion(prev => folioId && lista.some(f => f.id === folioId && f.reservation_id === reservationId)
        ? { scope, id: folioId } : prev?.scope === scope && lista.some(f => f.id === prev.id) ? prev : null);
    } catch {
      if (actual !== revision.current || scopeRef.current !== scope) return;
      setDatos({ scope, folios: [] });
      setSeleccion(null);
      toast({ title: 'Error', description: 'No se pudieron cargar los folios.', variant: 'destructive' });
    } finally {
      if (actual === revision.current && scopeRef.current === scope) setCargando(false);
    }
  }, [organizationId, branchId, branchLoading, reservationId, folioId, scope, toast]);
  useEffect(() => {
    void loadData();
    return () => { revision.current += 1; };
  }, [loadData]);
  return { folios, loadData, isLoading: !!organizationId && (branchLoading || datos.scope !== scope || cargando) && folios.length === 0,
    isRefreshing: datos.scope === scope && cargando, selectedFolioId,
    handleViewDetails: (folio: Folio) => { if (folios.some(f => f.id === folio.id)) setSeleccion({ scope, id: folio.id }); },
    handleCloseDialog: () => setSeleccion(null), scope };
}
