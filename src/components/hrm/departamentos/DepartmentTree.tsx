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
          'flex items-center gap-2 p-2 rounded-lg group transition-colors',
          'hover:bg-gray-100 dark:hover:bg-gray-700/50',
          !node.is_active && 'opacity-60'
        )}
        style={{ paddingLeft: `${node.level * 24 + 8}px` }}
      >
        {/* Expand/Collapse Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'h-6 w-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600',
            !hasChildren && 'invisible'
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-500" />
          )}
        </button>

        {/* Folder Icon */}
        {hasChildren && isExpanded ? (
          <FolderOpen className="h-5 w-5 text-blue-500 shrink-0" />
        ) : (
          <Folder className="h-5 w-5 text-blue-500 shrink-0" />
        )}

        {/* Department Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white truncate">
              {node.name}
            </span>
            {node.code && (
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                [{node.code}]
              </span>
            )}
            {!node.is_active && (
              <Badge variant="secondary" className="text-xs">
                Inactivo
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            {node.manager_name && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {node.manager_name}
              </span>
            )}
            {node.cost_center && (
              <span>CC: {node.cost_center}</span>
            )}
            {(node.children_count ?? 0) > 0 && (
              <span>{node.children_count} sub-depto(s)</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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
      <div className="space-y-2 p-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse h-14 bg-gray-100 dark:bg-gray-700 rounded-lg"
            style={{ marginLeft: `${(i % 3) * 24}px` }}
          />
        ))}
      </div>
    );
  }

  if (departments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Folder className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          No hay departamentos
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
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
