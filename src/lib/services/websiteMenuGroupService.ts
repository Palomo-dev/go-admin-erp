'use client';

import { supabase } from '@/lib/supabase/config';

// ============================================================
// SERVICIO DE MENÚS NOMBRADOS — Sistema de contenedores de
// items de navegación para header y footer.
// Fase 1 del plan footer_configurable.
// ============================================================

/** Ubicación del menú dentro del sitio */
export type MenuLocation = 'header' | 'footer' | 'both' | 'none';

/** Tipo de item dentro de un menú */
export type MenuItemType = 'page' | 'category' | 'policy' | 'custom_link';

/** Contenedor nombrado de items de navegación */
export interface MenuGroup {
  id: string;
  organization_id: number;
  name: string;
  slug: string;
  location: MenuLocation;
  footer_column: number | null;
  footer_order: number;
  header_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Items del menú (solo en getMenuTree) */
  items?: MenuGroupItem[];
}

/** Item individual dentro de un menú nombrado */
export interface MenuGroupItem {
  id: string;
  menu_id: string;
  organization_id: number;
  item_type: MenuItemType;
  page_id: string | null;
  category_id: number | null;
  custom_label: string | null;
  custom_url: string | null;
  parent_item_id: string | null;
  icon: string | null;
  badge: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Hijos anidados (solo en getMenuTree) */
  children?: MenuGroupItem[];
  /** Datos relacionados (solo en getMenuTree) */
  page_title?: string;
  page_slug?: string;
  category_name?: string;
  category_slug?: string;
}

/** Datos para crear un menú nuevo */
export interface CreateMenuData {
  name: string;
  slug: string;
  location?: MenuLocation;
  footer_column?: number | null;
  footer_order?: number;
  header_order?: number;
}

/** Datos para actualizar un menú */
export interface UpdateMenuData {
  name?: string;
  slug?: string;
  location?: MenuLocation;
  footer_column?: number | null;
  footer_order?: number;
  header_order?: number;
  is_active?: boolean;
}

/** Datos para crear un item de menú */
export interface CreateMenuItemData {
  menu_id: string;
  organization_id: number;
  item_type: MenuItemType;
  page_id?: string | null;
  category_id?: number | null;
  custom_label?: string | null;
  custom_url?: string | null;
  parent_item_id?: string | null;
  icon?: string | null;
  badge?: string | null;
  display_order?: number;
}

/** Datos para actualizar un item de menú */
export interface UpdateMenuItemData {
  item_type?: MenuItemType;
  page_id?: string | null;
  category_id?: number | null;
  custom_label?: string | null;
  custom_url?: string | null;
  parent_item_id?: string | null;
  icon?: string | null;
  badge?: string | null;
  display_order?: number;
  is_active?: boolean;
}

class WebsiteMenuGroupService {
  // ---- MENÚS (contenedores) ----

