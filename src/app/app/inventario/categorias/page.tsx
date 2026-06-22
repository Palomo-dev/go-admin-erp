'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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

  const totalPages = Math.ceil(filtered.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedFiltered = useMemo(
    () => filtered.slice(startIndex, startIndex + pageSize),
    [filtered, startIndex, pageSize]
  );

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
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
              filtered={paginatedFiltered}
              searchTerm={searchTerm}
              onToggleExpand={toggleExpand}
              onToggleActive={handleToggleActive}
              onDuplicate={handleDuplicate}
              onMakeRoot={handleMakeRoot}
              onDelete={confirmDelete}
              onMoveToParent={handleMoveToParent}
            />

            <DataTablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={filtered.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={handlePageSizeChange}
              pageSizeOptions={[10, 25, 50, 100]}
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
