'use client';

import { useState, useEffect, useMemo, useRef, memo } from 'react';
import {
  Building,
  Store,
  Warehouse,
  Factory,
  Hotel,
  Landmark,
  Home,
  Tent,
  ShoppingBag,
  Briefcase,
  ChevronDown,
  Search,
  Check,
  Layers,
} from 'lucide-react';
import { useBranch, ALL_BRANCHES } from '@/lib/context/BranchContext';
import type { LucideIcon } from 'lucide-react';

interface BranchSelectorProps {
  organizationId?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Paleta de colores por sucursal.
// Se asigna un color determinístico a cada sucursal según su ID, de modo que
// siempre sea el mismo para una sucursal dada pero distinto entre sucursales.
// Las clases se escriben completas (no se construyen dinámicamente) para que
// el JIT de Tailwind las detecte y las incluya en el bundle.
// ---------------------------------------------------------------------------
interface BranchColor {
  /** Fondo claro del contenedor (light + dark) */
  bg: string;
  /** Color del ícono (light + dark) */
  text: string;
}

const BRANCH_PALETTE: BranchColor[] = [
  { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-600 dark:text-blue-400' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-600 dark:text-emerald-400' },
  { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-600 dark:text-orange-400' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-600 dark:text-rose-400' },
  { bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-600 dark:text-violet-400' },
  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-600 dark:text-amber-400' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-600 dark:text-cyan-400' },
  { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/40', text: 'text-fuchsia-600 dark:text-fuchsia-400' },
  { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-600 dark:text-teal-400' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-600 dark:text-indigo-400' },
];

/**
 * Devuelve el color asignado a una sucursal por su ID.
 * Usa módulo para ciclar la paleta si hay más sucursales que colores.
 */
function getBranchColor(id: number | null | undefined): BranchColor {
  if (!id) return BRANCH_PALETTE[0];
  return BRANCH_PALETTE[Math.abs(id) % BRANCH_PALETTE.length];
}

// Contenedor cuadrado con puntas redondeadas para el ícono de la sucursal.
const BRANCH_ICON_WRAPPER = 'flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0';

// ---------------------------------------------------------------------------
// Paleta de íconos por sucursal.
// Cada sucursal recibe un ícono distinto (determinístico por ID), de modo que
// siempre sea el mismo para una sucursal dada pero distinto entre sucursales.
// ---------------------------------------------------------------------------
const BRANCH_ICONS: LucideIcon[] = [
  Building,
  Store,
  Warehouse,
  Factory,
  Hotel,
  Landmark,
  Home,
  Tent,
  ShoppingBag,
  Briefcase,
];

/**
 * Devuelve el ícono asignado a una sucursal por su ID.
 * Usa módulo para ciclar la paleta si hay más sucursales que íconos.
 */
function getBranchIcon(id: number | null | undefined): LucideIcon {
  if (!id) return BRANCH_ICONS[0];
  return BRANCH_ICONS[Math.abs(id) % BRANCH_ICONS.length];
}

const BranchSelector = memo(({ className = '' }: BranchSelectorProps) => {
  const { branches, selectedBranchId, isAllSelected, setSelectedBranch, isLoading, canSelectAll } = useBranch();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Sucursal concreta seleccionada (para mostrar su nombre)
  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) || null,
    [branches, selectedBranchId]
  );

  // Etiqueta del botón
  const label = isAllSelected
    ? 'Todas las sucursales'
    : selectedBranch?.name || 'Seleccionar sucursal';

  // Iniciales para móvil
  const shortLabel = isAllSelected
    ? 'ALL'
    : selectedBranch?.name
    ? selectedBranch.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 3)
    : '...';

  // Filtrado por búsqueda
  const filteredBranches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(
      (b) =>
        b.name?.toLowerCase().includes(q) ||
        b.address?.toLowerCase().includes(q)
    );
  }, [branches, query]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (id: number | typeof ALL_BRANCHES) => {
    setSelectedBranch(id);
    setIsOpen(false);
    setQuery('');
  };

  if (isLoading) {
    return (
      <div className={`flex items-center space-x-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 ${className}`}>
        <span className={`${BRANCH_ICON_WRAPPER} bg-gray-200 dark:bg-gray-600`}>
          <Building size={14} className="text-gray-500 dark:text-gray-400" />
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">Cargando...</span>
      </div>
    );
  }

  if (branches.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((v) => !v);
        }}
        className={`flex items-center space-x-1 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 ${className}`}
        title={label}
      >
        {isAllSelected ? (
          <span className={`${BRANCH_ICON_WRAPPER} bg-blue-100 dark:bg-blue-900/40`}>
            <Layers size={14} className="text-blue-600 dark:text-blue-400" />
          </span>
        ) : (
          (() => {
            const color = getBranchColor(selectedBranch?.id);
            const Icon = getBranchIcon(selectedBranch?.id);
            return (
              <span className={`${BRANCH_ICON_WRAPPER} ${color.bg}`}>
                <Icon size={14} className={color.text} />
              </span>
            );
          })()
        )}
        {/* Mobile: solo iniciales */}
        <span className="md:hidden text-xs font-bold text-gray-700 dark:text-gray-300">
          {shortLabel}
        </span>
        {/* Desktop: nombre completo */}
        <span className="hidden md:inline text-xs font-medium text-gray-700 dark:text-gray-300 max-w-[140px] break-words whitespace-normal">
          {label}
        </span>
        <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="fixed sm:absolute left-0 right-0 sm:left-auto sm:right-0 top-[60px] sm:top-auto mt-0 sm:mt-1 w-full sm:w-72 rounded-none sm:rounded-md shadow-xl sm:shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-50 max-h-[calc(100vh-60px)] sm:max-h-80 flex flex-col">
          {/* Buscador */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar sucursal..."
                className="w-full pl-7 pr-2 py-2 text-sm rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain" role="menu" aria-orientation="vertical">
            {/* Opción: Todas las sucursales (solo si el usuario tiene acceso a >1) */}
            {canSelectAll && (
              <button
                className={`block w-full text-left px-4 py-3 sm:py-2 text-sm border-b border-gray-100 dark:border-gray-700 ${
                  isAllSelected
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(ALL_BRANCHES);
                }}
              >
                <div className="flex items-center">
                  <Layers size={14} className="mr-2 flex-shrink-0" />
                  <span className="font-medium">Todas las sucursales</span>
                  {isAllSelected && (
                    <Check size={14} className="ml-auto text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  )}
                </div>
              </button>
            )}

            {filteredBranches.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                No se encontraron sucursales.
              </p>
            ) : (
              filteredBranches.map((branch) => {
                const color = getBranchColor(branch.id);
                const Icon = getBranchIcon(branch.id);
                const isSelected = !isAllSelected && selectedBranchId === branch.id;
                return (
                  <button
                    key={branch.id}
                    className={`block w-full text-left px-4 py-3 sm:py-2 text-sm border-b border-gray-100 dark:border-gray-700 sm:border-0 ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (branch.id) handleSelect(branch.id);
                    }}
                  >
                    <div className="flex items-center">
                      <span className={`${BRANCH_ICON_WRAPPER} mr-2 ${color.bg}`}>
                        <Icon size={14} className={color.text} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{branch.name}</p>
                        {branch.address && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {branch.address}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Check size={14} className="ml-auto text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
});

BranchSelector.displayName = 'BranchSelector';

export default BranchSelector;
