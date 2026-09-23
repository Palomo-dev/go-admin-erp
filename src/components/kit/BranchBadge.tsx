'use client';

import { Building2, ChevronDown, MapPinOff, Store } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useBranch } from '@/lib/context/BranchContext';

/**
 * Chip de sucursal (Figma `02 Componentes` › Átomos › `BranchBadge`,
 * SISTEMA-BADGES.md §3 y PATRONES-TRANSVERSALES.md §9–10).
 *
 * - `una`: Azul GO sólido con `Store`. Es ruidoso a propósito.
 * - `todas`: tinte de marca con `Building2`; con 2+ sucursales dice «Todas (3)».
 * - `sinAsignar`: gris, «Sin sucursal», nunca interactivo.
 * - `tono="neutro"`: gris para barras densas donde el azul compite.
 *
 * Solo las pantallas de ámbito de sucursal lo llevan en la cabecera
 * (inventario, POS, cajas, facturas, informes). Clientes y proveedores no.
 */
export type AlcanceSucursal = 'una' | 'todas' | 'sinAsignar';

export interface BranchBadgeProps {
  alcance: AlcanceSucursal;
  /** Nombre de la sucursal (alcance `una`). */
  nombre?: string;
  /** Cuántas sucursales consolida «Todas» (se muestra con 2 o más). */
  cantidad?: number;
  tono?: 'marca' | 'neutro';
  /** `sm` 24 px (cabeceras de pantalla, móvil) · `md` 28 px (POS). */
  tamano?: 'sm' | 'md';
  /** Solo cuando el chip abre el selector de sucursal: añade el chevron y lo vuelve botón. */
  onClick?: () => void;
  className?: string;
}

const COLOR = {
  una: 'bg-solid-brand text-on-solid border-brand-action',
  todas: 'bg-brand-tint text-brand-deep border-line-brand',
  neutro: 'bg-subtle text-fg-secondary border-line',
} as const;

export function textoSucursal(alcance: AlcanceSucursal, nombre?: string, cantidad?: number): string {
  if (alcance === 'sinAsignar') return 'Sin sucursal';
  if (alcance === 'todas') return cantidad && cantidad >= 2 ? `Todas (${cantidad})` : 'Todas las sucursales';
  return nombre || 'Sucursal';
}

export function BranchBadge({ alcance, nombre, cantidad, tono = 'marca', tamano = 'sm', onClick, className }: BranchBadgeProps) {
  const interactivo = !!onClick && alcance !== 'sinAsignar';
  const Icono = alcance === 'todas' ? Building2 : alcance === 'una' ? Store : MapPinOff;
  const color = tono === 'neutro' || alcance === 'sinAsignar' ? COLOR.neutro : COLOR[alcance];
  const texto = textoSucursal(alcance, nombre, cantidad);
  const clases = cn(
    'inline-flex max-w-full shrink-0 items-center rounded-full border font-semibold',
    tamano === 'sm' ? 'h-6 gap-1.5 px-2.5 text-xs' : 'h-7 gap-2 px-3 text-sm',
    color,
    interactivo && 'cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
    className,
  );
  const contenido = (
    <>
      <Icono aria-hidden="true" strokeWidth={1.75} className={tamano === 'sm' ? 'size-3.5 shrink-0' : 'size-4 shrink-0'} />
      <span className="truncate">{texto}</span>
      {interactivo && <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 opacity-80" />}
    </>
  );
  if (interactivo) {
    return (
      <button type="button" onClick={onClick} className={clases} aria-label={`Sucursal: ${texto}. Cambiar sucursal`}>
        {contenido}
      </button>
    );
  }
  return (
    <span className={clases} title={texto}>
      <span className="sr-only">Sucursal: </span>
      {contenido}
    </span>
  );
}

/**
 * El chip de la sucursal activa del header (BranchContext). Es el que va debajo
 * del título en las pantallas de ámbito de sucursal: no filtra nada por su
 * cuenta, solo dice qué está mandando.
 */
export function BranchBadgeActiva(props: Omit<BranchBadgeProps, 'alcance' | 'nombre' | 'cantidad'>) {
  const { branchFilter, branches, isLoading } = useBranch();
  if (isLoading) return null;
  if (branches.length === 0) return <BranchBadge {...props} alcance="sinAsignar" />;
  if (branchFilter === null) return <BranchBadge {...props} alcance="todas" cantidad={branches.length} />;
  const nombre = branches.find((b) => b.id === branchFilter)?.name ?? `Sucursal #${branchFilter}`;
  return <BranchBadge {...props} alcance="una" nombre={nombre} />;
}
