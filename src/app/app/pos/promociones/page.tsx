'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import {
  PromotionsList,
  PromotionsHeader,
  PromotionsService,
} from '@/components/pos/promociones';
import { Promotion, PromotionFilters } from '@/components/pos/promociones/types';
import { estadoDePromocion } from '@/components/pos/promociones/estadoPromocion';
import { usePuedeGestionarPromociones } from '@/components/pos/promociones/usePuedeGestionarPromociones';
import { cargarResumenPromociones, type ResumenPromociones } from '@/components/pos/promociones/estadisticasPromociones';

type EstadoCarga = 'cargando' | 'listo' | 'error' | 'sinPermiso';

/** 42501 (Postgres) o 401/403 (PostgREST): la sesión no puede leer promociones. */
function esSinPermiso(error: unknown): boolean {
  const e = error as { code?: unknown; status?: unknown } | null;
  const code = String(e?.code ?? '');
  return code === '42501' || code === 'PGRST301' || e?.status === 401 || e?.status === 403;
}

export default function PromocionesPage() {
  const t = useTranslations('posPromociones');
  const { organization, isLoading: orgLoading } = useOrganization();
  const puedeGestionar = usePuedeGestionarPromociones(organization?.id);
  const { branchFilter } = useBranch();
  const { timezone } = useOrgTimezone();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [estado, setEstado] = useState<EstadoCarga>('cargando');
  const [filters, setFilters] = useState<PromotionFilters>({});
  const [resumen, setResumen] = useState<ResumenPromociones | null>(null);

  const loadPromotions = useCallback(async () => {
    if (!organization?.id) return;

    setEstado('cargando');
    try {
      const data = await PromotionsService.getAll({ ...filters, branchId: branchFilter });
      setPromotions(data);
      setEstado('listo');
    } catch (error: unknown) {
      console.error('Error loading promotions:', error);
      // Sin toast: el error se ve en la tabla con «Reintentar» (Figma 27 · estados).
      setEstado(esSinPermiso(error) ? 'sinPermiso' : 'error');
    }
  }, [organization?.id, filters, branchFilter]);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  // «Ahorro del mes»: aparte de la lista, para que un fallo aquí no la tumbe.
  useEffect(() => {
    if (!organization?.id || !timezone) return;
    let vigente = true;
    cargarResumenPromociones(organization.id, timezone, branchFilter ?? null)
      .then((r) => { if (vigente) setResumen(r); })
      .catch((error: unknown) => {
        console.warn('[promociones] No se pudo cargar el ahorro del mes:', error);
        if (vigente) setResumen(null);
      });
    return () => { vigente = false; };
  }, [organization?.id, timezone, branchFilter, promotions]);

  const hayFiltros = Boolean(filters.search || filters.is_active !== undefined || filters.promotion_type);

  // «Activa ahora» con el mismo criterio que el motor: estado, fechas y horario semanal.
  const { activas, programadas } = useMemo(() => {
    const ahora = new Date();
    let a = 0;
    let p = 0;
    for (const promo of promotions) {
      const e = estadoDePromocion(promo, ahora, timezone);
      if (e === 'activa') a++;
      else if (e === 'programada') p++;
    }
    return { activas: a, programadas: p };
  }, [promotions, timezone]);

  if (orgLoading) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={5} columns="1" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
      <div className="flex w-full flex-col gap-4">
        <PromotionsHeader
          filters={filters}
          onFiltersChange={setFilters}
          onRefresh={loadPromotions}
          totalPromotions={promotions.length}
          activePromotions={activas}
          scheduledPromotions={programadas}
          loading={estado === 'cargando'}
          sinPermiso={estado === 'sinPermiso'}
          puedeGestionar={puedeGestionar}
          ahorroMes={resumen ? { ahorro: resumen.ahorro, ventas: resumen.ventas } : null}
        />

        <PromotionsList
          promotions={promotions}
          estadoCarga={estado}
          filtrado={hayFiltros}
          termino={filters.search?.trim() || undefined}
          onLimpiarFiltros={() => setFilters({})}
          onRefresh={loadPromotions}
          puedeGestionar={puedeGestionar}
        />
      </div>
    </div>
  );
}
