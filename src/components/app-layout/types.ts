// Tipos del layout de la aplicación.
//
// Los de la navegación y el header viejos (NavItemProps, SidebarProps,
// AppHeaderProps, UserMenuProps…) se fueron con sus componentes: el shell nuevo
// vive en `src/components/shell` y el catálogo en `src/lib/navigation`.

export interface UserData {
  name?: string;
  email?: string;
  role?: string;
  avatar?: string;
}
