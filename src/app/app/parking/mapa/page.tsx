'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization, getCurrentBranchIdWithFallback } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, LayoutGrid, AlertCircle } from 'lucide-react';
import parkingMapService, {
  type ParkingSpace,
  type ParkingZone,
  type MapStats,
} from '@/lib/services/parkingMapService';
import {
  MapaHeader,
  MapaStats,
  MapaLegend,
  SpaceGrid,
  SpaceDetailDialog,
} from '@/components/parking/mapa';

const initialStats: MapStats = {
  total: 0,
  free: 0,
  occupied: 0,
  reserved: 0,
  maintenance: 0,
  occupancy_rate: 0,
};

export default function MapaPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();
  const branchId = getCurrentBranchIdWithFallback();

  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [zones, setZones] = useState<ParkingZone[]>([]);
  const [stats, setStats] = useState<MapStats>(initialStats);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Dialog state
  const [selectedSpace, setSelectedSpace] = useState<ParkingSpace | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!branchId) return;

    setIsLoading(true);
    try {
      const [spacesData, zonesData, statsData] = await Promise.all([
        parkingMapService.getSpaces(branchId),
        parkingMapService.getZones(branchId),
        parkingMapService.getMapStats(branchId),
      ]);

      setSpaces(spacesData);
      setZones(zonesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading map data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del mapa',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [branchId, toast]);

  useEffect(() => {
    if (branchId && !orgLoading) {
      loadData();
    }
  }, [branchId, orgLoading, loadData]);

  // Suscripción a cambios en tiempo real
  useEffect(() => {
    if (!branchId) return;

    const unsubscribe = parkingMapService.subscribeToChanges(
      branchId,
      (updatedSpace) => {
        setSpaces((prev) =>
          prev.map((s) => (s.id === updatedSpace.id ? { ...s, ...updatedSpace } : s))
        );
        // Recargar stats cuando cambia un espacio
        parkingMapService.getMapStats(branchId).then(setStats);
      },
      () => {
        // Recargar todo cuando cambia una sesión
        loadData();
      }
    );

    return () => {
      unsubscribe();
    };
  }, [branchId, loadData]);

  // Handlers
  const handleSpaceClick = (space: ParkingSpace) => {
    setSelectedSpace(space);
    setShowDetailDialog(true);
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Escuchar cambios de fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Loading state
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // No organization
  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Sin organización
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Debes pertenecer a una organización para acceder a esta página.
        </p>
      </div>
    );
  }

  return (
    <div className={`p-6 space-y-6 bg-gray-50 dark:bg-gray-900 ${isFullscreen ? 'min-h-screen' : ''}`}>
      {/* Header */}
      <MapaHeader
        onRefresh={loadData}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        isLoading={isLoading}
      />

      {/* Stats */}
      <MapaStats stats={stats} isLoading={isLoading} />

      {/* Legend */}
      <MapaLegend />

      {/* Grid de espacios */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <SpaceGrid
          spaces={spaces}
          zones={zones}
          selectedSpace={selectedSpace}
          onSpaceClick={handleSpaceClick}
          isLoading={isLoading}
          groupByZone={zones.length > 0}
        />
      </div>

      {/* No spaces message */}
      {!isLoading && spaces.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
            <LayoutGrid className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Sin espacios configurados
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-sm">
            No hay espacios de estacionamiento configurados para esta sucursal.
            Ve a la sección de Espacios para crear los espacios del parqueadero.
          </p>
        </div>
      )}

      {/* Detail Dialog */}
      <SpaceDetailDialog
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        space={selectedSpace}
        branchId={branchId}
        onSuccess={loadData}
      />
    </div>
  );
}
