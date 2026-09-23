/**
 * Identidad visual determinística de organizaciones y sucursales en el shell
 * (Figma `02 Componentes` › OrgAvatar 41:1094 y BranchRow 41:1369).
 *
 * - Organización: avatar cuadrado con el logo o la inicial sobre un color sólido.
 * - Sucursal: icono y color por id, nunca iniciales («Sucursal Principal» y
 *   «Sucursal Poblado» darían las mismas).
 *
 * El mismo id da siempre el mismo resultado, y ids distintos se reparten la
 * paleta. Las clases van completas para que el JIT de Tailwind las vea.
 */
import {
  Briefcase,
  Building,
  Factory,
  Home,
  Hotel,
  Landmark,
  ShoppingBag,
  Store,
  Tent,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

const COLORES_ORG = [
  'bg-blue-500',
  'bg-amber-500',
  'bg-emerald-600',
  'bg-rose-500',
  'bg-violet-500',
  'bg-cyan-600',
  'bg-orange-500',
  'bg-teal-600',
] as const;

/** Color sólido del avatar de una organización (fondo; el texto va en blanco). */
export function colorOrganizacion(id: number | null | undefined): string {
  return COLORES_ORG[Math.abs(id ?? 0) % COLORES_ORG.length];
}

const ICONOS_SUCURSAL: LucideIcon[] = [Store, Warehouse, Building, Factory, Hotel, Landmark, Home, Tent, ShoppingBag, Briefcase];

const TONOS_SUCURSAL = [
  { fondo: 'bg-success-subtle', icono: 'text-success-text' },
  { fondo: 'bg-info-subtle', icono: 'text-info-text' },
  { fondo: 'bg-warning-subtle', icono: 'text-warning-text' },
  { fondo: 'bg-brand-tint', icono: 'text-brand-deep' },
  { fondo: 'bg-danger-subtle', icono: 'text-danger-text' },
] as const;

export interface IdentidadSucursal {
  Icono: LucideIcon;
  fondo: string;
  icono: string;
}

export function identidadSucursal(id: number | null | undefined): IdentidadSucursal {
  const n = Math.abs(id ?? 0);
  const tono = TONOS_SUCURSAL[n % TONOS_SUCURSAL.length];
  return { Icono: ICONOS_SUCURSAL[n % ICONOS_SUCURSAL.length], fondo: tono.fondo, icono: tono.icono };
}

