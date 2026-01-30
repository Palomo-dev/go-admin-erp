'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RefreshCw, Download, ArrowLeft, BarChart3, Building2, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { DateRangeFilter, DateRange } from './DateRangeFilter';

interface Branch {
  id: number;
  name: string;
}

interface ReportsHeaderProps {
  onRefresh: () => void;
  onExport: (format: 'csv' | 'pdf') => void;
  isLoading?: boolean;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  branches?: Branch[];
  selectedBranch: number | 'all';
  onBranchChange: (branchId: number | 'all') => void;
}

export function ReportsHeader({ 
  onRefresh, 
  onExport, 
  isLoading,
  dateRange,
  onDateRangeChange,
  branches = [],
  selectedBranch,
  onBranchChange
}: ReportsHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/gym">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <BarChart3 className="h-6 w-6 text-blue-600" />
              </div>
              Reportes Operativos
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Análisis de retención, ingresos y asistencia
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exportar
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport('csv')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('pdf')}>
                <FileText className="h-4 w-4 mr-2" />
                Exportar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <DateRangeFilter 
          dateRange={dateRange} 
          onDateRangeChange={onDateRangeChange} 
        />

        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-gray-500" />
          <Select 
            value={selectedBranch === 'all' ? 'all' : selectedBranch.toString()} 
            onValueChange={(v) => onBranchChange(v === 'all' ? 'all' : parseInt(v))}
          >
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue placeholder="Todas las sedes" />
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
        </div>
      </div>
    </div>
  );
}
