'use client';

/**
 * «Nueva devolución · buscar la venta» (Figma `874:577989`). Busca en el
 * servidor (`GET /api/pos/devoluciones/ventas`) por número de factura,
 * cliente, documento o teléfono. Una venta con devoluciones previas sigue
 * apareciendo mientras le queden unidades; la que ya se devolvió entera se ve
 * sin «Elegir». Elegir abre «Crear devolución».
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Undo2 } from 'lucide-react';
import { AvisoTonal, EmptyState, PanelAdaptable, SearchInput, StatusBadge } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { BADGE_ESTADO_VENTA } from '@/lib/pos/ventas/estadoVenta';
import { estadoVentaParaDevolver } from '@/lib/pos/devoluciones/presentacionDevoluciones';
import { ErrorPeticionDevoluciones, pedirVentasParaDevolver } from '@/lib/pos/devoluciones/clienteDevoluciones';
import type { VentaParaDevolver } from '@/lib/pos/devoluciones/listadoServidor';

export interface NuevaDevolucionDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Sucursal del selector del header (null = todas las visibles). */
  sucursal: number | null;
  onElegir: (venta: VentaParaDevolver) => void;
}

export function NuevaDevolucionDialog({ abierto, onAbiertoChange, sucursal, onElegir }: NuevaDevolucionDialogProps) {
  const t = useTranslations('posDevoluciones.nueva');
  const tVentas = useTranslations('posVentas.estados');
  const { formatear } = useMonedaOrganizacion();
  const { timezone } = useFormatDate();
  const locale = useLocaleIntl();
  const [busqueda, setBusqueda] = useState('');
  const [ventas, setVentas] = useState<VentaParaDevolver[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!abierto) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);
    pedirVentasParaDevolver(busqueda, sucursal, control.signal)
      .then((v) => setVentas(v))
      .catch((e) => {
        if (control.signal.aborted) return;
        setError(e instanceof ErrorPeticionDevoluciones ? e.codigo : 'lectura_fallida');
      })
      .finally(() => !control.signal.aborted && setCargando(false));
    return () => control.abort();
  }, [abierto, busqueda, sucursal, intento]);

  useEffect(() => {
    if (!abierto) {
      setBusqueda('');
      setVentas(null);
    }
  }, [abierto]);

  const fecha = (v: string) => formatDateTimeInTz(v, timezone, { locale, day: '2-digit', month: '2-digit', year: 'numeric' });
  const cantidad = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(v);

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Undo2}
      ancho={672}
      pantallaCompletaMovil
      pie={
        <Button variant="outline" className="h-10" onClick={() => onAbiertoChange(false)}>
          {t('cancelar')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscar')} etiqueta={t('buscar')} cargando={cargando} atajo={false} autoFocus />

        {error ? (
          <EmptyState
            compacto
            variante={error === 'sin_permiso' ? 'forbidden' : 'error'}
            titulo={error === 'sin_permiso' ? t('sinPermiso') : t('error')}
            onReintentar={error === 'sin_permiso' ? undefined : () => setIntento((n) => n + 1)}
          />
        ) : ventas === null ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        ) : ventas.length === 0 ? (
          <EmptyState compacto variante={busqueda ? 'search' : 'empty'} titulo={t('vacio')} termino={busqueda || undefined} />
        ) : (
          <ul className="flex flex-col gap-2" aria-label={t('titulo')}>
            {ventas.map((v) => {
              const estado = estadoVentaParaDevolver(v.unidades, v.devueltas);
              const numero = v.numero ?? t('sinNumero');
              const cliente = v.cliente?.nombre ?? t('clienteGenerico');
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {numero} · {cliente}
                    </p>
                    <p className="text-xs text-fg-secondary">
                      {t('resumen', { fecha: fecha(v.fecha), productos: v.productos, total: formatear(v.total) })}
                      {v.devueltas > 0 && estado !== 'devuelta' ? ` · ${t('devueltasN', { n: cantidad(v.devueltas), count: v.devueltas })}` : ''}
                    </p>
                  </div>
                  <StatusBadge estado={BADGE_ESTADO_VENTA[estado]} etiqueta={tVentas(estado)} />
                  {estado === 'devuelta' ? (
                    <span className="text-xs text-fg-muted">{t('yaDevuelta')}</span>
                  ) : (
                    <Button variant="outline" size="sm" className="h-8" onClick={() => onElegir(v)} aria-label={t('elegirDe', { numero, cliente })}>
                      {t('elegir')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <AvisoTonal tono="informacion" titulo={t('aviso')} compacto />
      </div>
    </PanelAdaptable>
  );
}
