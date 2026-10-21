'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import {
  PromotionsList,
  PromotionsHeader,
  PromotionsService,
} from '@/components/pos/promociones';
import { Promotion, PromotionFilters } from '@/components/pos/promociones/types';
import { toast } from 'sonner';

export default function PromocionesPage() {
  const t = useTranslations('posPromociones');
  const { organization, isLoading: orgLoading } = useOrganization();
  const { branchFilter } = useBranch();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<PromotionFilters>({});

  const loadPromotions = useCallback(async () => {
    if (!organization?.id) return;

    setLoading(true);
    try {
      const data = await PromotionsService.getAll({ ...filters, branchId: branchFilter });
      setPromotions(data);
    } catch (error: unknown) {
      console.error('Error loading promotions:', error);
      toast.error(t('pantalla.errorCargar'));
    } finally {
      setLoading(false);
    }
  }, [organization?.id, filters, branchFilter, t]);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  const hayFiltros = Boolean(filters.search || filters.is_active !== undefined || filters.promotion_type);

  const activePromotions = promotions.filter((p) => {
    if (!p.is_active) return false;
    const now = new Date();
    const startDate = new Date(p.start_date);
    const endDate = p.end_date ? new Date(p.end_date) : null;
    return startDate <= now && (!endDate || endDate >= now);
  }).length;

  if (orgLoading) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <PageHeaderSkeleton />
        <StatsSkeleton count={2} />
        <CardListSkeleton cards={5} columns="1" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <PromotionsHeader
          filters={filters}
          onFiltersChange={setFilters}
          onRefresh={loadPromotions}
          totalPromotions={promotions.length}
          activePromotions={activePromotions}
          loading={loading}
        />

        <PromotionsList
          promotions={promotions}
          loading={loading}
          filtrado={hayFiltros}
          onLimpiarFiltros={() => setFilters({})}
          onRefresh={loadPromotions}
        />
      </div>
    </div>
  );
}
