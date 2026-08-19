'use client';

import { supabase } from '@/lib/supabase/config';
import { websitePageBuilderService, WebsitePage, WebsitePageWithChildren } from './websitePageBuilderService';
import categoryService, { Category, CategoryWithChildren, buildCategoryTree } from './categoryService';

// ============================================================
// SERVICIO DE MENÚ — Integra páginas del sitio con categorías
// del inventario para construir el menú del header/footer.
// Fase 1 del plan header_configurable_mega_menu.
// ============================================================

/** Item de menú unificado (página o categoría) para renderizar en el header */
export interface MenuItem {
  id: string;
  type: 'page' | 'category';
  title: string;
  slug: string;
  href: string;
  icon: string | null;
  badge: string | null;
  image_url: string | null;
  description: string | null;
  order: number;
  children: MenuItem[];
  /** Referencia a la página original (si type='page') */
  page_id?: string;
  /** Referencia a la categoría original (si type='category') */
  category_id?: number;
}

/** Categoría vinculable disponible para agregar al menú */
export interface AvailableCategory {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string;
  image_url: string | null;
  parent_id: number | null;
  is_active: boolean;
  children: AvailableCategory[];
  /** Indica si ya está vinculada a una página del menú */
  is_linked: boolean;
  /** ID de la página vinculada (si is_linked=true) */
  linked_page_id?: string;
}

class WebsiteMenuService {
  /**
   * Obtiene el árbol completo del menú del header, combinando páginas
   * y categorías vinculadas. Las subcategorías de una categoría vinculada
   * se incluyen como children del item.
   */
  async getMenuTree(organizationId: number): Promise<MenuItem[]> {
    const [pageTree, categories] = await Promise.all([
      websitePageBuilderService.getMenuTree(organizationId),
      categoryService.getAll(organizationId),
    ]);

    const categoryMap = new Map<number, Category>(categories.map(c => [c.id, c]));
    return this.convertPageTreeToMenuItems(pageTree, categoryMap);
  }

  /**
   * Obtiene el árbol del menú del footer.
   */
  async getFooterMenuTree(organizationId: number): Promise<MenuItem[]> {
    const [pageTree, categories] = await Promise.all([
      websitePageBuilderService.getFooterMenuTree(organizationId),
      categoryService.getAll(organizationId),
    ]);

    const categoryMap = new Map<number, Category>(categories.map(c => [c.id, c]));
    return this.convertPageTreeToMenuItems(pageTree, categoryMap);
  }

  /**
   * Convierte un árbol de WebsitePageWithChildren en MenuItem[],
   * resolviendo las categorías vinculadas (linked_category_id).
   */
  private convertPageTreeToMenuItems(
    pages: WebsitePageWithChildren[],
    categoryMap: Map<number, Category>
  ): MenuItem[] {
    return pages.map(page => {
      const isCategoryLink = page.linked_category_id !== null;
      const category = isCategoryLink ? categoryMap.get(page.linked_category_id!) : null;

      // Si la página está vinculada a una categoría, usar el slug de la categoría
      const slug = isCategoryLink && category ? category.slug : page.slug;
      const href = slug === 'home' ? '/' : `/${slug}`;

      // Icono: preferir menu_icon de la página, sino icon de la categoría vinculada
      const icon = page.menu_icon ?? category?.icon ?? null;

      // Children: si está vinculada a categoría, las subcategorías se vuelven children
      let children: MenuItem[] = [];
      if (isCategoryLink && category) {
        // Las sub-páginas (parent_page_id) tienen prioridad si existen
        if (page.children.length > 0) {
          children = this.convertPageTreeToMenuItems(page.children, categoryMap);
        }
        // Si no hay sub-páginas pero la categoría tiene hijas, se podrían cargar
        // (se hace lazy en el sitio público para no sobrecargar el editor)
      } else {
        children = this.convertPageTreeToMenuItems(page.children, categoryMap);
      }

      return {
        id: page.id,
        type: isCategoryLink ? 'category' : 'page',
        title: page.title,
        slug,
        href,
        icon,
        badge: page.menu_badge,
        image_url: category?.image_url ?? null,
        description: category?.description ?? page.description,
        order: page.header_order,
        children,
        page_id: page.id,
        category_id: page.linked_category_id ?? undefined,
      };
    });
  }

