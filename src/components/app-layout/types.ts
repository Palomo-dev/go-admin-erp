// Definición de tipos para el layout de la aplicación
import { ReactNode } from 'react';

// Interfaces para la navegación
export interface SubNavItem {
  name: string;
  href: string;
}

export interface NavItemProps {
  name: string;
  href: string;
  icon: ReactNode;
  submenu?: SubNavItem[];
}

export interface NavSection {
  title: string;
  items: NavItemProps[];
}

export interface NavSectionProps {
  title: string;
  items: NavItemProps[];
  collapsed?: boolean;
  sectionIdx?: number;
}

// Interfaces para datos de usuario
export interface UserData {
  name?: string;
  email?: string;
  role?: string;
  avatar?: string;
}

// Propiedades para componentes específicos
export interface SidebarProps {
  navSections: NavSection[];
  userData: UserData | null;
  orgName?: string | null;
  collapsed?: boolean;
  handleSignOut: () => Promise<void>;
  loading: boolean;
}

export interface NavItemComponentProps {
  item: NavItemProps;
  collapsed?: boolean;
}

export interface SidebarNavigationProps {
  handleSignOut: () => Promise<void>;
  loading: boolean;
  userData: UserData | null;
  orgName?: string | null;
  collapsed?: boolean;
}

export interface AppHeaderProps {
  userData: UserData | null;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  orgId: string | null;
  handleSignOut: () => Promise<void>;
  loading: boolean;
}

export interface UserMenuProps {
  userData: UserData | null;
  handleSignOut: () => Promise<void>;
  loading: boolean;
}

export interface ThemeToggleProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}
