'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import categoryService from '@/lib/services/categoryService';
import {
  useCategories,
  CategoriesPageHeader,
  CategoriesStatsCards,
  CategoriesToolbar,
  CategoriesTreeTable,
  CategoriesLoadingSkeleton,
  DeleteCategoryDialog,
  ImportCategoriesDialog,
} from '@/components/inventario/categorias';

export default function CategoriasPage() {
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);
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

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = async () => {
    const orgId = getOrganizationId();
    if (!orgId) return;
    try {
      const csv = await categoryService.exportCategoriesToCSV(orgId);
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, `categorias_${Date.now()}.csv`);
      toast({ title: 'Exportación completada', description: 'CSV generado correctamente' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al exportar';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const handleExportXLSX = async () => {
    const orgId = getOrganizationId();
    if (!orgId) return;
    try {
      const blob = await categoryService.exportCategoriesToXLSX(orgId);
      downloadBlob(blob, `categorias_${Date.now()}.xlsx`);
      toast({ title: 'Exportación completada', description: 'Excel generado correctamente' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al exportar';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const handleExportPDF = async () => {
    const orgId = getOrganizationId();
    if (!orgId) return;
    try {
      const blob = await categoryService.exportCategoriesToPDF(orgId);
      downloadBlob(blob, `categorias_${Date.now()}.pdf`);
      toast({ title: 'Exportación completada', description: 'PDF generado correctamente' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al exportar';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <CategoriesPageHeader
        isRefreshing={isRefreshing}
        onRefresh={() => loadData(true)}
        onExportCSV={handleExportCSV}
        onExportXLSX={handleExportXLSX}
        onExportPDF={handleExportPDF}
        onImport={() => setImportOpen(true)}
      />

      <div className="p-4 sm:p-6 space-y-6">
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

      <ImportCategoriesDialog open={importOpen} onOpenChange={setImportOpen} onSuccess={() => loadData(true)} />
    </div>
  );
}
