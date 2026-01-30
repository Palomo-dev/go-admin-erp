'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  ToggleLeft,
  ToggleRight,
  Trash2,
  RotateCw,
  Calendar,
} from 'lucide-react';
import type { ShiftRotation } from '@/lib/services/shiftRotationsService';

interface TemplateInfo {
  id: string;
  name: string;
  color: string | null;
}

interface RotationTableProps {
  rotations: ShiftRotation[];
  templates: TemplateInfo[];
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
  isLoading?: boolean;
}

export function RotationTable({
  rotations,
  templates,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
  isLoading,
}: RotationTableProps) {
  const getTemplateInfo = (templateId: string | null): TemplateInfo | null => {
    if (!templateId) return null;
    return templates.find((t) => t.id === templateId) || null;
  };

  const renderPatternPreview = (rotation: ShiftRotation) => {
    const pattern = rotation.pattern || [];
    const maxShow = 14;
    const toShow = pattern.slice(0, maxShow);

    return (
      <div className="flex items-center gap-0.5">
        {toShow.map((day, idx) => {
          const template = getTemplateInfo(day.shift_template_id);
          return (
            <div
              key={idx}
              className={`w-5 h-5 rounded text-[10px] flex items-center justify-center font-medium ${
                day.is_off
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                  : 'text-white'
              }`}
              style={{
                backgroundColor: day.is_off ? undefined : template?.color || '#3b82f6',
              }}
              title={day.is_off ? 'Libre' : template?.name || 'Turno'}
            >
              {day.day}
            </div>
          );
        })}
        {pattern.length > maxShow && (
          <span className="text-xs text-gray-400 ml-1">+{pattern.length - maxShow}</span>
        )}
      </div>
    );
  };

  const countWorkDays = (rotation: ShiftRotation) => {
    return (rotation.pattern || []).filter((d) => !d.is_off).length;
  };

  const countOffDays = (rotation: ShiftRotation) => {
    return (rotation.pattern || []).filter((d) => d.is_off).length;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (rotations.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <RotateCw className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p>No hay rotaciones creadas</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50">
            <TableHead>Nombre</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Ciclo</TableHead>
            <TableHead>Patrón</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rotations.map((rotation) => (
            <TableRow
              key={rotation.id}
              className={!rotation.is_active ? 'opacity-60' : ''}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <RotateCw className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-gray-900 dark:text-white">
                    {rotation.name}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-gray-600 dark:text-gray-300 text-sm">
                  {rotation.description || '-'}
                </span>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {rotation.cycle_days} días
                  </div>
                  <div className="text-xs text-gray-500">
                    {countWorkDays(rotation)} trabajo, {countOffDays(rotation)} libre
                  </div>
                </div>
              </TableCell>
              <TableCell>{renderPatternPreview(rotation)}</TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={rotation.is_active ? 'default' : 'secondary'}
                  className={
                    rotation.is_active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                  }
                >
                  {rotation.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
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
                    <DropdownMenuItem onClick={() => onEdit(rotation.id)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(rotation.id)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleActive(rotation.id)}>
                      {rotation.is_active ? (
                        <>
                          <ToggleLeft className="h-4 w-4 mr-2" />
                          Desactivar
                        </>
                      ) : (
                        <>
                          <ToggleRight className="h-4 w-4 mr-2" />
                          Activar
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(rotation.id)}
                      className="text-red-600 dark:text-red-400"
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

export default RotationTable;
