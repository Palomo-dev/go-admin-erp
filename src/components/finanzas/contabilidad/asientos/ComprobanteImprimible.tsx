'use client';

/**
 * Comprobante de contabilidad imprimible (Figma «Documento / Comprobante de
 * contabilidad» 2327:128220): empresa · NIT, tipo y número del comprobante,
 * fecha y memo, líneas (cuenta, detalle, tercero, débito, crédito), totales y
 * firmas. Página propia: todavía no pasa por el motor de documentos.
 *
 * Fecha con la zona de la sucursal del asiento (`entry_date` es timestamptz).
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Printer } from 'lucide-react';
import { AvisoTonal, EmptyState, clasesBoton } from '@/components/kit';
import { useFormatDateFor } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { cuadreDe } from '@/lib/finanzas/contabilidad/cuadre';
import { esTipoComprobante, NOMBRE_COMPROBANTE, textoComprobante } from '@/lib/finanzas/contabilidad/comprobante';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import { ContabilidadService, type JournalEntry } from '../ContabilidadService';
import { datosEmpresaComprobante, nitConDigito, type EmpresaComprobante } from './comprobanteEmpresa';

type Estado = 'cargando' | 'listo' | 'noEncontrado' | 'error';
const RAYA = '—';

export function ComprobanteImprimible({ entryId }: { entryId: number }) {
  const t = useTranslations('finanzasContabilidadR3.comprobante');
  const { formatear } = useMonedaOrganizacion();
  const [asiento, setAsiento] = useState<JournalEntry | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaComprobante | null>(null);
  const [sucursal, setSucursal] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>('cargando');
  const { formatDate } = useFormatDateFor(asiento?.branch_id);
  const volver = `/app/finanzas/contabilidad/asientos/${Number.isFinite(entryId) ? entryId : ''}`;
  useCabeceraMovil({ modo: 'page', titulo: t('comprobanteContable'), volverA: volver });

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const data = Number.isFinite(entryId) ? await ContabilidadService.obtenerAsiento(entryId) : null;
      if (!data) {
        setEstado('noEncontrado');
        return;
      }
      setAsiento(data);
      const [org, sede] = await Promise.all([
        datosEmpresaComprobante().catch(() => null),
        ContabilidadService.nombreSucursal(data.branch_id).catch(() => null),
      ]);
      setEmpresa(org);
      setSucursal(sede);
      setEstado('listo');
    } catch (error) {
      console.error('No se pudo cargar el comprobante:', error);
      setEstado('error');
    }
  }, [entryId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (estado === 'cargando') {
    return <p className="p-8 text-sm text-fg-secondary" role="status">{t('cargando')}</p>;
  }
  if (estado === 'noEncontrado' || estado === 'error' || !asiento) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState
          variante={estado === 'error' ? 'error' : 'empty'}
          titulo={estado === 'error' ? undefined : t('noEncontrado')}
          onReintentar={estado === 'error' ? () => void cargar() : undefined}
          accion={{ etiqueta: t('volver'), href: '/app/finanzas/contabilidad/asientos' }}
        />
      </div>
    );
  }

  const numero = textoComprobante(asiento.comprobante_prefijo, asiento.comprobante_numero);
  const tipo = esTipoComprobante(asiento.comprobante_tipo) ? NOMBRE_COMPROBANTE[asiento.comprobante_tipo] : t('comprobanteContable');
  const titulo = numero ? `${tipo} ${numero}` : t('asiento', { numero: `#${asiento.id}` });
  const lineas = asiento.lines ?? [];
  const totales = cuadreDe(lineas);
  const nit = empresa ? nitConDigito(empresa) : null;
  const nombreEmpresa = empresa?.legal_name || empresa?.name || null;

  return (
    <div className="min-h-screen bg-canvas print:bg-surface">
      <div className="flex items-center justify-end gap-3 p-4 lg:justify-between print:hidden">
        {/* En celular «←» es la del MobileHeader del shell (guardrail 44). */}
        <Link href={volver} className={`${clasesBoton({ variante: 'fantasma' })} hidden lg:inline-flex`}>
          <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('volver')}
        </Link>
        <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => window.print()}>
          <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('imprimir')}
        </button>
      </div>

      <article className="mx-auto max-w-[51rem] space-y-6 rounded-xl border border-line bg-surface px-6 py-8 text-fg sm:px-12 print:max-w-none print:rounded-none print:border-0 print:px-0">
        {!asiento.posted && <AvisoTonal tono="advertencia" titulo={t('borrador')} compacto className="print:border print:border-line" />}
        <header className="space-y-2">
          {(nombreEmpresa || nit) && (
            <p className="text-sm text-fg">{[nombreEmpresa, nit ? t('nit', { nit }) : null].filter(Boolean).join(' · ')}</p>
          )}
          <h1 className="text-2xl font-semibold text-fg">{titulo}</h1>
          <p className="text-sm text-fg-secondary">
            {[
              t('fecha', { fecha: formatDate(asiento.entry_date) }),
              asiento.memo ? t('memo', { memo: asiento.memo }) : null,
              sucursal ? t('sucursal', { sucursal }) : null,
            ].filter(Boolean).join(' · ')}
          </p>
        </header>

        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
              <tr>
                <th scope="col" className="px-3 py-2.5">{t('cuenta')}</th>
                <th scope="col" className="px-3 py-2.5">{t('detalle')}</th>
                <th scope="col" className="px-3 py-2.5">{t('tercero')}</th>
                <th scope="col" className="px-3 py-2.5 text-right">{t('debito')}</th>
                <th scope="col" className="px-3 py-2.5 text-right">{t('credito')}</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id} className="border-t border-line align-top">
                  <td className="px-3 py-2.5">
                    <span className="font-mono">{l.account_code}</span>
                    {l.account?.name ? <span className="ml-1">{l.account.name}</span> : null}
                  </td>
                  <td className="px-3 py-2.5">{l.description || RAYA}</td>
                  <td className="px-3 py-2.5">
                    {l.tercero_nit ? (
                      <>
                        {l.tercero_nombre ? <span className="block">{l.tercero_nombre}</span> : null}
                        <span className="font-mono text-xs text-fg-secondary">{l.tercero_nit}</span>
                      </>
                    ) : RAYA}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{Number(l.debit) > 0 ? formatear(l.debit) : ''}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{Number(l.credit) > 0 ? formatear(l.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line bg-subtle font-semibold">
              <tr>
                <td colSpan={3} className="px-3 py-2.5">{t('totales')}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatear(totales.debitos)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatear(totales.creditos)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <footer className="flex flex-wrap gap-x-12 gap-y-6 pt-10 text-sm text-fg-secondary">
          {[t('elaboro'), t('aprobo')].map((rol) => (
            <span key={rol} className="flex items-end gap-2">
              <span aria-hidden="true" className="inline-block w-32 border-b border-fg-secondary" />
              {rol}
            </span>
          ))}
        </footer>
      </article>
    </div>
  );
}
