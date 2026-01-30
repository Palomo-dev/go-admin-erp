'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import {
  Building2,
  Edit,
  Users,
  DollarSign,
  FolderTree,
  Calendar,
  Code,
  MoreVertical,
  Copy,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';

export interface DepartmentHeaderData {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  cost_center: string | null;
  is_active: boolean;
  manager_name: string | null;
  parent_id: string | null;
  parent_name: string | null;
  created_at: string;
}

interface DepartmentHeaderProps {
  department: DepartmentHeaderData;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  isLoading?: boolean;
}

export function DepartmentHeader({
  department,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
  isLoading,
}: DepartmentHeaderProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          {/* Info Principal */}
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'h-16 w-16 rounded-xl flex items-center justify-center shrink-0',
                department.is_active
                  ? 'bg-blue-100 dark:bg-blue-900/30'
                  : 'bg-gray-100 dark:bg-gray-700'
              )}
            >
              <Building2
                className={cn(
                  'h-8 w-8',
                  department.is_active
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-400'
                )}
              />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {department.name}
                </h1>
                {department.code && (
                  <Badge variant="outline" className="font-mono">
                    {department.code}
                  </Badge>
                )}
                <Badge
                  variant={department.is_active ? 'default' : 'secondary'}
                  className={cn(
                    department.is_active
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : ''
                  )}
                >
                  {department.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
              {department.description && (
                <p className="text-gray-500 dark:text-gray-400 mb-3 max-w-2xl">
                  {department.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {department.parent_name && (
                  <Link
                    href={`/app/hrm/departamentos/${department.parent_id}`}
                    className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <FolderTree className="h-4 w-4" />
                    <span>Padre: {department.parent_name}</span>
                  </Link>
                )}
                {department.manager_name && (
                  <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                    <Users className="h-4 w-4" />
                    <span>Jefe: {department.manager_name}</span>
                  </span>
                )}
                {department.cost_center && (
                  <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                    <DollarSign className="h-4 w-4" />
                    <span>CC: {department.cost_center}</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <Calendar className="h-4 w-4" />
                  <span>Creado: {formatDate(department.created_at)}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2">
            <Button onClick={onEdit} disabled={isLoading}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" disabled={isLoading}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onToggleActive}>
                  {department.is_active ? (
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
      </CardContent>
    </Card>
  );
}

export default DepartmentHeader;
