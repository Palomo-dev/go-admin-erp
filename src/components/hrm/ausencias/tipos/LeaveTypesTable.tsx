'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  DollarSign,
  Calendar,
  FileText,
  CheckCircle,
} from 'lucide-react';
import type { LeaveType } from '@/lib/services/leaveTypesService';

interface LeaveTypesTableProps {
  types: LeaveType[];
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
  isLoading?: boolean;
}

export function LeaveTypesTable({
  types,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleActive,
  isLoading,
}: LeaveTypesTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (types.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p>No hay tipos de ausencia configurados</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50">
            <TableHead>Código</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead className="text-center">Pagado</TableHead>
            <TableHead className="text-center">Documento</TableHead>
            <TableHead className="text-center">Aprobación</TableHead>
            <TableHead className="text-center">Máx/Año</TableHead>
            <TableHead className="text-center">Acumula</TableHead>
            <TableHead className="text-center">Activo</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {types.map((type) => (
            <TableRow key={type.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <TableCell>
                <div className="flex items-center gap-2">
                  {type.color && (
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: type.color }}
                    />
                  )}
                  <span className="font-mono font-medium text-gray-900 dark:text-white">
                    {type.code}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-gray-700 dark:text-gray-300">{type.name}</span>
                {type.description && (
                  <span className="block text-xs text-gray-400 line-clamp-1">
                    {type.description}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-center">
                {type.paid ? (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <DollarSign className="h-3 w-3 mr-1" />
                    Sí
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-gray-500">No</Badge>
                )}
              </TableCell>
              <TableCell className="text-center">
                {type.requires_document ? (
                  <FileText className="h-4 w-4 mx-auto text-blue-600" />
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                {type.requires_approval ? (
                  <CheckCircle className="h-4 w-4 mx-auto text-blue-600" />
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {type.max_days_per_year || '-'}
                </span>
              </TableCell>
              <TableCell className="text-center">
                {type.accrues_monthly ? (
                  <Badge variant="outline" className="text-purple-600 border-purple-300">
                    {type.accrual_rate}/mes
                  </Badge>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                <Switch
                  checked={type.is_active}
                  onCheckedChange={(checked) => onToggleActive(type.id, checked)}
                />
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onEdit(type.id)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(type.id)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(type.id)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
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
