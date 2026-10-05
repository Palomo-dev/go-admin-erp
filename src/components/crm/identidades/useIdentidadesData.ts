'use client';
import { useEffect, useState } from 'react';
import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import {
  leerDuplicados,
  leerFusiones,
  leerIdentidades,
  type FilaFusion,
  type IdentidadReal,
  type ListaDuplicados,
} from './IdentidadesService';
export type VistaIdentidades = 'duplicados' | 'canales' | 'historial';

export function useIdentidadesData(
  vista: VistaIdentidades,
  page: number,
  search: string,
  revision: number,
) {
  const [duplicates, setDuplicates] = useState<ListaDuplicados | null>(null);
  const [merges, setMerges] = useState<FilaFusion[]>([]);
  const [identities, setIdentities] = useState<IdentidadReal[]>([]);
  const [total, setTotal] = useState(0);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        if (vista === 'duplicados') {
          const r = await leerDuplicados(page, search, controller.signal);
          if (!controller.signal.aborted) {
            setDuplicates(r);
            setTotal(r.total);
          }
        } else if (vista === 'historial') {
          const r = await leerFusiones(page, controller.signal);
          if (!controller.signal.aborted) {
            setMerges(r.data);
            setTotal(r.total);
          }
        } else {
          const r = await leerIdentidades(page, controller.signal);
          if (!controller.signal.aborted) {
            setIdentities(r.data);
            setTotal(r.total);
            setCanEdit(r.canEdit);
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [vista, page, search, revision]);
  return {
    duplicates,
    merges,
    identities,
    total,
    canEdit,
    loading,
    error,
    forbidden:
      error instanceof ErrorApiCrm &&
      (error.status === 401 || error.status === 403),
  };
}
