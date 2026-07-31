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
import { Plus, Search, RefreshCw, ArrowLeft, User, Upload } from 'lucide-react';

interface DriversHeaderProps {
  searchTerm: string;
  categoryFilter: string;
  statusFilter: string;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onNew: () => void;
  onImport: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function DriversHeader({
  searchTerm,
  categoryFilter,
  statusFilter,
  onSearchChange,
  onCategoryChange,
  onStatusChange,
  onNew,
  onImport,
  onRefresh,
  isLoading,
}: DriversHeaderProps) {
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
                <User className="h-6 w-6 text-blue-600" />
              </div>
              Conductores
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Transporte / Conductores
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
            Nuevo Conductor
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre o licencia..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={categoryFilter} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-full md:w-[160px]">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las cat.</SelectItem>
            <SelectItem value="A1">A1 - Motos</SelectItem>
            <SelectItem value="A2">A2 - Motos +125cc</SelectItem>
            <SelectItem value="B1">B1 - Autos</SelectItem>
            <SelectItem value="B2">B2 - Camionetas</SelectItem>
            <SelectItem value="B3">B3 - Buses</SelectItem>
            <SelectItem value="C1">C1 - Camiones</SelectItem>
            <SelectItem value="C2">C2 - Articulados</SelectItem>
            <SelectItem value="C3">C3 - Especiales</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-full md:w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
            <SelectItem value="expiring">Por vencer</SelectItem>
            <SelectItem value="expired">Vencidos</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
