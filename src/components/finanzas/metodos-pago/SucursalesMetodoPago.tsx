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
export interface SucursalBasica { id: number; name: string; is_active?: boolean | null }

const cache = new Map<number, Promise<SucursalBasica[]>>();

export function useSucursalesOrganizacion(organizationId: number | null | undefined): SucursalBasica[] {
  const [lista, setLista] = useState<SucursalBasica[]>([]);
  useEffect(() => {
    if (!organizationId) return;
    let vigente = true;
    if (!cache.has(organizationId)) {
      cache.set(organizationId, Promise.resolve(
        supabase.from('branches').select('id, name, is_active').eq('organization_id', organizationId).order('name'),
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

/** ¿Sucursal activa? (`is_active` ausente o NULL cuenta como activa, como antes.) */
export const sucursalActiva = (s: SucursalBasica): boolean => s.is_active !== false;

/**
 * Opciones del selector: las sucursales activas y, de las inactivas, solo las
 * que el método ya tiene marcadas (se muestran con «· inactiva» para poder quitarlas).
 */
export function opcionesSucursalesMetodo(sucursales: readonly SucursalBasica[], valor: readonly number[] | null) {
  const marcadas = new Set(valor ?? []);
  return sucursales
    .filter((s) => sucursalActiva(s) || marcadas.has(s.id))
    .map((s) => ({ valor: String(s.id), etiqueta: sucursalActiva(s) ? s.name : `${s.name} · inactiva`, inactiva: !sucursalActiva(s) }));
}

/**
 * Valor del selector → valor de `branch_ids` (vacío = NULL). `total` (número de
 * sucursales activas) o `activas` (sus ids): con todas las activas marcadas y
 * ninguna inactiva, se guarda NULL («Todas»).
 */
export function sucursalesParaGuardar(valor: readonly number[] | null, total?: number | readonly number[]): number[] | null {
  const ids = normalizarSucursales(valor ? [...valor] : null);
  if (!ids) return null;
  if (Array.isArray(total)) {
    const activas = total as readonly number[];
    if (activas.length > 0 && ids.length === activas.length && activas.every((id) => ids.includes(id))) return null;
    return ids;
  }
  if (typeof total === 'number' && total > 0 && ids.length >= total) return null;
  return ids;
}

/** Texto del aviso cuando la org tiene una sola sucursal activa (marcarla equivale a «Todas»). */
export const AVISO_UNICA_SUCURSAL = 'Con una sola sucursal, el método queda disponible en todas';

/** ¿Mostrar el aviso de sucursal única? Solo con exactamente una sucursal activa. */
export const hayUnicaSucursalActiva = (sucursales: readonly SucursalBasica[]): boolean =>
  sucursales.filter(sucursalActiva).length === 1;

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
  const opciones = opcionesSucursalesMetodo(sucursales, valor);
  const activas = sucursales.filter(sucursalActiva).map((s) => s.id);
  const inactivasMarcadas = opciones.filter((o) => o.inactiva);
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
      {hayUnicaSucursalActiva(sucursales) && (
        <p className="text-[13px] leading-[18px] text-fg-secondary" data-testid="aviso-sucursal-unica">
          {AVISO_UNICA_SUCURSAL}
        </p>
      )}
      {inactivasMarcadas.length > 0 && (
        <p role="status" className="text-[13px] leading-[18px] text-warning-text" data-testid="aviso-sucursales-inactivas">
          {inactivasMarcadas.length === 1
            ? `${inactivasMarcadas[0].etiqueta.replace(' · inactiva', '')} está inactiva: el método no se ofrece ahí mientras siga así.`
            : `${inactivasMarcadas.length} sucursales marcadas están inactivas: el método no se ofrece ahí mientras sigan así.`}
        </p>
      )}
      {opciones.length === 0 ? (
        <p className="text-[13px] leading-[18px] text-fg-secondary">No hay sucursales activas en la organización.</p>
      ) : (
        <ChipsOpcion
          multiple
          aria-labelledby="etiqueta-sucursales-metodo"
          opciones={opciones.map(({ valor: v, etiqueta }) => ({ valor: v, etiqueta }))}
          valor={(valor ?? []).map(String)}
          onValorChange={(v) => onChange(sucursalesParaGuardar(v.map(Number), activas))}
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
