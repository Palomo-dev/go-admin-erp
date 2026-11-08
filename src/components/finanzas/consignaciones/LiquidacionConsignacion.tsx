'use client';

/**
 * Liquidación de una nota de consignación (Figma `2335:139356`, captura
 * `docs/design/figma/88-terceros-consignaciones-liquidacion.png`).
 *
 * Por producto: entregado, vendido y devuelto (lo que reporta el consignatario),
 * en su poder y la venta al precio reportado (con impuestos incluidos). Abajo:
 * venta reportada, comisión pactada y neto por cobrar. «Facturar y cerrar» →
 * `POST /api/consignaciones/[id]/liquidar`: lo devuelto vuelve a tu bodega, lo
 * vendido se factura con la factura de venta de siempre (y su envío a la DIAN)
 * y la comisión queda como gasto contra la cuenta por cobrar. Una liquidación
 * «por facturar» (la factura no se pudo emitir) ofrece «Facturar» otra vez.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ClipboardList, Receipt } from 'lucide-react';
import {
  AvisoTonal,
  CampoNumero,
  EmptyState,
  FilaDato,
  PageHeader,
  StatusBadge,
  Tarjeta,
  clasesBoton,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { electronicInvoicingService } from '@/lib/services/electronicInvoicingService';
import {
  BADGE_ESTADO_NOTA,
  RUTA_CONSIGNACIONES,
  enSuPoder,
  liquidacionValida,
  resumenLiquidacion,
  validarLineaLiquidacion,
  type LineaLiquidacion,
  type NotaConsignacion,
} from '@/lib/finanzas/consignaciones/consignaciones';
import { ErrorPeticionSaldoFavor, nuevaClaveIdempotencia } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { consignacionesService, type ResultadoLiquidarCliente } from './consignacionesService';

const NS = 'finanzasTercerosR4.consignaciones';
const RUTA_FACTURA = '/app/finanzas/facturas-venta';

export function LiquidacionConsignacion({ notaId }: { notaId: string }) {
  const t = useTranslations(NS);
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const fmt = moneda.formatear;
  const entero = useFormatoEntero();
  const { formatDate } = useFormatDate();

  const [nota, setNota] = useState<NotaConsignacion | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [lineas, setLineas] = useState<LineaLiquidacion[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoLiquidarCliente | null>(null);
  const clave = useRef(nuevaClaveIdempotencia('liquidar'));

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    consignacionesService
      .detalle(notaId)
      .then((r) => {
        if (!vigente) return;
        setPendiente(r.pendiente);
        setNota(r.nota);
        setError(null);
        setLineas((r.nota?.lineas ?? []).map((l) => ({ lineaId: l.id, vendido: 0, precio: 0, devuelto: 0 })));
        clave.current = nuevaClaveIdempotencia('liquidar');
      })
      .catch((e) => vigente && setError(e instanceof ErrorPeticionSaldoFavor ? String(e.codigo) : 'error_desconocido'));
    return () => {
      vigente = false;
    };
  }, [notaId, recarga]);

  const porLinea = useMemo(() => new Map((nota?.lineas ?? []).map((l) => [l.id, l])), [nota]);
  const resumen = resumenLiquidacion(lineas, nota?.comisionPct ?? 0);
  const valida = liquidacionValida(lineas, porLinea);
  const porFacturar = nota?.liquidaciones.find((q) => q.estado === 'por_facturar') ?? null;
  const cambiar = (id: string, campo: 'vendido' | 'precio' | 'devuelto', v: number | null) =>
    setLineas((ls) => ls.map((l) => (l.lineaId === id ? { ...l, [campo]: v ?? 0 } : l)));

  const despues = async (r: ResultadoLiquidarCliente) => {
    setResultado(r);
    if (r.enviarDian && r.facturaId) {
      const envio = await electronicInvoicingService.sendToFactus(r.facturaId, getOrganizationId());
      if (!envio.success) toastError(t('liquidar.dianError'));
    }
    if (r.estado === 'liquidada') toastSuccess(t('liquidar.exito', { neto: fmt(r.neto) }));
    else if (r.errorFactura) toastError(t('liquidar.porFacturar'));
    recargar();
  };

  const liquidar = async () => {
    if (!nota || !valida) return;
    setEnviando(true);
    try {
      const r = await consignacionesService.liquidar(nota.id, {
        lineas: lineas
          .filter((l) => l.vendido > 0 || l.devuelto > 0)
          .map((l) => ({ linea_id: l.lineaId, vendido: l.vendido, precio: l.precio, devuelto: l.devuelto })),
        claveIdempotencia: clave.current,
      });
      await despues(r);
    } catch (e) {
      toastError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  const facturarDeNuevo = async () => {
    if (!porFacturar) return;
    setEnviando(true);
    try {
      await despues(await consignacionesService.facturar(porFacturar.id, nuevaClaveIdempotencia('facturar')));
    } catch (e) {
      toastError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  if (pendiente) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader titulo={t('titulo')} icono={ClipboardList} volverA={RUTA_CONSIGNACIONES} />
        <AvisoTonal tono="advertencia" rol="status" titulo={t('pendiente.titulo')} descripcion={t('pendiente.descripcion')} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader titulo={t('titulo')} icono={ClipboardList} volverA={RUTA_CONSIGNACIONES} />
        <EmptyState
          titulo={error === 'nota_no_encontrada' ? t('liquidar.noEncontrada') : t('errorCarga')}
          descripcion={error !== 'error_desconocido' && error !== 'nota_no_encontrada' ? textoErrorSaldo(t, new ErrorPeticionSaldoFavor(error, 0)) : undefined}
          accion={{ etiqueta: t('acciones.reintentar'), onClick: recargar }}
        />
      </div>
    );
  }

  const subtitulo = nota
    ? [nota.consignatario, nota.ubicacion, formatDate(nota.fecha)].filter(Boolean).join(' · ')
    : undefined;
  const puedeLiquidar = permisos.crear && !!nota && nota.estado !== 'liquidada' && !porFacturar;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={nota ? t('liquidar.titulo', { numero: nota.numero }) : t('titulo')}
        subtitulo={subtitulo}
        icono={ClipboardList}
        cargando={!nota}
        volverA={RUTA_CONSIGNACIONES}
        badge={nota ? <StatusBadge estado={BADGE_ESTADO_NOTA[nota.estado]} etiqueta={t(`estados.${nota.estado}`)} tamano="md" /> : undefined}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.consignacion'), href: RUTA_CONSIGNACIONES }, { etiqueta: nota?.numero ?? '…' }]}
        movil={{
          menu: [
            { id: 'facturar', etiqueta: t('acciones.facturar'), icono: Receipt, onSelect: () => void facturarDeNuevo(), oculta: !(porFacturar && permisos.crear), deshabilitada: enviando },
            {
              id: 'liquidar',
              etiqueta: enviando ? t('liquidar.procesando') : t('acciones.facturarYCerrar'),
              icono: Receipt,
              onSelect: () => void liquidar(),
              oculta: (porFacturar && permisos.crear) || !puedeLiquidar,
              deshabilitada: !valida || enviando,
            },
          ],
        }}
        acciones={
          porFacturar && permisos.crear ? (
            <button type="button" onClick={() => void facturarDeNuevo()} disabled={enviando} className={clasesBoton({ variante: 'primario' })}>
              <Receipt aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('acciones.facturar')}
            </button>
          ) : puedeLiquidar ? (
            <button type="button" onClick={() => void liquidar()} disabled={!valida || enviando} className={clasesBoton({ variante: 'primario' })}>
              <Receipt aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {enviando ? t('liquidar.procesando') : t('acciones.facturarYCerrar')}
            </button>
          ) : null
        }
      />

      {porFacturar && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('liquidar.porFacturarTitulo')}
          descripcion={t('liquidar.porFacturarDescripcion', { venta: fmt(porFacturar.venta) })}
          accion={porFacturar.facturaId ? { etiqueta: t('liquidar.verFactura'), href: `${RUTA_FACTURA}/${porFacturar.facturaId}` } : undefined}
        />
      )}
      {resultado?.estado === 'liquidada' && resultado.facturaId && (
        <AvisoTonal
          tono="exito"
          titulo={t('liquidar.cerradaTitulo')}
          descripcion={t('liquidar.cerradaDescripcion', { factura: resultado.facturaNumero ?? '—', neto: fmt(resultado.neto) })}
          accion={{ etiqueta: t('liquidar.verFactura'), href: `${RUTA_FACTURA}/${resultado.facturaId}` }}
        />
      )}

      <Tarjeta sinRelleno>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
              <tr>
                <th className="px-3 py-2">{t('columnas.producto')}</th>
                <th className="px-3 py-2 text-right">{t('columnas.entregado')}</th>
                <th className="w-28 px-3 py-2 text-right">{t('columnas.vendido')}</th>
                <th className="w-28 px-3 py-2 text-right">{t('columnas.devuelto')}</th>
                <th className="px-3 py-2 text-right">{t('columnas.enSuPoder')}</th>
                <th className="w-36 px-3 py-2 text-right">{t('columnas.precio')}</th>
                <th className="px-3 py-2 text-right">{t('columnas.venta')}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(nota?.lineas ?? []).map((l) => {
                const e = lineas.find((x) => x.lineaId === l.id) ?? { lineaId: l.id, vendido: 0, precio: 0, devuelto: 0 };
                const fallo = validarLineaLiquidacion(e, l);
                const editable = puedeLiquidar && enSuPoder(l) > 0;
                const restante = enSuPoder(l) - e.vendido - e.devuelto;
                return (
                  <tr key={l.id} className="border-t border-line align-top">
                    <td className="px-3 py-2">
                      <span className="block text-fg">{l.producto}</span>
                      {fallo && (
                        <span role="alert" className="text-xs text-danger-text">
                          {t(`liquidar.errores.${fallo}`)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{entero(l.entregado)}</td>
                    <td className="px-3 py-2 text-right">
                      {editable ? (
                        <CampoNumero aria-label={t('liquidar.vendidoDe', { producto: l.producto })} valor={e.vendido || null} onValorChange={(v) => cambiar(l.id, 'vendido', v)} minimo={0} decimales={3} alinear="derecha" tamano="sm" />
                      ) : (
                        entero(l.vendido)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editable ? (
                        <CampoNumero aria-label={t('liquidar.devueltoDe', { producto: l.producto })} valor={e.devuelto || null} onValorChange={(v) => cambiar(l.id, 'devuelto', v)} minimo={0} decimales={3} alinear="derecha" tamano="sm" />
                      ) : (
                        entero(l.devuelto)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{entero(editable ? Math.max(0, restante) : enSuPoder(l))}</td>
                    <td className="px-3 py-2 text-right">
                      {editable ? (
                        <CampoNumero aria-label={t('liquidar.precioDe', { producto: l.producto })} valor={e.precio || null} onValorChange={(v) => cambiar(l.id, 'precio', v)} minimo={0} alinear="derecha" tamano="sm" />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(e.vendido * e.precio)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {puedeLiquidar && (
        <Tarjeta titulo={t('liquidar.resumen')}>
          <div className="flex flex-col">
            <FilaDato etiqueta={t('liquidar.ventaReportada')} valor={fmt(resumen.venta)} />
            <FilaDato etiqueta={t('liquidar.comision', { pct: nota?.comisionPct ?? 0 })} valor={`(${fmt(resumen.comision)})`} />
            <FilaDato etiqueta={t('liquidar.neto')} valor={fmt(resumen.neto)} tono="exito" />
          </div>
        </Tarjeta>
      )}

      {puedeLiquidar && <AvisoTonal tono="informacion" titulo={t('liquidar.alCerrarTitulo')} descripcion={t('liquidar.alCerrar')} />}

      {nota && nota.liquidaciones.length > 0 && (
        <Tarjeta titulo={t('liquidar.anteriores')}>
          <ul className="flex flex-col divide-y divide-line">
            {nota.liquidaciones.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-fg">{formatDate(q.creada)}</span>
                <span className="tabular-nums text-fg-secondary">{t('liquidar.lineaAnterior', { venta: fmt(q.venta), comision: fmt(q.comision), neto: fmt(q.neto) })}</span>
                {q.facturaId ? (
                  <Link href={`${RUTA_FACTURA}/${q.facturaId}`} className="text-brand-text underline-offset-2 hover:underline">
                    {q.facturaNumero ?? t('liquidar.verFactura')}
                  </Link>
                ) : (
                  <span className="text-fg-muted">{t('liquidar.sinFactura')}</span>
                )}
                <StatusBadge estado={q.estado === 'liquidada' ? 'completado' : 'pendiente'} etiqueta={t(`estadosLiquidacion.${q.estado}`)} />
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}
