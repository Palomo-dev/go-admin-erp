'use client';

import { useState } from 'react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  MoreVertical,
  Edit,
  Copy,
  UserPlus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Plus,
  Users,
} from 'lucide-react';

export interface DepartmentWithHierarchy {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  cost_center: string | null;
  is_active: boolean;
  manager_name?: string;
  manager_employment_id: string | null;
  children_count?: number;
  children: DepartmentWithHierarchy[];
  level: number;
}

interface DepartmentTreeProps {
  departments: DepartmentWithHierarchy[];
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onAssignManager: (id: string) => void;
  isLoading?: boolean;
}

interface TreeNodeProps {
  node: DepartmentWithHierarchy;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onAssignManager: (id: string) => void;
}

function TreeNode({
  node,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
  onAddChild,
  onAssignManager,
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div className="select-none">
      <div
        className={cn(
          'flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg group transition-colors',
          'hover:bg-gray-100 dark:hover:bg-gray-700/50',
          !node.is_active && 'opacity-60'
        )}
        style={{ paddingLeft: `${node.level * 16 + 8}px` }}
      >
        {/* Expand/Collapse Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'h-5 w-5 sm:h-6 sm:w-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600',
            !hasChildren && 'invisible'
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500 dark:text-gray-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500 dark:text-gray-400" />
          )}
        </button>

        {/* Folder Icon */}
        {hasChildren && isExpanded ? (
          <FolderOpen className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 dark:text-blue-400 shrink-0" />
        ) : (
          <Folder className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 dark:text-blue-400 shrink-0" />
        )}

        {/* Department Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white truncate">
              {node.name}
            </span>
            {node.code && (
              <span className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 font-mono hidden xs:inline">
                [{node.code}]
              </span>
            )}
            {!node.is_active && (
              <Badge variant="secondary" className="text-[10px] sm:text-xs">
                Inactivo
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
            {node.manager_name && (
              <span className="flex items-center gap-1 truncate max-w-[100px] sm:max-w-none">
                <Users className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                <span className="truncate">{node.manager_name}</span>
              </span>
            )}
            {node.cost_center && (
              <span className="hidden sm:inline">CC: {node.cost_center}</span>
            )}
            {(node.children_count ?? 0) > 0 && (
              <span className="hidden xs:inline">{node.children_count} sub-depto(s)</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <DropdownMenuItem onClick={() => onEdit(node.id)}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddChild(node.id)}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar sub-departamento
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAssignManager(node.id)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Asignar jefe
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(node.id)}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onToggleActive(node.id)}>
              {node.is_active ? (
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
              onClick={() => onDelete(node.id)}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onAssignManager={onAssignManager}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DepartmentTree({
  departments,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
  onAddChild,
  onAssignManager,
  isLoading,
}: DepartmentTreeProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-3 sm:p-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse h-10 sm:h-14 bg-gray-100 dark:bg-gray-700 rounded-lg"
            style={{ marginLeft: `${(i % 3) * 16}px` }}
          />
        ))}
      </div>
    );
  }

  if (departments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
        <Folder className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 mb-3 sm:mb-4" />
        <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-1">
          No hay departamentos
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm px-4">
          Crea el primer departamento para comenzar a organizar tu estructura
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {departments.map((dept) => (
        <TreeNode
          key={dept.id}
          node={dept}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onToggleActive={onToggleActive}
          onDelete={onDelete}
          onAddChild={onAddChild}
          onAssignManager={onAssignManager}
        />
      ))}
    </div>
  );
}

export default DepartmentTree;
