'use client';

/**
 * /app/pos/pedidos-online/pagos-sin-pedido — cobros APROBADOS de todas las pasarelas conectadas
 * que no tienen pedido. «Reconstruir» abre el paso 2 con la pasarela, la transacción, la
 * referencia, el valor y la fecha ya puestos.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CircleDollarSign, RefreshCw, Wrench } from 'lucide-react';
import { AvisoTonal, EmptyState, PageHeader, clasesBoton } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { DialogoReconstruirPedido, type PrecargaReconstruir } from '@/components/pos/pedidos-online/manual/DialogoReconstruirPedido';

interface Pago {
  cobro: { transaccionId: string; referencia: string | null; montoCentavos: number | null; fecha: string | null; metodo: string | null };
  conexion: { id: string; nombre: string; proveedor: string };
  sinPrefijo: boolean;
  registradoEn: string;
}

export default function PagosSinPedidoPage() {
  const t = useTranslations('pedidosManuales.sinPedido');
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const { formatear } = useMonedaOrganizacion();
  const { formatDateTime } = useFormatDate();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [precarga, setPrecarga] = useState<PrecargaReconstruir | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/web-orders/pagos-sin-pedido?dias=90');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? t('error'));
      setPagos((json?.pagos ?? []) as Pago[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas px-4 pb-24 pt-4 sm:px-6 lg:gap-5 lg:pt-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={CircleDollarSign}
        cargando={cargando}
        migas={[{ etiqueta: 'POS', href: '/app/pos' }, { etiqueta: t('pedidosOnline'), href: '/app/pos/pedidos-online' }, { etiqueta: t('titulo') }]}
        acciones={
          <button type="button" onClick={() => void cargar()} disabled={cargando} aria-label={t('actualizar')} title={t('actualizar')} className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'w-10 px-0' })}>
            <RefreshCw aria-hidden="true" className={cargando ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
          </button>
        }
      />

      <AvisoTonal tono="informacion" compacto titulo={t('origen')} descripcion={t('origenDetalle')} />
      {error && <AvisoTonal tono="peligro" titulo={error} />}

      {!cargando && !error && pagos.length === 0 ? (
        <EmptyState titulo={t('vacioTitulo')} descripcion={t('vacioDescripcion')} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-subtle text-left text-xs text-fg-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">{t('fecha')}</th>
                <th className="px-3 py-2 font-medium">{t('pasarela')}</th>
                <th className="px-3 py-2 font-medium">{t('referencia')}</th>
                <th className="px-3 py-2 font-medium">{t('transaccion')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('valor')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pagos.map((p) => (
                <tr key={p.cobro.transaccionId}>
                  <td className="px-3 py-2 text-fg">{formatDateTime(p.cobro.fecha ?? p.registradoEn)}</td>
                  <td className="px-3 py-2 text-fg">
                    {p.conexion.nombre}
                    {p.cobro.metodo && <span className="block text-xs text-fg-secondary">{p.cobro.metodo}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-fg">
                    {p.cobro.referencia ?? '—'}
                    {p.sinPrefijo && <span className="block font-sans text-xs text-warning-text">{t('sinPrefijo')}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-fg-secondary">{p.cobro.transaccionId}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg">{formatear((p.cobro.montoCentavos ?? 0) / 100)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                      onClick={() =>
                        setPrecarga({
                          connection_id: p.conexion.id,
                          transaccion: p.cobro.transaccionId,
                          referencia: p.cobro.referencia,
                          valor: (p.cobro.montoCentavos ?? 0) / 100,
                          fecha: p.cobro.fecha,
                        })
                      }
                    >
                      <Wrench aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('reconstruir')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {organization?.id && (
        <DialogoReconstruirPedido
          organizationId={organization.id}
          abierto={!!precarga}
          onAbiertoChange={(v) => !v && setPrecarga(null)}
          precarga={precarga}
          onReconstruido={(r) => {
            setPrecarga(null);
            toast({ title: t('listo', { pedido: r.pedido.order_number }) });
            void cargar();
            router.push(`/app/pos/pedidos-online/${r.pedido.id}`);
          }}
        />
      )}
    </div>
  );
}
