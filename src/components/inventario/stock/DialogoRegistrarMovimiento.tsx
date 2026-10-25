'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Info } from 'lucide-react';
import { AvisoTonal, CampoFecha, CampoNumero, Dialogo, FormField } from '@/components/kit';
import { simboloMoneda } from '@/components/kit/documento';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  RUTA_FACTURA_COMPRA,
  asientoCargaInicial,
  asientoSobrante,
  costoParecePrecio,
  cuentaInventarioCargaInicial,
  debeAvisarSaldoInicial,
  debeConfirmarAjuste,
  importeCarga,
  rutaConteo,
  sugerirCompraPorNegativo,
  sugerirCorregirConteo,
} from '@/lib/inventario/cargaInicial';
import { leerConfigInventario } from '@/lib/inventario/permisos';
import type { LoteDisponible } from '@/lib/inventario/nucleo/tipos';
import { supabase } from '@/lib/supabase/config';
import {
  consultarConteoDelMes,
  corregirConteoDelMes,
  listarStock,
  registrarMovimiento,
  type ConteoDelMes,
  type StockFila,
} from '@/lib/services/stockService';
import { guardarLote, lotesDeProducto } from '../lotes/LotesService';
import {
  LARGO_MOTIVO,
  MOTIVOS_ENTRADA,
  MOTIVOS_SALIDA,
  existenciaEn,
  validarMovimiento,
  type CampoMovimiento,
} from './logica';
import { SelectorProductoStock } from './SelectorProductoStock';
import { useAlcanceSucursales, useCantidadStock, useMensajeErrorInventario } from './useInventarioB1';

const LOTE_NUEVO = 'nuevo';

/**
 * «Registrar entrada» (Figma 586:73716) y «Registrar salida» (586:73820).
 *
 * Suma o resta unidades de una sucursal con un motivo. Se guarda como un ajuste
 * aplicado de una línea (`fn_stock_registrar_movimiento` → documento de ajuste de
 * B2 → `fn_inv_int_mover`), así el kardex lo enlaza y el documento hace el único
 * asiento. La entrada recalcula el costo promedio; la salida se valora al costo
 * promedio de la sucursal y no deja la fila en negativo.
 *
 * Producto con lotes: el lote es obligatorio; en la entrada se puede crear aquí
 * mismo (código y vencimiento). Producto con seriales: se registra desde Ajustes,
 * que pide los seriales.
 */
export interface DialogoRegistrarMovimientoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  direccion: 'in' | 'out';
  organizacionId: number;
  /** Producto preseleccionado (menú ⋯ de la fila). */
  producto?: StockFila | null;
  sucursalId?: number | null;
  loteId?: number | null;
  /** Mostrar la valoración (permiso `costos`). */
  verCostos: boolean;
  /** El paso de puesta en marcha abre la entrada como saldo inicial. */
  motivoInicial?: string;
  onRegistrado?: (resultado: { numero: string | null; productoId: number }) => void;
}

export function DialogoRegistrarMovimiento(props: DialogoRegistrarMovimientoProps) {
  // Se monta de nuevo cada vez que se abre: el formulario empieza limpio.
  if (!props.abierto) return null;
  return <Formulario {...props} />;
}

