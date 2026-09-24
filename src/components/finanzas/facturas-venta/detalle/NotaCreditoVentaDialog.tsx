'use client';

/**
 * Nota crédito de una factura de venta en dos pasos (Figma Sección 17
 * `738:41958`: N3 por líneas, N4 excede el tope). Sustituye al diálogo viejo
 * que escribía la nota, el saldo y la cartera desde el navegador.
 *
 * Paso 1 · Qué se acredita: Toda la factura · Por líneas · Por valor, con el
 *          tope (lo facturado menos lo ya acreditado).
 * Paso 2 · Motivo y efectos: motivo, concepto DIAN, reingreso de mercancía y,
 *          si la nota supera lo que se debía, qué hacer con lo ya pagado
 *          (saldo a favor o devolución; en efectivo exige caja abierta).
 *
 * Emite con `POST /api/facturas-venta/[id]/nota-credito` (una transacción en
 * la base). La vista previa del excedente usa `excedenteNotaCredito`, la misma
 * que ya usaba el diálogo anterior; el valor real lo decide la base.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileMinus } from 'lucide-react';
import { CampoNumero, Dialogo, FormField, SegmentedControl } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { toastError, toastInfo, toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { excedenteNotaCredito } from '@/lib/services/notasCreditoService';
import { nuevaClaveIdempotencia } from '@/lib/finanzas/pagos/contrato';
import {
  CONCEPTOS_DIAN,
  totalNota,
  type ConceptoDian,
  type ContextoNota,
  type ModoNota,
} from '@/lib/finanzas/ventas/contratoNotaCredito';
import { ErrorPeticionFactura, emitirNotaCreditoVenta, pedirContextoNota } from '@/lib/finanzas/ventas/clienteFacturas';
import { SeleccionLineasNota } from '@/components/finanzas/notas/SeleccionLineasNota';

export interface NotaCreditoVentaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  facturaId: string;
  numero: string;
  onEmitida?: () => void;
}

type Paso = 'que' | 'motivo';

const CLASES_CAMPO =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function NotaCreditoVentaDialog({ abierto, onAbiertoChange, facturaId, numero, onEmitida }: NotaCreditoVentaDialogProps) {
  const t = useTranslations('facturasVenta.nota');
  const moneda = useMonedaOrganizacion();

  const [ctx, setCtx] = useState<ContextoNota | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>('que');
  const [modo, setModo] = useState<ModoNota>('lineas');
  const [seleccion, setSeleccion] = useState<Record<string, number>>({});
  const [valor, setValor] = useState<number | null>(null);
  const [concepto, setConcepto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [conceptoDian, setConceptoDian] = useState<ConceptoDian | ''>('');
  const [reingresar, setReingresar] = useState(true);
  const [liquidacion, setLiquidacion] = useState<'saldo_a_favor' | 'devolucion'>('saldo_a_favor');
  const [metodo, setMetodo] = useState<'cash' | 'transfer'>('cash');
  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef(nuevaClaveIdempotencia('nota'));

  useEffect(() => {
    if (!abierto) return;
    setPaso('que');
    setModo('lineas');
    setSeleccion({});
    setValor(null);
    setConcepto('');
    setMotivo('');
    setConceptoDian('');
    setReingresar(true);
    setMetodo('cash');
    setError(null);
    setErrorCarga(null);
    setCtx(null);
    clave.current = nuevaClaveIdempotencia('nota');
    let vivo = true;
    pedirContextoNota(facturaId)
      .then((c) => {
        if (!vivo) return;
        setCtx(c);
        setLiquidacion(c.tieneCliente ? 'saldo_a_favor' : 'devolucion');
      })
      .catch((e: unknown) => vivo && setErrorCarga(e instanceof ErrorPeticionFactura ? e.codigo : 'error_desconocido'));
    return () => {
      vivo = false;
    };
  }, [abierto, facturaId]);

  const fmt = useMemo(() => crearFormateadorMoneda(moneda.paraDocumento(ctx?.moneda)), [moneda, ctx?.moneda]);
  const monto = ctx ? totalNota(modo, ctx.lineas, seleccion, valor ?? 0) : 0;
  const excede = !!ctx && monto > ctx.tope + 0.01;
  const excedente = ctx ? excedenteNotaCredito(monto, ctx.saldo, ctx.total) : 0;
  const hayProductos = modo !== 'valor' && !!ctx?.lineas.some((l) => l.productId != null);

  const textoError = (codigo: string) => {
    const k = `errores.${codigo}`;
    return t.has(k) ? t(k as never) : t('errores.error_desconocido');
  };

  const bloqueoPaso1 = !ctx
    ? t('cargando')
    : monto <= 0
      ? t('bloqueos.sinMonto')
      : excede
        ? t('bloqueos.excede', { tope: fmt(ctx.tope) })
        : modo === 'valor' && !concepto.trim()
          ? t('bloqueos.sinConcepto')
          : null;
  const bloqueoPaso2 =
    motivo.trim().length < 5
      ? t('bloqueos.sinMotivo')
      : excedente > 0 && liquidacion === 'saldo_a_favor' && !ctx?.tieneCliente
        ? t('errores.saldo_a_favor_sin_cliente')
        : null;

  const emitir = async () => {
    if (!ctx) return;
    setEmitiendo(true);
    setError(null);
    try {
      const r = await emitirNotaCreditoVenta(facturaId, {
        modo,
        lineas:
          modo === 'lineas'
            ? Object.entries(seleccion)
                .filter(([, q]) => q > 0)
                .map(([itemId, cantidad]) => ({ itemId, cantidad }))
            : undefined,
        valor: modo === 'valor' ? valor ?? undefined : undefined,
        concepto: modo === 'valor' ? concepto.trim() : undefined,
        motivo: motivo.trim(),
        conceptoDian: conceptoDian || undefined,
        reingresar: hayProductos && reingresar,
        liquidacion,
        metodoDevolucion: excedente > 0 && liquidacion === 'devolucion' ? metodo : undefined,
        claveIdempotencia: clave.current,
      });
      toastSuccess(t('emitida', { numero: r.numero ?? '' }), t('emitidaDetalle', { monto: fmt(r.total) }));
      if (r.excedente > 0) {
        toastInfo(t(r.liquidacion?.modo === 'devolucion' ? 'excedente.devuelto' : 'excedente.aFavor', { monto: fmt(r.excedente) }));
      }
      if (r.fe === 'encolada') toastInfo(t('fe.encolada'));
      if (r.fe === 'error') toastError(t('fe.error'));
      onAbiertoChange(false);
      onEmitida?.();
    } catch (e) {
      setError(textoError(e instanceof ErrorPeticionFactura ? e.codigo : 'error_desconocido'));
    } finally {
      setEmitiendo(false);
    }
  };

  const modos = [
    { valor: 'total' as const, etiqueta: t('modos.total') },
    { valor: 'lineas' as const, etiqueta: t('modos.lineas') },
    { valor: 'valor' as const, etiqueta: t('modos.valor') },
  ];

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !emitiendo && onAbiertoChange(v)}
      titulo={t('titulo', { numero })}
      descripcion={paso === 'que' ? t('paso1') : t('paso2')}
      icono={FileMinus}
      ancho={672}
      secundarios={paso === 'motivo' ? [{ etiqueta: t('atras'), onClick: () => setPaso('que'), deshabilitada: emitiendo }] : undefined}
      primario={
        paso === 'que'
          ? { etiqueta: t('siguiente'), onClick: () => setPaso('motivo'), deshabilitada: !!bloqueoPaso1, motivo: bloqueoPaso1 ?? undefined }
          : { etiqueta: t('emitir'), onClick: () => void emitir(), cargando: emitiendo, deshabilitada: !!bloqueoPaso2, motivo: bloqueoPaso2 ?? undefined }
      }
      pie={
        ctx ? (
          <span className="text-sm text-fg-secondary">
            {t('totalNota')} <strong className="tabular-nums text-fg">{fmt(monto)}</strong>
          </span>
        ) : undefined
      }
    >
      {errorCarga ? (
        <p role="alert" className="text-sm text-danger-text">
          {textoError(errorCarga)}
        </p>
      ) : !ctx ? (
        <p className="text-sm text-fg-muted" aria-live="polite">
          {t('cargando')}
        </p>
      ) : paso === 'que' ? (
        <div className="flex flex-col gap-4">
          <SegmentedControl opciones={modos} valor={modo} onValorChange={setModo} etiqueta={t('modo')} anchoCompleto />
          <dl className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-subtle px-3 py-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-fg-muted">{t('facturado')}</dt>
              <dd className="tabular-nums text-fg">{fmt(ctx.total)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t('saldo')}</dt>
              <dd className="tabular-nums text-fg">{fmt(ctx.saldo)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t('tope')}</dt>
              <dd className="tabular-nums text-fg">{fmt(ctx.tope)}</dd>
            </div>
          </dl>
          {modo === 'valor' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField etiqueta={t('concepto')} ayuda={t('conceptoAyuda')}>
                {(c) => <input id={c.id} value={concepto} maxLength={200} onChange={(e) => setConcepto(e.target.value)} className={CLASES_CAMPO} />}
              </FormField>
              <FormField etiqueta={t('valor')}>
                {(c) => <CampoNumero id={c.id} valor={valor} onValorChange={setValor} minimo={0} maximo={ctx.tope} alinear="derecha" />}
              </FormField>
            </div>
          ) : (
            <SeleccionLineasNota
              lineas={ctx.lineas}
              seleccion={seleccion}
              onSeleccionChange={setSeleccion}
              formatear={fmt}
              soloLectura={modo === 'total'}
            />
          )}
          {excede && (
            <p role="alert" className="rounded-lg border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
              {t('bloqueos.excede', { tope: fmt(ctx.tope) })}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <FormField etiqueta={t('motivo')} ayuda={t('motivoAyuda')}>
            {(c) => (
              <textarea
                id={c.id}
                rows={3}
                maxLength={500}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            )}
          </FormField>
          {ctx.feAceptada && (
            <FormField etiqueta={t('conceptoDian')} ayuda={t('conceptoDianAyuda')}>
              {(c) => (
                <select id={c.id} value={conceptoDian} onChange={(e) => setConceptoDian(e.target.value as ConceptoDian | '')} className={CLASES_CAMPO}>
                  <option value="">{t('conceptosDian.auto')}</option>
                  {CONCEPTOS_DIAN.map((k) => (
                    <option key={k} value={k}>
                      {t(`conceptosDian.c${k}` as never)}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}
          {hayProductos && (
            <div className="flex items-start gap-2 text-sm text-fg">
              <Checkbox id="nota-reingresar" checked={reingresar} onCheckedChange={(v) => setReingresar(v === true)} className="mt-0.5" />
              <label htmlFor="nota-reingresar" className="cursor-pointer">
                {t('reingresar')}
                <span className="block text-xs text-fg-muted">{t('reingresarAyuda')}</span>
              </label>
            </div>
          )}
          {excedente > 0 && (
            <fieldset className="flex flex-col gap-2 rounded-lg border border-line px-3 py-2">
              <legend className="px-1 text-sm font-medium text-fg">{t('excedente.titulo', { monto: fmt(excedente) })}</legend>
              <p className="text-xs text-fg-muted">{t('excedente.ayuda')}</p>
              <label className={`flex items-center gap-2 text-sm ${ctx.tieneCliente ? 'text-fg' : 'text-fg-muted'}`}>
                <input
                  type="radio"
                  name="nota-liquidacion"
                  checked={liquidacion === 'saldo_a_favor'}
                  disabled={!ctx.tieneCliente}
                  onChange={() => setLiquidacion('saldo_a_favor')}
                />
                {t('excedente.opcionAFavor')}
              </label>
              <label className="flex items-center gap-2 text-sm text-fg">
                <input type="radio" name="nota-liquidacion" checked={liquidacion === 'devolucion'} onChange={() => setLiquidacion('devolucion')} />
                {t('excedente.opcionDevolucion')}
              </label>
              {liquidacion === 'devolucion' && (
                <FormField etiqueta={t('excedente.metodo')}>
                  {(c) => (
                    <select id={c.id} value={metodo} onChange={(e) => setMetodo(e.target.value as 'cash' | 'transfer')} className={CLASES_CAMPO}>
                      <option value="cash">{t('excedente.efectivo')}</option>
                      <option value="transfer">{t('excedente.transferencia')}</option>
                    </select>
                  )}
                </FormField>
              )}
            </fieldset>
          )}
          <div className="rounded-lg border border-line bg-subtle px-3 py-2">
            <p className="mb-1 text-sm font-medium text-fg">{t('alEmitir.titulo')}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-fg-secondary">
              <li>{t('alEmitir.saldo', { monto: fmt(Math.min(monto, ctx.saldo)) })}</li>
              <li>{t('alEmitir.asiento')}</li>
              {hayProductos && reingresar && <li>{t('alEmitir.inventario')}</li>}
              {excedente > 0 && <li>{t(liquidacion === 'devolucion' ? 'alEmitir.devolucion' : 'alEmitir.aFavor', { monto: fmt(excedente) })}</li>}
              {ctx.feAceptada && <li>{t('alEmitir.dian')}</li>}
            </ul>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialogo>
  );
}
