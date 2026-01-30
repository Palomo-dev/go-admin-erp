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
import { Calendar, X } from 'lucide-react';

interface LeaveType {
  id: string;
  code: string;
  name: string;
}

interface LeaveRequestFiltersProps {
  dateFrom: string;
  dateTo: string;
  status: string;
  leaveTypeId: string;
  leaveTypes: LeaveType[];
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onLeaveTypeChange: (value: string) => void;
  onClearFilters: () => void;
}

export function LeaveRequestFilters({
  dateFrom,
  dateTo,
  status,
  leaveTypeId,
  leaveTypes,
  onDateFromChange,
  onDateToChange,
  onStatusChange,
  onLeaveTypeChange,
  onClearFilters,
}: LeaveRequestFiltersProps) {
  const hasActiveFilters = dateFrom || dateTo || status !== 'all' || leaveTypeId !== 'all';

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
          <SelectItem value="requested">Solicitado</SelectItem>
          <SelectItem value="approved">Aprobado</SelectItem>
          <SelectItem value="rejected">Rechazado</SelectItem>
          <SelectItem value="cancelled">Cancelado</SelectItem>
        </SelectContent>
      </Select>

      <Select value={leaveTypeId} onValueChange={onLeaveTypeChange}>
        <SelectTrigger className="w-[180px] bg-white dark:bg-gray-900">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los tipos</SelectItem>
          {leaveTypes.map((type) => (
            <SelectItem key={type.id} value={type.id}>
              {type.code} - {type.name}
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
