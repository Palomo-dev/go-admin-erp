// Definición de tipos para el layout de la aplicación
import { ReactNode } from 'react';

// Interfaces para la navegación
export interface SubNavItem {
  name: string;
  href: string;
  icon?: ReactNode;
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
  onNavigate?: () => void;
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
  onNavigate?: () => void;
}

export interface SidebarNavigationProps {
  handleSignOut: () => Promise<void>;
  loading: boolean;
  userData: UserData | null;
  orgName?: string | null;
  collapsed?: boolean;
  onNavigate?: () => void;
  activeModuleCodes?: string[];
}

export interface AppHeaderProps {
  userData: UserData | null;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  orgId: string | null;
  handleSignOut: () => Promise<void>;
  loading: boolean;
  setSidebarOpen?: (open: boolean) => void;
  aiAssistantOpen?: boolean;
  onToggleAIAssistant?: () => void;
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

// Tipos para el sistema Multi-Column Layout con SubMenu
export interface SubMenuPanelProps {
  activeModule: NavItemProps | null;
  collapsed: boolean;
  onNavigate?: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export interface ActiveModuleState {
  module: NavItemProps | null;
  isOpen: boolean;
}
