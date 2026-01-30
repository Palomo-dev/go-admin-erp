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
  Clock,
  Moon,
  Coffee,
} from 'lucide-react';
import type { ShiftTemplate } from '@/lib/services/shiftTemplatesService';

interface TemplateTableProps {
  templates: ShiftTemplate[];
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
  isLoading?: boolean;
}

export function TemplateTable({
  templates,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
  isLoading,
}: TemplateTableProps) {
  const formatTime = (time: string) => {
    return time.substring(0, 5);
  };

  const calculateDuration = (start: string, end: string, breakMinutes: number) => {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    
    let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (totalMinutes < 0) totalMinutes += 24 * 60; // Cross midnight
    
    const netMinutes = totalMinutes - breakMinutes;
    const hours = Math.floor(netMinutes / 60);
    const minutes = netMinutes % 60;
    
    return `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`.trim();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p>No hay plantillas de turno creadas</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50">
            <TableHead className="w-[50px]">Color</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Horario</TableHead>
            <TableHead>Duración</TableHead>
            <TableHead>Descanso</TableHead>
            <TableHead>Multiplicadores</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((template) => (
            <TableRow
              key={template.id}
              className={!template.is_active ? 'opacity-60' : ''}
            >
              <TableCell>
                <div
                  className="w-8 h-8 rounded-lg border-2 border-white dark:border-gray-700 shadow-sm"
                  style={{ backgroundColor: template.color || '#3b82f6' }}
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {template.name}
                  </span>
                  {template.is_night_shift && (
                    <span title="Turno nocturno">
                      <Moon className="h-4 w-4 text-indigo-500" />
                    </span>
                  )}
                  {template.is_split_shift && (
                    <span title="Turno partido">
                      <Coffee className="h-4 w-4 text-orange-500" />
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {template.code ? (
                  <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                    {template.code}
                  </code>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 font-mono text-sm">
                  <Clock className="h-4 w-4 text-gray-400" />
                  {formatTime(template.start_time)} - {formatTime(template.end_time)}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-gray-600 dark:text-gray-300">
                  {calculateDuration(template.start_time, template.end_time, template.break_minutes)}
                </span>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  <span className="text-gray-600 dark:text-gray-300">
                    {template.break_minutes} min
                  </span>
                  {template.paid_break && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      Pagado
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-xs space-y-0.5">
                  <div className="text-gray-600 dark:text-gray-300">
                    Extra: {template.overtime_multiplier}x
                  </div>
                  {template.is_night_shift && (
                    <div className="text-indigo-600 dark:text-indigo-400">
                      Nocturno: {template.night_multiplier}x
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={template.is_active ? 'default' : 'secondary'}
                  className={
                    template.is_active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                  }
                >
                  {template.is_active ? 'Activo' : 'Inactivo'}
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
                    <DropdownMenuItem onClick={() => onEdit(template.id)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(template.id)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleActive(template.id)}>
                      {template.is_active ? (
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
                      onClick={() => onDelete(template.id)}
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

export default TemplateTable;
