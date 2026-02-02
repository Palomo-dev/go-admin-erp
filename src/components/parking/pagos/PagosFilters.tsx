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
import { Search, Calendar } from 'lucide-react';
import type { OrganizationPaymentMethod } from '@/lib/services/parkingPaymentService';

export interface PaymentFiltersState {
  search: string;
  source: 'all' | 'parking_session' | 'parking_pass';
  status: 'all' | 'completed' | 'pending' | 'reversed';
  method: string;
  startDate: string;
  endDate: string;
}

interface PagosFiltersProps {
  filters: PaymentFiltersState;
  onFiltersChange: (filters: PaymentFiltersState) => void;
  paymentMethods: OrganizationPaymentMethod[];
}

export function PagosFilters({ filters, onFiltersChange, paymentMethods }: PagosFiltersProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-3">
      {/* Búsqueda */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por placa, cliente, referencia..."
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="pl-10 dark:bg-gray-800 dark:border-gray-700"
        />
      </div>

      {/* Fecha inicio */}
      <div className="relative w-40">
        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="date"
          value={filters.startDate}
          onChange={(e) => onFiltersChange({ ...filters, startDate: e.target.value })}
          className="pl-10 dark:bg-gray-800 dark:border-gray-700"
        />
      </div>

      {/* Fecha fin */}
      <div className="relative w-40">
        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="date"
          value={filters.endDate}
          onChange={(e) => onFiltersChange({ ...filters, endDate: e.target.value })}
          className="pl-10 dark:bg-gray-800 dark:border-gray-700"
        />
      </div>

      {/* Origen */}
      <Select
        value={filters.source}
        onValueChange={(value: 'all' | 'parking_session' | 'parking_pass') =>
          onFiltersChange({ ...filters, source: value })
        }
      >
        <SelectTrigger className="w-40 dark:bg-gray-800 dark:border-gray-700">
          <SelectValue placeholder="Origen" />
        </SelectTrigger>
        <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="parking_session">Sesiones</SelectItem>
          <SelectItem value="parking_pass">Abonados</SelectItem>
        </SelectContent>
      </Select>

      {/* Estado */}
      <Select
        value={filters.status}
        onValueChange={(value: 'all' | 'completed' | 'pending' | 'reversed') =>
          onFiltersChange({ ...filters, status: value })
        }
      >
        <SelectTrigger className="w-40 dark:bg-gray-800 dark:border-gray-700">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="completed">Completado</SelectItem>
          <SelectItem value="pending">Pendiente</SelectItem>
          <SelectItem value="reversed">Reversado</SelectItem>
        </SelectContent>
      </Select>

      {/* Método de pago */}
      <Select
        value={filters.method}
        onValueChange={(value) => onFiltersChange({ ...filters, method: value })}
      >
        <SelectTrigger className="w-44 dark:bg-gray-800 dark:border-gray-700">
          <SelectValue placeholder="Método" />
        </SelectTrigger>
        <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
          <SelectItem value="all">Todos los métodos</SelectItem>
          {paymentMethods.map((pm) => (
            <SelectItem key={pm.payment_method_code} value={pm.payment_method_code}>
              {pm.payment_method?.name || pm.payment_method_code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default PagosFilters;
