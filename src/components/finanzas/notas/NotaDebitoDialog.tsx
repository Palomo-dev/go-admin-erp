'use client';

/**
 * Nota débito sobre una factura de venta (Figma `1021:93831`,
 * `73-documentos-nota-debito-dialogo.png`; FINANZAS-DOCUMENTOS-V2 §5.3).
 *
 * Un paso: concepto DIAN (1–4) y motivo, líneas manuales (descripción,
 * cantidad, valor unitario e impuesto de la organización), totales y «Qué
 * pasa al emitir». Emite por `POST /api/facturas-venta/[id]/nota-debito`
 * (`fn_nota_debito_emitir`, idempotente por clave): el servidor resuelve los
 * impuestos y crea la cuenta por cobrar propia. Mientras la función no esté
 * activa en la base, el diálogo lo dice y no deja emitir.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, FilePlus, Info, Plus, Trash2 } from 'lucide-react';
import { CampoNumero, Dialogo, DocumentoTotales, EmptyState, FormField, Tarjeta } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { nuevaClaveIdempotencia } from '@/lib/finanzas/pagos/contrato';
import { ErrorPeticionNota, emitirNotaDebito, pedirContextoNotaDebito } from '@/lib/finanzas/notas/clienteNotas';
import {
  CONCEPTOS_NOTA_DEBITO,
  facturaAdmiteNotaDebito,
  faltantesNotaDebito,
  lineasParaEnviar,
  rutaDetalleNota,
  totalesNotaDebito,
  type ConceptoNotaDebito,
  type ContextoNotaDebito,
  type LineaNotaDebitoEdicion,
} from '@/lib/finanzas/notas/contratoNotas';

const CLASES_CAMPO =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
const SIN_IMPUESTO = 'ninguno';

export interface NotaDebitoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  facturaId: string;
  numero: string;
  onEmitida?: (id: string) => void;
  /** Tras emitir, abrir el detalle de la nota (listado y factura: sí). */
  irAlDetalle?: boolean;
}

let secuencia = 0;
const lineaVacia = (): LineaNotaDebitoEdicion => ({ id: `l${++secuencia}`, descripcion: '', cantidad: 1, valorUnitario: null, impuestoId: null });

