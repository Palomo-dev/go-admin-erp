'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Search, RefreshCw, ArrowLeft, MapPin, Upload, List, Map } from 'lucide-react';

type ViewMode = 'list' | 'map';

interface StopsHeaderProps {
  searchTerm: string;
  typeFilter: string;
  viewMode: ViewMode;
  onSearchChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onNew: () => void;
  onImport: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function StopsHeader({
  searchTerm,
  typeFilter,
  viewMode,
  onSearchChange,
  onTypeChange,
  onViewModeChange,
  onNew,
  onImport,
  onRefresh,
  isLoading,
}: StopsHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/transporte">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <MapPin className="h-6 w-6 text-blue-600" />
              </div>
              Paradas
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Transporte / Paradas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('list')}
              className={viewMode === 'list' ? 'bg-blue-600 text-white' : ''}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'map' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('map')}
              className={viewMode === 'map' ? 'bg-blue-600 text-white' : ''}
            >
              <Map className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onImport}
          >
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button
            size="sm"
            onClick={onNew}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Parada
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre, código o ciudad..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={onTypeChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="terminal">Terminal</SelectItem>
            <SelectItem value="station">Estación</SelectItem>
            <SelectItem value="warehouse">Bodega</SelectItem>
            <SelectItem value="stop">Parada</SelectItem>
            <SelectItem value="branch">Sucursal</SelectItem>
            <SelectItem value="customer">Cliente</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