  /**
   * Obtiene todos los menús de una organización.
   */
  async getMenus(organizationId: number): Promise<MenuGroup[]> {
    const { data, error } = await supabase
      .from('website_menus')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []) as MenuGroup[];
  }

  /**
   * Obtiene menús filtrados por ubicación (header, footer, both).
   */
  async getMenusByLocation(organizationId: number, location: MenuLocation): Promise<MenuGroup[]> {
    const { data, error } = await supabase
      .from('website_menus')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .or(`location.eq.${location},location.eq.both`)
      .order(location === 'header' ? 'header_order' : 'footer_order', { ascending: true });

    if (error) throw error;
    return (data || []) as MenuGroup[];
  }

  /**
   * Crea un menú nuevo.
   */
  async createMenu(organizationId: number, data: CreateMenuData): Promise<MenuGroup> {
    const { data: menu, error } = await supabase
      .from('website_menus')
      .insert({
        organization_id: organizationId,
        name: data.name,
        slug: data.slug,
        location: data.location ?? 'none',
        footer_column: data.footer_column ?? null,
        footer_order: data.footer_order ?? 0,
        header_order: data.header_order ?? 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return menu as MenuGroup;
  }

  /**
   * Actualiza un menú existente.
   */
  async updateMenu(menuId: string, updates: UpdateMenuData): Promise<MenuGroup> {
    const { data, error } = await supabase
      .from('website_menus')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', menuId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('No se pudo actualizar el menú. Verifica permisos.');
    return data as MenuGroup;
  }

  /**
   * Elimina un menú y todos sus items (CASCADE).
   */
  async deleteMenu(menuId: string): Promise<void> {
    const { error } = await supabase
      .from('website_menus')
      .delete()
      .eq('id', menuId);

    if (error) throw error;
  }

  // ---- ITEMS DE MENÚ ----

  /**
   * Agrega un item a un menú.
   */
  async addMenuItem(item: CreateMenuItemData): Promise<MenuGroupItem> {
    const { data, error } = await supabase
      .from('website_menu_items')
      .insert({
        menu_id: item.menu_id,
        organization_id: item.organization_id,
        item_type: item.item_type,
        page_id: item.page_id ?? null,
        category_id: item.category_id ?? null,
        custom_label: item.custom_label ?? null,
        custom_url: item.custom_url ?? null,
        parent_item_id: item.parent_item_id ?? null,
        icon: item.icon ?? null,
        badge: item.badge ?? null,
        display_order: item.display_order ?? 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as MenuGroupItem;
  }

  /**
   * Actualiza un item de menú.
   */
  async updateMenuItem(itemId: string, updates: UpdateMenuItemData): Promise<MenuGroupItem> {
    const { data, error } = await supabase
      .from('website_menu_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('No se pudo actualizar el item. Verifica permisos.');
    return data as MenuGroupItem;
  }

  /**
   * Elimina un item de menú.
   */
  async removeMenuItem(itemId: string): Promise<void> {
    const { error } = await supabase
      .from('website_menu_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
  }

  /**
   * Reordena los items de un menú (batch update de display_order).
   */
  async reorderMenuItems(menuId: string, itemIds: string[]): Promise<void> {
    const updates = itemIds.map((id, index) => ({
      id,
      display_order: index,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('website_menu_items')
      .upsert(updates, { onConflict: 'id' });

    if (error) throw error;
  }

  /**
   * Anida un item bajo otro (parent_item_id).
   */
  async nestMenuItem(itemId: string, parentItemId: string | null): Promise<MenuGroupItem> {
    const { data, error } = await supabase
      .from('website_menu_items')
      .update({ parent_item_id: parentItemId, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('No se pudo anidar el item. Verifica permisos.');
    return data as MenuGroupItem;
  }

  /**
   * Obtiene el árbol jerárquico de items de un menú, con datos
   * relacionados (título de página, nombre de categoría).
   */
  async getMenuTree(menuId: string): Promise<MenuGroupItem[]> {
    const { data: items, error } = await supabase
      .from('website_menu_items')
      .select(`
        *,
        page:page_id (title, slug),
        category:category_id (name, slug)
      `)
      .eq('menu_id', menuId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    const flat = (items || []) as any[];

    // Mapear datos relacionados
    const enriched: MenuGroupItem[] = flat.map((item) => ({
      ...item,
      page_title: item.page?.title ?? undefined,
      page_slug: item.page?.slug ?? undefined,
      category_name: item.category?.name ?? undefined,
      category_slug: item.category?.slug ?? undefined,
    }));

    // Construir árbol
    return this.buildTree(enriched);
  }

  // ---- MIGRACIÓN ----

  /**
   * Migración one-time: crea menús por defecto desde páginas con
   * show_in_header/show_in_footer. Ya ejecutado en BD (Fase 0),
   * pero se mantiene para organizaciones nuevas.
   */
  async migrateExistingPages(organizationId: number): Promise<{ headerMenuId: string | null; footerMenuId: string | null }> {
    // Verificar si ya existen menús
    const existing = await this.getMenus(organizationId);
    const hasHeader = existing.some(m => m.slug === 'menu-principal');
    const hasFooter = existing.some(m => m.slug === 'menu-footer');

    let headerMenuId: string | null = null;
    let footerMenuId: string | null = null;

    if (!hasHeader) {
      // Crear "Menú Principal" y migrar páginas del header
      const headerMenu = await this.createMenu(organizationId, {
        name: 'Menú Principal',
        slug: 'menu-principal',
        location: 'header',
        header_order: 0,
      });
      headerMenuId = headerMenu.id;

      const { data: headerPages } = await supabase
        .from('website_pages')
        .select('id, header_order')
        .eq('organization_id', organizationId)
        .eq('show_in_header', true)
        .order('header_order', { ascending: true });

      if (headerPages) {
        for (const page of headerPages) {
          await this.addMenuItem({
            menu_id: headerMenu.id,
            organization_id: organizationId,
            item_type: 'page',
            page_id: page.id,
            display_order: page.header_order ?? 0,
          });
        }
      }

      // Setear header_menu_id en website_settings
      await supabase
        .from('website_settings')
        .update({ header_menu_id: headerMenu.id, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId);
    } else {
      headerMenuId = existing.find(m => m.slug === 'menu-principal')?.id ?? null;
    }

    if (!hasFooter) {
      // Crear "Menú Footer" y migrar páginas del footer
      const footerMenu = await this.createMenu(organizationId, {
        name: 'Menú Footer',
        slug: 'menu-footer',
        location: 'footer',
        footer_order: 0,
        footer_column: 1,
      });
      footerMenuId = footerMenu.id;

      const { data: footerPages } = await supabase
        .from('website_pages')
        .select('id, footer_order')
        .eq('organization_id', organizationId)
        .eq('show_in_footer', true)
        .order('footer_order', { ascending: true });

      if (footerPages) {
        for (const page of footerPages) {
          await this.addMenuItem({
            menu_id: footerMenu.id,
            organization_id: organizationId,
            item_type: 'page',
            page_id: page.id,
            display_order: page.footer_order ?? 0,
          });
        }
      }
    } else {
      footerMenuId = existing.find(m => m.slug === 'menu-footer')?.id ?? null;
    }

    return { headerMenuId, footerMenuId };
  }

  // ---- HELPERS ----

  /**
   * Construye un árbol jerárquico desde una lista plana de items.
   */
  private buildTree(items: MenuGroupItem[]): MenuGroupItem[] {
    const map = new Map<string, MenuGroupItem>();
    const roots: MenuGroupItem[] = [];

    // Primera pasada: crear mapa
    for (const item of items) {
      map.set(item.id, { ...item, children: [] });
    }

    // Segunda pasada: asignar hijos
    for (const item of items) {
      const node = map.get(item.id)!;
      if (item.parent_item_id && map.has(item.parent_item_id)) {
        map.get(item.parent_item_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}

export const websiteMenuGroupService = new WebsiteMenuGroupService();
