'use client';

/**
 * Liquidación al consignante (Figma R5 `2407:147372`, captura
 * `docs/design/figma/89-consignacion-recibida-05-liquidacion-al-consignante.png`).
 * Separa precio de venta, precio pactado, lo del dueño, la remuneración,
 * descuentos e IVA, con la MISMA fórmula de la base (`vistaLiquidacion`).
 * Ronda 2 del Contador:
 * - la remuneración se reconoce cuando se devenga (Ronda 3): al vender ya quedó con
 *   cada venta; con obligación posterior, al cumplirse, con evidencia. La
 *   liquidación nunca la reconoce por su fecha;
 * - al liquidar se resuelven por separado las retenciones de la OPERACIÓN y las de
 *   la REMUNERACIÓN, con las reglas configuradas (se ven en el historial);
 * - el saldo del dueño queda en 281510 y se paga por Dinero de terceros; nunca una
 *   compra ni un documento soporte fabricados;
 * - los derechos frente al dueño (devoluciones de lo ya liquidado) solo se
 *   descuentan con el acuerdo escrito; si no habrá otra liquidación, se cobran;
 * - si la remuneración se factura aparte, la liquidación no sustituye esa factura;
 * - IVA y retenciones (por pago o abono, con la calidad del mandante) no se
 *   eligen: quedan como pendiente contable visible.
 * «Anular» la última liquidación, con motivo (contra-asiento).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, Receipt } from 'lucide-react';
import { AvisoTonal, DialogoMotivo, FilaDato, FormField, ListaDatos, PageHeader, StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { toastSuccess } from '@/components/ui/use-toast';
import { ErrorPeticionSaldoFavor, nuevaClaveIdempotencia } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { textoErrorConsignacion } from './textoErrorConsignacion';
import { RUTA_CONSIGNACIONES_INVENTARIO, rutaRecibida, vistaLiquidacion, type NotaRecibida } from '@/lib/inventario/consignaciones/recibidas';
import { consignacionesRecibidasService } from './consignacionesRecibidasService';

const NS = 'consignacionesR4';
/** Rondas 5 y 6 del Contador: errores nuevos de la liquidación (orden de aplicación). */
const NS_R5 = 'consignacionesR5';
const NS_R6 = 'consignacionesR6';

