'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/Utils';

interface MembershipFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
}

export function MembershipFilters({ 
  search, 
  onSearchChange, 
  status, 
  onStatusChange 
}: MembershipFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Buscar por nombre, documento o código..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className={cn(
            "pl-9",
            "bg-white dark:bg-gray-800",
            "border-gray-300 dark:border-gray-600"
          )}
        />
      </div>
      
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-full sm:w-[180px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los estados</SelectItem>
          <SelectItem value="active">Activas</SelectItem>
          <SelectItem value="frozen">Congeladas</SelectItem>
          <SelectItem value="expired">Vencidas</SelectItem>
          <SelectItem value="cancelled">Canceladas</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export default MembershipFilters;
