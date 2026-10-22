'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContabilidadService, type JournalEntry } from '../ContabilidadService';
import { useFormatDateFor } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { esTipoComprobante, NOMBRE_COMPROBANTE, textoComprobante } from '@/lib/finanzas/contabilidad/comprobante';

export function ComprobanteImprimible({ entryId }: { entryId: number }) {
  const router = useRouter();
  const { formatear } = useMonedaOrganizacion();
  const [asiento, setAsiento] = useState<JournalEntry | null>(null);
  const { formatDate } = useFormatDateFor(asiento?.branch_id);

  const cargar = useCallback(async () => {
    const data = await ContabilidadService.obtenerAsiento(entryId);
    if (!data) {
      router.push('/app/finanzas/contabilidad/asientos');
      return;
    }
    setAsiento(data);
  }, [entryId, router]);

  useEffect(() => {
    cargar().catch(() => router.push('/app/finanzas/contabilidad/asientos'));
  }, [cargar, router]);

  if (!asiento) return <p className="p-8 text-sm text-gray-500">Cargando comprobante…</p>;

  const numero = textoComprobante(asiento.comprobante_prefijo, asiento.comprobante_numero);
  const titulo = esTipoComprobante(asiento.comprobante_tipo)
    ? NOMBRE_COMPROBANTE[asiento.comprobante_tipo]
    : 'Comprobante contable';
  const debitos = (asiento.lines ?? []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const creditos = (asiento.lines ?? []).reduce((s, l) => s + (Number(l.credit) || 0), 0);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="flex items-center justify-between gap-3 p-4 print:hidden">
        <Link href={`/app/finanzas/contabilidad/asientos/${asiento.id}`} className="hidden lg:inline-flex">
          <Button variant="ghost" size="icon" aria-label="Volver al asiento">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Imprimir
        </Button>
      </div>
      <article className="mx-auto max-w-3xl px-6 py-8 print:max-w-none print:px-0">
        <header className="border-b border-gray-300 pb-4">
          <p className="text-sm uppercase tracking-wide text-gray-500">{titulo}</p>
          <h1 className="text-2xl font-semibold">{numero ?? `Asiento #${asiento.id}`}</h1>
          <p className="mt-1 text-sm">{formatDate(asiento.entry_date)}</p>
          {asiento.memo && <p className="mt-2">{asiento.memo}</p>}
        </header>
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-2 font-medium">Cuenta</th>
              <th className="py-2 pr-2 font-medium">Detalle</th>
              <th className="py-2 pr-2 font-medium">Tercero</th>
              <th className="py-2 pr-2 text-right font-medium">Débito</th>
              <th className="py-2 text-right font-medium">Crédito</th>
            </tr>
          </thead>
          <tbody>
            {(asiento.lines ?? []).map((linea) => (
              <tr key={linea.id} className="border-b border-gray-200">
                <td className="py-2 pr-2 font-mono">
                  {linea.account_code}
                  {linea.account?.name ? <span className="mt-0.5 block font-sans text-xs text-gray-600">{linea.account.name}</span> : null}
                </td>
                <td className="py-2 pr-2">{linea.description || '—'}</td>
                <td className="py-2 pr-2">
                  {linea.tercero_nit ? (
                    <>
                      {linea.tercero_nombre ? <span className="block">{linea.tercero_nombre}</span> : null}
                      <span className="font-mono text-xs">{linea.tercero_nit}</span>
                    </>
                  ) : '—'}
                </td>
                <td className="py-2 pr-2 text-right font-mono">{linea.debit > 0 ? formatear(linea.debit) : '—'}</td>
                <td className="py-2 text-right font-mono">{linea.credit > 0 ? formatear(linea.credit) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-2 text-right font-medium">Totales</td>
              <td className="py-2 pr-2 text-right font-mono font-medium">{formatear(debitos)}</td>
              <td className="py-2 text-right font-mono font-medium">{formatear(creditos)}</td>
            </tr>
          </tfoot>
        </table>
      </article>
    </div>
  );
}
