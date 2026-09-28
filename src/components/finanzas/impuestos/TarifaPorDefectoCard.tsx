"use client";

import React, { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { setOrganizationDefaultTax, SIN_TARIFA_POR_DEFECTO } from '@/lib/services/defaultTaxService';
import { formatPercent } from '@/utils/Utils';

interface ImpuestoOpcion {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
  is_active: boolean;
}

interface TarifaPorDefectoCardProps {
  organizationId: number;
  taxes: ImpuestoOpcion[];
  /** Se llama tras guardar para recargar la tabla. */
  onSaved: () => void;
}

/**
 * «Tarifa por defecto para productos sin impuesto asignado»: la marca
 * `is_default` de `organization_taxes` que usa `resolveLineTax` cuando el
 * producto no tiene impuestos propios. Una sola a la vez, o ninguna.
 */
export default function TarifaPorDefectoCard({ organizationId, taxes, onSaved }: TarifaPorDefectoCardProps) {
  const { toast } = useToast();
  const selectId = useId();
  const ayudaId = useId();

  const actual = taxes.find((t) => t.is_default && t.is_active)?.id ?? SIN_TARIFA_POR_DEFECTO;
  const [seleccion, setSeleccion] = useState<string>(actual);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setSeleccion(actual);
  }, [actual]);

  const activos = taxes.filter((t) => t.is_active);
  const hayCambios = seleccion !== actual;

  const guardar = async () => {
    setGuardando(true);
    try {
      await setOrganizationDefaultTax(
        supabase,
        organizationId,
        seleccion === SIN_TARIFA_POR_DEFECTO ? null : seleccion,
      );
      toast({
        title: 'Tarifa por defecto actualizada',
        description:
          seleccion === SIN_TARIFA_POR_DEFECTO
            ? 'Los productos sin impuesto asignado se venderán sin IVA.'
            : 'Los productos sin impuesto asignado usarán esta tarifa.',
      });
      onSaved();
    } catch (error) {
      console.error('Error al guardar la tarifa por defecto:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la tarifa por defecto. Intente de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section
      aria-labelledby={`${selectId}-titulo`}
      className="rounded-lg border border-line bg-surface p-4 sm:p-5"
    >
      <h2 id={`${selectId}-titulo`} className="text-base font-semibold text-fg">
        Tarifa por defecto para productos sin impuesto asignado
      </h2>
      <p id={ayudaId} className="mt-1 text-sm text-fg-secondary">
        Se aplica en facturas, cotizaciones y POS a los productos que no tienen un impuesto propio.
        Si eliges «Ninguna», esas ventas salen sin IVA y verás una advertencia antes de emitir.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={selectId} className="text-sm text-fg">
            Tarifa por defecto
          </Label>
          <Select value={seleccion} onValueChange={setSeleccion} disabled={guardando}>
            <SelectTrigger id={selectId} aria-describedby={ayudaId} className="w-full sm:max-w-md">
              <SelectValue placeholder="Selecciona una tarifa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_TARIFA_POR_DEFECTO}>
                Ninguna — vendo productos excluidos/exentos
              </SelectItem>
              {activos.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({formatPercent(t.rate)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={guardar} disabled={!hayCambios || guardando} size="sm" className="w-full sm:w-auto">
          {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {guardando ? 'Guardando...' : 'Guardar tarifa'}
        </Button>
      </div>
    </section>
  );
}
