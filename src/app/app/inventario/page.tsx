'use client';

import { FC, useState, useEffect, useCallback } from 'react';
import { 
  Package, 
  PackageCheck, 
  AlertTriangle, 
  PackageX, 
  DollarSign, 
  FolderTree,
  RefreshCw
} from 'lucide-react';
import KPICard from '@/components/inventario/KPICard';
import { 
  AlertasInventario, 
  AccesosRapidos, 
  ResumenSucursales, 
  MovimientosRecientes 
} from '@/components/inventario/dashboard';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/utils/Utils';
import inventoryDashboardService, { 
  InventoryKPIs, 
  StockAlert, 
  RecentMovement, 
  BranchSummary 
} from '@/lib/services/inventoryDashboardService';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';

interface InventarioPageProps {}

const InventarioPage: FC<InventarioPageProps> = () => {
  const { toast } = useToast();
  
  // Estados del dashboard
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [kpis, setKpis] = useState<InventoryKPIs | null>(null);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [movements, setMovements] = useState<RecentMovement[]>([]);
  const [branchSummaries, setBranchSummaries] = useState<BranchSummary[]>([]);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  // Cargar datos del dashboard
  const loadDashboardData = useCallback(async () => {
    try {
      const organizationId = getOrganizationId();
      const branchId = selectedBranch === 'all' ? null : parseInt(selectedBranch);

      const data = await inventoryDashboardService.getDashboardData(organizationId, branchId);
      
      setKpis(data.kpis);
      setAlerts(data.alerts);
      setMovements(data.recentMovements);
      setBranchSummaries(data.branchSummaries);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del dashboard',
        variant: 'destructive',
      });
    }
  }, [selectedBranch, toast]);

  // Cargar sucursales
  const loadBranches = useCallback(async () => {
    try {
      const organizationId = getOrganizationId();
      const branchesData = await inventoryDashboardService.getBranches(organizationId);
      setBranches(branchesData);
    } catch (error) {
      console.error('Error cargando sucursales:', error);
    }
  }, []);

  // Efecto inicial para cargar datos
  useEffect(() => {
    const initDashboard = async () => {
      setIsLoading(true);
      await loadBranches();
      await loadDashboardData();
      setIsLoading(false);
    };
    
    initDashboard();
  }, [loadBranches, loadDashboardData]);

  // Efecto para recargar cuando cambia la sucursal
  useEffect(() => {
    if (!isLoading) {
      loadDashboardData();
    }
  }, [selectedBranch, loadDashboardData, isLoading]);

  // Función para refrescar datos
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDashboardData();
    setIsRefreshing(false);
    toast({
      title: 'Actualizado',
      description: 'Los datos del dashboard han sido actualizados',
    });
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Package className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Panel de Control Inventario
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                {new Date().toLocaleDateString('es-ES', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 self-start md:self-auto">
            {/* Selector de Sucursal */}
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Seleccionar sucursal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sucursales</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id.toString()}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Botón Refrescar */}
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard 
          title="Total Productos" 
          value={isLoading ? '...' : (kpis?.totalProducts || 0)}
          icon={<Package className="h-6 w-6" />}
          variant="blue"
        />
        <KPICard 
          title="Productos Activos" 
          value={isLoading ? '...' : (kpis?.activeProducts || 0)}
          icon={<PackageCheck className="h-6 w-6" />}
          variant="green"
        />
        <KPICard 
          title="Stock Bajo" 
          value={isLoading ? '...' : (kpis?.lowStockProducts || 0)}
          icon={<AlertTriangle className="h-6 w-6" />}
          variant="amber"
        />
        <KPICard 
          title="Sin Stock" 
          value={isLoading ? '...' : (kpis?.outOfStockProducts || 0)}
          icon={<PackageX className="h-6 w-6" />}
          variant="red"
        />
        <KPICard 
          title="Valor Inventario" 
          value={isLoading ? '...' : formatCurrency(kpis?.totalInventoryValue || 0)}
          icon={<DollarSign className="h-6 w-6" />}
          variant="purple"
        />
        <KPICard 
          title="Categorías" 
          value={isLoading ? '...' : (kpis?.totalCategories || 0)}
          icon={<FolderTree className="h-6 w-6" />}
          variant="default"
        />
      </div>

      {/* Accesos Rápidos */}
      <AccesosRapidos />

      {/* Grid de Alertas, Movimientos y Resumen */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alertas */}
        <AlertasInventario 
          alerts={alerts} 
          isLoading={isLoading}
        />

        {/* Movimientos Recientes */}
        <MovimientosRecientes 
          movements={movements} 
          isLoading={isLoading}
        />

        {/* Resumen por Sucursal */}
        <ResumenSucursales 
          summaries={branchSummaries} 
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

export default InventarioPage;