export function LiquidacionAlConsignante({ notaId }: { notaId: string }) {
  const t = useTranslations(NS);
  const tR5 = useTranslations(NS_R5);
  const tR6 = useTranslations(NS_R6);
  const router = useRouter();
  const permisos = usePermisosFinanzas();
  const fmt = useMonedaOrganizacion().formatear;
  const entero = useFormatoEntero();
  const { formatDate } = useFormatDate();
  const [nota, setNota] = useState<NotaRecibida | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [anular, setAnular] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [descontar, setDescontar] = useState(false);
  const [acuerdo, setAcuerdo] = useState('');
  const clave = useRef(nuevaClaveIdempotencia('consignacion-liquidar'));

  useEffect(() => {
    let vigente = true;
    consignacionesRecibidasService
      .detalle(notaId)
      .then((r) => vigente && (setPendiente(r.pendiente), setNota(r.nota), setError(null)))
      .catch((e) => vigente && setError(e instanceof ErrorPeticionSaldoFavor ? textoErrorSaldo(t, e) : t('errores.error_desconocido')));
    return () => {
      vigente = false;
    };
  }, [notaId, recarga, t]);

  const lineas = useMemo(() => (nota?.lineas ?? []).filter((l) => l.sinLiquidar.cantidad !== 0), [nota]);
  const vista = useMemo(
    () =>
      nota
        ? vistaLiquidacion(
            lineas.map((l) => ({ cantidad: l.sinLiquidar.cantidad, venta: l.sinLiquidar.venta, pactado: l.sinLiquidar.pactado, precioLiquidacion: l.precioLiquidacion })),
            nota,
          )
        : null,
    [lineas, nota],
  );
  const ultima = nota?.liquidaciones.find((q) => q.estado !== 'anulada') ?? null;
  const derechos = nota?.derechosFrenteAlDueno ?? 0;
  const faltaAcuerdo = descontar && acuerdo.trim().length < 5;
  const intermediacion = nota?.contrato === 'intermediacion';
  const puedeLiquidar = permisos.crear && intermediacion && !!vista && vista.dueno > 0 && !vista.bajoPrecio && !pendiente && !faltaAcuerdo;

  const liquidar = async () => {
    if (!puedeLiquidar) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await consignacionesRecibidasService.liquidar(notaId, {
        clave_idempotencia: clave.current,
        descontar_derechos: descontar,
        acuerdo: descontar ? acuerdo.trim() : null,
      });
      toastSuccess(t('liquidar.exito', { valor: fmt(r.porPagar) }));
      clave.current = nuevaClaveIdempotencia('consignacion-liquidar');
      router.push(rutaRecibida(notaId));
    } catch (e) {
      setError(textoErrorConsignacion(t, tR5, e, tR6));
    } finally {
      setEnviando(false);
    }
  };

  const confirmarAnular = useCallback(
    async (motivo: string) => {
      if (!ultima) return;
      await consignacionesRecibidasService.anularLiquidacion(ultima.id, motivo);
      toastSuccess(t('liquidar.anulada'));
      setAnular(false);
      setRecarga((n) => n + 1);
    },
    [ultima, t],
  );

  const titulo = nota ? t('liquidar.titulo', { numero: nota.numero }) : '…';

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={titulo}
        variante="detail"
        icono={Receipt}
        cargando={!nota && !error && !pendiente}
        volverA={rutaRecibida(notaId)}
        subtitulo={nota ? t('liquidar.subtitulo', { consignante: nota.consignante, contrato: t(`condiciones.contratos.${nota.contrato}`) }) : undefined}
        migas={[
          { etiqueta: t('migas.inventario'), href: '/app/inventario' },
          { etiqueta: t('migas.consignaciones'), href: `${RUTA_CONSIGNACIONES_INVENTARIO}?pestana=recibidas` },
          { etiqueta: nota ? `${nota.numero} · ${t('liquidar.miga')}` : '…' },
        ]}
        acciones={
          <>
            {ultima && permisos.anular && (
              <button type="button" onClick={() => setAnular(true)} className={clasesBoton({ variante: 'secundario' })}>
                <Ban aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('liquidar.anularUltima')}
              </button>
            )}
            {permisos.crear && (
              <button type="button" onClick={() => void liquidar()} disabled={!puedeLiquidar || enviando} className={clasesBoton({ variante: 'primario' })}>
                <Receipt aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {enviando ? t('liquidar.procesando') : t('liquidar.confirmar')}
              </button>
            )}
          </>
        }
        movil={{
          titulo: nota?.numero,
          subtitulo: t('liquidar.miga'),
          menu: [
            { id: 'liquidar', etiqueta: t('liquidar.confirmar'), icono: Receipt, onSelect: () => void liquidar(), oculta: !permisos.crear, deshabilitada: !puedeLiquidar || enviando },
            { id: 'anular', etiqueta: t('liquidar.anularUltima'), icono: Ban, onSelect: () => setAnular(true), oculta: !(ultima && permisos.anular) },
          ],
        }}
      />

      {pendiente && <AvisoTonal tono="advertencia" rol="status" titulo={t('pendiente.titulo')} descripcion={t('pendiente.descripcion')} />}
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      {nota && !intermediacion && (
        <AvisoTonal tono="advertencia" titulo={t('condiciones.estimatorioBloqueado.titulo')} descripcion={t('condiciones.estimatorioBloqueado.descripcion')} />
      )}

      {nota && vista && (
        <>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
                <tr>
                  <th className="px-3 py-2">{t('columnas.producto')}</th>
                  <th className="px-3 py-2 text-right">{t('columnas.recibido')}</th>
                  <th className="px-3 py-2 text-right">{t('columnas.vendidoSinLiquidar')}</th>
                  <th className="px-3 py-2 text-right">{t('columnas.devuelto')}</th>
                  <th className="px-3 py-2 text-right">{t('columnas.precioPactado')}</th>
                  <th className="px-3 py-2 text-right">{t('columnas.venta')}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {lineas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-fg-muted">
                      {t('liquidar.sinVentas')}
                    </td>
                  </tr>
                )}
                {lineas.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <td className="px-3 py-2 text-fg">{l.productoConsignante ?? l.producto}</td>
                    <td className="px-3 py-2 text-right">{entero(l.recibido)}</td>
                    <td className="px-3 py-2 text-right">{entero(l.sinLiquidar.cantidad)}</td>
                    <td className="px-3 py-2 text-right">{entero(l.devuelto)}</td>
                    <td className="px-3 py-2 text-right">{fmt(l.precioPactado)}</td>
                    <td className="px-3 py-2 text-right">{fmt(l.sinLiquidar.venta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Tarjeta titulo={t('liquidar.resumen')}>
              <ListaDatos divisores>
                <FilaDato etiqueta={t('liquidar.venta')} valor={fmt(vista.venta)} />
                <FilaDato etiqueta={t('liquidar.pactado')} valor={fmt(vista.pactado)} />
                <FilaDato
                  etiqueta={nota.remuneracionModo === 'porcentaje' ? t('liquidar.remuneracionPct', { pct: nota.comisionPct, base: t(`condiciones.bases.${nota.baseComision}`) }) : t('liquidar.remuneracionPrecio')}
                  valor={`(${fmt(vista.remuneracion)})`}
                />
                {descontar && derechos > 0 && (
                  <FilaDato etiqueta={t('liquidar.derechosDescontados')} valor={`(${fmt(derechos)})`} descripcion={t('liquidar.derechosDescontadosAyuda')} />
                )}
                <FilaDato etiqueta={t('liquidar.impuestos')} accesorio={<StatusBadge estado="pendiente" etiqueta={t('liquidar.porDeterminar')} />} descripcion={t('liquidar.impuestosAyuda')} />
                <FilaDato etiqueta={t('liquidar.saldoDueno', { consignante: nota.consignante })} valor={fmt(vista.dueno)} tamano="lg" separadorAntes />
              </ListaDatos>
            </Tarjeta>
            <Tarjeta titulo={t('liquidar.vistaPrevia')}>
              <p className="text-sm text-fg">
                {t(nota.reconocimiento === 'obligacion_posterior' ? 'liquidar.remuneracionEsperaObligacion' : 'liquidar.remuneracionYaDevengada')}
              </p>
              <p className="mt-2 text-xs text-fg-muted">{t('liquidar.retencionesAlLiquidar')}</p>
              <p className="mt-2 text-xs text-fg-muted">{t('liquidar.notaIntermediacion')}</p>
            </Tarjeta>
          </div>

          {derechos > 0 && (
            <Tarjeta titulo={t('liquidar.derechosTitulo', { valor: fmt(derechos) })}>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-fg-secondary">{t('liquidar.derechosDescripcion')}</p>
                <label className="flex items-start gap-2 text-sm text-fg">
                  <Checkbox checked={descontar} onCheckedChange={(v) => setDescontar(v === true)} aria-describedby="consignacion-derechos-ayuda" />
                  <span>{t('liquidar.descontarConAcuerdo')}</span>
                </label>
                {descontar && (
                  <FormField etiqueta={t('liquidar.acuerdo')} obligatorio error={faltaAcuerdo && acuerdo !== '' ? t('errores.acuerdo_obligatorio') : null}>
                    {(c) => (
                      <Textarea id={c.id} aria-labelledby={c.idEtiqueta} value={acuerdo} maxLength={1000} rows={3} placeholder={t('liquidar.acuerdoPlaceholder')} onChange={(e) => setAcuerdo(e.target.value)} />
                    )}
                  </FormField>
                )}
                <p id="consignacion-derechos-ayuda" className="text-xs text-fg-muted">
                  {t('liquidar.derechosSinOtra')}
                </p>
              </div>
            </Tarjeta>
          )}
          {vista.bajoPrecio && <AvisoTonal tono="peligro" titulo={t('liquidar.bajoPrecioTitulo')} descripcion={t('errores.venta_bajo_precio_pactado')} />}
          {nota.facturaRemuneracion && (
            <AvisoTonal tono="advertencia" titulo={t('liquidar.facturaRemuneracionTitulo')} descripcion={t('liquidar.facturaRemuneracionDescripcion')} />
          )}
          <AvisoTonal
            tono="informacion"
            titulo={t('liquidar.alLiquidar')}
            descripcion={t('liquidar.alLiquidarIntermediacion')}
            accion={{ etiqueta: t('liquidar.irDineroTerceros'), href: '/app/finanzas/tesoreria/dinero-de-terceros' }}
          />

          {nota.liquidaciones.length > 0 && (
            <Tarjeta titulo={t('detalle.liquidaciones', { n: nota.liquidaciones.length })}>
              <ListaDatos divisores>
                {nota.liquidaciones.map((q) => (
                  <FilaDato
                    key={q.id}
                    etiqueta={`${formatDate(q.creada)} · ${t(`estadosLiquidacion.${q.estado}`)}`}
                    descripcion={
                      q.derechosDescontados > 0
                        ? t('detalle.liquidacionResumenDerechos', { venta: fmt(q.venta), remuneracion: fmt(q.remuneracion), derechos: fmt(q.derechosDescontados) })
                        : t('detalle.liquidacionResumen', { venta: fmt(q.venta), remuneracion: fmt(q.remuneracion) })
                    }
                    valor={fmt(q.porPagar)}
                  />
                ))}
              </ListaDatos>
            </Tarjeta>
          )}
        </>
      )}

      <DialogoMotivo
        abierto={anular}
        onAbiertoChange={setAnular}
        titulo={t('liquidar.anularTitulo')}
        descripcion={t('liquidar.anularDescripcion')}
        textoConfirmar={t('liquidar.anularConfirmar')}
        destructiva
        onConfirmar={async (motivo) => {
          try {
            await confirmarAnular(motivo);
          } catch (e) {
            setError(textoErrorSaldo(t, e));
            setAnular(false);
          }
        }}
      />
    </div>
  );
}
