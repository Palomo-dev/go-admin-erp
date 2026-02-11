'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { FolderTree } from 'lucide-react';
import categoryService, { type Category } from '@/lib/services/categoryService';
import {
  CategoryDetailHeader,
  CategoryInfoCard,
  CategorySeoCard,
  CategoryChildrenCard,
  CategoryVisualCard,
  CategoryStatsCard,
  CategoryProductsCard,
} from '@/components/inventario/categorias';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CategoriaDetallePage({ params }: PageProps) {
  const { id: categoryUuid } = React.use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [category, setCategory] = useState<Category | null>(null);
  const [parent, setParent] = useState<Category | null>(null);
  const [children, setChildren] = useState<Category[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (organization?.id) loadData();
  }, [categoryUuid, organization?.id]);

  const loadData = async () => {
    if (!organization?.id) return;
    try {
      setIsLoading(true);
      const [cat, allCats, counts] = await Promise.all([
        categoryService.getByUuid(categoryUuid),
        categoryService.getAll(organization.id),
        categoryService.getProductCounts(organization.id),
      ]);

      setCategory(cat);
      setProductCount(counts[cat.id] || 0);
      setParent(cat.parent_id ? allCats.find(c => c.id === cat.parent_id) || null : null);
      setChildren(allCats.filter(c => c.parent_id === cat.id));
    } catch {
      toast({ title: 'Error', description: 'No se pudo cargar la categoría', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await categoryService.deleteByUuid(categoryUuid);
      toast({ title: 'Categoría eliminada' });
      router.push('/app/inventario/categorias');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'No se pudo eliminar', variant: 'destructive' });
    } finally {
      setDeleteOpen(false);
    }
  };

  const handleToggleActive = async () => {
    if (!category) return;
    try {
      await categoryService.toggleActiveByUuid(categoryUuid, !category.is_active);
      toast({ title: category.is_active ? 'Categoría desactivada' : 'Categoría activada' });
      loadData();
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleDuplicate = async () => {
    if (!organization?.id) return;
    try {
      const dup = await categoryService.duplicateByUuid(categoryUuid, organization.id);
      toast({ title: 'Categoría duplicada' });
      router.push(`/app/inventario/categorias/${dup.uuid}`);
    } catch {
      toast({ title: 'Error', description: 'No se pudo duplicar', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 py-4">
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="flex-1 p-4 sm:p-6 space-y-6">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <FolderTree className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-lg font-medium text-gray-900 dark:text-white">Categoría no encontrada</p>
          <Link href="/app/inventario/categorias">
            <Button className="mt-4" variant="outline">Volver a categorías</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <CategoryDetailHeader
        category={category}
        onToggleActive={handleToggleActive}
        onDuplicate={handleDuplicate}
        onDelete={() => setDeleteOpen(true)}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna principal */}
          <div className="lg:col-span-2 space-y-6">
            <CategoryInfoCard category={category} parent={parent} />
            <CategorySeoCard category={category} />
            <CategoryChildrenCard subcategories={children} />
            {category && organization?.id && (
              <CategoryProductsCard categoryId={category.id} organizationId={organization.id} />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <CategoryVisualCard category={category} />
            <CategoryStatsCard
              category={category}
              productCount={productCount}
              childrenCount={children.length}
            />
          </div>
        </div>
      </div>

      {/* AlertDialog Eliminar */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-gray-100">¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. Las subcategorías se moverán a la raíz automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
