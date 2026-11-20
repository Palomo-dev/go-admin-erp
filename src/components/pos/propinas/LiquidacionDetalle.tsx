'use client';

/**
 * Detalle de una liquidación de propinas (Figma `1087:715627`): reparto,
 * propinas incluidas, pago (egreso de caja, asiento) e historial. «Imprimir
 * comprobante» imprime la hoja con una línea de firma por persona; con
 * `?imprimir=1` (recién liquidada) se abre sola. «Anular liquidación» pide
 * motivo y devuelve el efectivo a la caja (`fn_propinas_liquidacion_anular`).
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, FileText, History, Printer, Users, Wallet } from 'lucide-react';
import {
  AvatarIniciales,
  DataTable,
  DialogoMotivo,
  EmptyState,
  FilaDato,
  ListaDatos,
  PageHeader,
  RowActionsMenu,
  StatusBadge,
  Tarjeta,
  type ColumnaTabla,
} from '@/components/kit';
import { ChipDocumento } from '@/components/kit/documento';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { anularLiquidacionPropinas, pedirDetalleLiquidacion, pedirPermisosPropinas } from '@/lib/pos/propinas/clientePropinas';
import { codigoErrorPropina, type CodigoErrorPropina } from '@/lib/pos/propinas/errores';
import { centavos, numeroEgreso } from '@/lib/pos/propinas/liquidacionLogica';
import { SIN_PERMISOS_PROPINAS, type DetalleLiquidacion, type PermisosPropinasServidor } from '@/lib/pos/propinas/tiposPropinas';
import { useEtiquetasPropinas, useFormatoPropinas } from './formatoPropinas';

const RUTA = '/app/pos/propinas';
const VISIBLES = 10;

export function LiquidacionDetalle({ id }: { id: string }) {
  const t = useTranslations('posPropinas');
  const params = useSearchParams();
  const f = useFormatoPropinas();
  const etiqueta = useEtiquetasPropinas();
  const [d, setD] = useState<DetalleLiquidacion | null>(null);
  const [error, setError] = useState<CodigoErrorPropina | null>(null);
  const [cargando, setCargando] = useState(true);
  const [permisos, setPermisos] = useState<PermisosPropinasServidor>(SIN_PERMISOS_PROPINAS);
  const [todas, setTodas] = useState(false);
  const [anular, setAnular] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);
  const [impreso, setImpreso] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    setError(null);
    pedirDetalleLiquidacion(id)
      .then(setD)
      .catch((e) => setError(codigoErrorPropina(e)))
      .finally(() => setCargando(false));
  }, [id]);

  useEffect(() => cargar(), [cargar]);
  useEffect(() => {
    pedirPermisosPropinas().then(setPermisos).catch(() => setPermisos(SIN_PERMISOS_PROPINAS));
  }, []);

  // Recién liquidada con «Imprimir el comprobante»: una sola vez.
  useEffect(() => {
    if (d && !impreso && params?.get('imprimir') === '1') {
      setImpreso(true);
      window.setTimeout(() => window.print(), 300);
    }
  }, [d, impreso, params]);

  const confirmarAnular = async (motivo: string) => {
    setOcupado(true);
    setErrorAnular(null);
    try {
      await anularLiquidacionPropinas(id, motivo);
      toast.success(t('toast.liquidacionAnulada', { codigo: d?.codigo ?? '' }));
      setAnular(false);
      cargar();
    } catch (e) {
      setErrorAnular(t(`errores.${codigoErrorPropina(e)}`));
    } finally {
      setOcupado(false);
    }
  };

  const migas = [
    { etiqueta: t('pagina.migaPos'), href: '/app/pos' },
    { etiqueta: t('pagina.titulo'), href: `${RUTA}?pestana=liquidaciones` },
    { etiqueta: d?.codigo ?? t('detalle.titulo') },
  ];

  if (!d) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader titulo={t('detalle.titulo')} migas={migas} variante="form" volverA={`${RUTA}?pestana=liquidaciones`} cargando={cargando} />
        {cargando ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : error === 'SIN_PERMISO' ? (
          <EmptyState variante="forbidden" titulo={t('vacios.sinPermisoTitulo')} descripcion={t('vacios.sinPermisoDescripcion')} />
        ) : error === 'LIQUIDACION_INEXISTENTE' ? (
          <EmptyState variante="empty" titulo={t('detalle.noExiste')} accion={{ etiqueta: t('detalle.volver'), href: `${RUTA}?pestana=liquidaciones` }} />
        ) : (
          <EmptyState variante="error" titulo={t('vacios.error')} onReintentar={cargar} />
        )}
      </div>
    );
  }

  const anulada = d.estado === 'anulada';
  const totalAjustes = centavos(d.lineas.reduce((a, l) => a + Math.abs(l.ajuste), 0) / 2);
  const medioTexto = d.medio === 'efectivo' && d.sesion_caja ? t('liquidaciones.efectivoCaja', { caja: d.sesion_caja }) : etiqueta.medio(d.medio);
  const asiento = d.asientos[0];
  const propinas = todas ? d.propinas : d.propinas.slice(0, VISIBLES);

  const columnasPropinas: ColumnaTabla<DetalleLiquidacion['propinas'][number]>[] = [
    {
      id: 'fecha',
      encabezado: t('columnas.fecha'),
      celda: (x) => (
        <div className="flex flex-col whitespace-nowrap">
          <span>{f.dia(x.fecha)}</span>
          <span className="text-xs text-fg-secondary">{f.hora(x.fecha)}</span>
        </div>
      ),
    },
    {
      id: 'documento',
      encabezado: t('columnas.documento'),
      celda: (x) =>
        x.venta?.numero ? (
          <ChipDocumento tipo={x.venta.tipo_numero === 'pedido' ? 'pedido' : 'venta'} numero={x.venta.numero} href={`/app/pos/ventas/${x.venta.id}`} />
        ) : (
          <span className="text-fg-muted">{t('tabla.manual')}</span>
        ),
    },
    { id: 'atendio', encabezado: t('columnas.atendio'), celda: (x) => x.persona.nombre ?? t('sinNombre') },
    { id: 'tipo', encabezado: t('columnas.tipo'), ocultarDebajo: 'md', celda: (x) => etiqueta.tipo(x.tipo) },
    { id: 'monto', encabezado: t('columnas.monto'), variante: 'importe', celda: (x) => f.formatear(x.monto) },
  ];

  const historial: { fecha: string; texto: string }[] = [
    { fecha: d.creada_en, texto: t('detalle.historial.liquidada', { persona: d.creada_por.nombre ?? t('sinNombre') }) },
    ...(d.movimiento_caja
      ? [{ fecha: d.movimiento_caja.fecha, texto: t('detalle.historial.egreso', { numero: numeroEgreso(d.movimiento_caja.id) ?? '', caja: d.movimiento_caja.sesion }) }]
      : []),
    ...d.asientos.map((a) => ({ fecha: a.fecha, texto: t('detalle.historial.asiento', { numero: `${a.prefijo ?? ''}-${a.numero ?? a.id}` }) })),
    ...(d.anulada_en
      ? [{ fecha: d.anulada_en, texto: t('detalle.historial.anulada', { persona: d.anulada_por?.nombre ?? t('sinNombre'), motivo: d.motivo_anulacion ?? '' }) }]
      : []),
    ...(d.reingreso_caja
      ? [{ fecha: d.reingreso_caja.fecha, texto: t('detalle.historial.reingreso', { numero: numeroEgreso(d.reingreso_caja.id) ?? '', caja: d.reingreso_caja.sesion }) }]
      : []),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <div className="print:hidden">
        <PageHeader
          titulo={t('detalle.tituloCodigo', { codigo: d.codigo })}
          variante="form"
          volverA={`${RUTA}?pestana=liquidaciones`}
          migas={migas}
          badge={<StatusBadge estado={d.estado} etiqueta={t(`liquidaciones.estados.${d.estado}`)} />}
          subtitulo={t('detalle.subtitulo', {
            periodo: f.periodo(d.desde, d.hasta) || f.dia(d.creada_en),
            sucursal: d.sucursal?.nombre ?? '',
            persona: d.creada_por.nombre ?? t('sinNombre'),
            fecha: f.fechaHora(d.creada_en),
          })}
          debajo={
            <div className="flex flex-wrap gap-1.5">
              <Badge tono="neutro" apariencia="contorno" tamano="sm">
                {medioTexto}
              </Badge>
              <Badge tono="neutro" apariencia="contorno" tamano="sm">
                {etiqueta.reparto(d.reparto)}
              </Badge>
            </div>
          }
          acciones={
            <>
              <Button variant="outline" className="h-10 gap-2" onClick={() => window.print()}>
                <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('detalle.imprimir')}
              </Button>
              <RowActionsMenu
                orientacion="horizontal"
                tamano="md"
                titulo={d.codigo}
                acciones={[
                  {
                    id: 'anular',
                    etiqueta: t('acciones.anularLiquidacion'),
                    icono: Ban,
                    destructiva: true,
                    onSelect: () => {
                      setErrorAnular(null);
                      setAnular(true);
                    },
                    oculta: anulada,
                    deshabilitada: !permisos.anularLiquidacion,
                    motivo: t('motivos.sinPermisoAnularLiquidacion'),
                  },
                ]}
              />
            </>
          }
          movil={{ titulo: d.codigo, subtitulo: f.periodo(d.desde, d.hasta) }}
        />
      </div>

      {anulada && (
        <p role="status" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text print:hidden">
          {t('detalle.avisoAnulada', { fecha: f.fechaHora(d.anulada_en), motivo: d.motivo_anulacion ?? '' })}
        </p>
      )}

      <Tarjeta titulo={t('detalle.reparto')} icono={Users} sinRelleno>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">{t('detalle.reparto')}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-secondary">
                <th scope="col" className="px-4 py-2 font-medium">{t('liquidar.columnas.persona')}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t('liquidar.columnas.base')}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t('liquidar.columnas.participacion')}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t('liquidar.columnas.calculado')}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t('liquidar.columnas.ajuste')}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{t('liquidar.columnas.aPagar')}</th>
                <th scope="col" className="hidden px-4 py-2 font-medium print:table-cell">{t('detalle.firma')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.lineas.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <AvatarIniciales nombre={l.nombre ?? '?'} tamano="sm" />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-fg">{l.nombre ?? t('sinNombre')}</span>
                        <span className="truncate text-xs text-fg-secondary">{[l.cargo, l.referencia ? t('detalle.ref', { ref: l.referencia }) : null].filter(Boolean).join(' · ')}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-fg-secondary">{f.formatear(l.base)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{Math.round(l.pct)} %</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{f.formatear(l.calculado)}</td>
                  <td className={`px-2 py-2.5 text-right tabular-nums ${l.ajuste === 0 ? 'text-fg-muted' : 'text-warning-text'}`}>{f.formatear(l.ajuste)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-fg">{f.formatear(l.monto)}</td>
                  <td className="hidden w-48 px-4 py-2.5 print:table-cell">
                    <span className="block h-8 border-b border-fg" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.motivo_ajuste && <p className="px-4 pb-3 text-sm text-fg-secondary">{t('detalle.motivoAjuste', { motivo: d.motivo_ajuste })}</p>}
      </Tarjeta>

      <Tarjeta titulo={t('detalle.incluidas', { count: d.cantidad })} icono={FileText} sinRelleno className="print:hidden">
        <DataTable
          etiqueta={t('detalle.incluidas', { count: d.cantidad })}
          columnas={columnasPropinas}
          filas={propinas}
          obtenerId={(x) => x.id}
          estado="listo"
          densidad="compacta"
          tarjetaMovil={(x) => (
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-fg">{x.persona.nombre ?? t('sinNombre')}</span>
                <span className="truncate text-xs text-fg-secondary">{[x.venta?.numero, etiqueta.tipo(x.tipo), f.dia(x.fecha)].filter(Boolean).join(' · ')}</span>
              </div>
              <span className="tabular-nums text-fg">{f.formatear(x.monto)}</span>
            </div>
          )}
        />
        {!todas && d.propinas.length > VISIBLES && (
          <div className="px-4 py-3">
            <Button variant="link" className="h-auto p-0" onClick={() => setTodas(true)}>
              {t('detalle.verTodas', { count: d.propinas.length })}
            </Button>
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo={t('detalle.pago')} icono={Wallet}>
        <ListaDatos>
          <FilaDato etiqueta={t('detalle.totalPropinas')} valor={f.formatear(d.total)} />
          <FilaDato etiqueta={t('detalle.efectivo')} valor={f.formatear(d.efectivo)} sangria={1} />
          <FilaDato etiqueta={t('detalle.banco')} valor={f.formatear(d.banco)} sangria={1} />
          <FilaDato etiqueta={t('detalle.ajustes')} valor={f.formatear(totalAjustes)} />
          <FilaDato etiqueta={t('detalle.pagado')} valor={f.formatear(d.lineas.reduce((a, l) => a + l.monto, 0))} tono="fuerte" tamano="lg" />
          <FilaDato etiqueta={t('detalle.medio')} valor={medioTexto} />
          {d.movimiento_caja && (
            <FilaDato
              etiqueta={t('detalle.egreso')}
              valor={numeroEgreso(d.movimiento_caja.id) ?? ''}
              tono="enlace"
              href={`/app/pos/cajas/${d.movimiento_caja.sesion}/movimientos`}
            />
          )}
          {d.reingreso_caja && (
            <FilaDato
              etiqueta={t('detalle.reingreso')}
              valor={numeroEgreso(d.reingreso_caja.id) ?? ''}
              tono="enlace"
              href={`/app/pos/cajas/${d.reingreso_caja.sesion}/movimientos`}
            />
          )}
          <FilaDato
            etiqueta={t('detalle.asiento')}
            valor={asiento ? `${asiento.prefijo ?? ''}-${asiento.numero ?? asiento.id}` : d.medio === 'efectivo' ? t('detalle.asientoEnCobro') : t('detalle.sinAsiento')}
            tono={asiento ? 'enlace' : 'neutro'}
            href={asiento ? `/app/finanzas/contabilidad/asientos/${asiento.id}` : undefined}
          />
          {d.notas && <FilaDato etiqueta={t('detalle.motivoSinPago')} valor={d.notas} />}
          <FilaDato etiqueta={t('detalle.comprobante')} valor={t('detalle.comprobanteFirmas', { count: d.lineas.length })} />
        </ListaDatos>
      </Tarjeta>

      <Tarjeta titulo={t('detalle.historialTitulo')} icono={History} className="print:hidden">
        <ol className="flex flex-col gap-2 text-sm">
          {historial.map((h, i) => (
            <li key={i} className="flex flex-col justify-between gap-1 sm:flex-row sm:gap-4">
              <span className="tabular-nums text-fg-secondary">{f.fechaHora(h.fecha)}</span>
              <span className="text-fg sm:text-right">{h.texto}</span>
            </li>
          ))}
        </ol>
      </Tarjeta>

      <DialogoMotivo
        abierto={anular}
        onAbiertoChange={(v) => !ocupado && setAnular(v)}
        titulo={t('anularLiquidacion.titulo', { codigo: d.codigo })}
        descripcion={t('anularLiquidacion.descripcion')}
        textoConfirmar={t('anularLiquidacion.confirmar')}
        consecuencias={[
          d.medio === 'efectivo' ? t('anularLiquidacion.consecuenciaCaja', { monto: f.formatear(d.total) }) : t('anularLiquidacion.consecuenciaAsiento'),
          t('anularLiquidacion.consecuenciaPropinas'),
        ]}
        etiquetaMotivo={t('anularV2.motivo')}
        minimo={3}
        cargando={ocupado}
        error={errorAnular}
        icono={Ban}
        onConfirmar={confirmarAnular}
      />
    </div>
  );
}
