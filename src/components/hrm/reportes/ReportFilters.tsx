'use client';

import { useState } from 'react';
import type { ReportFilters as Filters } from '@/lib/services/hrmReportsService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter, Search, RotateCcw } from 'lucide-react';

interface ReportFiltersProps {
  branches: { id: number; name: string }[];
  departments: { id: string; name: string }[];
  onApply: (filters: Filters) => void;
  isLoading?: boolean;
}

export function ReportFilters({
  branches,
  departments,
  onApply,
  isLoading,
}: ReportFiltersProps) {
  // Default to current month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const [filters, setFilters] = useState<Filters>({
    dateFrom: firstDay.toISOString().split('T')[0],
    dateTo: lastDay.toISOString().split('T')[0],
  });

  const handleChange = (field: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleApply = () => {
    onApply(filters);
  };

  const handleReset = () => {
    const reset: Filters = {
      dateFrom: firstDay.toISOString().split('T')[0],
      dateTo: lastDay.toISOString().split('T')[0],
    };
    setFilters(reset);
    onApply(reset);
  };

  // Quick date presets
  const setPreset = (preset: string) => {
    const now = new Date();
    let from: Date;
    let to: Date;

    switch (preset) {
      case 'today':
        from = to = now;
        break;
      case 'week':
        from = new Date(now);
        from.setDate(now.getDate() - now.getDay() + 1);
        to = new Date(from);
        to.setDate(from.getDate() + 6);
        break;
      case 'month':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        from = new Date(now.getFullYear(), quarter * 3, 1);
        to = new Date(now.getFullYear(), quarter * 3 + 3, 0);
        break;
      case 'year':
        from = new Date(now.getFullYear(), 0, 1);
        to = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        return;
    }

    setFilters(prev => ({
      ...prev,
      dateFrom: from.toISOString().split('T')[0],
      dateTo: to.toISOString().split('T')[0],
    }));
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-blue-600" />
          <span className="font-medium text-gray-900 dark:text-white">Filtros</span>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={() => setPreset('today')}>
            Hoy
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPreset('week')}>
            Esta semana
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPreset('month')}>
            Este mes
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPreset('quarter')}>
            Trimestre
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPreset('year')}>
            Este año
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Date Range */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Desde</Label>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleChange('dateFrom', e.target.value)}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Hasta</Label>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleChange('dateTo', e.target.value)}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          {/* Branch */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Sucursal</Label>
            <Select
              value={filters.branchId?.toString() || 'all'}
              onValueChange={(v) => handleChange('branchId', v === 'all' ? undefined : parseInt(v))}
            >
              <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800">
                <SelectItem value="all">Todas</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id.toString()}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Department */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Departamento</Label>
            <Select
              value={filters.departmentId || 'all'}
              onValueChange={(v) => handleChange('departmentId', v === 'all' ? undefined : v)}
            >
              <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800">
                <SelectItem value="all">Todos</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">&nbsp;</Label>
            <div className="flex gap-2">
              <Button
                onClick={handleApply}
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Search className="mr-2 h-4 w-4" />
                Buscar
              </Button>
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isLoading}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
