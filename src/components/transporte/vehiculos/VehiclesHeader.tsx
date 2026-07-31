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
import { Plus, Search, RefreshCw, ArrowLeft, Bus, Upload } from 'lucide-react';
import { TransportCarrier } from '@/lib/services/transportService';

interface VehiclesHeaderProps {
  searchTerm: string;
  statusFilter: string;
  typeFilter: string;
  carrierFilter: string;
  carriers: TransportCarrier[];
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onCarrierChange: (value: string) => void;
  onNew: () => void;
  onImport: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function VehiclesHeader({
  searchTerm,
  statusFilter,
  typeFilter,
  carrierFilter,
  carriers,
  onSearchChange,
  onStatusChange,
  onTypeChange,
  onCarrierChange,
  onNew,
  onImport,
  onRefresh,
  isLoading,
}: VehiclesHeaderProps) {
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
                <Bus className="h-6 w-6 text-blue-600" />
              </div>
              Vehículos
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Inventario de flota y vehículos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            Nuevo Vehículo
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por placa, marca o modelo..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={typeFilter} onValueChange={onTypeChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="motorcycle">Moto</SelectItem>
            <SelectItem value="car">Auto</SelectItem>
            <SelectItem value="van">Van</SelectItem>
            <SelectItem value="truck">Camión</SelectItem>
            <SelectItem value="minibus">Minibús</SelectItem>
            <SelectItem value="bus">Bus</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="available">Disponible</SelectItem>
            <SelectItem value="in_use">En uso</SelectItem>
            <SelectItem value="maintenance">Mantenimiento</SelectItem>
            <SelectItem value="inactive">Inactivo</SelectItem>
          </SelectContent>
        </Select>

        {carriers.length > 0 && (
          <Select value={carrierFilter} onValueChange={onCarrierChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Transportadora" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las transportadoras</SelectItem>
              {carriers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
