'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { BranchBadge } from '@/components/kit/BranchBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { normalizarSucursales } from '@/lib/finanzas/metodosPagoAlcance';

/**
 * Sucursales de un método de pago (20261028180000): selector del formulario y
 * chips de la lista. `null` = «Todas» (se guarda NULL en `branch_ids`).
 */
export interface SucursalBasica { id: number; name: string }

const cache = new Map<number, Promise<SucursalBasica[]>>();

export function useSucursalesOrganizacion(organizationId: number | null | undefined): SucursalBasica[] {
  const [lista, setLista] = useState<SucursalBasica[]>([]);
  useEffect(() => {
    if (!organizationId) return;
    let vigente = true;
    if (!cache.has(organizationId)) {
      cache.set(organizationId, Promise.resolve(
        supabase.from('branches').select('id, name').eq('organization_id', organizationId).order('name'),
      ).then(({ data }) => ((data ?? []) as SucursalBasica[])).catch(() => {
        cache.delete(organizationId);
        return [];
      }));
    }
    cache.get(organizationId)!.then((l) => { if (vigente) setLista(l); });
    return () => { vigente = false; };
  }, [organizationId]);
  return lista;
}

/** Valor del selector → valor de `branch_ids` (vacío o todas = NULL). */
export function sucursalesParaGuardar(valor: readonly number[] | null, total?: number): number[] | null {
  const ids = normalizarSucursales(valor ? [...valor] : null);
  if (!ids) return null;
  if (total && ids.length >= total) return null;
  return ids;
}

export function SelectorSucursalesMetodoPago({
  organizationId,
  valor,
  onChange,
}: {
  organizationId: number;
  valor: number[] | null;
  onChange: (valor: number[] | null) => void;
}) {
  const sucursales = useSucursalesOrganizacion(organizationId);
  const todas = !valor || valor.length === 0;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-4" data-testid="selector-sucursales-metodo">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p id="etiqueta-sucursales-metodo" className="text-sm font-medium text-fg">Sucursales</p>
          <p className="text-[13px] leading-[18px] text-fg-secondary">
            {todas
              ? 'Disponible en todas las sucursales.'
              : 'Solo se podrá cobrar con este método en las sucursales elegidas.'}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={todas}
          className={clasesBoton({ variante: todas ? 'secundario' : 'fantasma', tamano: 'sm' })}
          onClick={() => onChange(null)}
        >
          Todas
        </button>
      </div>
      {sucursales.length === 0 ? (
        <p className="text-[13px] leading-[18px] text-fg-secondary">No hay sucursales en la organización.</p>
      ) : (
        <ChipsOpcion
          multiple
          aria-labelledby="etiqueta-sucursales-metodo"
          opciones={sucursales.map((s) => ({ valor: String(s.id), etiqueta: s.name }))}
          valor={(valor ?? []).map(String)}
          onValorChange={(v) => onChange(sucursalesParaGuardar(v.map(Number), sucursales.length))}
        />
      )}
    </div>
  );
}

export function SucursalesMetodoBadges({ organizationId, branchIds }: { organizationId: number; branchIds: unknown }) {
  const sucursales = useSucursalesOrganizacion(organizationId);
  const ids = normalizarSucursales(branchIds);
  if (!ids) return <BranchBadge alcance="todas" tono="neutro" />;
  const nombres = new Map(sucursales.map((s) => [s.id, s.name]));
  return (
    <span className="flex flex-wrap gap-1" data-testid="sucursales-metodo">
      {ids.map((id) => <BranchBadge key={id} alcance="una" tono="neutro" nombre={nombres.get(id) ?? `#${id}`} />)}
    </span>
  );
}
