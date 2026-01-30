'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Briefcase,
  Edit,
  Copy,
  ToggleLeft,
  Trash2,
  MoreVertical,
  Building2,
  GraduationCap,
} from 'lucide-react';

interface JobPositionHeaderProps {
  position: {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    level: string | null;
    department_name?: string;
    is_active: boolean;
    created_at: string;
  };
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

export function JobPositionHeader({
  position,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
}: JobPositionHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        {/* Info Principal */}
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Briefcase className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {position.name}
              </h1>
              <Badge
                variant={position.is_active ? 'default' : 'secondary'}
                className={
                  position.is_active
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }
              >
                {position.is_active ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            
            {position.code && (
              <p className="text-sm font-mono text-gray-500 dark:text-gray-400 mt-1">
                Código: {position.code}
              </p>
            )}

            <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
              {position.department_name && (
                <div className="flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  <span>{position.department_name}</span>
                </div>
              )}
              {position.level && (
                <div className="flex items-center gap-1">
                  <GraduationCap className="h-4 w-4" />
                  <span>{position.level}</span>
                </div>
              )}
            </div>

            {position.description && (
              <p className="text-gray-600 dark:text-gray-300 mt-3 max-w-2xl">
                {position.description}
              </p>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2">
          <Button onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleActive}>
                <ToggleLeft className="h-4 w-4 mr-2" />
                {position.is_active ? 'Desactivar' : 'Activar'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-red-600 dark:text-red-400"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export default JobPositionHeader;
