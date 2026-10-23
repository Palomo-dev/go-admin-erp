'use client';

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  } from '@/components/ui/select';
import { SearchInput } from '@/components/kit/SearchInput';
import { ElegirProveedor } from '@/components/finanzas/documento/terceros';

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
      <SearchInput
        value={search}
        onChange={onSearchChange}
        onValueChange={onSearchChange}
        placeholder="Buscar por proveedor o notas..."
        className="flex-1 max-w-md"
      />

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

      <div className="min-w-[220px] flex-1">
        <ElegirProveedor
          layout="campo"
          proveedor={
            supplierFilter !== 'all'
              ? {
                  id: supplierFilter,
                  nombre: suppliers.find((s) => String(s.id) === supplierFilter)?.name ?? 'Proveedor',
                }
              : null
          }
          onCambiar={(p) => onSupplierChange(p.id)}
          onQuitar={() => onSupplierChange('all')}
        />
      </div>

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
