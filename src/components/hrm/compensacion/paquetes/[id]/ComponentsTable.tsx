'use client';

import type { CompensationComponent } from '@/lib/services/compensationPackagesService';
import { formatCurrency } from '@/utils/Utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Trash2, Layers } from 'lucide-react';

interface ComponentsTableProps {
  components: CompensationComponent[];
  currencyCode: string;
  onEdit: (component: CompensationComponent) => void;
  onDelete: (component: CompensationComponent) => void;
  onToggleActive: (component: CompensationComponent) => void;
  isLoading?: boolean;
}

const componentTypeLabels: Record<string, string> = {
  salary: 'Salario Base',
  bonus: 'Bonificación',
  commission: 'Comisión',
  allowance: 'Subsidio',
  deduction: 'Deducción',
  benefit: 'Beneficio',
  other: 'Otro',
};

const componentTypeColors: Record<string, string> = {
  salary: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  bonus: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  commission: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  allowance: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  deduction: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  benefit: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const frequencyLabels: Record<string, string> = {
  monthly: 'Mensual',
  biweekly: 'Quincenal',
  weekly: 'Semanal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
  one_time: 'Único',
};

export function ComponentsTable({
  components,
  currencyCode,
  onEdit,
  onDelete,
  onToggleActive,
  isLoading,
}: ComponentsTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (components.length === 0) {
    return (
      <div className="text-center py-12">
        <Layers className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          Sin componentes
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Agrega componentes a este paquete de compensación.
        </p>
      </div>
    );
  }

  const formatAmount = (comp: CompensationComponent) => {
    if (comp.amount_type === 'percentage') {
      return `${comp.amount}%`;
    }
    if (comp.amount_type === 'formula') {
      return comp.formula || 'Fórmula';
    }
    return comp.amount ? formatCurrency(comp.amount, currencyCode) : '-';
  };

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            <TableHead className="text-gray-700 dark:text-gray-300">Código</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Nombre</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Tipo</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Monto</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Frecuencia</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Impuesto</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Activo</TableHead>
            <TableHead className="text-right text-gray-700 dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {components.map((comp) => (
            <TableRow key={comp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <TableCell className="font-mono text-sm text-gray-900 dark:text-white">
                {comp.code}
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {comp.name}
                  </div>
                  {comp.description && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                      {comp.description}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge className={componentTypeColors[comp.component_type] || componentTypeColors.other}>
                  {componentTypeLabels[comp.component_type] || comp.component_type}
                </Badge>
              </TableCell>
              <TableCell className="text-gray-900 dark:text-white font-medium">
                {formatAmount(comp)}
              </TableCell>
              <TableCell className="text-gray-600 dark:text-gray-400">
                {frequencyLabels[comp.frequency || 'monthly'] || comp.frequency}
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  {comp.is_taxable && (
                    <Badge variant="outline" className="text-xs">Gravable</Badge>
                  )}
                  {comp.affects_social_security && (
                    <Badge variant="outline" className="text-xs">Seg. Social</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Switch
                  checked={comp.is_active}
                  onCheckedChange={() => onToggleActive(comp)}
                  className="data-[state=checked]:bg-blue-600"
                />
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800">
                    <DropdownMenuItem onClick={() => onEdit(comp)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(comp)}
                      className="text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
