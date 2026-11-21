'use client';

/**
 * «Crear devolución» (Figma `874:578120`; sin caja abierta `874:578327`; móvil
 * a pantalla completa `874:580876`). Se abre desde el listado (tras buscar la
 * venta), desde el detalle de la venta (`DevolucionPanel`) y con
 * `/app/pos/devoluciones?venta=<id>`.
 *
 * No hay lógica nueva de devolución: la venta se lee con
 * `DevolucionesService.obtenerDetalleVenta`, el estado del formulario son las
 * reglas de `formularioDevolucion.ts` (las de `ReturnForm`) y «Procesar» llama
 * a `DevolucionesService.procesarDevolucion` → `procesar_devolucion`, que
 * vuelve a calcular el monto con lo cobrado, repone stock, saca el efectivo de
 * la caja o deja el saldo a favor, y registra la nota crédito contable.
 *
 * La caja abierta se lee con `fn_caja_abierta_para` (misma regla que la RPC):
 * sin caja, «Efectivo» y «Medio original» (que hoy también sale en efectivo)
 * quedan bloqueados, como pide el dueño (2026-09-23).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote, CreditCard, Undo2, Wallet } from 'lucide-react';
import { AvisoTonal, CampoNumero, EmptyState, FilaDato, FormField, ListaDatos, PanelAdaptable, TarjetaSeleccionable } from '@/components/kit';
import { ChipDocumento } from '@/components/kit/documento';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { cn } from '@/utils/Utils';
import { claveErrorDevolucion, codigoErrorDevolucion, type MetodoReintegroPantalla, type ResultadoProcesarDevolucion } from '@/lib/pos/devoluciones/procesarDevolucion';
import {
  agotada,
  alternarLinea,
  alternarSerial,
  aplicarMotivo,
  cambiarCantidad,
  cambiarDisposicion,
  cambiarReingresa,
  datosDevolucion,
  impuestoLinea,
  lineasIniciales,
  reintegroLinea,
  resumenDevolucion,
  validarFormulario,
  type LineaFormulario,
} from '@/lib/pos/devoluciones/formularioDevolucion';
import { numeroDevolucion } from '@/lib/pos/devoluciones/presentacionDevoluciones';
import { pedirCajaParaDevolucion } from '@/lib/pos/devoluciones/clienteDevoluciones';
import { DevolucionesService } from './devolucionesService';
import { ReturnReasonsService } from './motivos/returnReasonsService';
import type { ReturnReason, SaleForReturn } from './types';

export interface CrearDevolucionDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  ventaId: string;
  onDevuelta: (resultado: ResultadoProcesarDevolucion) => void;
}

/** `undefined` = aún se busca; `null` = no hay caja abierta. */
type EstadoCaja = number | null | undefined;

