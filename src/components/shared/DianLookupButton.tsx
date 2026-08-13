'use client';

/**
 * DianLookupButton - Boton reutilizable para consultar DIAN/RUES
 * y autocompletar datos de cliente/proveedor.
 *
 * Se usa junto al campo de numero de documento en formularios.
 * Llama a /api/dian/lookup (server route) que oculta las API keys.
 *
 * Props:
 * - documentType: tipo de documento interno del ERP (national_id, tax_id, etc.)
 * - documentNumber: numero de documento (sin DV)
 * - onResult: callback con los datos normalizados para autocompletar el formulario
 * - variant: "button" (boton explicito) | "icon" (solo icono junto al input)
 * - disabled: deshabilitar consulta
 * - className: clases adicionales
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Search, Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DianNormalizedData } from '@/lib/services/dianLookupService';

interface DianLookupButtonProps {
  documentType: string;
  documentNumber: string;
  organizationId?: number;
  onResult: (data: DianNormalizedData, provider: string, fromCache: boolean) => void;
  variant?: 'button' | 'icon';
  disabled?: boolean;
  className?: string;
  label?: string;
}

export function DianLookupButton({
  documentType,
  documentNumber,
  organizationId,
  onResult,
  variant = 'button',
  disabled = false,
  className = '',
  label = 'Consultar DIAN',
}: DianLookupButtonProps) {
  const [loading, setLoading] = useState(false);

  const puedeConsultar = !disabled && !loading && documentNumber && documentNumber.length >= 4;

  const handleConsultar = async () => {
    if (!documentNumber || documentNumber.length < 4) {
      toast.error('Ingrese un numero de documento valido (minimo 4 digitos)');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/dian/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType, documentNumber, organizationId }),
      });

      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'No se encontro informacion para este documento');
        return;
      }

      const providerLabel = data.provider === 'verifik' ? 'Verifik' : 'CoreSoft';
      const cacheLabel = data.fromCache ? ' (cache)' : '';
      toast.success(`Datos obtenidos desde ${providerLabel}${cacheLabel}`);

      onResult(data.data, data.provider, data.fromCache);
    } catch (err: unknown) {
      console.error('Error consultando DIAN:', err);
      toast.error('Error de conexion al consultar DIAN/RUES');
    } finally {
      setLoading(false);
    }
  };

  if (variant === 'icon') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleConsultar}
        disabled={!puedeConsultar}
        className={`h-10 w-10 shrink-0 ${className}`}
        title={label}
        aria-label={label}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleConsultar}
      disabled={!puedeConsultar}
      className={`shrink-0 ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Consultando...
        </>
      ) : (
        <>
          <Building2 className="h-4 w-4 mr-2" />
          {label}
        </>
      )}
    </Button>
  );
}

/**
 * HabeasDataCheckbox - Checkbox opcional de autorizacion de tratamiento de datos
 * Cumple con Ley 1581 de 2012 (Habeas Data).
 */
interface HabeasDataCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function HabeasDataCheckbox({ checked, onChange, className = '' }: HabeasDataCheckboxProps) {
  return (
    <label className={`flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
      />
      <span>
        Autorizo la consulta de mi informacion en DIAN y RUES para fines de
        facturacion electronica y cumplimiento tributario (Ley 1581 de 2012).
      </span>
    </label>
  );
}