  /**
   * Lista las categorías disponibles para vincular al menú, con su jerarquía.
   * Marca cuáles ya están vinculadas a una página existente.
   */
  async getAvailableCategories(organizationId: number): Promise<AvailableCategory[]> {
    const [categories, pages] = await Promise.all([
      categoryService.getAll(organizationId),
      websitePageBuilderService.getPages(organizationId),
    ]);

    // Map de category_id → page_id para saber cuáles ya están vinculadas
    const linkedMap = new Map<number, string>();
    pages.forEach(page => {
      if (page.linked_category_id !== null) {
        linkedMap.set(page.linked_category_id, page.id);
      }
    });

    // Filtrar solo categorías activas
    const activeCategories = categories.filter(c => c.is_active);

    // Construir árbol
    const tree = buildCategoryTree(activeCategories);

    return this.convertCategoryTreeToAvailable(tree, linkedMap);
  }

  private convertCategoryTreeToAvailable(
    tree: CategoryWithChildren[],
    linkedMap: Map<number, string>
  ): AvailableCategory[] {
    return tree.map(cat => ({
      id: cat.id,
      uuid: cat.uuid,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      color: cat.color,
      image_url: cat.image_url,
      parent_id: cat.parent_id,
      is_active: cat.is_active,
      is_linked: linkedMap.has(cat.id),
      linked_page_id: linkedMap.get(cat.id),
      children: this.convertCategoryTreeToAvailable(cat.children, linkedMap),
    }));
  }

  /**
   * Agrega una categoría existente al menú del header.
   * Crea una website_pages virtual con linked_category_id seteado.
   * Usa el nombre, slug e icono de la categoría.
   */
  async addCategoryToMenu(
    organizationId: number,
    categoryId: number,
    options?: {
      show_in_footer?: boolean;
      menu_badge?: string | null;
      parent_page_id?: string | null;
    }
  ): Promise<WebsitePage> {
    const category = await categoryService.getById(categoryId);

    // Calcular el header_order (al final)
    const existingPages = await websitePageBuilderService.getPages(organizationId);
    const headerPages = existingPages.filter(p => p.show_in_header);
    const nextOrder = headerPages.length;

    return websitePageBuilderService.createPage({
      organization_id: organizationId,
      title: category.name,
      // Prefijar con 'categorias/' para que la URL del sitio público sea correcta
      // El sitio público usa /categorias/[slug] para páginas de categorías
      slug: `categorias/${category.slug}`,
      show_in_header: true,
      show_in_footer: options?.show_in_footer ?? false,
      header_order: nextOrder,
      footer_order: options?.show_in_footer ? existingPages.filter(p => p.show_in_footer).length : 0,
      linked_category_id: categoryId,
      menu_icon: category.icon,
      menu_badge: options?.menu_badge ?? null,
      parent_page_id: options?.parent_page_id ?? null,
    });
  }

  /**
   * Vincula una página existente a una categoría del inventario.
   */
  async linkPageToCategory(pageId: string, categoryId: number | null): Promise<WebsitePage> {
    let menu_icon: string | null = null;
    if (categoryId !== null) {
      const category = await categoryService.getById(categoryId);
      menu_icon = category.icon;
    }
    return websitePageBuilderService.updatePageMenu(pageId, {
      linked_category_id: categoryId,
      menu_icon,
    });
  }

  /**
   * Anida una página bajo otra (sub-menú).
   */
  async nestPage(pageId: string, parentPageId: string | null): Promise<WebsitePage> {
    return websitePageBuilderService.updatePageMenu(pageId, {
      parent_page_id: parentPageId,
    });
  }

  /**
   * Reordena los items del menú del header.
   */
  async reorderMenu(items: { id: string; header_order: number }[]): Promise<void> {
    return websitePageBuilderService.reorderMenuItems(items);
  }

  /**
   * Actualiza el icono y badge de un item de menú.
   */
  async updateMenuItemStyle(
    pageId: string,
    style: { menu_icon?: string | null; menu_badge?: string | null }
  ): Promise<WebsitePage> {
    return websitePageBuilderService.updatePageMenu(pageId, style);
  }

  /**
   * Obtiene las subcategorías de una categoría vinculada para renderizar
   * en el mega-menú del sitio público.
   */
  async getCategoryChildrenForMenu(
    organizationId: number,
    categoryId: number
  ): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('parent_id', categoryId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('rank', { ascending: true });

    if (error) throw error;
    return (data || []) as Category[];
  }
}

export const websiteMenuService = new WebsiteMenuService();