export function CrearDevolucionDialog({ abierto, onAbiertoChange, ventaId, onDevuelta }: CrearDevolucionDialogProps) {
  const t = useTranslations('posDevoluciones.crear');
  const tForm = useTranslations('posDevoluciones.formulario');
  const tErrores = useTranslations('posDevoluciones.errores');
  const { formatear } = useMonedaOrganizacion();
  const { formatDate } = useFormatDate();
  const locale = useLocaleIntl();

  const [venta, setVenta] = useState<SaleForReturn | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [intentoCarga, setIntentoCarga] = useState(0);
  const [motivos, setMotivos] = useState<ReturnReason[] | null>(null);
  const [caja, setCaja] = useState<EstadoCaja>(undefined);
  const [lineas, setLineas] = useState<LineaFormulario[]>([]);
  const [motivoCodigo, setMotivoCodigo] = useState('');
  const [notas, setNotas] = useState('');
  const [metodo, setMetodo] = useState<MetodoReintegroPantalla | null>(null);
  const [intento, setIntento] = useState(false);
  const [procesando, setProcesando] = useState(false);
  // Una clave por intento: si la red corta y se reenvía, el servidor devuelve
  // la misma devolución en vez de duplicarla. Se renueva al terminar bien.
  const claveIntento = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setVenta(null);
    setErrorCarga(false);
    setCaja(undefined);
    DevolucionesService.obtenerDetalleVenta(ventaId)
      .then((v) => {
        if (!vigente) return;
        setVenta(v);
        setLineas(lineasIniciales(v.items));
        pedirCajaParaDevolucion(v.branch_id)
          .then((c) => vigente && setCaja(c))
          .catch(() => vigente && setCaja(null));
      })
      .catch(() => vigente && setErrorCarga(true));
    ReturnReasonsService.getActive()
      .then((m) => vigente && setMotivos(m))
      .catch(() => vigente && setMotivos([]));
    return () => {
      vigente = false;
    };
  }, [abierto, ventaId, intentoCarga]);

  useEffect(() => {
    if (abierto) return;
    setMotivoCodigo('');
    setNotas('');
    setMetodo(null);
    setIntento(false);
  }, [abierto]);

  const motivo = motivos?.find((m) => m.code === motivoCodigo) ?? null;
  const repone = motivo?.affects_inventory === true;
  const conCliente = !!venta?.customer_id;
  const hayCaja = typeof caja === 'number';

  // Método por defecto: efectivo con caja; sin caja, saldo a favor si hay cliente.
  useEffect(() => {
    if (caja === undefined || !venta || metodo !== null) return;
    setMetodo(hayCaja ? 'cash' : conCliente ? 'credit_note' : null);
  }, [caja, venta, metodo, hayCaja, conCliente]);

  const resumen = useMemo(() => resumenDevolucion(lineas), [lineas]);
  const validacion = useMemo(() => validarFormulario(lineas, motivo), [lineas, motivo]);
  const metodoValido = metodo === 'credit_note' ? conCliente : metodo !== null && hayCaja;

  const actualizar = (id: string, cambio: (l: LineaFormulario) => LineaFormulario) =>
    setLineas((prev) => prev.map((l) => (l.sale_item_id === id ? cambio(l) : l)));

  const elegirMotivo = (codigo: string) => {
    setMotivoCodigo(codigo);
    const nuevo = motivos?.find((m) => m.code === codigo);
    setLineas((prev) => prev.map((l) => aplicarMotivo(l, nuevo?.affects_inventory === true)));
  };

  const cantidad = (v: number, decimales = 3) => new Intl.NumberFormat(locale, { maximumFractionDigits: decimales }).format(v);
  const numeroVenta = venta?.invoice_number ?? null;
  const nombreCliente = venta?.customer?.full_name ?? t('clienteGenerico');
  const metodoPago = venta?.payment_method
    ? tForm.has(`metodosPago.${venta.payment_method}`)
      ? tForm(`metodosPago.${venta.payment_method}`)
      : venta.payment_method
    : null;

  const procesar = async () => {
    setIntento(true);
    if (!venta || !motivo || !metodo || procesando) return;
    if (validacion.generales.length > 0 || !metodoValido) return;
    setProcesando(true);
    try {
      const resultado = await DevolucionesService.procesarDevolucion(venta.id, datosDevolucion(lineas, motivo, metodo, notas), claveIntento.current);
      claveIntento.current = crypto.randomUUID();
      // El monto lo calcula el servidor con lo cobrado en la venta.
      toastSuccess(t('hecha', { numero: numeroDevolucion(resultado.return_id), monto: formatear(Number(resultado.total_refund ?? resumen.total)) }));
      onDevuelta(resultado);
    } catch (error) {
      console.error('Error procesando devolución:', error);
      toastError(tErrores(claveErrorDevolucion(codigoErrorDevolucion(error))));
    } finally {
      setProcesando(false);
    }
  };

  const titulo = numeroVenta ? t('titulo', { numero: numeroVenta }) : t('tituloSinNumero');
  const descripcion = venta
    ? metodoPago
      ? t('descripcion', { fecha: formatDate(venta.sale_date), cliente: nombreCliente, metodo: metodoPago })
      : t('descripcionSinMetodo', { fecha: formatDate(venta.sale_date), cliente: nombreCliente })
    : undefined;

  const sinMotivos = motivos !== null && motivos.length === 0;
  const deshabilitarProcesar = procesando || !venta || sinMotivos || resumen.lineas === 0 || !motivo || !metodoValido;

  const pie = (
    <>
      <Button variant="outline" className="h-10" onClick={() => onAbiertoChange(false)} disabled={procesando}>
        {t('cancelar')}
      </Button>
      <Button className="h-10 gap-2" onClick={() => void procesar()} disabled={deshabilitarProcesar}>
        <Undo2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {procesando ? t('procesando') : t('procesar', { monto: formatear(resumen.total) })}
      </Button>
    </>
  );

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={(v) => !procesando && onAbiertoChange(v)}
      titulo={titulo}
      descripcion={descripcion}
      icono={Undo2}
      ancho={800}
      pantallaCompletaMovil
      ocupado={procesando}
      pie={venta ? pie : undefined}
    >
      {errorCarga ? (
        <EmptyState variante="error" titulo={t('errorCarga')} onReintentar={() => setIntentoCarga((n) => n + 1)} />
      ) : !venta ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            <ChipDocumento tipo="venta" numero={numeroVenta ?? t('ventaSinNumero')} href={`/app/pos/ventas/${venta.id}`} />
          </div>

          {caja === null && (
            <AvisoTonal
              tono="advertencia"
              titulo={t('avisoSinCaja')}
              rol="status"
              compacto
              accion={{ etiqueta: t('abrirCaja'), href: '/app/pos/cajas' }}
            />
          )}
          {sinMotivos && (
            <AvisoTonal tono="advertencia" titulo={tForm('sinMotivos')} rol="alert" compacto accion={{ etiqueta: tForm('irAMotivos'), href: '/app/pos/devoluciones/motivos' }} />
          )}

          {/* 1. Qué se devuelve */}
          <section aria-labelledby="dev-paso-lineas" className="flex flex-col gap-2">
            <h3 id="dev-paso-lineas" className="text-xs font-semibold text-fg-secondary">
              {t('pasoLineas')}
            </h3>
            {lineas.every(agotada) && <AvisoTonal tono="informacion" titulo={tForm('sinItems')} compacto />}
            <ul className="flex flex-col gap-2">
              {lineas.map((l) => (
                <LineaDevolucion
                  key={l.sale_item_id}
                  linea={l}
                  repone={repone}
                  formatear={formatear}
                  cantidad={cantidad}
                  error={intento ? validacion.porLinea[l.sale_item_id] : undefined}
                  onAlternar={(v) => actualizar(l.sale_item_id, (x) => alternarLinea(x, v, repone))}
                  onCantidad={(v) => actualizar(l.sale_item_id, (x) => cambiarCantidad(x, v))}
                  onReingresa={(v) => actualizar(l.sale_item_id, (x) => cambiarReingresa(x, v))}
                  onSerial={(id) => actualizar(l.sale_item_id, (x) => alternarSerial(x, id, repone))}
                  onDisposicion={(id, d) => actualizar(l.sale_item_id, (x) => cambiarDisposicion(x, id, d))}
                />
              ))}
            </ul>
          </section>

          {/* 2. Motivo */}
          <section aria-labelledby="dev-paso-motivo" className="flex flex-col gap-2">
            <h3 id="dev-paso-motivo" className="text-xs font-semibold text-fg-secondary">
              {t('pasoMotivo')}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                etiqueta={t('motivo')}
                obligatorio
                ayuda={motivo ? (repone ? t('motivoAyudaRepone') : t('motivoAyudaNoRepone')) : t('motivoAyuda')}
                error={intento && !motivo ? tForm('validacion.sinMotivoGeneral') : null}
              >
                {(c) => (
                  <Select value={motivoCodigo} onValueChange={elegirMotivo} disabled={!motivos || sinMotivos}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                      <SelectValue placeholder={t('motivoPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(motivos ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.code}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('notas')} ayuda={t('notasAyuda')}>
                {(c) => <Input id={c.id} aria-describedby={c['aria-describedby']} value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} className="h-10" />}
              </FormField>
            </div>
            {motivo?.requires_photo && <AvisoTonal tono="informacion" titulo={t('requiereFoto')} compacto />}
          </section>

          {/* 3. Cómo se reintegra */}
          <section aria-labelledby="dev-paso-reintegro" className="flex flex-col gap-2">
            <h3 id="dev-paso-reintegro" className="text-xs font-semibold text-fg-secondary">
              {t('pasoReintegro')}
            </h3>
            <div role="radiogroup" aria-labelledby="dev-paso-reintegro" className="flex flex-col gap-2">
              <TarjetaSeleccionable
                orientacion="horizontal"
                icono={Banknote}
                titulo={t('efectivo')}
                descripcion={caja === undefined ? t('cajaCargando') : hayCaja ? t('efectivoDescripcion', { sesion: caja }) : t('efectivoBloqueado')}
                seleccionada={metodo === 'cash'}
                deshabilitada={!hayCaja}
                onSeleccionar={() => setMetodo('cash')}
              />
              <TarjetaSeleccionable
                orientacion="horizontal"
                icono={Wallet}
                titulo={t('saldo')}
                descripcion={conCliente ? t('saldoDescripcion', { cliente: nombreCliente }) : t('saldoSinCliente')}
                seleccionada={metodo === 'credit_note'}
                deshabilitada={!conCliente}
                onSeleccionar={() => setMetodo('credit_note')}
              />
              <TarjetaSeleccionable
                orientacion="horizontal"
                icono={CreditCard}
                titulo={t('original')}
                descripcion={hayCaja ? t('originalDescripcion') : t('efectivoBloqueado')}
                seleccionada={metodo === 'original_method'}
                deshabilitada={!hayCaja}
                onSeleccionar={() => setMetodo('original_method')}
              />
            </div>
          </section>

          {intento && validacion.generales.length > 0 && (
            <AvisoTonal
              tono="peligro"
              rol="alert"
              compacto
              titulo={tForm(`validacion.${validacion.generales[0]}`)}
              descripcion={
                validacion.generales.length > 1 ? (
                  <ul className="list-disc pl-4">
                    {validacion.generales.slice(1).map((clave) => (
                      <li key={clave}>{tForm(`validacion.${clave}`)}</li>
                    ))}
                  </ul>
                ) : undefined
              }
            />
          )}

          {/* Resumen del reintegro */}
          <div className="flex flex-col gap-3 rounded-xl bg-subtle p-3 sm:p-4">
            <ListaDatos etiqueta={t('resumen')}>
              <FilaDato etiqueta={t('base')} valor={formatear(resumen.base)} />
              <FilaDato etiqueta={t('impuestos')} valor={formatear(resumen.impuesto)} />
              <FilaDato etiqueta={t('descuento')} valor={formatear(resumen.descuento)} />
              <FilaDato etiqueta={t('total')} valor={formatear(resumen.total)} tono="fuerte" tamano="lg" />
            </ListaDatos>
            {resumen.lineas > 0 && (
              <AvisoTonal
                tono="informacion"
                compacto
                titulo={[
                  numeroVenta ? t('efectoNc', { factura: numeroVenta }) : null,
                  t('efectoInventario', { n: resumen.reingresan }),
                  resumen.completa ? t('efectoVentaTotal') : t('efectoVentaParcial'),
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            )}
          </div>
        </div>
      )}
    </PanelAdaptable>
  );
}

interface LineaDevolucionProps {
  linea: LineaFormulario;
  repone: boolean;
  formatear: (v: number) => string;
  cantidad: (v: number, decimales?: number) => string;
  error?: string;
  onAlternar: (seleccionar: boolean) => void;
  onCantidad: (cantidad: number) => void;
  onReingresa: (reingresa: boolean) => void;
  onSerial: (id: number) => void;
  onDisposicion: (id: number, disposicion: 'in_stock' | 'damaged') => void;
}

/** Una línea de la venta (Figma `LineaDevolucion`): seleccionada · disponible · agotada. */
function LineaDevolucion({ linea: l, formatear, cantidad, error, onAlternar, onCantidad, onReingresa, onSerial, onDisposicion }: LineaDevolucionProps) {
  const t = useTranslations('posDevoluciones.crear');
  const tForm = useTranslations('posDevoluciones.formulario');
  const tComun = useTranslations('posDevoluciones.comun');
  const nombre = l.nombre || tComun('productoNoEncontrado');
  const sinStock = agotada(l);
  const unidad = (v: number) => (l.unidad ? `${cantidad(v, l.decimales)} ${l.unidad}` : cantidad(v, l.decimales));
  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-3 sm:p-4',
        l.seleccionada ? 'border-brand bg-brand-tint' : 'border-line bg-surface',
        sinStock && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Checkbox checked={l.seleccionada} disabled={sinStock} onCheckedChange={(v) => onAlternar(v === true)} aria-label={tForm('seleccionarDe', { producto: nombre })} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-medium', sinStock ? 'text-fg-muted' : 'text-fg')}>{nombre}</p>
          <p className="text-xs text-fg-secondary">
            {sinStock
              ? t('yaDevuelta', { vendidas: unidad(l.vendida) })
              : t('vendidas', { vendidas: unidad(l.vendida), devueltas: unidad(l.devuelta), disponibles: unidad(l.disponible) })}
          </p>
        </div>
        {sinStock ? (
          <Badge tono="neutro" apariencia="suave" tamano="sm">
            {t('agotada')}
          </Badge>
        ) : (
          !l.serializada && (
            <CampoNumero
              valor={l.cantidad}
              onValorChange={(v) => onCantidad(v ?? 0)}
              minimo={0}
              maximo={l.disponible}
              decimales={l.decimales}
              sufijo={l.unidad ?? undefined}
              tamano="sm"
              className="w-28"
              aria-label={t('cantidadDe', { producto: nombre })}
            />
          )
        )}
        <div className="w-28 text-right">
          {l.seleccionada && l.cantidad > 0 ? (
            <>
              <p className="text-sm font-semibold tabular-nums text-fg">{formatear(reintegroLinea(l))}</p>
              {impuestoLinea(l) > 0 && <p className="text-xs text-fg-muted">{t('impuestoIncluido', { monto: formatear(impuestoLinea(l)) })}</p>}
            </>
          ) : (
            <span className="text-fg-muted">—</span>
          )}
        </div>
      </div>

      {l.seleccionada && !l.serializada && (
        <label className="ml-7 inline-flex cursor-pointer items-center gap-2 text-xs text-fg-secondary">
          <Checkbox checked={l.reingresa} onCheckedChange={(v) => onReingresa(v === true)} aria-label={tForm('reingresaDe', { producto: nombre })} />
          {tForm('reingresa')}
        </label>
      )}

      {l.serializada && !sinStock && (
        <div className="ml-7 flex flex-col gap-1">
          {l.seriales.length === 0 ? (
            <p role="alert" className="text-xs text-danger-text">
              {tForm('sinSerialesVendidos')}
            </p>
          ) : (
            l.seriales.map((s) => {
              const elegido = l.seriales_elegidos.includes(s.id);
              const disposicion = l.disposiciones[String(s.id)] ?? 'damaged';
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={elegido} onCheckedChange={() => onSerial(s.id)} />
                    <span className="font-mono text-fg">{s.serial}</span>
                  </label>
                  {elegido && (
                    <div role="radiogroup" aria-label={tForm('disposicionDe', { serial: s.serial })} className="flex items-center gap-3 text-xs text-fg-secondary">
                      <label className="flex items-center gap-1">
                        <input type="radio" name={`disp-${l.sale_item_id}-${s.id}`} checked={disposicion === 'in_stock'} onChange={() => onDisposicion(s.id, 'in_stock')} />
                        {tForm('vuelveAStock')}
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="radio" name={`disp-${l.sale_item_id}-${s.id}`} checked={disposicion === 'damaged'} onChange={() => onDisposicion(s.id, 'damaged')} />
                        {tForm('danado')}
                      </label>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="ml-7 text-xs text-danger-text">
          {tForm(`validacion.${error}`)}
        </p>
      )}
    </li>
  );
}