export function NotaDebitoDialog({ abierto, onAbiertoChange, facturaId, numero, onEmitida, irAlDetalle = true }: NotaDebitoDialogProps) {
  const t = useTranslations('finanzasDocumentosR3.notas');
  const router = useRouter();
  const moneda = useMonedaOrganizacion();
  const [ctx, setCtx] = useState<ContextoNotaDebito | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [concepto, setConcepto] = useState<ConceptoNotaDebito | null>(null);
  const [motivo, setMotivo] = useState('');
  const [lineas, setLineas] = useState<LineaNotaDebitoEdicion[]>([lineaVacia()]);
  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  const clave = useRef(nuevaClaveIdempotencia('nota_debito'));

  useEffect(() => {
    if (!abierto) return;
    setConcepto(null);
    setMotivo('');
    setLineas([lineaVacia()]);
    setError(null);
    setIntento(false);
    clave.current = nuevaClaveIdempotencia('nota_debito');
    let cancelado = false;
    setCargando(true);
    setErrorCarga(null);
    pedirContextoNotaDebito(facturaId)
      .then((c) => !cancelado && setCtx(c))
      .catch((e) => !cancelado && setErrorCarga(e instanceof ErrorPeticionNota ? e.codigo : 'error_desconocido'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [abierto, facturaId]);

  const ctxMoneda = moneda.paraDocumento(ctx?.factura.moneda);
  const fmt = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);
  const impuestos = ctx?.impuestos ?? [];
  const totales = totalesNotaDebito(lineas, impuestos);
  const faltan = faltantesNotaDebito({ concepto, motivo, lineas });
  const admite = ctx ? facturaAdmiteNotaDebito(ctx.factura) : false;
  const disponible = !!ctx?.disponible;

  const cambiarLinea = (id: string, cambio: Partial<LineaNotaDebitoEdicion>) =>
    setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...cambio } : l)));
  const quitarLinea = (id: string) => setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : [lineaVacia()]));

  const textoError = (codigo: string) => (t.has(`notaDebito.errores.${codigo}`) ? t(`notaDebito.errores.${codigo}` as never) : t('notaDebito.errores.error_desconocido'));

  const emitir = async () => {
    setIntento(true);
    if (!ctx || faltan.length > 0 || !concepto) return;
    setEmitiendo(true);
    setError(null);
    try {
      const r = await emitirNotaDebito(facturaId, {
        concepto,
        motivo: motivo.trim(),
        lineas: lineasParaEnviar(lineas),
        claveIdempotencia: clave.current,
      });
      toastSuccess(t('notaDebito.emitida', { numero: r.numero ?? '' }), t('notaDebito.emitidaDetalle', { total: fmt(r.total) }));
      onAbiertoChange(false);
      onEmitida?.(r.id);
      if (irAlDetalle) router.push(rutaDetalleNota('debito', r.id));
    } catch (e) {
      setError(textoError(e instanceof ErrorPeticionNota ? e.codigo : 'error_desconocido'));
    } finally {
      setEmitiendo(false);
    }
  };

  const subtitulo = ctx
    ? t(ctx.factura.feAceptada ? 'notaDebito.subtituloAceptada' : 'notaDebito.subtitulo', {
        cliente: ctx.factura.cliente ?? t('listado.sinCliente'),
        saldo: fmt(ctx.factura.saldo),
      })
    : undefined;

  const motivoPrimario = !disponible
    ? t('notaDebito.noDisponibleTitulo')
    : !admite
      ? t('notaDebito.noAdmite')
      : faltan.length > 0
        ? t(`notaDebito.faltan.${faltan[0]}` as never)
        : undefined;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !emitiendo && onAbiertoChange(v)}
      titulo={t('notaDebito.titulo', { numero })}
      descripcion={subtitulo}
      icono={FilePlus}
      ancho={880}
      primario={{
        etiqueta: emitiendo ? t('notaDebito.emitiendo') : t('notaDebito.emitir'),
        onClick: () => void emitir(),
        cargando: emitiendo,
        deshabilitada: !ctx || !disponible || !admite || (intento && faltan.length > 0),
        motivo: motivoPrimario,
      }}
    >
      {cargando && !ctx ? (
        <p className="py-6 text-center text-sm text-fg-muted">{t('notaDebito.cargando')}</p>
      ) : errorCarga ? (
        <EmptyState variante="error" titulo={t('notaDebito.errorCarga')} descripcion={textoError(errorCarga)} />
      ) : ctx ? (
        <div className="flex flex-col gap-4">
          {!disponible && (
            <Tarjeta tono="advertencia" icono={AlertTriangle} titulo={t('notaDebito.noDisponibleTitulo')}>
              <p className="text-sm text-fg-secondary">{t('notaDebito.noDisponible')}</p>
            </Tarjeta>
          )}
          {disponible && !admite && (
            <Tarjeta tono="advertencia" icono={AlertTriangle} titulo={t('notaDebito.noAdmite')} />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField etiqueta={t('notaDebito.concepto')} obligatorio error={intento && !concepto ? t('notaDebito.faltan.concepto') : undefined}>
              {(c) => (
                <Select value={concepto ?? undefined} onValueChange={(v) => setConcepto(v as ConceptoNotaDebito)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                    <SelectValue placeholder={t('notaDebito.conceptoPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {CONCEPTOS_NOTA_DEBITO.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`conceptos.debito.${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('notaDebito.motivo')} obligatorio error={intento && motivo.trim().length < 5 ? t('notaDebito.faltan.motivo') : undefined}>
              {(c) => (
                <input
                  id={c.id}
                  aria-describedby={c['aria-describedby']}
                  className={CLASES_CAMPO}
                  value={motivo}
                  maxLength={500}
                  placeholder={t('notaDebito.motivoPlaceholder')}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              )}
            </FormField>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-fg">{t('notaDebito.lineas.etiqueta')}</legend>
            {impuestos.length === 0 && <p className="text-xs text-fg-muted">{t('notaDebito.sinImpuestos')}</p>}
            <div className="hidden grid-cols-[minmax(0,1fr)_80px_140px_140px_110px_40px] gap-2 rounded-t-lg bg-subtle px-3 py-2 text-xs font-medium text-fg-secondary md:grid">
              <span>{t('notaDebito.lineas.descripcion')}</span>
              <span className="text-right">{t('notaDebito.lineas.cantidad')}</span>
              <span className="text-right">{t('notaDebito.lineas.valorUnitario')}</span>
              <span>{t('notaDebito.lineas.impuesto')}</span>
              <span className="text-right">{t('notaDebito.lineas.total')}</span>
              <span className="sr-only">{t('notaDebito.lineas.quitar', { n: '' })}</span>
            </div>
            <ul className="flex flex-col gap-3 md:gap-0 md:divide-y md:divide-line md:rounded-b-lg md:border md:border-line">
              {lineas.map((l, i) => {
                const totalLinea = totalesNotaDebito([l], impuestos).total;
                return (
                  <li
                    key={l.id}
                    className="grid grid-cols-2 gap-2 rounded-lg border border-line p-3 md:grid-cols-[minmax(0,1fr)_80px_140px_140px_110px_40px] md:items-center md:rounded-none md:border-0 md:px-3 md:py-2"
                  >
                    <div className="col-span-2 md:col-span-1">
                      <input
                        aria-label={`${t('notaDebito.lineas.descripcion')} ${i + 1}`}
                        className={CLASES_CAMPO}
                        value={l.descripcion}
                        maxLength={200}
                        placeholder={t('notaDebito.lineas.descripcionPlaceholder')}
                        onChange={(e) => cambiarLinea(l.id, { descripcion: e.target.value })}
                      />
                      <span className="mt-1 block text-xs text-fg-muted">{t('notaDebito.lineas.manual')}</span>
                    </div>
                    <CampoNumero
                      aria-label={`${t('notaDebito.lineas.cantidad')} ${i + 1}`}
                      valor={l.cantidad}
                      onValorChange={(v) => cambiarLinea(l.id, { cantidad: v })}
                      minimo={0}
                      decimales={3}
                      alinear="derecha"
                    />
                    <CampoNumero
                      aria-label={`${t('notaDebito.lineas.valorUnitario')} ${i + 1}`}
                      valor={l.valorUnitario}
                      onValorChange={(v) => cambiarLinea(l.id, { valorUnitario: v })}
                      minimo={0}
                      alinear="derecha"
                    />
                    <Select value={l.impuestoId ?? SIN_IMPUESTO} onValueChange={(v) => cambiarLinea(l.id, { impuestoId: v === SIN_IMPUESTO ? null : v })}>
                      <SelectTrigger aria-label={`${t('notaDebito.lineas.impuesto')} ${i + 1}`} className="h-10 border-line-strong bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SIN_IMPUESTO}>{t('notaDebito.lineas.sinImpuesto')}</SelectItem>
                        {impuestos.map((imp) => (
                          <SelectItem key={imp.id} value={imp.id}>
                            {imp.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="self-center text-right text-sm font-medium tabular-nums text-fg">{fmt(totalLinea)}</span>
                    <button
                      type="button"
                      onClick={() => quitarLinea(l.id)}
                      aria-label={t('notaDebito.lineas.quitar', { n: i + 1 })}
                      className="flex size-10 items-center justify-center justify-self-end rounded-md text-fg-muted hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => setLineas((ls) => (ls.length < 50 ? [...ls, lineaVacia()] : ls))}
              className="flex h-10 w-fit items-center gap-2 rounded-md px-2 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('notaDebito.lineas.agregar')}
            </button>
            {intento && faltan.includes('lineaIncompleta') && <p className="text-xs text-danger-text">{t('notaDebito.faltan.lineaIncompleta')}</p>}
            {intento && faltan.includes('lineas') && <p className="text-xs text-danger-text">{t('notaDebito.faltan.lineas')}</p>}
          </fieldset>

          <DocumentoTotales
            moneda={ctxMoneda}
            subtotal={totales.subtotal}
            impuestos={totales.impuestos.map((i) => ({ nombre: i.nombre, tarifa: i.tarifa, base: i.base, importe: i.importe }))}
            total={totales.total}
            mostrarBases={false}
          />

          <Tarjeta tono="informacion" icono={Info} titulo={t('notaDebito.quePasaTitulo')}>
            <p className="text-sm text-fg-secondary">
              {t('notaDebito.quePasa', { total: fmt(totales.total), factura: numero })}{' '}
              {ctx.factura.feAceptada ? t('notaDebito.quePasaDian') : t('notaDebito.quePasaSinDian')}
            </p>
          </Tarjeta>

          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
        </div>
      ) : null}
    </Dialogo>
  );
}
