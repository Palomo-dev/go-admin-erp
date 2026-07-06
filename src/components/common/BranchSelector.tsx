'use client';

import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { Building, ChevronDown, Search, Check, Layers } from 'lucide-react';
import { useBranch, ALL_BRANCHES } from '@/lib/context/BranchContext';

interface BranchSelectorProps {
  organizationId?: number;
  className?: string;
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
        <Building size={16} className="text-gray-500 dark:text-gray-400" />
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
          <Layers size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
        ) : (
          <Building size={16} className="text-gray-700 dark:text-gray-300 flex-shrink-0" />
        )}
        {/* Mobile: solo iniciales */}
        <span className="md:hidden text-xs font-bold text-gray-700 dark:text-gray-300">
          {shortLabel}
        </span>
        {/* Desktop: nombre completo */}
        <span className="hidden md:inline text-xs font-medium text-gray-700 dark:text-gray-300 max-w-[140px] truncate">
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
              filteredBranches.map((branch) => (
                <button
                  key={branch.id}
                  className={`block w-full text-left px-4 py-3 sm:py-2 text-sm border-b border-gray-100 dark:border-gray-700 sm:border-0 ${
                    !isAllSelected && selectedBranchId === branch.id
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
                    <Building size={14} className="mr-2 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{branch.name}</p>
                      {branch.address && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {branch.address}
                        </p>
                      )}
                    </div>
                    {!isAllSelected && selectedBranchId === branch.id && (
                      <Check size={14} className="ml-auto text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});

BranchSelector.displayName = 'BranchSelector';

export default BranchSelector;
