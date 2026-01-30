'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { 
  PromotionsList, 
  PromotionsHeader,
  PromotionsService 
} from '@/components/pos/promociones';
import { Promotion, PromotionFilters } from '@/components/pos/promociones/types';
import { toast } from 'sonner';

export default function PromocionesPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<PromotionFilters>({});

  const loadPromotions = useCallback(async () => {
    if (!organization?.id) return;
    
    setLoading(true);
    try {
      const data = await PromotionsService.getAll(filters);
      setPromotions(data);
    } catch (error: any) {
      console.error('Error loading promotions:', error);
      toast.error('Error al cargar promociones');
    } finally {
      setLoading(false);
    }
  }, [organization?.id, filters]);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  const handleFiltersChange = (newFilters: PromotionFilters) => {
    setFilters(newFilters);
  };

  const activePromotions = promotions.filter(p => {
    if (!p.is_active) return false;
    const now = new Date();
    const startDate = new Date(p.start_date);
    const endDate = p.end_date ? new Date(p.end_date) : null;
    return startDate <= now && (!endDate || endDate >= now);
  }).length;

  if (orgLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PromotionsHeader
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onRefresh={loadPromotions}
          totalPromotions={promotions.length}
          activePromotions={activePromotions}
          loading={loading}
        />

        <PromotionsList
          promotions={promotions}
          loading={loading}
          onRefresh={loadPromotions}
        />
      </div>
    </div>
  );
}
