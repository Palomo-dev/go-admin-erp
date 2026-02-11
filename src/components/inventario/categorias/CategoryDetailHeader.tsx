'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Edit, Trash2, Copy, ToggleLeft, FolderTree } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { type Category } from '@/lib/services/categoryService';

interface CategoryDetailHeaderProps {
  category: Category;
  onToggleActive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export default function CategoryDetailHeader({ category, onToggleActive, onDuplicate, onDelete }: CategoryDetailHeaderProps) {
  const router = useRouter();

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/app/inventario/categorias" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </Link>
            <span
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${category.color || '#3B82F6'}20` }}
            >
              {(() => {
                const Icon = category.icon ? (LucideIcons as any)[category.icon] : FolderTree;
                return Icon ? <Icon className="h-5 w-5" style={{ color: category.color || '#3B82F6' }} /> : null;
              })()}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {category.name}
                </h1>
                <Badge
                  variant={category.is_active ? 'default' : 'secondary'}
                  className={category.is_active
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}
                >
                  {category.is_active ? 'Activa' : 'Inactiva'}
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">/{category.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onToggleActive} className="border-gray-300 dark:border-gray-700">
              <ToggleLeft className="h-4 w-4 mr-2" />
              {category.is_active ? 'Desactivar' : 'Activar'}
            </Button>
            <Button variant="outline" size="sm" onClick={onDuplicate} className="border-gray-300 dark:border-gray-700">
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </Button>
            <Button
              size="sm"
              onClick={() => router.push(`/app/inventario/categorias/${category.uuid}/editar`)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
