'use client';

import { supabase } from '@/lib/supabase/config';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';

export interface LineaVistaPrevia {
  cuenta: string;
  descripcion: string;
  debito: number;
  credito: number;
  tercero_nit?: string | null;
  tercero_nombre?: string | null;
}

export interface VistaPreviaAsiento {
  ok: boolean;
  fallo: string | null;
  memo?: string | null;
  lineas: LineaVistaPrevia[];
  debitos?: number;
  creditos?: number;
}

export async function vistaPreviaAsientoDocumento(
  tipo: 'venta' | 'compra' | 'nota_credito' | 'nota_debito' | 'documento_soporte',
  id: string,
  lineas?: unknown,
): Promise<VistaPreviaAsiento> {
  const { data, error } = await supabase.rpc('fn_vista_previa_asiento_documento', {
    p_tipo: tipo,
    p_id: id,
    p_lineas: lineas ?? null,
  });
  if (error) throw error;
  const previa = (data ?? {}) as Partial<VistaPreviaAsiento>;
  return {
    ok: previa.ok === true,
    fallo: previa.fallo ?? null,
    memo: previa.memo ?? null,
    lineas: Array.isArray(previa.lineas) ? previa.lineas : [],
    debitos: previa.debitos,
    creditos: previa.creditos,
  };
}

export function TablaVistaPrevia({ previa }: { previa: VistaPreviaAsiento }) {
  const { formatear } = useMonedaOrganizacion();
  if (!previa.ok) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        {previa.fallo || 'No se pudo armar el asiento'}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {previa.memo && <p className="text-sm text-gray-600 dark:text-gray-300">{previa.memo}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-1 pr-2 font-medium">Cuenta</th>
            <th className="py-1 pr-2 font-medium">Detalle</th>
            <th className="py-1 pr-2 text-right font-medium">Débito</th>
            <th className="py-1 text-right font-medium">Crédito</th>
          </tr>
        </thead>
        <tbody>
          {previa.lineas.map((l, i) => (
            <tr key={`${l.cuenta}-${i}`} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-1 pr-2 font-mono">{l.cuenta}</td>
              <td className="py-1 pr-2">
                {l.descripcion}
                {l.tercero_nit ? <span className="block text-xs text-gray-500">{l.tercero_nombre ? `${l.tercero_nombre} · ` : ''}{l.tercero_nit}</span> : null}
              </td>
              <td className="py-1 pr-2 text-right font-mono">{l.debito > 0 ? formatear(l.debito) : '—'}</td>
              <td className="py-1 text-right font-mono">{l.credito > 0 ? formatear(l.credito) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
