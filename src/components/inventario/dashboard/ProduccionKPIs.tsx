'use client';

import { FC, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Factory, ChefHat, TrendingUp, Package, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface ProduccionKPIsProps {
  className?: string;
}

interface KPI {
  label: string;
  value: number;
  icon: typeof Factory;
  color: string;
  bg: string;
}

const ProduccionKPIs: FC<ProduccionKPIsProps> = ({ className }) => {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarKPIs();
  }, []);

  const cargarKPIs = async () => {
    try {
      setLoading(true);
      const orgId = getOrganizationId();

      const [recetasRes, ordenesRes, completadasRes, enProgresoRes] = await Promise.all([
        supabase.from('product_recipes').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
        supabase.from('production_orders').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
        supabase.from('production_orders').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'completed'),
        supabase.from('production_orders').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'in_progress'),
      ]);

      setKpis([
        {
          label: 'Recetas Activas',
          value: recetasRes.count || 0,
          icon: ChefHat,
          color: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-100 dark:bg-amber-900/30',
        },
        {
          label: 'Órdenes Totales',
          value: ordenesRes.count || 0,
          icon: Factory,
          color: 'text-blue-600 dark:text-blue-400',
          bg: 'bg-blue-100 dark:bg-blue-900/30',
        },
        {
          label: 'Completadas',
          value: completadasRes.count || 0,
          icon: Package,
          color: 'text-green-600 dark:text-green-400',
          bg: 'bg-green-100 dark:bg-green-900/30',
        },
        {
          label: 'En Progreso',
          value: enProgresoRes.count || 0,
          icon: TrendingUp,
          color: 'text-purple-600 dark:text-purple-400',
          bg: 'bg-purple-100 dark:bg-purple-900/30',
        },
      ]);
    } catch (error) {
      console.error('Error cargando KPIs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className={className}>
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
        <Factory className="h-5 w-5 text-indigo-500" />
        KPIs de Producción
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.bg}`}>
                  <Icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpi.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{kpi.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ProduccionKPIs;
