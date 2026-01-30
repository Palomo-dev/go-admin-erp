'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Search, X } from 'lucide-react';

interface TimesheetFiltersProps {
  dateFrom: string;
  dateTo: string;
  status: string;
  branchId: string;
  branches: { id: number; name: string }[];
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onClearFilters: () => void;
}

export function TimesheetFilters({
  dateFrom,
  dateTo,
  status,
  branchId,
  branches,
  onDateFromChange,
  onDateToChange,
  onStatusChange,
  onBranchChange,
  onClearFilters,
}: TimesheetFiltersProps) {
  const hasActiveFilters = dateFrom || dateTo || status !== 'all' || branchId !== 'all';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-gray-400" />
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="w-[150px] bg-white dark:bg-gray-900"
          placeholder="Desde"
        />
        <span className="text-gray-400">-</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="w-[150px] bg-white dark:bg-gray-900"
          placeholder="Hasta"
        />
      </div>

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[150px] bg-white dark:bg-gray-900">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los estados</SelectItem>
          <SelectItem value="open">Abierto</SelectItem>
          <SelectItem value="submitted">Enviado</SelectItem>
          <SelectItem value="approved">Aprobado</SelectItem>
          <SelectItem value="rejected">Rechazado</SelectItem>
          <SelectItem value="locked">Bloqueado</SelectItem>
        </SelectContent>
      </Select>

      <Select value={branchId} onValueChange={onBranchChange}>
        <SelectTrigger className="w-[180px] bg-white dark:bg-gray-900">
          <SelectValue placeholder="Sede" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las sedes</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id.toString()}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4 mr-1" />
          Limpiar
        </Button>
      )}
    </div>
  );
}
