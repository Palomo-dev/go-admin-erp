'use client';

import { useState, useRef } from 'react';
import { 
  Plus, 
  Percent,
  RefreshCw,
  Upload,
  Building2,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { ServiceChargeFilters, APPLIES_TO_LABELS, AppliesTo } from './types';
import { CargosServicioService } from './cargosServicioService';
import { toast } from 'sonner';

interface ChargesHeaderProps {
  filters: ServiceChargeFilters;
  onFiltersChange: (filters: ServiceChargeFilters) => void;
  onRefresh: () => void;
  onNewCharge: () => void;
  branches: { id: number; name: string }[];
  stats: {
    total: number;
    active: number;
    inactive: number;
  };
  loading: boolean;
}

export function ChargesHeader({
  filters,
  onFiltersChange,
  onRefresh,
  onNewCharge,
  branches,
  stats,
  loading
}: ChargesHeaderProps) {
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStatusChange = (value: string) => {
    const newFilter = value === 'all' 
      ? { ...filters, is_active: undefined }
      : { ...filters, is_active: value === 'active' };
    onFiltersChange(newFilter);
  };

  const handleBranchChange = (value: string) => {
    onFiltersChange({ 
      ...filters, 
      branch_id: value === 'all' ? undefined : parseInt(value)
    });
  };

  const handleAppliesToChange = (value: string) => {
    onFiltersChange({ 
      ...filters, 
      applies_to: value === 'all' ? undefined : value as AppliesTo 
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const result = await CargosServicioService.importFromCSV(text);
      
      if (result.errors.length > 0) {
        toast.warning(
          `Importados: ${result.imported}. Errores: ${result.errors.length}`,
          { description: result.errors.slice(0, 3).join('\n') }
        );
      } else {
        toast.success(`${result.imported} cargos importados correctamente`);
      }
      
      onRefresh();
      setShowImport(false);
    } catch (error: any) {
      toast.error(error.message || 'Error al importar');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Principal */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Percent className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="dark:text-white">
                  Cargos de Servicio
                </CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configura cargos automáticos como propina sugerida
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowImport(true)}
                className="dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600"
              >
                <Upload className="h-4 w-4 mr-2" />
                Importar
              </Button>
              <Button 
                onClick={onNewCharge}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Cargo
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {stats.total}
                </p>
              </div>
              <Percent className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Activos</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.active}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Inactivos</p>
                <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {stats.inactive}
                </p>
              </div>
              <XCircle className="h-8 w-8 text-gray-600 dark:text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select 
              value={filters.is_active === undefined ? 'all' : filters.is_active ? 'active' : 'inactive'}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger className="w-[140px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              value={filters.branch_id?.toString() || 'all'}
              onValueChange={handleBranchChange}
            >
              <SelectTrigger className="w-[180px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Sucursal" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="all">Todas las sucursales</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id.toString()}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select 
              value={filters.applies_to || 'all'}
              onValueChange={handleAppliesToChange}
            >
              <SelectTrigger className="w-[150px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Aplica a" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(APPLIES_TO_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              className="dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal de importación */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Importar Cargos</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Sube un archivo CSV con los cargos de servicio
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                <strong>Formato requerido:</strong>
              </p>
              <code className="text-xs bg-gray-200 dark:bg-gray-600 p-2 rounded block">
                name,charge_type,charge_value,min_amount,min_guests,applies_to,is_taxable,is_optional
              </code>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                charge_type: percentage o fixed<br />
                applies_to: all, dine_in, delivery, takeout
              </p>
            </div>

            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              disabled={importing}
              className="dark:bg-gray-700 dark:border-gray-600"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowImport(false)}
              disabled={importing}
              className="dark:bg-gray-700 dark:border-gray-600"
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
