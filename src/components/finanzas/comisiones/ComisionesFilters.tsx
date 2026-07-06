'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import type { CommissionFilters, CommissionStatus, CommissionType, CommissionSourceType } from '@/lib/services/commissionsService';

interface ComisionesFiltersProps {
  filters: CommissionFilters;
  onChange: (filters: CommissionFilters) => void;
}

export function ComisionesFilters({ filters, onChange }: ComisionesFiltersProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Nombre o notas..."
              value={filters.search || ''}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              className="pl-9 bg-white dark:bg-gray-900 dark:text-gray-200 border-gray-200 dark:border-gray-700"
            />
          </div>
        </div>

        <div>
          <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Estado</Label>
          <Select
            value={filters.status || 'all'}
            onValueChange={(v) => onChange({ ...filters, status: v as CommissionStatus | 'all' })}
          >
            <SelectTrigger className="bg-white dark:bg-gray-900 dark:text-gray-200 border-gray-200 dark:border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="accrued">Pendientes</SelectItem>
              <SelectItem value="paid">Pagadas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Tipo</Label>
          <Select
            value={filters.commission_type || 'all'}
            onValueChange={(v) => onChange({ ...filters, commission_type: v as CommissionType | 'all' })}
          >
            <SelectTrigger className="bg-white dark:bg-gray-900 dark:text-gray-200 border-gray-200 dark:border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="salesperson">Vendedor</SelectItem>
              <SelectItem value="intermediation_sale">Intermediación Venta</SelectItem>
              <SelectItem value="intermediation_purchase">Intermediación Compra</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm text-gray-700 dark:text-gray-300 mb-1.5 block">Origen</Label>
          <Select
            value={filters.source_type || 'all'}
            onValueChange={(v) => onChange({ ...filters, source_type: v as CommissionSourceType | 'all' })}
          >
            <SelectTrigger className="bg-white dark:bg-gray-900 dark:text-gray-200 border-gray-200 dark:border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="sale">Venta POS</SelectItem>
              <SelectItem value="invoice_sale">Factura Venta</SelectItem>
              <SelectItem value="invoice_purchase">Factura Compra</SelectItem>
              <SelectItem value="opportunity">Oportunidad CRM</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
