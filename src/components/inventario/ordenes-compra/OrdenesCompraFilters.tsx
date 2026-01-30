'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';

interface OrdenesCompraFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  supplierFilter: string;
  onSupplierChange: (value: string) => void;
  branchFilter: string;
  onBranchChange: (value: string) => void;
  suppliers: { id: number; name: string }[];
  branches: { id: number; name: string }[];
}

export function OrdenesCompraFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  supplierFilter,
  onSupplierChange,
  branchFilter,
  onBranchChange,
  suppliers,
  branches
}: OrdenesCompraFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por proveedor o notas..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 dark:bg-gray-800 dark:border-gray-700"
        />
      </div>

      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[160px] dark:bg-gray-800 dark:border-gray-700">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los estados</SelectItem>
          <SelectItem value="draft">Borrador</SelectItem>
          <SelectItem value="sent">Enviada</SelectItem>
          <SelectItem value="partial">Parcial</SelectItem>
          <SelectItem value="received">Recibida</SelectItem>
          <SelectItem value="cancelled">Cancelada</SelectItem>
        </SelectContent>
      </Select>

      {suppliers.length > 0 && (
        <Select value={supplierFilter} onValueChange={onSupplierChange}>
          <SelectTrigger className="w-[180px] dark:bg-gray-800 dark:border-gray-700">
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proveedores</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id.toString()}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {branches.length > 0 && (
        <Select value={branchFilter} onValueChange={onBranchChange}>
          <SelectTrigger className="w-[160px] dark:bg-gray-800 dark:border-gray-700">
            <SelectValue placeholder="Sucursal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sucursales</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id.toString()}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export default OrdenesCompraFilters;
