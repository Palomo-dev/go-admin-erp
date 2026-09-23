/**
 * Colores y medidas del sistema de diseño para Tailwind.
 *
 * Tres capas, de la más baja a la más alta:
 *
 * 1. PRIMITIVOS — las escalas `blue` y `gray` se sustituyen por las de Figma.
 *    Con eso las ~12.000 clases `*-blue-*` y ~55.000 `*-gray-*` que ya existen
 *    pasan al azul de marca y a los grises de Figma sin tocar un solo archivo.
 *    `blue` sigue los nombres de Figma uno a uno (blue-500 = #4361EE, la marca;
 *    blue-600 = #3651D4, la acción) y `gray` pasa a ser `slate`, que es el gris
 *    que usa Figma.
 *
 * 2. SEMÁNTICOS — los tokens de Figma con modo claro y oscuro (src/styles/tokens.css):
 *    `bg-surface`, `text-fg`, `border-line`, `bg-brand-action`… Un componente que
 *    los usa no necesita ninguna clase `dark:`: el cambio lo hace la variable.
 *    Es lo que usa todo el código nuevo.
 *
 * 3. COMPATIBILIDAD CON SHADCN — `bg-muted`, `text-muted-foreground`, `bg-accent`,
 *    `bg-popover`, `ring-ring`… Los componentes de shadcn los usan desde siempre
 *    (~600 usos) pero el tailwind.config nunca los definió, así que no generaban
 *    CSS: el texto «atenuado» salía del color heredado y los hover de acento no
 *    hacían nada. Ahora apuntan a los tokens de Figma.
 *
 * Radios: NO se sobrescribe la escala de Tailwind (cambiaría el redondeo de toda
 * la app de golpe). Equivalencia con Figma: radius/sm 6 = rounded-md,
 * radius/md 8 = rounded-lg, radius/lg 12 = rounded-xl, radius/xl 16 = rounded-2xl.
 */

/** Color desde una variable de tokens.css, con soporte de opacidad (`/10`). */
const t = (variable) => `rgb(var(--${variable}) / <alpha-value>)`;

const blue = {
  25: '#f8faff',
  50: '#eef1fe',
  100: '#dce2fc',
  200: '#b9c5f9',
  300: '#8fa3f5',
  400: '#6a82f1',
  500: '#4361ee',
  600: '#3651d4',
  700: '#2a3ea8',
  800: '#1f2e7d',
  900: '#151f54',
  // Figma no define 950; se extiende la escala para las clases que ya lo usan.
  950: '#0e1538',
};

// slate de Tailwind, idéntico a slate/* de Figma.
const gray = {
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1e293b',
  900: '#0f172a',
  950: '#020617',
};

const colors = {
  blue,
  gray,

  // --- Semánticos (Figma) ---
  canvas: t('bg-canvas'),
  surface: t('bg-surface'),
  subtle: t('bg-subtle'),
  sidebar: t('bg-sidebar'),
  hover: t('bg-hover'),
  pressed: t('bg-pressed'),
  tooltip: t('bg-tooltip'),
  fg: {
    DEFAULT: t('text-primary'),
    secondary: t('text-secondary'),
    muted: t('text-muted'),
    'on-brand': t('text-on-brand'),
  },
  link: t('text-link'),
  line: {
    DEFAULT: t('border-default'),
    strong: t('border-strong'),
    brand: t('border-brand'),
    success: t('border-success'),
    warning: t('border-warning'),
    danger: t('border-danger'),
    info: t('border-info'),
  },
  brand: {
    DEFAULT: t('brand-primary'),
    action: t('brand-action'),
    'action-hover': t('brand-action-hover'),
    deep: t('brand-deep'),
    tint: t('brand-tint'),
    'tint-hover': t('brand-tint-hover'),
  },
  success: {
    DEFAULT: t('state-success'),
    subtle: t('state-success-subtle'),
    text: t('state-success-text'),
  },
  warning: {
    DEFAULT: t('state-warning'),
    subtle: t('state-warning-subtle'),
    text: t('state-warning-text'),
  },
  danger: {
    DEFAULT: t('state-danger'),
    subtle: t('state-danger-subtle'),
    text: t('state-danger-text'),
    hover: t('state-danger-hover'),
  },
  info: {
    DEFAULT: t('state-info'),
    subtle: t('state-info-subtle'),
    text: t('state-info-text'),
  },
  solid: {
    brand: t('badge-solid-brand'),
    success: t('badge-solid-success'),
    warning: t('badge-solid-warning'),
    danger: t('badge-solid-danger'),
    info: t('badge-solid-info'),
    neutral: t('badge-solid-neutral'),
  },
  'on-solid': {
    DEFAULT: t('badge-on-solid'),
    warning: t('badge-on-solid-warning'),
  },

  // --- Compatibilidad con shadcn/ui ---
  background: t('bg-canvas'),
  foreground: t('text-primary'),
  muted: {
    DEFAULT: t('bg-subtle'),
    foreground: t('text-secondary'),
  },
  accent: {
    DEFAULT: t('bg-hover'),
    foreground: t('text-primary'),
  },
  popover: {
    DEFAULT: t('bg-surface'),
    foreground: t('text-primary'),
  },
  card: {
    DEFAULT: t('bg-surface'),
    foreground: t('text-primary'),
  },
  border: t('border-default'),
  input: t('border-strong'),
  ring: t('brand-primary'),
  primary: {
    DEFAULT: t('brand-action'),
    foreground: t('text-on-brand'),
    // `primary-dark` existía (#0050b3) como tono de hover.
    dark: t('brand-action-hover'),
  },
  secondary: {
    DEFAULT: t('bg-subtle'),
    foreground: t('text-primary'),
  },
  destructive: {
    DEFAULT: t('state-danger'),
    foreground: t('text-on-brand'),
  },
};

module.exports = {
  colors,
  // Borde por defecto (`border` sin color) sensible al modo oscuro.
  borderColor: {
    DEFAULT: t('border-default'),
  },
  spacing: {
    sidebar: 'var(--size-sidebar-expanded)',
    rail: 'var(--size-sidebar-collapsed)',
    popover: 'var(--size-popover-width)',
  },
};
