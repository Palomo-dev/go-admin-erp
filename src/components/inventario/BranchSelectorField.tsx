'use client';

import React, { useMemo } from 'react';
import { useBranch } from '@/lib/context/BranchContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Building2 } from 'lucide-react';

interface BranchSelectorFieldProps {
  /** Valor controlado: branch_id seleccionado en el formulario. */
  value: number | null;
  /** Callback cuando el usuario cambia la sucursal. */
  onChange: (branchId: number | null) => void;
  /** Label del campo. Por defecto "Sucursal". */
  label?: string;
  /** Si es true, el campo es obligatorio y no permite vacío. */
  required?: boolean;
  /** Placeholder cuando no hay sucursal seleccionada. */
  placeholder?: string;
  /** className extra para el contenedor. */
  className?: string;
  /** Si es true, muestra el campo compacto (sin label encima). */
  compact?: boolean;
}

/**
 * Campo de formulario reutilizable para seleccionar la sucursal destino
 * al crear un registro (mesa, factura, venta, etc.).
 *
 * - Si hay una sucursal concreta seleccionada en el contexto global,
 *   se usa como valor inicial del campo.
 * - Si el contexto está en "Todas las sucursales", el usuario debe
 *   elegir explícitamente a qué sucursal pertenece el registro.
 * - El usuario siempre puede cambiar la sucursal en el campo.
 */
export function BranchSelectorField({
  value,
  onChange,
  label = 'Sucursal',
  required = false,
  placeholder = 'Seleccionar sucursal',
  className = '',
  compact = false,
}: BranchSelectorFieldProps) {
  const { branches, selectedBranchId, isAllSelected, isLoading } = useBranch();

  // Valor efectivo: si el formulario no tiene value, usar el del contexto
  const effectiveValue = useMemo(() => {
    if (value !== null && value !== undefined) return value;
    if (!isAllSelected && selectedBranchId) return selectedBranchId;
    return null;
  }, [value, isAllSelected, selectedBranchId]);

  // Sincronizar el valor inicial del formulario con el contexto
  React.useEffect(() => {
    if (value === null || value === undefined) {
      if (!isAllSelected && selectedBranchId) {
        onChange(selectedBranchId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, isAllSelected]);

  const showWarning = isAllSelected && (effectiveValue === null || effectiveValue === undefined);

  if (isLoading) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        {!compact && <Label className="text-sm font-medium">{label}{required && ' *'}</Label>}
        <Select value="" disabled>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Cargando sucursales..." />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        {!compact && <Label className="text-sm font-medium">{label}{required && ' *'}</Label>}
        <div className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-900/20">
          <Building2 className="h-4 w-4 shrink-0" />
          No hay sucursales configuradas
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {!compact && (
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          {label}{required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <Select
        value={effectiveValue?.toString() ?? ''}
        onValueChange={(val) => onChange(val ? Number(val) : null)}
      >
        <SelectTrigger className={`w-full ${showWarning ? 'border-amber-400 dark:border-amber-600' : ''}`}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {branches.filter(b => b.id != null).map((branch) => (
            <SelectItem key={branch.id} value={branch.id!.toString()}>
              <span className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-gray-400" />
                {branch.name}
                {branch.is_main && (
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                    (principal)
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showWarning && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          Estás en "Todas las sucursales". Selecciona a qué sucursal pertenece este registro.
        </p>
      )}
    </div>
  );
}

export default BranchSelectorField;
