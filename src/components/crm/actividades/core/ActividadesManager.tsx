'use client';

import React, { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, BarChart3 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { ActivityFilter, Activity } from '@/types/activity';
import { useActividades } from '@/lib/hooks/useActividades';
import { FiltrosActividades, ActividadesList, ActividadesStats } from '@/components/crm/actividades';
import { ActividadContextPanel } from '../ui/ActividadContextPanel';

interface ActividadesManagerProps {
  className?: string;
}

export function ActividadesManager({ className }: ActividadesManagerProps) {
  const [activeTab, setActiveTab] = useState('actividades');
  const [currentFilters, setCurrentFilters] = useState<ActivityFilter>({
    limit: 50,
    page: 1
  });
  
  // Estado para el panel de contexto
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [selectedActivityForContext, setSelectedActivityForContext] = useState<Activity | null>(null);
  
  const {
    activities,
    loading,
    error,
    total,
    currentPage,
    totalPages,
    limit,
    stats,
    loadActivities,
    goToPage,
    refresh,
    loadingStats
  } = useActividades({
    limit: 50,
    page: 1
  });

  const handleFiltrosChange = useCallback((newFiltros: ActivityFilter) => {
    const updatedFilters = {
      ...newFiltros,
      page: 1 // Reset page cuando cambian filtros
    };
    setCurrentFilters(updatedFilters);
    loadActivities(updatedFilters);
  }, [loadActivities]);

  const handleRefresh = useCallback(async () => {
    console.log('🔄 Botón Actualizar presionado');
    console.log('📊 Estado actual:', { total, loading, activities: activities.length });
    try {
      await refresh();
      console.log('✅ Actualización completada');
    } catch (error) {
      console.error('❌ Error al actualizar:', error);
    }
  }, [refresh, total, loading, activities.length]);

  const handlePageChange = useCallback((page: number) => {
    goToPage(page);
  }, [goToPage]);

  // Callbacks para el panel de contexto
  const handleOpenContext = useCallback((activity: Activity) => {
    setSelectedActivityForContext(activity);
    setContextPanelOpen(true);
  }, []);

  const handleCloseContext = useCallback(() => {
    setContextPanelOpen(false);
    setSelectedActivityForContext(null);
  }, []);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Historial de Actividades
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Registro completo de todas las actividades del CRM
          </p>
        </div>
        
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </Button>
      </div>



      {/* Contenido con pestañas */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="actividades" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Actividades
          </TabsTrigger>
          <TabsTrigger value="estadisticas" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Estadísticas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="actividades" className="space-y-6">
          {/* Filtros */}
          <Card className="p-6">
            <FiltrosActividades
              filtros={currentFilters}
              onFiltrosChange={handleFiltrosChange}
            />
          </Card>

          {/* Lista de actividades */}
          <ActividadesList
            activities={activities}
            loading={loading}
            error={error}
            currentPage={currentPage}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={handlePageChange}
            onOpenContext={handleOpenContext}
          />
        </TabsContent>

        <TabsContent value="estadisticas">
          <ActividadesStats
            stats={stats}
            loading={loadingStats}
          />
        </TabsContent>
      </Tabs>
      
      {/* Panel de contexto */}
      <ActividadContextPanel
        activity={selectedActivityForContext}
        isOpen={contextPanelOpen}
        onClose={handleCloseContext}
      />
    </div>
  );
}
