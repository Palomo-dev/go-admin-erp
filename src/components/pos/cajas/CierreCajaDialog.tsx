'use client';

/**
 * «Arqueo y cierre de caja» (Figma `I-Cierre` · `I-CierreCiego`, captura
 * `10-pos-cierre-caja.png`; paso 11 de docs/implementacion/CAJAS-VENTAS-PLAN.md).
 *
 * - Diálogo en escritorio y hoja inferior en móvil (`PanelAdaptable`), sin
 *   portales hechos a mano.
 * - El esperado y su desglose vienen del servidor (`GET /api/pos/cajas/[id]/resumen`);
 *   con cierre ciego y sin permiso no llegan y el cajero cuenta a ciegas.
 * - Conteo por método (efectivo escrito o por billetes y monedas) con el mismo
 *   `ConteoPorMetodo` / `ConteoEfectivo` / `ResumenArqueo` del arqueo.
 * - Cierra con `CajasService.closeSession`: con red por `POST
 *   /api/pos/cajas/[id]/cerrar` → `pos_caja_cerrar`, que guarda el conteo por
 *   método en la MISMA transacción (D6) y calcula la diferencia en el servidor;
 *   sin red (Desktop) al outbox con el conteo, que luego reproduce la misma RPC.
 *
 * API conservada para la pantalla del POS: `session`, `onSessionClosed` y,
 * opcionales, `open`/`onOpenChange` (sin ellos dibuja su botón «Cerrar caja»).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calculator, Lock, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { FormField, PanelAdaptable, Tarjeta } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { diferenciasPorMetodo, observacionObligatoria, totalesConteo } from '@/lib/pos/cajas/arqueo';
import { conteoParaGuardar, denominacionesDe, totalDenominaciones, type ConteoDenominaciones } from '@/lib/pos/cajas/denominaciones';
import { CajasService } from './CajasService';
import { useBlindCloseMode } from './useBlindCloseMode';
import { useResumenCaja } from './useResumenCaja';
import { useMensajeErrorCaja, useMetodosPagoActivos, useMonedaCaja } from './comunesCaja';
import { ConteoEfectivo } from './conteo/ConteoEfectivo';
import { ConteoPorMetodo } from './conteo/ConteoPorMetodo';
import { ResumenArqueo } from './conteo/ResumenArqueo';
import { TarjetaDesglose } from './detalle/seccionesCaja';
import { useEtiquetaMetodoPago } from './paymentMethodLabels';
import type { CashSession, SessionPaymentDetail } from './types';

interface CierreCajaDialogProps {
  session: CashSession;
  onSessionClosed: (session: CashSession) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const MAX_NOTAS = 1000;

export function CierreCajaDialog({ session, onSessionClosed, open: controlledOpen, onOpenChange }: CierreCajaDialogProps) {
  const t = useTranslations('cajas.cerrarCaja');
  const tMetodo = useTranslations('cajas.cierre.tiposMovimiento');
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const { moneda, simbolo, formatear } = useMonedaCaja();
  const etiquetaMetodo = useEtiquetaMetodoPago();
  const mensajeError = useMensajeErrorCaja();
  const metodosActivos = useMetodosPagoActivos();
  const { showExpected } = useBlindCloseMode();
  const { resumen, cargando, error, recargar } = useResumenCaja(session.id > 0 ? session.uuid : session.id, {
    ventas: false,
    sesionLocal: session,
    activo: open,
  });

  const [porDenominacion, setPorDenominacion] = useState(false);
  const [denominaciones, setDenominaciones] = useState<ConteoDenominaciones>({});
  const [contado, setContado] = useState<Record<string, number | null>>({});
  const [notas, setNotas] = useState('');
  const [intento, setIntento] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [movimientos, setMovimientos] = useState<SessionPaymentDetail[]>([]);

  // Sin red el resumen se calcula en local: la visibilidad la decide el cierre ciego de la pantalla.
  const visible = resumen ? (resumen.sinRed ? showExpected : resumen.verImportes) : false;
  const conLista = denominacionesDe(moneda.code) !== null;
  const efectivo = porDenominacion && conLista ? totalDenominaciones(denominaciones) : contado.cash ?? null;

  useEffect(() => {
    if (!open) {
      setPorDenominacion(false);
      setDenominaciones({});
      setContado({});
      setNotas('');
      setIntento(false);
      return;
    }
    if (!visible || session.id < 0) {
      setMovimientos([]);
      return;
    }
    let vigente = true;
    CajasService.getSessionPaymentsDetail(session.id)
      .then((m) => vigente && setMovimientos(m))
      .catch(() => vigente && setMovimientos([]));
    return () => {
      vigente = false;
    };
  }, [open, visible, session.id]);

  const filas = useMemo(
    () =>
      diferenciasPorMetodo(
        visible && resumen ? resumen.esperado.por_metodo ?? {} : null,
        { ...contado, cash: efectivo },
        metodosActivos,
      ),
    [visible, resumen, contado, efectivo, metodosActivos],
  );
  const totales = useMemo(() => totalesConteo(filas), [filas]);
  const notasObligatorias = observacionObligatoria(totales.diferenciaTotal);
  const errorNotas = intento && notasObligatorias && !notas.trim() ? t('notasObligatorias') : null;
  const sinEfectivo = efectivo === null;

  const cerrar = async () => {
    setIntento(true);
    if (sinEfectivo) return;
    if (notasObligatorias && !notas.trim()) return;
    setCerrando(true);
    try {
      const porMetodo: Record<string, number> = {};
      for (const [k, v] of Object.entries(contado)) if (k !== 'cash' && v !== null && v > 0) porMetodo[k] = v;
      const cerrada = await CajasService.closeSession(
        {
          final_amount: efectivo ?? 0,
          notes: notas.trim() || undefined,
          counted_by_method: porMetodo,
          denominations: porDenominacion && conLista ? conteoParaGuardar(denominaciones) : undefined,
        },
        session,
      );
      const dif = cerrada.difference;
      toast.success(cerrada.pending_sync ? t('cerradaSinRed') : t('cerrada'), {
        description:
          cerrada.pending_sync
            ? t('pendienteSincronizar')
            : dif !== null && dif !== undefined
              ? t('cerradaDiferencia', { monto: formatear(Number(dif)) })
              : t('cerradaSinCifras'),
      });
      setCerrando(false);
      onSessionClosed(cerrada);
      setOpen(false);
    } catch (e) {
      const codigo = (e as { codigo?: string })?.codigo;
      toast.error(t('errorCerrar'), { description: mensajeError(codigo, (e as Error)?.message) });
      setCerrando(false);
    }
  };

  const pie = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" className="h-10" onClick={() => setOpen(false)} disabled={cerrando}>
        {t('cancelar')}
      </Button>
      <Button variant="destructive" className="h-10 gap-2" onClick={() => void cerrar()} disabled={cerrando || !resumen} title={sinEfectivo ? t('cuentaEfectivo') : undefined}>
        <Lock aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {cerrando ? t('cerrando') : t('cerrarCaja')}
      </Button>
    </div>
  );

  return (
    <>
      {!controlled && (
        <Button variant="destructive" className="h-10 gap-2" onClick={() => setOpen(true)}>
          <Lock aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('cerrarCaja')}
        </Button>
      )}
      <PanelAdaptable
        abierto={open}
        onAbiertoChange={(v) => !cerrando && setOpen(v)}
        titulo={t('titulo')}
        descripcion={t('descripcion', { id: session.id > 0 ? session.id : '—' })}
        icono={Calculator}
        ancho={800}
        ocupado={cerrando}
        pie={pie}
      >
        {cargando && !resumen ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        ) : error || !resumen ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-line-danger bg-danger-subtle p-4 text-sm text-danger-text" role="alert">
            <p>{mensajeError(error)}</p>
            <Button variant="outline" size="sm" onClick={() => void recargar()}>
              {t('reintentar')}
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void cerrar();
            }}
          >
            {resumen.sinRed && <p className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-sm text-warning-text">{t('avisoSinRed')}</p>}

            {visible ? (
              <TarjetaDesglose resumen={{ ...resumen, verImportes: true }} formatear={formatear} />
            ) : (
              <p className="rounded-lg border border-line-info bg-info-subtle px-3 py-2 text-sm text-info-text">{t('avisoCierreCiego')}</p>
            )}

            {visible && movimientos.length > 0 && (
              <Tarjeta titulo={t('movimientosSesion', { n: movimientos.length })} icono={ReceiptText}>
                <ul className="flex max-h-56 flex-col divide-y divide-line overflow-y-auto">
                  {movimientos.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-fg">
                          {tMetodo(CLAVE_TIPO[m.type] ?? 'otro')}
                          {m.reference ? ` #${m.reference}` : ''}
                        </p>
                        <p className="truncate text-xs text-fg-muted">
                          {m.counterparty || t('sinContraparte')} · {etiquetaMetodo(m.method)}
                        </p>
                      </div>
                      <span className={m.direction === 'in' ? 'shrink-0 font-semibold tabular-nums text-success-text' : 'shrink-0 font-semibold tabular-nums text-danger-text'}>
                        {`${m.direction === 'in' ? '+' : '−'}${formatear(m.amount)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            )}

            {conLista && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-fg-secondary">{porDenominacion ? t('contandoDenominaciones') : t('contarDenominacionesAyuda')}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setPorDenominacion((v) => !v)} aria-pressed={porDenominacion}>
                  {porDenominacion ? t('escribirTotal') : t('contarDenominaciones')}
                </Button>
              </div>
            )}
            {porDenominacion && conLista && (
              <ConteoEfectivo
                compacto
                moneda={moneda.code}
                valor={denominaciones}
                onValorChange={setDenominaciones}
                totalManual={null}
                onTotalManualChange={() => undefined}
                formatear={formatear}
                simbolo={simbolo}
                deshabilitado={cerrando}
              />
            )}

            <ConteoPorMetodo
              titulo={t('arqueoPorMetodo')}
              filas={filas}
              efectivoEditable={!(porDenominacion && conLista)}
              onContadoChange={(metodo, v) => setContado((prev) => ({ ...prev, [metodo]: v }))}
              etiquetaMetodo={etiquetaMetodo}
              formatear={formatear}
              simbolo={simbolo}
              visible={visible}
              deshabilitado={cerrando}
            />

            <ResumenArqueo titulo={t('resumenCierre')} totales={totales} formatear={formatear} visible={visible} />

            <FormField etiqueta={t('observaciones')} obligatorio={notasObligatorias} error={errorNotas} ayuda={t('observacionesAyuda', { max: MAX_NOTAS })}>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value.slice(0, MAX_NOTAS))} rows={3} placeholder={t('observacionesPlaceholder')} />
            </FormField>
            {intento && sinEfectivo && (
              <p role="alert" className="text-sm text-danger-text">
                {t('cuentaEfectivo')}
              </p>
            )}
          </form>
        )}
      </PanelAdaptable>
    </>
  );
}

const CLAVE_TIPO: Record<SessionPaymentDetail['type'], string> = {
  venta_pos: 'ventaPos',
  venta_mesa: 'ventaMesa',
  venta_factura: 'ventaFactura',
  compra_factura: 'compraFactura',
  cuenta_por_cobrar: 'cuentaPorCobrar',
  cuenta_por_pagar: 'cuentaPorPagar',
  otro: 'otro',
};
