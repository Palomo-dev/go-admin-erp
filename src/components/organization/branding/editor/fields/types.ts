/**
 * Tipos compartidos para los controles del editor de secciones (F0.3).
 */
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';

/** Props comunes a todos los controles de campo. */
export interface BaseFieldProps {
  field: ContentFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

/** Breakpoints responsive para el preview del editor. */
export type Viewport = 'desktop' | 'tablet' | 'mobile';

/** Paleta del tema activo (de `website_settings`) para ColorField. */
export interface ThemePalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

/** Clases de input reutilizables (mismo estilo que EditorSidebar original). */
export const INPUT_CLASS =
  'h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500';

export const TEXTAREA_CLASS =
  'text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none';

export const LABEL_CLASS = 'text-xs text-gray-500 dark:text-gray-400';
