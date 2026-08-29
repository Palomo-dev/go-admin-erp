/**
 * Paleta de colores para identificar organizaciones.
 *
 * Cada organización recibe un color determinístico según su ID, de modo que
 * siempre sea el mismo para una organización dada pero distinto entre
 * organizaciones. Esto permite al usuario ubicarse visualmente cuando una
 * organización no tiene logo configurado (se muestra la inicial del nombre
 * sobre un fondo del color asignado).
 *
 * Las clases Tailwind se escriben completas (no se construyen dinámicamente)
 * para que el JIT las detecte y las incluya en el bundle.
 */

export interface OrgColor {
  /** Fondo del avatar con la inicial (light + dark) */
  bg: string;
  /** Borde del avatar (light + dark) */
  border: string;
  /** Fondo claro del contenedor/tarjeta de la organización (light + dark) */
  containerBg: string;
  /** Borde del contenedor (light + dark) */
  containerBorder: string;
  /** Texto del nombre en móvil/colapsado (light + dark) */
  text: string;
}

const ORG_PALETTE: OrgColor[] = [
  {
    bg: 'bg-gradient-to-br from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-900',
    border: 'border-blue-200 dark:border-blue-700',
    containerBg: 'bg-blue-50 dark:bg-blue-900/30',
    containerBorder: 'border-blue-100 dark:border-blue-800',
    text: 'text-blue-900 dark:text-blue-100',
  },
  {
    bg: 'bg-gradient-to-br from-emerald-500 to-emerald-700 dark:from-emerald-600 dark:to-emerald-900',
    border: 'border-emerald-200 dark:border-emerald-700',
    containerBg: 'bg-emerald-50 dark:bg-emerald-900/30',
    containerBorder: 'border-emerald-100 dark:border-emerald-800',
    text: 'text-emerald-900 dark:text-emerald-100',
  },
  {
    bg: 'bg-gradient-to-br from-orange-500 to-orange-700 dark:from-orange-600 dark:to-orange-900',
    border: 'border-orange-200 dark:border-orange-700',
    containerBg: 'bg-orange-50 dark:bg-orange-900/30',
    containerBorder: 'border-orange-100 dark:border-orange-800',
    text: 'text-orange-900 dark:text-orange-100',
  },
  {
    bg: 'bg-gradient-to-br from-rose-500 to-rose-700 dark:from-rose-600 dark:to-rose-900',
    border: 'border-rose-200 dark:border-rose-700',
    containerBg: 'bg-rose-50 dark:bg-rose-900/30',
    containerBorder: 'border-rose-100 dark:border-rose-800',
    text: 'text-rose-900 dark:text-rose-100',
  },
  {
    bg: 'bg-gradient-to-br from-violet-500 to-violet-700 dark:from-violet-600 dark:to-violet-900',
    border: 'border-violet-200 dark:border-violet-700',
    containerBg: 'bg-violet-50 dark:bg-violet-900/30',
    containerBorder: 'border-violet-100 dark:border-violet-800',
    text: 'text-violet-900 dark:text-violet-100',
  },
  {
    bg: 'bg-gradient-to-br from-amber-500 to-amber-700 dark:from-amber-600 dark:to-amber-900',
    border: 'border-amber-200 dark:border-amber-700',
    containerBg: 'bg-amber-50 dark:bg-amber-900/30',
    containerBorder: 'border-amber-100 dark:border-amber-800',
    text: 'text-amber-900 dark:text-amber-100',
  },
  {
    bg: 'bg-gradient-to-br from-cyan-500 to-cyan-700 dark:from-cyan-600 dark:to-cyan-900',
    border: 'border-cyan-200 dark:border-cyan-700',
    containerBg: 'bg-cyan-50 dark:bg-cyan-900/30',
    containerBorder: 'border-cyan-100 dark:border-cyan-800',
    text: 'text-cyan-900 dark:text-cyan-100',
  },
  {
    bg: 'bg-gradient-to-br from-fuchsia-500 to-fuchsia-700 dark:from-fuchsia-600 dark:to-fuchsia-900',
    border: 'border-fuchsia-200 dark:border-fuchsia-700',
    containerBg: 'bg-fuchsia-50 dark:bg-fuchsia-900/30',
    containerBorder: 'border-fuchsia-100 dark:border-fuchsia-800',
    text: 'text-fuchsia-900 dark:text-fuchsia-100',
  },
  {
    bg: 'bg-gradient-to-br from-teal-500 to-teal-700 dark:from-teal-600 dark:to-teal-900',
    border: 'border-teal-200 dark:border-teal-700',
    containerBg: 'bg-teal-50 dark:bg-teal-900/30',
    containerBorder: 'border-teal-100 dark:border-teal-800',
    text: 'text-teal-900 dark:text-teal-100',
  },
  {
    bg: 'bg-gradient-to-br from-indigo-500 to-indigo-700 dark:from-indigo-600 dark:to-indigo-900',
    border: 'border-indigo-200 dark:border-indigo-700',
    containerBg: 'bg-indigo-50 dark:bg-indigo-900/30',
    containerBorder: 'border-indigo-100 dark:border-indigo-800',
    text: 'text-indigo-900 dark:text-indigo-100',
  },
];

/**
 * Devuelve el color asignado a una organización por su ID.
 * Usa módulo para ciclar la paleta si hay más organizaciones que colores.
 */
export function getOrgColor(id: number | null | undefined): OrgColor {
  if (!id) return ORG_PALETTE[0];
  return ORG_PALETTE[Math.abs(id) % ORG_PALETTE.length];
}
