'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CompensationPackage } from '@/lib/services/compensationPackagesService';
import { formatCurrency, formatDate } from '@/utils/Utils';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  MoreHorizontal,
  Edit,
  Copy,
  Trash2,
  Eye,
  Calendar,
  DollarSign,
} from 'lucide-react';

interface PackagesTableProps {
  packages: CompensationPackage[];
  onEdit: (pkg: CompensationPackage) => void;
  onDuplicate: (pkg: CompensationPackage) => void;
  onDelete: (pkg: CompensationPackage) => void;
  onToggleActive: (pkg: CompensationPackage) => void;
  isLoading?: boolean;
}

export function PackagesTable({
  packages,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleActive,
  isLoading,
}: PackagesTableProps) {
  const router = useRouter();

  const handleViewDetail = (pkg: CompensationPackage) => {
    router.push(`/app/hrm/compensacion/paquetes/${pkg.id}`);
  };

  const isExpired = (pkg: CompensationPackage) => {
    if (!pkg.valid_to) return false;
    return new Date(pkg.valid_to) < new Date();
  };

  const isUpcoming = (pkg: CompensationPackage) => {
    if (!pkg.valid_from) return false;
    return new Date(pkg.valid_from) > new Date();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="text-center py-12">
        <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          No hay paquetes de compensación
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Crea un nuevo paquete para comenzar.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-md border border-gray-200 dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800">
              <TableHead className="text-gray-700 dark:text-gray-300">Código</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Nombre</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Salario Base</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Moneda</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Vigencia</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Estado</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Activo</TableHead>
              <TableHead className="text-right text-gray-700 dark:text-gray-300">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.map((pkg) => (
              <TableRow
                key={pkg.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                onClick={() => handleViewDetail(pkg)}
              >
                <TableCell className="font-mono text-sm text-gray-900 dark:text-white">
                  {pkg.code || '-'}
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {pkg.name}
                    </div>
                    {pkg.description && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                        {pkg.description}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-gray-900 dark:text-white">
                  {pkg.base_salary
                    ? formatCurrency(pkg.base_salary, pkg.currency_code)
                    : '-'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono">
                    {pkg.currency_code}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-gray-600 dark:text-gray-400">
                      {pkg.valid_from ? formatDate(pkg.valid_from) : 'Sin inicio'}
                      {' - '}
                      {pkg.valid_to ? formatDate(pkg.valid_to) : 'Sin fin'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {isExpired(pkg) ? (
                    <Badge variant="destructive">Expirado</Badge>
                  ) : isUpcoming(pkg) ? (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      Próximo
                    </Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      Vigente
                    </Badge>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={pkg.is_active}
                    onCheckedChange={() => onToggleActive(pkg)}
                    className="data-[state=checked]:bg-blue-600"
                  />
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800">
                      <DropdownMenuItem onClick={() => handleViewDetail(pkg)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Ver detalle
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(pkg)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(pkg)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(pkg)}
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
    </TooltipProvider>
  );
}
