'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import { FolderTree, Plus, ChevronRight, Users, Folder } from 'lucide-react';
import Link from 'next/link';

export interface DepartmentChild {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  employee_count: number;
}

interface DepartmentChildrenProps {
  children: DepartmentChild[];
  parentId: string;
  isLoading?: boolean;
}

export function DepartmentChildren({
  children,
  parentId,
  isLoading,
}: DepartmentChildrenProps) {
  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <FolderTree className="h-5 w-5 text-blue-600" />
            Sub-departamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse h-14 bg-gray-100 dark:bg-gray-700 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          <FolderTree className="h-5 w-5 text-blue-600" />
          Sub-departamentos
          {children.length > 0 && (
            <Badge variant="secondary">{children.length}</Badge>
          )}
        </CardTitle>
        <Link href={`/app/hrm/departamentos/nuevo?parent=${parentId}`}>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Agregar
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {children.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Folder className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">
              No hay sub-departamentos
            </p>
            <Link href={`/app/hrm/departamentos/nuevo?parent=${parentId}`}>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Crear Sub-departamento
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {children.map((child) => (
              <Link
                key={child.id}
                href={`/app/hrm/departamentos/${child.id}`}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border transition-colors',
                  'border-gray-200 dark:border-gray-700',
                  'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                  !child.is_active && 'opacity-60'
                )}
              >
                <div className="flex items-center gap-3">
                  <Folder className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {child.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      {child.code && (
                        <span className="font-mono">[{child.code}]</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {child.employee_count} empleados
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!child.is_active && (
                    <Badge variant="secondary" className="text-xs">
                      Inactivo
                    </Badge>
                  )}
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DepartmentChildren;
