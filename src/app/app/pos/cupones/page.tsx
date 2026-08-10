'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { CouponsList, CouponsHeader, CouponsService } from '@/components/pos/cupones';
import { Coupon, CouponFilters } from '@/components/pos/cupones/types';
import { toast } from 'sonner';

export default function CuponesPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<CouponFilters>({});

  const loadCoupons = useCallback(async () => {
    if (!organization?.id) return;
    
    setLoading(true);
    try {
      const data = await CouponsService.getAll(filters);
      setCoupons(data);
    } catch (error: any) {
      console.error('Error loading coupons:', error);
      toast.error('Error al cargar cupones');
    } finally {
      setLoading(false);
    }
  }, [organization?.id, filters]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const handleFiltersChange = (newFilters: CouponFilters) => {
    setFilters(newFilters);
  };

  const activeCoupons = coupons.filter(c => {
    if (!c.is_active) return false;
    const now = new Date();
    const startDate = c.start_date ? new Date(c.start_date) : null;
    const endDate = c.end_date ? new Date(c.end_date) : null;
    if (startDate && startDate > now) return false;
    if (endDate && endDate < now) return false;
    if (c.usage_limit && c.usage_count >= c.usage_limit) return false;
    return true;
  }).length;

  if (orgLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={3} />
        <CardListSkeleton cards={5} columns="1" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <CouponsHeader
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onRefresh={loadCoupons}
          totalCoupons={coupons.length}
          activeCoupons={activeCoupons}
          loading={loading}
        />

        <CouponsList
          coupons={coupons}
          loading={loading}
          onRefresh={loadCoupons}
        />
      </div>
    </div>
  );
}