function Formulario({
  abierto,
  onAbiertoChange,
  direccion,
  organizacionId,
  producto: productoInicial,
  sucursalId: sucursalInicial,
  loteId: loteInicial,
  verCostos,
  motivoInicial,
  onRegistrado,
}: DialogoRegistrarMovimientoProps) {
  const entrada = direccion === 'in';
  const t = useTranslations('inventarioStock.registrar');
  const tm = useTranslations('inventarioStock.motivos');
  const tv = useTranslations('inventario.vencimiento');
  const { toast } = useToast();
  const mensajeError = useMensajeErrorInventario();
  const entero = useCantidadStock();
  const moneda = useMonedaOrganizacion();
  const { formatPlain, getToday } = useFormatDate();
  const { branches, sucursalActiva } = useAlcanceSucursales();
  const { organization } = useOrganization();

  const [producto, setProducto] = useState<StockFila | null>(productoInicial ?? null);
  const [sucursalId, setSucursalId] = useState<number | null>(sucursalInicial ?? sucursalActiva);
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [costo, setCosto] = useState<number | null>(entrada ? productoInicial?.costo_promedio ?? null : null);
  const [motivo, setMotivo] = useState<string>(entrada ? motivoInicial ?? 'sobrante' : 'merma_vencido');
  const [motivoOtro, setMotivoOtro] = useState('');
  const [nota, setNota] = useState('');
  const [lotes, setLotes] = useState<LoteDisponible[]>([]);
  const [loteSel, setLoteSel] = useState<string>(loteInicial ? String(loteInicial) : '');
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [nuevoVence, setNuevoVence] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [movimientosPrevios, setMovimientosPrevios] = useState<number | null>(null);
  const [precioVenta, setPrecioVenta] = useState<number | null>(null);
  const [umbral, setUmbral] = useState<number | null>(5_000_000);
  const [costoConfirmado, setCostoConfirmado] = useState(false);
  const [saldoDescartado, setSaldoDescartado] = useState(false);
  const [conteoMes, setConteoMes] = useState<ConteoDelMes | null>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const primerError = useRef<HTMLDivElement>(null);

  // Al cambiar de sucursal se vuelve a leer la fila del producto en esa sucursal
  // (disponible y costo promedio), y sus lotes.
  const productoId = producto?.product_id ?? null;
  // Vista previa = lo que postea el SQL (fn_clasificar_producto_restaurante): en hoteles/restaurantes un
  // ingrediente de receta va a 14050501 solo si la org tiene la separación insumo/reventa activa.
  const tipoOrg = typeof organization?.type_id === 'number' ? organization.type_id : null;
  const [insumo, setInsumo] = useState<{ esIngrediente: boolean; separar: boolean }>({ esIngrediente: false, separar: false });
  useEffect(() => {
    setInsumo({ esIngrediente: false, separar: false });
    if (!productoId || (tipoOrg !== 1 && tipoOrg !== 2)) return;
    let vivo = true;
    void Promise.all([
      supabase.from('recipe_ingredients').select('id', { count: 'exact', head: true }).eq('ingredient_product_id', productoId),
      supabase.rpc('fn_separacion_insumos_activa', { p_org: organizacionId }),
    ]).then(([ing, sep]) => {
      if (!vivo) return;
      setInsumo({ esIngrediente: !ing.error && (ing.count ?? 0) > 0, separar: !sep.error && sep.data === true });
    });
    return () => {
      vivo = false;
    };
  }, [organizacionId, productoId, tipoOrg]);
  useEffect(() => {
    if (!productoId || !sucursalId) return;
    let vivo = true;
    listarStock(organizacionId, { producto: productoId, agrupar: false, sucursales: [sucursalId] }, 0, 5)
      .then((r) => {
        const fila = r.filas.find((f) => f.product_id === productoId);
        if (vivo && fila) setProducto(fila);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [organizacionId, productoId, sucursalId]);

  useEffect(() => {
    if (!entrada || !productoId || !sucursalId) {
      setConteoMes(null);
      return;
    }
    let vivo = true;
    consultarConteoDelMes(organizacionId, sucursalId, productoId)
      .then((c) => {
        if (vivo) setConteoMes(c);
      })
      .catch(() => {
        if (vivo) setConteoMes(null);
      });
    return () => {
      vivo = false;
    };
  }, [entrada, organizacionId, productoId, sucursalId]);

  useEffect(() => {
    let vivo = true;
    leerConfigInventario(organizacionId)
      .then((c) => {
        if (vivo) setUmbral(c.monto_confirmacion_ajuste);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [organizacionId]);

  useEffect(() => {
    if (!productoId) {
      setMovimientosPrevios(null);
      setPrecioVenta(null);
      return;
    }
    let vivo = true;
    void supabase
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizacionId)
      .eq('product_id', productoId)
      .then(({ count, error }) => {
        if (!vivo || error) return;
        setMovimientosPrevios(count ?? 0);
      });
    void supabase
      .from('product_prices')
      .select('price')
      .eq('product_id', productoId)
      .is('effective_to', null)
      .order('effective_from', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!vivo) return;
        const precio = data?.[0]?.price;
        setPrecioVenta(precio == null ? null : Number(precio));
      });
    return () => {
      vivo = false;
    };
  }, [organizacionId, productoId]);

  useEffect(() => {
    setCostoConfirmado(false);
  }, [costo, precioVenta]);

  useEffect(() => {
    setSaldoDescartado(false);
  }, [productoId]);

  const conLotes = producto?.con_lotes ?? false;
  useEffect(() => {
    if (!productoId || !conLotes) {
      setLotes([]);
      return;
    }
    let vivo = true;
    lotesDeProducto(organizacionId, productoId, sucursalId)
      .then((l) => {
        if (vivo) setLotes(l);
      })
      .catch(() => {
        if (vivo) setLotes([]);
      });
    return () => {
      vivo = false;
    };
  }, [organizacionId, productoId, sucursalId, conLotes]);

  const lotesVisibles = useMemo(() => (entrada ? lotes : lotes.filter((l) => l.qty_on_hand > 0 || String(l.lot_id) === loteSel)), [entrada, lotes, loteSel]);
  const loteElegido = lotes.find((l) => String(l.lot_id) === loteSel) ?? null;
  const enSucursal = producto ? existenciaEn(producto, sucursalId) : null;
  const disponible = entrada ? null : conLotes ? (loteElegido?.qty_on_hand ?? null) : (enSucursal?.existencia ?? (producto ? 0 : null));
  const unidad = producto?.unidad ?? t('uds');

  const errores = validarMovimiento({
    direccion,
    productoId,
    sucursalId,
    cantidad,
    costo,
    motivo,
    motivoOtro,
    loteId: loteSel === LOTE_NUEVO ? -1 : loteSel ? Number(loteSel) : null,
    conLotes,
    conSeriales: producto?.con_seriales ?? false,
    disponible,
  });
  const hayErrores = Object.keys(errores).length > 0;
  const textoError = (campo: CampoMovimiento): string | null => {
    const e = errores[campo];
    if (!intentado || !e) return null;
    if (e === 'superaDisponible') return t('errores.superaDisponible', { n: entero(disponible ?? 0) });
    return t(`errores.${e}`);
  };

  // El documento guarda el código (`saldo_inicial`, `sobrante`…), no la etiqueta.
  // El saldo inicial acredita 3105. Un sobrante real acredita 4295. «Otro» sí lleva el texto.
  const motivoEnvio = (motivo === 'otro' ? motivoOtro.trim() : motivo).slice(0, LARGO_MOTIVO);
  const existenciaActual = enSucursal?.existencia ?? producto?.existencia ?? null;
  const desdeNegativo = entrada && sugerirCompraPorNegativo(existenciaActual);
  const sinHistorial =
    !saldoDescartado &&
    movimientosPrevios !== null &&
    debeAvisarSaldoInicial({ movimientosPrevios, direccion, cantidad: cantidad ?? 0 });
  const avisoCosto = entrada && costoParecePrecio(costo, precioVenta);
  const montoMovimiento = entrada ? importeCarga(cantidad ?? 0, costo ?? 0) : 0;
  const pideConfirmacion =
    entrada &&
    debeConfirmarAjuste({
      creadaEn: organization?.isPartial ? null : organization?.created_at,
      ahora: new Date(),
      monto: montoMovimiento,
      umbral,
    });
  const cuentaInventario = cuentaInventarioCargaInicial({
    typeId: tipoOrg,
    producto: { esIngrediente: insumo.esIngrediente },
    separarInsumos: insumo.separar,
  });
  const asientoInicial =
    motivo === 'saldo_inicial' && (cantidad ?? 0) > 0 && costo !== null
      ? asientoCargaInicial({ unidades: cantidad ?? 0, costo, cuentaInventario })
      : null;
  const asientoDelSobrante =
    entrada && motivo !== 'saldo_inicial' && motivo !== 'compra_sin_orden' && montoMovimiento > 0
      ? asientoSobrante({ total: montoMovimiento, cuentaInventario })
      : null;
  const ofreceCorregir = sugerirCorregirConteo({
    direccion,
    motivo: motivoEnvio,
    tuvoConteoOFaltante: conteoMes !== null,
  });

  const enviar = useCallback(async () => {
    setIntentado(true);
    if (hayErrores || !producto || !sucursalId || (pideConfirmacion && !nota.trim()) || (avisoCosto && !costoConfirmado)) {
      requestAnimationFrame(() => primerError.current?.querySelector<HTMLElement>('[aria-invalid="true"], button, input')?.focus());
      return;
    }
    setGuardando(true);
    try {
      let loteId: number | null = loteSel && loteSel !== LOTE_NUEVO ? Number(loteSel) : null;
      if (loteSel === LOTE_NUEVO) {
        const creado = await guardarLote(organizacionId, {
          product_id: producto.product_id,
          lot_code: nuevoCodigo.trim() || null,
          expiry_date: nuevoVence || null,
          branch_id: sucursalId,
        });
        loteId = creado.lot_id;
      }
      const r = await registrarMovimiento({
        p_org: organizacionId,
        p_branch: sucursalId,
        p_product: producto.product_id,
        p_lot: loteId,
        p_direccion: direccion,
        p_qty: cantidad ?? 0,
        p_costo: entrada ? costo : null,
        p_motivo: motivoEnvio,
        p_nota: nota.trim() || null,
      });
      toast({
        title: entrada ? t('listoEntrada') : t('listoSalida'),
        description: r.numero ? t('listoDocumento', { numero: r.numero }) : undefined,
      });
      onRegistrado?.({ numero: r.numero, productoId: producto.product_id });
      onAbiertoChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: entrada ? t('errorEntrada') : t('errorSalida'), description: mensajeError(e) });
    } finally {
      setGuardando(false);
    }
  }, [
    hayErrores,
    producto,
    sucursalId,
    loteSel,
    organizacionId,
    nuevoCodigo,
    nuevoVence,
    direccion,
    cantidad,
    entrada,
    costo,
    motivoEnvio,
    pideConfirmacion,
    avisoCosto,
    costoConfirmado,
    nota,
    toast,
    t,
    onRegistrado,
    onAbiertoChange,
    mensajeError,
  ]);

  const alCorregirConteo = useCallback(async () => {
    if (!producto || !sucursalId || !conteoMes || conteoMes.varios) return;
    setCorrigiendo(true);
    try {
      const r = await corregirConteoDelMes(organizacionId, sucursalId, producto.product_id, nota.trim() || null);
      if (!r.corregido) {
        toast({ variant: 'destructive', title: t('corregirConteoVarios') });
        return;
      }
      toast({ title: t('corregirConteoListo', { codigo: r.codigo ?? conteoMes.codigo ?? '' }) });
      onRegistrado?.({ numero: r.codigo, productoId: producto.product_id });
      onAbiertoChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: t('errorEntrada'), description: mensajeError(e) });
    } finally {
      setCorrigiendo(false);
    }
  }, [producto, sucursalId, conteoMes, organizacionId, nota, toast, t, onRegistrado, onAbiertoChange, mensajeError]);

  const valorSalida = !entrada && verCostos && producto?.costo_promedio && cantidad ? producto.costo_promedio * cantidad : null;
  const motivos = entrada ? MOTIVOS_ENTRADA : MOTIVOS_SALIDA;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={entrada ? t('tituloEntrada') : t('tituloSalida')}
      descripcion={entrada ? t('descripcionEntrada') : t('descripcionSalida')}
      ancho={560}
      icono={entrada ? ArrowDownCircle : ArrowUpCircle}
        primario={{
        etiqueta: entrada ? t('confirmarEntrada') : t('confirmarSalida'),
        onClick: () => void enviar(),
        cargando: guardando || corrigiendo,
        deshabilitada: motivo === 'compra_sin_orden' || (avisoCosto && !costoConfirmado),
        motivo: avisoCosto && !costoConfirmado ? t('costoParecePrecio') : undefined,
      }}
    >
      <div ref={primerError} className="flex flex-col gap-4">
        <FormField etiqueta={t('producto')} obligatorio error={textoError('producto')}>
          {(c) => (
            <div aria-invalid={c['aria-invalid']} aria-describedby={c['aria-describedby']}>
              <SelectorProductoStock
                id={c.id}
                organizacionId={organizacionId}
                sucursalId={sucursalId}
                valor={producto}
                etiqueta={t('producto')}
                onCambiar={(f) => {
                  setProducto(f);
                  setLoteSel('');
                  if (entrada && costo === null && f.costo_promedio !== null) setCosto(f.costo_promedio);
                }}
              />
            </div>
          )}
        </FormField>
        {producto?.con_seriales && (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning-text">
            <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
            {t('conSeriales')}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('sucursal')} obligatorio error={textoError('sucursal')} ayuda={t('sucursalAyuda')}>
            {(c) => (
              <Select value={sucursalId ? String(sucursalId) : ''} onValueChange={(v) => setSucursalId(Number(v))}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} aria-invalid={c['aria-invalid']} className="h-10">
                  <SelectValue placeholder={t('elegirSucursal')} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField
            etiqueta={t('cantidad')}
            obligatorio
            error={textoError('cantidad')}
            ayuda={
              disponible !== null
                ? conLotes
                  ? t('disponibleLote', { n: entero(disponible) })
                  : t('disponibleSucursal', { n: entero(disponible) })
                : enSucursal
                  ? t('hoyHay', { n: entero(enSucursal.existencia) })
                  : undefined
            }
          >
            <CampoNumero valor={cantidad} onValorChange={setCantidad} decimales={3} minimo={0} sufijo={unidad} />
          </FormField>
        </div>

        <div className={entrada ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : 'flex flex-col gap-4'}>
          {entrada && (
            <FormField etiqueta={t('costoUnitario')} obligatorio error={textoError('costo')} ayuda={t('costoAyuda')}>
              <CampoNumero valor={costo} onValorChange={setCosto} decimales={moneda.decimals} minimo={0} prefijo={simboloMoneda(moneda)} />
            </FormField>
          )}
          <FormField etiqueta={t('motivo')} obligatorio error={textoError('motivo')}>
            {(c) => (
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} aria-invalid={c['aria-invalid']} className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {motivos.map((m) => (
                    <SelectItem key={m} value={m}>
                      {tm(`${entrada ? 'entrada' : 'salida'}.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
        {motivo === 'otro' && (
          <FormField etiqueta={t('motivoOtro')} obligatorio>
            <Input value={motivoOtro} maxLength={LARGO_MOTIVO} onChange={(e) => setMotivoOtro(e.target.value)} />
          </FormField>
        )}

        {conLotes && (
          <FormField etiqueta={t('lote')} obligatorio error={textoError('lote')} ayuda={entrada ? t('loteAyudaEntrada') : undefined}>
            {(c) => (
              <Select value={loteSel} onValueChange={setLoteSel}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} aria-invalid={c['aria-invalid']} className="h-10">
                  <SelectValue placeholder={lotesVisibles.length ? t('elegirLote') : t('sinLotes')} />
                </SelectTrigger>
                <SelectContent>
                  {lotesVisibles.map((l) => {
                    const vencido = !!l.expiry_date && l.expiry_date < getToday();
                    const vence = l.expiry_date
                      ? vencido
                        ? t('loteVencio', { fecha: formatPlain(l.expiry_date) })
                        : t('loteVence', { fecha: formatPlain(l.expiry_date) })
                      : tv('sin_vencimiento');
                    return (
                      <SelectItem key={l.lot_id} value={String(l.lot_id)}>
                        {t('opcionLote', { codigo: l.lot_code, vence, n: entero(l.qty_on_hand) })}
                      </SelectItem>
                    );
                  })}
                  {entrada && (
                    <>
                      {lotesVisibles.length > 0 && <SelectSeparator />}
                      <SelectItem value={LOTE_NUEVO}>{t('crearLote')}</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}
        {conLotes && loteSel === LOTE_NUEVO && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-subtle p-3 sm:grid-cols-2">
            <FormField etiqueta={t('codigoLote')} ayuda={t('codigoLoteAyuda')}>
              <Input value={nuevoCodigo} maxLength={60} onChange={(e) => setNuevoCodigo(e.target.value)} />
            </FormField>
            <FormField etiqueta={t('venceLote')} ayuda={t('venceLoteAyuda')}>
              {(c) => <CampoFecha id={c.id} valor={nuevoVence || null} onValorChange={setNuevoVence} hoy={getToday()} limpiable />}
            </FormField>
          </div>
        )}

        {entrada && motivo === 'compra_sin_orden' && (
          <AvisoTonal
            tono="advertencia"
            rol="alert"
            titulo={t('errores.facturaCompra')}
            accion={{ etiqueta: t('registrarCompra'), href: RUTA_FACTURA_COMPRA }}
          />
        )}
        {desdeNegativo && (
          <AvisoTonal
            tono="advertencia"
            rol="alert"
            titulo={t('desdeNegativo')}
            descripcion={t('desdeNegativoDetalle')}
            accion={{ etiqueta: t('registrarCompra'), href: RUTA_FACTURA_COMPRA }}
          />
        )}
        {ofreceCorregir && conteoMes && (
          <AvisoTonal
            tono="advertencia"
            titulo={t('corregirConteo')}
            descripcion={
              conteoMes.varios
                ? t('corregirConteoVarios')
                : t('corregirConteoDetalle', { codigo: conteoMes.codigo ?? String(conteoMes.ajusteId) })
            }
            accion={
              conteoMes.varios
                ? { etiqueta: t('abrirConteo'), href: rutaConteo(conteoMes.ajusteId) }
                : { etiqueta: t('corregirConteo'), onClick: () => void alCorregirConteo(), cargando: corrigiendo }
            }
          />
        )}
        {sinHistorial && motivo !== 'saldo_inicial' && (
          <AvisoTonal
            tono="advertencia"
            titulo={t('sinHistorial')}
            acciones={[
              { etiqueta: t('siSaldoInicial'), onClick: () => setMotivo('saldo_inicial') },
              {
                etiqueta: t('noSobrante'),
                onClick: () => {
                  setMotivo('sobrante');
                  setSaldoDescartado(true);
                },
              },
            ]}
          />
        )}
        {avisoCosto && (
          <AvisoTonal
            tono="advertencia"
            titulo={t('costoParecePrecio')}
            accion={{ etiqueta: t('costoEsCorrecto'), onClick: () => setCostoConfirmado(true) }}
          />
        )}
        {pideConfirmacion && (
          <AvisoTonal tono="advertencia" titulo={t('confirmarAjuste')} descripcion={t('confirmarAjusteDetalle')} />
        )}
        {asientoInicial && (
          <AvisoTonal
            tono="informacion"
            titulo={t('asientoTitulo')}
            descripcion={t('asientoDetalle', {
              inventario: asientoInicial.lineas[0]?.cuenta ?? '',
              saldo: asientoInicial.lineas[1]?.cuenta ?? '',
              total: moneda.formatear(asientoInicial.total),
            })}
          />
        )}
        {asientoDelSobrante && (
          <AvisoTonal
            tono="informacion"
            titulo={t('asientoSobranteTitulo')}
            descripcion={t('asientoSobranteDetalle', {
              inventario: asientoDelSobrante.lineas[0]?.cuenta ?? '',
              diversos: asientoDelSobrante.lineas[1]?.cuenta ?? '',
              total: moneda.formatear(asientoDelSobrante.total),
            })}
          />
        )}

        <FormField etiqueta={t('nota')} obligatorio={pideConfirmacion} error={intentado && pideConfirmacion && !nota.trim() ? t('errores.notaObligatoria') : null}>
          <Input value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder={t('notaPlaceholder')} />
        </FormField>

        {entrada ? (
          <p className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-2.5 text-xs text-fg-secondary">
            <Info aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.5} />
            {t('avisoEntrada')}
          </p>
        ) : (
          valorSalida !== null && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-xs text-warning-text">
              <AlertTriangle aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.5} />
              {t('avisoSalida', {
                costo: moneda.formatear(producto?.costo_promedio ?? 0),
                n: entero(cantidad ?? 0),
                total: moneda.formatear(valorSalida),
              })}
            </p>
          )
        )}
      </div>
    </Dialogo>
  );
}
