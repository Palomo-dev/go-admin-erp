'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import categoryService, {
  type Category,
  type CategoryWithChildren,
  type CategoryStats,
  buildCategoryTree,
  computeStats,
} from '@/lib/services/categoryService';

// ─── Tipos para el árbol aplanado ────────────────────────────────────────────

export interface FlatNode {
  category: Category;
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
  productCount: number;
  childCount: number;
}

function flattenTree(
  tree: CategoryWithChildren[],
  expanded: Set<number>,
  productCounts: Record<number, number>,
  level = 0,
): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of tree) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    result.push({
      category: node,
      level,
      hasChildren,
      isExpanded,
      productCount: productCounts[node.id] || 0,
      childCount: node.children.length,
    });
    if (hasChildren && isExpanded) {
      result.push(...flattenTree(node.children, expanded, productCounts, level + 1));
    }
  }
  return result;
}

// ─── Hook principal ──────────────────────────────────────────────────────────

export function useCategories() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [tree, setTree] = useState<CategoryWithChildren[]>([]);
  const [stats, setStats] = useState<CategoryStats>({ total: 0, active: 0, inactive: 0, root: 0, withChildren: 0 });
  const [productCounts, setProductCounts] = useState<Record<number, number>>({});
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<number | null>(null);

  const loadData = useCallback(async (refresh = false) => {
    if (!organizationId) return;
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    try {
      const [cats, counts] = await Promise.all([
        categoryService.getAll(organizationId),
        categoryService.getProductCounts(organizationId),
      ]);
      setProductCounts(counts);
      setStats(computeStats(cats));
      setTree(buildCategoryTree(cats));
      setExpandedIds(new Set(cats.map(c => c.id)));
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar las categorías', variant: 'destructive' });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [organizationId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Acciones ──
  const handleToggleActive = async (id: number, current: boolean) => {
    try {
      await categoryService.toggleActive(id, !current);
      toast({ title: current ? 'Categoría desactivada' : 'Categoría activada' });
      loadData(true);
    } catch {
      toast({ title: 'Error', description: 'No se pudo cambiar el estado', variant: 'destructive' });
    }
  };

  const handleDuplicate = async (id: number) => {
    if (!organizationId) return;
    try {
      await categoryService.duplicate(id, organizationId);
      toast({ title: 'Categoría duplicada' });
      loadData(true);
    } catch {
      toast({ title: 'Error', description: 'No se pudo duplicar', variant: 'destructive' });
    }
  };

  const confirmDelete = (id: number) => { setToDeleteId(id); setDeleteOpen(true); };

  const handleDelete = async () => {
    if (!toDeleteId) return;
    try {
      await categoryService.delete(toDeleteId);
      toast({ title: 'Categoría eliminada' });
      loadData(true);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'No se pudo eliminar', variant: 'destructive' });
    } finally {
      setDeleteOpen(false);
      setToDeleteId(null);
    }
  };

  const handleMakeRoot = async (id: number) => {
    try {
      await categoryService.move(id, null, 999);
      toast({ title: 'Categoría movida a raíz' });
      loadData(true);
    } catch {
      toast({ title: 'Error', description: 'No se pudo mover', variant: 'destructive' });
    }
  };

  const handleMoveToParent = async (categoryId: number, newParentId: number | null) => {
    if (categoryId === newParentId) return;
    try {
      await categoryService.move(categoryId, newParentId, 999);
      if (newParentId) {
        const targetName = flat.find(n => n.category.id === newParentId)?.category.name || 'otra categoría';
        toast({ title: 'Categoría movida', description: `Ahora es subcategoría de "${targetName}"` });
      } else {
        toast({ title: 'Categoría movida a raíz', description: 'La categoría ya no tiene padre' });
      }
      loadData(true);
    } catch {
      toast({ title: 'Error', description: 'No se pudo mover la categoría', variant: 'destructive' });
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const all = new Set<number>();
    const walk = (nodes: CategoryWithChildren[]) => {
      nodes.forEach(n => { all.add(n.id); walk(n.children); });
    };
    walk(tree);
    setExpandedIds(all);
  };

  const collapseAll = () => setExpandedIds(new Set());

  // ── Aplanar y filtrar ──
  const flat = flattenTree(tree, expandedIds, productCounts);
  const filtered = searchTerm
    ? flat.filter(n => n.category.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : flat;

  return {
    router,
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
  };
}
