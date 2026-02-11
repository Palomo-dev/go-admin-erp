'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  useCategories,
  CategoriesPageHeader,
  CategoriesStatsCards,
  CategoriesToolbar,
  CategoriesTreeTable,
  CategoriesLoadingSkeleton,
  DeleteCategoryDialog,
} from '@/components/inventario/categorias';

export default function CategoriasPage() {
  const {
    stats,
    isLoading,
    isRefreshing,
    searchTerm,
    setSearchTerm,
    deleteOpen,
    setDeleteOpen,
    filtered,
    loadData,
    handleToggleActive,
    handleDuplicate,
    confirmDelete,
    handleDelete,
    handleMakeRoot,
    handleMoveToParent,
    toggleExpand,
    expandAll,
    collapseAll,
  } = useCategories();

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <CategoriesPageHeader isRefreshing={isRefreshing} onRefresh={() => loadData(true)} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {isLoading ? (
          <CategoriesLoadingSkeleton />
        ) : (
          <>
            <CategoriesStatsCards stats={stats} />

            <CategoriesToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onExpandAll={expandAll}
              onCollapseAll={collapseAll}
            />

            <CategoriesTreeTable
              filtered={filtered}
              searchTerm={searchTerm}
              onToggleExpand={toggleExpand}
              onToggleActive={handleToggleActive}
              onDuplicate={handleDuplicate}
              onMakeRoot={handleMakeRoot}
              onDelete={confirmDelete}
              onMoveToParent={handleMoveToParent}
            />

            {/* Navegación Rápida */}
            <div className="flex flex-wrap gap-2">
              <Link href="/app/inventario"><Button variant="outline" size="sm" className="border-gray-300 dark:border-gray-700">← Inventario</Button></Link>
              <Link href="/app/inventario/productos"><Button variant="outline" size="sm" className="border-gray-300 dark:border-gray-700">Productos</Button></Link>
            </div>
          </>
        )}
      </div>

      <DeleteCategoryDialog open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={handleDelete} />
    </div>
  );
}
