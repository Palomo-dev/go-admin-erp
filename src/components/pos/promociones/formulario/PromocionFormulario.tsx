'use client';

/**
 * «Nueva / Editar promoción» en UNA pantalla (Figma 05 POS y ventas, A2 2999:193484,
 * A2b 3002:193908 y A4 3004:194322; aprobado el 2026-11-24). Reemplaza al asistente de
 * 4 pasos. Lo esencial arriba (nombre y tipo), el descuento según el tipo, a qué
 * productos, dónde y cuándo, y lo avanzado plegado al final. A la derecha, «Así lo ve
 * tu cliente» y «En palabras».
 *
 * Mejoras suman, no quitan: todo lo que el asistente guardaba sigue aquí (descripción
 * como nota interna, cantidad mínima, repetir cada N, tope, compra mínima y su alcance,
 * métodos de pago, sucursales, horario semanal, canales, límite de usos, combinable).
 * La «Prioridad» ya no se pide: si dos promociones chocan y no se suman, gana la que más
 * ahorra. La columna sigue en la base y al editar se conserva su valor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Ban,
  Boxes,
  Check,
  DollarSign,
  FileText,
  Globe,
  Layers,
  Percent,
  Plus,
  ShoppingCart,
  Ticket,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { FormSection } from '@/components/kit/FormSection';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { TarjetaSeleccionable } from '@/components/kit/TarjetaSeleccionable';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { SeccionPlegable } from '@/components/kit/SeccionPlegable';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { clasesBoton } from '@/components/kit/botonClases';
import { formatearEnteroEn, localeIntl } from '@/components/kit/idioma';
import { cn } from '@/utils/Utils';
import { metodosPagoParaPromocion } from '@/lib/finanzas/metodosPagoAlcance';
import { minimoDelFormulario } from '@/lib/promotions/cantidadMinima';
import { columnasDeHorario, horarioDesdeColumnas, validarHorario, type HorarioFormulario } from '@/lib/promotions/horarioPromocion';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { plainDayOfInstant } from '@/lib/services/businessInstant';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { PromotionsService } from '../promotionsService';
import { AvisoSolapamiento, type ConflictoSolape } from '../nuevo/AvisoSolapamiento';
import { SelectorHorarioPromocion } from '../horario/SelectorHorarioPromocion';
import {
  TIPOS_SELECTOR,
  type CreatePromotionData,
  type PromotionType,
  type TiersCountMode,
} from '../types';
import {
  ORDEN_ERRORES,
  ahorroPorcentaje,
  alcanceDesdeReglas,
  cambiarTipo,
  cambiosAvanzados,
  escalonesDesdeFilas,
  filasDesdeEscalones,
  hastaDeEscalones,
  reglasDesdeAlcance,
  validarPromocion,
  type Alcance,
  type CampoError,
  type EscalonFormulario,
  type ModoEscalon,
  type SeleccionAlcance,
} from './logicaFormulario';
import { diaEnPalabras, textoEnPalabras } from './textoEnPalabras';
import { VistaPreviaCliente, type ProductoEjemplo } from './VistaPreviaCliente';
import { SelectorProductosPromocion, etiquetaProducto, type ProductoPromocion } from './SelectorProductosPromocion';

interface Props {
  initialData?: CreatePromotionData;
  promotionId?: string;
  /** Nombres de los productos ya guardados en las reglas (al editar). */
  nombresProductos?: Record<number, string>;
  onSuccess?: () => void;
}

const ICONO_TIPO: Record<PromotionType, LucideIcon> = {
  percentage: Percent,
  fixed_amount: DollarSign,
  buy_x_get_y: Ticket,
  bundle: Boxes,
  free_shipping: Globe,
  volume_tiers: Layers,
};

const ID_CAMPO: Record<CampoError, string> = {
  nombre: 'promo-nombre',
  porcentaje: 'promo-porcentaje',
  monto: 'promo-monto',
  compra: 'promo-compra',
  lleva: 'promo-lleva',
  precioPaquete: 'promo-precio-paquete',
  porcentajePaquete: 'promo-porcentaje-paquete',
  escalones: 'promo-escalones',
  alcance: 'promo-alcance',
  canales: 'promo-canales',
  fechaInicio: 'promo-fecha-inicio',
  fechaFin: 'promo-fecha-fin',
  grupoClientes: 'promo-grupo',
};

const MODOS_CONTEO: readonly TiersCountMode[] = ['promotion_mix', 'same_product', 'same_variant', 'product_group'];

function diaDelFormulario(valor: string, timezone: string): string {
  return valor.length <= 10 ? valor : plainDayOfInstant(valor, timezone);
}

function enteroDelCampo(valor: string): number | null {
  if (valor.trim() === '') return null;
  const n = Math.trunc(Number(valor));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function numeroDelCampo(valor: string): number | undefined {
  if (valor.trim() === '') return undefined;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function PromocionFormulario({ initialData, promotionId, nombresProductos, onSuccess }: Props) {
  const router = useRouter();
  const t = useTranslations('posPromociones');
  const locale = useLocale();
  const { formatear } = useMonedaOrganizacion();
  const { getToday, timezone } = useFormatDate();
  const editando = promotionId != null;

  const [formData, setFormData] = useState<CreatePromotionData>(() => {
    const base: CreatePromotionData = {
      name: '',
      description: '',
      promotion_type: 'percentage',
      discount_value: 10,
      buy_quantity: 2,
      get_quantity: 1,
      min_purchase_amount: undefined,
      min_purchase_scope: null,
      min_quantity: null,
      repeat_every_quantity: null,
      max_discount_amount: undefined,
      applies_to: 'all',
      start_date: getToday(),
      end_date: undefined,
      is_active: true,
      usage_limit: undefined,
      usage_limit_per_customer: null,
      customer_segment_id: null,
      tiers_count_mode: 'promotion_mix',
      is_combinable: false,
      applies_with_price_lists: true,
      applies_to_web: true,
      applies_to_pos: true,
      applies_to_finances: false,
      applicable_days: null,
      rules: [],
      ...initialData,
      ...(initialData?.start_date ? { start_date: diaDelFormulario(initialData.start_date, timezone) } : {}),
      ...(initialData?.end_date ? { end_date: diaDelFormulario(initialData.end_date, timezone) } : {}),
    };
    return minimoDelFormulario(base, editando);
  });
  const [seleccion, setSeleccion] = useState<SeleccionAlcance>(() =>
    alcanceDesdeReglas(initialData?.applies_to ?? 'all', initialData?.rules ?? []),
  );
  const inicialEscalones = useMemo(() => escalonesDesdeFilas(initialData?.tiers), [initialData?.tiers]);
  const [modoEscalon, setModoEscalon] = useState<ModoEscalon>(inicialEscalones.modo);
  const [escalones, setEscalones] = useState<EscalonFormulario[]>(inicialEscalones.escalones);
  const [horario, setHorario] = useState<HorarioFormulario>(() => horarioDesdeColumnas(initialData ?? {}));
  const [soloGrupo, setSoloGrupo] = useState<boolean>(!!initialData?.customer_segment_id);
  const [errores, setErrores] = useState<Partial<Record<CampoError, string>>>({});
  const [mostrarErroresHorario, setMostrarErroresHorario] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [avanzadasAbiertas, setAvanzadasAbiertas] = useState(false);
  const [excluirAbierto, setExcluirAbierto] = useState(
    seleccion.excluirProductos.length + seleccion.excluirCategorias.length > 0,
  );

  const [categorias, setCategorias] = useState<{ id: number; name: string }[]>([]);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [sucursales, setSucursales] = useState<{ id: number; name: string }[]>([]);
  const [metodosPago, setMetodosPago] = useState<{ code: string; name: string; branch_ids: number[] | null }[]>([]);
  const [segmentos, setSegmentos] = useState<{ id: string; name: string; customer_count: number | null }[]>([]);
  const [conflictos, setConflictos] = useState<ConflictoSolape[]>([]);
  const nombres = useRef<Map<number, string>>(new Map(Object.entries(nombresProductos ?? {}).map(([k, v]) => [Number(k), v])));
  const [, forzar] = useState(0);
  const [ejemplo, setEjemplo] = useState<ProductoEjemplo>({ nombre: '', precio: 0 });

  const columnasHorario = columnasDeHorario(horario);

  useEffect(() => {
    PromotionsService.getCategories().then(setCategorias).catch(() => setCategorias([]));
    PromotionsService.getMarcas().then(setMarcas).catch(() => setMarcas([]));
    PromotionsService.getBranches().then(setSucursales).catch(() => setSucursales([]));
    PromotionsService.getMetodosPago().then(setMetodosPago).catch(() => setMetodosPago([]));
    PromotionsService.getSegmentos().then(setSegmentos).catch(() => setSegmentos([]));
  }, []);

  const conocerProductos = useCallback((lista: ProductoPromocion[]) => {
    let cambio = false;
    for (const p of lista) {
      if (!nombres.current.has(p.id)) {
        nombres.current.set(p.id, etiquetaProducto(p));
        cambio = true;
      }
    }
    if (cambio) forzar((n) => n + 1);
  }, []);

  // Producto de ejemplo de la vista previa: el primero elegido, con su precio vigente.
  const primerProducto = seleccion.alcance === 'productos' ? seleccion.productos[0] : undefined;
  useEffect(() => {
    let vivo = true;
    const generico = { nombre: t('v2.vista.productoEjemplo'), precio: 10000 };
    if (primerProducto == null) {
      setEjemplo(generico);
      return;
    }
    PromotionsService.getPrecioVigente(primerProducto)
      .then((precio) => {
        if (!vivo) return;
        setEjemplo({ nombre: nombres.current.get(primerProducto) ?? generico.nombre, precio: precio ?? generico.precio });
      })
      .catch(() => {
        if (vivo) setEjemplo(generico);
      });
    return () => {
      vivo = false;
    };
  }, [primerProducto, t]);

  const cambiar = <K extends keyof CreatePromotionData>(campo: K, valor: CreatePromotionData[K]) =>
    setFormData((prev) => ({ ...prev, [campo]: valor }));

  const quitarError = (...campos: CampoError[]) =>
    setErrores((prev) => {
      if (campos.every((c) => !prev[c])) return prev;
      const next = { ...prev };
      campos.forEach((c) => delete next[c]);
      return next;
    });

  const tiers = useMemo(() => filasDesdeEscalones(modoEscalon, escalones), [modoEscalon, escalones]);
  const { applies_to, rules } = useMemo(
    () => reglasDesdeAlcance(seleccion, formData.promotion_type, (formData.tiers_count_mode ?? 'promotion_mix') as TiersCountMode),
    [seleccion, formData.promotion_type, formData.tiers_count_mode],
  );

  // Aviso de cruce con otras promociones no combinables (se conserva del asistente).
  const firmaSolape = JSON.stringify([
    formData.is_combinable, formData.is_active, applies_to, rules, formData.start_date, formData.end_date,
    columnasHorario, formData.branches ?? [], formData.applies_to_web, formData.applies_to_pos, formData.applies_to_finances,
    promotionId ?? '',
  ]);
  useEffect(() => {
    if (formData.is_combinable || formData.is_active === false) {
      setConflictos([]);
      return;
    }
    let vivo = true;
    const timer = setTimeout(() => {
      void PromotionsService.conflictosSolapados({
        id: promotionId ?? '',
        name: formData.name || '',
        is_combinable: formData.is_combinable === true,
        is_active: formData.is_active !== false,
        applies_to,
        branches: formData.branches ?? null,
        applies_to_web: formData.applies_to_web,
        applies_to_pos: formData.applies_to_pos,
        applies_to_finances: formData.applies_to_finances,
        start_date: formData.start_date,
        end_date: formData.end_date,
        applicable_days: columnasHorario.applicable_days,
        start_time: columnasHorario.start_time,
        end_time: columnasHorario.end_time,
        schedule_windows: columnasHorario.schedule_windows,
        rules: rules.map((r) => ({ rule_type: r.rule_type, product_id: r.product_id ?? null, category_id: r.category_id ?? null })),
      })
        .then((lista) => vivo && setConflictos(lista))
        .catch(() => vivo && setConflictos([]));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
    // firmaSolape resume los campos que deciden el aviso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaSolape]);

  // ── Textos derivados ──────────────────────────────────────────────────────
  const unir = (xs: readonly string[]) =>
    new Intl.ListFormat(localeIntl(locale), { style: 'long', type: 'conjunction' }).format([...xs]);
  const nombresAlcance =
    seleccion.alcance === 'categorias'
      ? seleccion.categorias.map((id) => categorias.find((c) => c.id === id)?.name ?? `#${id}`)
      : seleccion.alcance === 'productos'
        ? seleccion.productos.map((id) => nombres.current.get(id) ?? `#${id}`)
        : seleccion.alcance === 'marcas'
          ? seleccion.marcas
          : [];
  const nombreSegmento = soloGrupo ? (segmentos.find((s) => s.id === formData.customer_segment_id)?.name ?? null) : null;
  const enPalabras = textoEnPalabras({ ...formData, applies_to }, tiers, {
    t,
    formatear,
    fecha: (dia) => diaEnPalabras(dia, localeIntl(locale)),
    nombresAlcance: nombresAlcance.length > 4 ? [t('v2.palabras.nElementos', { n: nombresAlcance.length })] : nombresAlcance,
    sucursales: (formData.branches ?? []).map((id) => sucursales.find((s) => s.id === Number(id))?.name ?? `#${id}`),
    segmento: nombreSegmento,
    unir,
  });

  // ── Guardar ───────────────────────────────────────────────────────────────
  const guardar = async () => {
    const errs = validarPromocion({ datos: formData, seleccion, modoEscalon, escalones, soloGrupo });
    setErrores(errs);
    const primero = ORDEN_ERRORES.find((c) => errs[c]);
    const horarioMal = validarHorario(horario);
    if (horarioMal) setMostrarErroresHorario(true);
    if (primero || horarioMal) {
      toast.error(primero ? t(errs[primero]!) : t('horario.errorRevisar'));
      if (primero) document.getElementById(ID_CAMPO[primero])?.focus();
      return;
    }
    setGuardando(true);
    try {
      const esVolumen = formData.promotion_type === 'volume_tiers';
      const datos: CreatePromotionData = {
        ...formData,
        ...columnasHorario,
        applies_to,
        rules,
        discount_value: esVolumen ? 0 : formData.discount_value,
        tiers: esVolumen ? tiers : [],
        tiers_count_mode: (formData.tiers_count_mode ?? 'promotion_mix') as TiersCountMode,
        customer_segment_id: soloGrupo ? formData.customer_segment_id ?? null : null,
        usage_limit_per_customer: formData.usage_limit_per_customer ?? null,
      };
      if (promotionId) {
        await PromotionsService.update(promotionId, datos);
        toast.success(t('formulario.actualizada'));
      } else {
        await PromotionsService.create(datos);
        toast.success(t('formulario.creada'));
      }
      if (onSuccess) onSuccess();
      else router.push('/app/pos/promociones');
    } catch (error: unknown) {
      toast.error((error as { message?: string } | null)?.message || t('formulario.errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const error = (campo: CampoError) =>
    errores[campo] ? (
      <p id={`${ID_CAMPO[campo]}-error`} role="alert" className="mt-1 text-xs text-danger-text">{t(errores[campo]!)}</p>
    ) : null;
  const aria = (campo: CampoError) => ({
    'aria-invalid': errores[campo] ? true : undefined,
    'aria-describedby': errores[campo] ? `${ID_CAMPO[campo]}-error` : undefined,
    className: errores[campo] ? 'border-line-danger' : undefined,
  });

  const tipo = formData.promotion_type;
  const tiposVisibles: PromotionType[] = tipo === 'free_shipping' ? [...TIPOS_SELECTOR, 'free_shipping'] : [...TIPOS_SELECTOR];
  const precioNormal = ejemplo.precio || null;
  const hastas = hastaDeEscalones(escalones);
  const avanzados = cambiosAvanzados({ ...formData, customer_segment_id: soloGrupo ? formData.customer_segment_id : null });
  const ejemploRepetir = `$${formatearEnteroEn(5000, locale)}`;

  // ── Bloques ───────────────────────────────────────────────────────────────

  const bloqueDescuento = (() => {
    if (tipo === 'volume_tiers') {
      return (
        <FormSection titulo={t('v2.escalones.titulo')} descripcion={t('v2.escalones.descripcion')}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-fg">{t('v2.escalones.comoBaja')}</span>
            <SegmentedControl
              etiqueta={t('v2.escalones.comoBaja')}
              valor={modoEscalon}
              onValorChange={(v) => {
                setModoEscalon(v);
                setEscalones((prev) => prev.map((e) => ({ ...e, valor: '' })));
                quitarError('escalones');
              }}
              opciones={[
                { valor: 'precio', etiqueta: t('v2.escalones.precioFijo') },
                { valor: 'porcentaje', etiqueta: t('v2.escalones.porcentaje') },
              ]}
            />
          </div>
          <div id="promo-escalones" tabIndex={-1} className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
                <tr>
                  <th className="px-3 py-2">{t('v2.escalones.desde')}</th>
                  <th className="px-3 py-2">{t('v2.escalones.hasta')}</th>
                  <th className="px-3 py-2">{modoEscalon === 'precio' ? t('v2.escalones.precioUnidad') : t('v2.escalones.descuento')}</th>
                  <th className="px-3 py-2">{t('v2.escalones.ahorro')}</th>
                  <th className="w-10 px-3 py-2"><span className="sr-only">{t('v2.escalones.quitar')}</span></th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line text-fg-muted">
                  <td className="px-3 py-2"><Input value={t('v2.escalones.unidades', { n: 1 })} disabled /></td>
                  <td className="px-3 py-2">
                    <Input
                      value={escalones[0]?.desde && Number(escalones[0].desde) > 1 ? t('v2.escalones.unidades', { n: Number(escalones[0].desde) - 1 }) : ''}
                      disabled
                    />
                  </td>
                  <td className="px-3 py-2"><Input value={precioNormal ? formatear(precioNormal) : ''} disabled /></td>
                  <td className="px-3 py-2 text-xs">{t('v2.escalones.precioNormal')}</td>
                  <td />
                </tr>
                {escalones.map((e, i) => {
                  const ahorro = ahorroPorcentaje(precioNormal, modoEscalon, e.valor);
                  return (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={2}
                          value={e.desde}
                          aria-label={t('v2.escalones.desdeN', { n: i + 1 })}
                          onChange={(ev) => {
                            quitarError('escalones');
                            setEscalones((prev) => prev.map((x, j) => (j === i ? { ...x, desde: ev.target.value } : x)));
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={hastas[i] != null ? t('v2.escalones.unidades', { n: hastas[i]! }) : t('v2.escalones.oMas')}
                          disabled
                          aria-label={t('v2.escalones.hasta')}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={modoEscalon === 'porcentaje' ? 100 : undefined}
                            value={e.valor}
                            aria-label={t('v2.escalones.valorN', { n: i + 1 })}
                            className="pr-8"
                            onChange={(ev) => {
                              quitarError('escalones');
                              setEscalones((prev) => prev.map((x, j) => (j === i ? { ...x, valor: ev.target.value } : x)));
                            }}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted">{modoEscalon === 'precio' ? '$' : '%'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {ahorro != null && (
                          <Badge tono="exito" apariencia="suave" tamano="sm">{t('v2.escalones.ahorra', { n: ahorro })}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          aria-label={t('v2.escalones.quitarN', { n: i + 1 })}
                          disabled={escalones.length === 1}
                          onClick={() => setEscalones((prev) => prev.filter((_, j) => j !== i))}
                          className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0')}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {error('escalones')}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
              onClick={() => {
                const ultimo = Math.trunc(Number(escalones[escalones.length - 1]?.desde)) || 1;
                setEscalones((prev) => [...prev, { desde: String(ultimo * 2), valor: '' }]);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t('v2.escalones.agregar')}
            </button>
            <span className="text-[13px] text-fg-secondary">{t('v2.escalones.hastaAyuda')}</span>
          </div>
          <div className="flex flex-col gap-2 rounded-lg bg-subtle p-3">
            <Label htmlFor="promo-modo-conteo" className="text-fg">{t('v2.conteo.titulo')}</Label>
            <Select
              value={formData.tiers_count_mode ?? 'promotion_mix'}
              onValueChange={(v) => {
                quitarError('alcance');
                cambiar('tiers_count_mode', v as TiersCountMode);
              }}
            >
              <SelectTrigger id="promo-modo-conteo" className="w-full bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODOS_CONTEO.map((m) => (
                  <SelectItem key={m} value={m}>{t(`v2.conteo.${m}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[13px] text-fg-secondary">{t(`v2.conteo.${formData.tiers_count_mode ?? 'promotion_mix'}Ayuda`)}</p>
          </div>
        </FormSection>
      );
    }

    return (
      <FormSection titulo={t('v2.descuento.titulo')} descripcion={t(`v2.tiposAyuda.${tipo}`)}>
        {(tipo === 'percentage' || tipo === 'fixed_amount') && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor={tipo === 'percentage' ? 'promo-porcentaje' : 'promo-monto'} className="text-fg">
                {tipo === 'percentage' ? t('v2.descuento.porcentaje') : t('v2.descuento.cuanto')}
              </Label>
              <div className="relative">
                <Input
                  id={tipo === 'percentage' ? 'promo-porcentaje' : 'promo-monto'}
                  type="number"
                  min={0}
                  max={tipo === 'percentage' ? 100 : undefined}
                  value={formData.discount_value || ''}
                  onChange={(e) => {
                    quitarError(tipo === 'percentage' ? 'porcentaje' : 'monto');
                    cambiar('discount_value', parseFloat(e.target.value) || 0);
                  }}
                  {...aria(tipo === 'percentage' ? 'porcentaje' : 'monto')}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted">{tipo === 'percentage' ? '%' : '$'}</span>
              </div>
              {error(tipo === 'percentage' ? 'porcentaje' : 'monto')}
            </div>
            {tipo === 'percentage' ? (
              <div>
                <Label htmlFor="promo-tope" className="text-fg">{t('v2.descuento.tope')}</Label>
                <Input
                  id="promo-tope"
                  type="number"
                  min={0}
                  value={formData.max_discount_amount || ''}
                  placeholder={t('v2.descuento.sinTope')}
                  onChange={(e) => cambiar('max_discount_amount', numeroDelCampo(e.target.value))}
                />
                <p className="mt-1 text-[13px] text-fg-secondary">{t('v2.descuento.topeAyuda')}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-fg">{t('v2.descuento.seAplica')}</span>
                <SegmentedControl
                  etiqueta={t('v2.descuento.seAplica')}
                  valor={formData.repeat_every_quantity ? 'cada' : 'una'}
                  onValorChange={(v) => cambiar('repeat_every_quantity', v === 'cada' ? (formData.repeat_every_quantity || 1) : null)}
                  opciones={[
                    { valor: 'una', etiqueta: t('v2.descuento.unaVez') },
                    { valor: 'cada', etiqueta: t('v2.descuento.cadaN') },
                  ]}
                />
              </div>
            )}
          </div>
        )}

        {tipo === 'buy_x_get_y' && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="promo-compra" className="text-fg">{t('v2.descuento.lleva')}</Label>
                <Input
                  id="promo-compra"
                  type="number"
                  min={1}
                  value={formData.buy_quantity || ''}
                  onChange={(e) => {
                    quitarError('compra');
                    cambiar('buy_quantity', parseInt(e.target.value) || 0);
                  }}
                  {...aria('compra')}
                />
                {error('compra')}
              </div>
              <div>
                <Label htmlFor="promo-lleva" className="text-fg">{t('v2.descuento.paga')}</Label>
                <Input
                  id="promo-lleva"
                  type="number"
                  min={1}
                  value={formData.get_quantity || ''}
                  onChange={(e) => {
                    quitarError('lleva');
                    cambiar('get_quantity', parseInt(e.target.value) || 0);
                  }}
                  {...aria('lleva')}
                />
                {error('lleva')}
              </div>
            </div>
            <p className="text-[13px] text-fg-secondary">{ayudaCompraLleva(t, formData.buy_quantity, formData.get_quantity)}</p>
          </div>
        )}

        {tipo === 'bundle' && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-fg-secondary">{t('formulario.paqueteAyuda')}</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="promo-precio-paquete" className="text-fg">{t('v2.descuento.precioCombo')}</Label>
                <Input
                  id="promo-precio-paquete"
                  type="number"
                  min={0}
                  value={formData.bundle_price || ''}
                  placeholder={t('formulario.sinPrecioFijo')}
                  onChange={(e) => {
                    quitarError('precioPaquete', 'porcentajePaquete', 'alcance');
                    cambiar('bundle_price', parseFloat(e.target.value) || null);
                  }}
                  {...aria('precioPaquete')}
                />
                {error('precioPaquete')}
              </div>
              <div>
                <Label htmlFor="promo-porcentaje-paquete" className="text-fg">{t('formulario.porcentajeSinPrecio')}</Label>
                <div className="relative">
                  <Input
                    id="promo-porcentaje-paquete"
                    type="number"
                    min={0}
                    max={100}
                    value={formData.discount_value || ''}
                    onChange={(e) => {
                      quitarError('precioPaquete', 'porcentajePaquete');
                      cambiar('discount_value', parseFloat(e.target.value) || 0);
                    }}
                    {...aria('porcentajePaquete')}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted">%</span>
                </div>
                {error('porcentajePaquete')}
              </div>
            </div>
          </div>
        )}

        {(tipo === 'percentage' || tipo === 'fixed_amount' || tipo === 'bundle') && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="promo-minimo" className="text-fg">{t('formulario.cantidadMinima')}</Label>
              <Input
                id="promo-minimo"
                type="number"
                min={1}
                value={formData.min_quantity ?? ''}
                placeholder={t('formulario.sinMinimo')}
                onChange={(e) => cambiar('min_quantity', enteroDelCampo(e.target.value))}
              />
              <p className="mt-1 text-[13px] text-fg-secondary">{t('formulario.cantidadMinimaAyuda')}</p>
            </div>
            {(tipo !== 'fixed_amount' || formData.repeat_every_quantity) && (
              <div>
                <Label htmlFor="promo-repetir" className="text-fg">{t('formulario.repetir')}</Label>
                <Input
                  id="promo-repetir"
                  type="number"
                  min={1}
                  value={formData.repeat_every_quantity ?? ''}
                  placeholder={t('formulario.repetirPlaceholder')}
                  onChange={(e) => cambiar('repeat_every_quantity', enteroDelCampo(e.target.value))}
                />
                <p className="mt-1 text-[13px] text-fg-secondary">
                  {tipo === 'bundle' ? t('formulario.repetirAyudaPaquete') : t('formulario.repetirAyuda', { ejemplo: ejemploRepetir })}
                </p>
              </div>
            )}
          </div>
        )}
      </FormSection>
    );
  })();

  const chipsAlcance = (() => {
    const quitar = (lista: keyof Pick<SeleccionAlcance, 'productos' | 'categorias' | 'marcas'>, valor: number | string) =>
      setSeleccion((s) => ({ ...s, [lista]: (s[lista] as Array<number | string>).filter((x) => x !== valor) }));
    const chip = (clave: string, texto: string, onQuitar: () => void) => (
      <span key={clave} className="inline-flex h-7 items-center gap-1 rounded-full bg-info-subtle px-3 text-xs font-medium text-info-text">
        {texto}
        <button type="button" onClick={onQuitar} aria-label={t('v2.alcance.quitar', { nombre: texto })} className="rounded-full p-0.5 hover:bg-hover">
          <X className="size-3" aria-hidden="true" />
        </button>
      </span>
    );
    if (seleccion.alcance === 'categorias') {
      return seleccion.categorias.map((id) =>
        chip(`c${id}`, categorias.find((c) => c.id === id)?.name ?? `#${id}`, () => quitar('categorias', id)),
      );
    }
    if (seleccion.alcance === 'productos') {
      return seleccion.productos.map((id) => chip(`p${id}`, nombres.current.get(id) ?? `#${id}`, () => quitar('productos', id)));
    }
    if (seleccion.alcance === 'marcas') return seleccion.marcas.map((m) => chip(`m${m}`, m, () => quitar('marcas', m)));
    return [];
  })();

  const porGrupos = tipo === 'volume_tiers' && formData.tiers_count_mode === 'product_group';
  const extraProducto = (id: number) => {
    if (tipo === 'bundle' && (Number(formData.bundle_price) || 0) > 0) {
      return (
        <Input
          type="number"
          min={1}
          className="w-20"
          aria-label={t('formulario.unidadesPaquete', { nombre: nombres.current.get(id) ?? `#${id}` })}
          value={seleccion.cantidadesPaquete[id] ?? 1}
          onChange={(e) => {
            const n = Math.trunc(Number(e.target.value));
            setSeleccion((s) => ({ ...s, cantidadesPaquete: { ...s.cantidadesPaquete, [id]: Number.isFinite(n) && n > 0 ? n : 1 } }));
          }}
        />
      );
    }
    if (porGrupos) {
      return (
        <Select
          value={String(seleccion.gruposVolumen[id] ?? 1)}
          onValueChange={(v) => setSeleccion((s) => ({ ...s, gruposVolumen: { ...s.gruposVolumen, [id]: Number(v) } }))}
        >
          <SelectTrigger className="h-8 w-28" aria-label={t('v2.conteo.grupoDe', { nombre: nombres.current.get(id) ?? `#${id}` })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((g) => (
              <SelectItem key={g} value={String(g)}>{t('v2.conteo.grupoN', { n: g })}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return null;
  };

  const bloqueAlcance = (
    <FormSection titulo={t('v2.alcance.titulo')} descripcion={t('v2.alcance.descripcion')}>
      <div id="promo-alcance" tabIndex={-1} className="flex flex-col gap-3">
        <SegmentedControl<Alcance>
          etiqueta={t('v2.alcance.titulo')}
          valor={seleccion.alcance}
          onValorChange={(v) => {
            quitarError('alcance');
            setSeleccion((s) => ({ ...s, alcance: v }));
          }}
          opciones={[
            { valor: 'todos', etiqueta: t('v2.alcance.todos') },
            { valor: 'categorias', etiqueta: t('v2.alcance.categorias') },
            { valor: 'productos', etiqueta: t('v2.alcance.productos') },
            { valor: 'marcas', etiqueta: t('v2.alcance.marcas') },
          ]}
        />
        {chipsAlcance.length > 0 && <div className="flex flex-wrap gap-2">{chipsAlcance}</div>}
        {error('alcance')}
        {seleccion.alcance === 'categorias' && (
          <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
            {categorias.map((c) => (
              <label key={c.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-hover">
                <Checkbox
                  checked={seleccion.categorias.includes(c.id)}
                  onCheckedChange={(v) => {
                    quitarError('alcance');
                    setSeleccion((s) => ({
                      ...s,
                      categorias: v ? [...s.categorias, c.id] : s.categorias.filter((x) => x !== c.id),
                    }));
                  }}
                />
                <span className="text-fg">{c.name}</span>
              </label>
            ))}
          </div>
        )}
        {seleccion.alcance === 'productos' && (
          <SelectorProductosPromocion
            seleccionados={seleccion.productos}
            onCambio={(ids) => {
              quitarError('alcance');
              setSeleccion((s) => ({ ...s, productos: ids }));
            }}
            onConocer={conocerProductos}
            placeholder={t('formulario.buscarProductos')}
            textoVacio={t('formulario.sinProductos')}
            extra={extraProducto}
          />
        )}
        {seleccion.alcance === 'marcas' && (
          marcas.length === 0 ? (
            <p className="text-[13px] text-fg-secondary">{t('v2.alcance.sinMarcas')}</p>
          ) : (
            <ChipsOpcion
              multiple
              etiqueta={t('v2.alcance.marcas')}
              opciones={marcas.map((m) => ({ valor: m, etiqueta: m }))}
              valor={seleccion.marcas}
              onValorChange={(v) => {
                quitarError('alcance');
                setSeleccion((s) => ({ ...s, marcas: v }));
              }}
            />
          )
        )}
        {porGrupos && <p className="text-[13px] text-fg-secondary">{t('v2.conteo.gruposAyuda')}</p>}

        <button
          type="button"
          onClick={() => setExcluirAbierto((a) => !a)}
          aria-expanded={excluirAbierto}
          className="inline-flex items-center gap-2 self-start text-sm text-brand hover:underline"
        >
          <Ban className="size-4" aria-hidden="true" />
          {t('v2.alcance.excluir')} ·{' '}
          {seleccion.excluirProductos.length + seleccion.excluirCategorias.length === 0
            ? t('v2.alcance.ninguno')
            : t('v2.alcance.nExcluidos', { n: seleccion.excluirProductos.length + seleccion.excluirCategorias.length })}
        </button>
        {excluirAbierto && (
          <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
            {categorias.length > 0 && seleccion.alcance !== 'categorias' && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-fg-secondary">{t('v2.alcance.excluirCategorias')}</span>
                <ChipsOpcion
                  multiple
                  etiqueta={t('v2.alcance.excluirCategorias')}
                  opciones={categorias.map((c) => ({ valor: String(c.id), etiqueta: c.name }))}
                  valor={seleccion.excluirCategorias.map(String)}
                  onValorChange={(v) => setSeleccion((s) => ({ ...s, excluirCategorias: v.map(Number) }))}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-fg-secondary">{t('v2.alcance.excluirProductos')}</span>
              <SelectorProductosPromocion
                seleccionados={seleccion.excluirProductos}
                onCambio={(ids) => setSeleccion((s) => ({ ...s, excluirProductos: ids }))}
                onConocer={conocerProductos}
                placeholder={t('formulario.buscarProductos')}
                textoVacio={t('formulario.sinProductos')}
              />
            </div>
          </div>
        )}
      </div>
    </FormSection>
  );

  const canal = (campo: 'applies_to_web' | 'applies_to_pos' | 'applies_to_finances', icono: LucideIcon, titulo: string, ayuda: string, porDefecto: boolean) => {
    const Icono = icono;
    const activo = (formData[campo] ?? porDefecto) === true;
    return (
      <label className={cn('flex items-center gap-3 rounded-xl border p-3', activo ? 'border-brand bg-info-subtle' : 'border-line bg-surface')}>
        <Icono className="size-5 shrink-0 text-fg-secondary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg">{titulo}</span>
          <span className="block text-xs text-fg-secondary">{ayuda}</span>
        </span>
        <Switch
          checked={activo}
          onCheckedChange={(v) => {
            quitarError('canales');
            cambiar(campo, v);
          }}
          aria-label={titulo}
        />
      </label>
    );
  };

  const bloqueDondeCuando = (
    <FormSection titulo={t('v2.donde.titulo')} descripcion={t('v2.donde.descripcion', { zona: timezone })}>
      <div id="promo-canales" tabIndex={-1} className="grid grid-cols-1 gap-3 md:grid-cols-3" role="group" aria-label={t('formulario.canales')}>
        {canal('applies_to_web', Globe, t('v2.donde.web'), t('v2.donde.webAyuda'), true)}
        {canal('applies_to_pos', ShoppingCart, t('v2.donde.pos'), t('v2.donde.posAyuda'), true)}
        {canal('applies_to_finances', FileText, t('v2.donde.facturas'), t('v2.donde.facturasAyuda'), false)}
      </div>
      {error('canales')}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-fg">
            {t('v2.donde.desde')} <span className="text-danger-text" aria-hidden="true">*</span>
          </Label>
          <CampoFecha
            id="promo-fecha-inicio"
            aria-label={t('v2.donde.desde')}
            valor={formData.start_date || ''}
            onValorChange={(dia) => {
              quitarError('fechaInicio', 'fechaFin');
              cambiar('start_date', dia || '');
            }}
          />
          {error('fechaInicio')}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-fg">{t('v2.donde.hasta')}</Label>
          <CampoFecha
            id="promo-fecha-fin"
            aria-label={t('v2.donde.hasta')}
            valor={formData.end_date || ''}
            min={formData.start_date || undefined}
            onValorChange={(dia) => {
              quitarError('fechaFin');
              cambiar('end_date', dia || undefined);
            }}
          />
          {error('fechaFin') ?? <p className="text-[13px] text-fg-secondary">{t('v2.donde.hastaAyuda')}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">{t('formulario.sucursales')}</span>
          {sucursales.length === 0 ? (
            <p className="text-[13px] text-fg-secondary">{t('formulario.sinSucursales')}</p>
          ) : (
            <Select
              value={(formData.branches ?? []).length === 0 ? 'todas' : 'algunas'}
              onValueChange={(v) => cambiar('branches', v === 'todas' ? undefined : (formData.branches?.length ? formData.branches : [sucursales[0].id]))}
            >
              <SelectTrigger aria-label={t('formulario.sucursales')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">{t('v2.donde.todasSucursales')}</SelectItem>
                <SelectItem value="algunas">{t('v2.donde.algunasSucursales')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      {(formData.branches ?? []).length > 0 && (
        <ChipsOpcion
          multiple
          etiqueta={t('formulario.sucursales')}
          opciones={sucursales.map((s) => ({ valor: String(s.id), etiqueta: s.name }))}
          valor={(formData.branches ?? []).map(String)}
          onValorChange={(v) => {
            const ids = v.map(Number).filter((n) => Number.isFinite(n));
            cambiar('branches', ids.length === 0 ? undefined : ids);
          }}
        />
      )}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-fg">{t('v2.donde.horario')}</span>
        <SelectorHorarioPromocion
          valor={horario}
          onValorChange={setHorario}
          zona={timezone}
          vigencia={{ desde: formData.start_date ?? null, hasta: formData.end_date ?? null }}
          mostrarErrores={mostrarErroresHorario}
        />
      </div>
    </FormSection>
  );

  const resumenAvanzadas = [
    soloGrupo && nombreSegmento ? t('v2.avanzadas.resumenGrupo', { grupo: nombreSegmento }) : null,
    formData.usage_limit ? t('v2.avanzadas.resumenUsos', { n: formData.usage_limit }) : t('v2.avanzadas.resumenSinLimite'),
    formData.is_combinable ? t('v2.avanzadas.resumenSeSuma') : t('v2.avanzadas.resumenNoSeSuma'),
    formData.applies_with_price_lists === false ? t('v2.avanzadas.resumenSinListas') : null,
    formData.min_purchase_amount ? t('v2.avanzadas.resumenMinimo', { monto: formatear(formData.min_purchase_amount) }) : t('v2.avanzadas.resumenSinMinimo'),
  ].filter(Boolean).join(' · ');

  const bloqueAvanzadas = (
    <SeccionPlegable
      titulo={t('v2.avanzadas.titulo')}
      resumen={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-fg-secondary">{resumenAvanzadas}</span>
          {avanzados > 0 && <Badge tono="marca" apariencia="suave" tamano="sm">{t('v2.avanzadas.nCambiados', { n: avanzados })}</Badge>}
        </span>
      }
      abierta={avanzadasAbiertas}
      onAbiertaChange={setAvanzadasAbiertas}
      className="rounded-xl border border-line bg-surface"
    >
      <div className="flex flex-col gap-6 p-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-fg">{t('v2.avanzadas.quien')}</span>
          <SegmentedControl
            etiqueta={t('v2.avanzadas.quien')}
            valor={soloGrupo ? 'grupo' : 'todos'}
            onValorChange={(v) => {
              quitarError('grupoClientes');
              setSoloGrupo(v === 'grupo');
            }}
            opciones={[
              { valor: 'todos', etiqueta: t('v2.avanzadas.todosClientes') },
              { valor: 'grupo', etiqueta: t('v2.avanzadas.unGrupo') },
            ]}
          />
          {soloGrupo && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-grupo" className="text-fg">{t('v2.avanzadas.grupo')}</Label>
              <Select
                value={formData.customer_segment_id ?? ''}
                onValueChange={(v) => {
                  quitarError('grupoClientes');
                  cambiar('customer_segment_id', v || null);
                }}
              >
                <SelectTrigger id="promo-grupo" aria-invalid={errores.grupoClientes ? true : undefined}>
                  <SelectValue placeholder={t('v2.avanzadas.elegirGrupo')} />
                </SelectTrigger>
                <SelectContent>
                  {segmentos.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.customer_count != null ? t('v2.avanzadas.grupoConteo', { nombre: s.name, n: s.customer_count }) : s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error('grupoClientes')}
              <p className="text-[13px] text-fg-secondary">
                {segmentos.length === 0 ? t('v2.avanzadas.sinGrupos') : t('v2.avanzadas.grupoAyuda')}{' '}
                <Link href="/app/crm/segmentos" className="text-brand hover:underline">{t('v2.avanzadas.irSegmentos')}</Link>
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-fg">{t('v2.avanzadas.limites')}</span>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="promo-limite-usos" className="text-fg">{t('v2.avanzadas.usosTotal')}</Label>
              <Input
                id="promo-limite-usos"
                type="number"
                min={1}
                value={formData.usage_limit || ''}
                placeholder={t('formulario.sinLimite')}
                onChange={(e) => cambiar('usage_limit', enteroDelCampo(e.target.value) ?? undefined)}
              />
              <p className="mt-1 text-[13px] text-fg-secondary">{t('v2.avanzadas.usosTotalAyuda')}</p>
            </div>
            <div>
              <Label htmlFor="promo-usos-cliente" className="text-fg">{t('v2.avanzadas.usosCliente')}</Label>
              <Input
                id="promo-usos-cliente"
                type="number"
                min={1}
                value={formData.usage_limit_per_customer ?? ''}
                placeholder={t('formulario.sinLimite')}
                onChange={(e) => cambiar('usage_limit_per_customer', enteroDelCampo(e.target.value))}
              />
              <p className="mt-1 text-[13px] text-fg-secondary">{t('v2.avanzadas.usosClienteAyuda')}</p>
            </div>
            {tipo !== 'percentage' && (
              <div>
                <Label htmlFor="promo-tope-avanzado" className="text-fg">{t('v2.avanzadas.tope')}</Label>
                <Input
                  id="promo-tope-avanzado"
                  type="number"
                  min={0}
                  value={formData.max_discount_amount || ''}
                  placeholder={t('v2.descuento.sinTope')}
                  onChange={(e) => cambiar('max_discount_amount', numeroDelCampo(e.target.value))}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-fg">{t('v2.avanzadas.compraMinima')}</span>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="promo-compra-minima" className="text-fg">{t('v2.avanzadas.desde')}</Label>
              <Input
                id="promo-compra-minima"
                type="number"
                min={0}
                value={formData.min_purchase_amount || ''}
                placeholder={t('v2.avanzadas.sinMinimo')}
                onChange={(e) => cambiar('min_purchase_amount', numeroDelCampo(e.target.value))}
              />
            </div>
            {applies_to !== 'all' && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-fg">{t('v2.avanzadas.seCuentaSobre')}</span>
                <SegmentedControl
                  etiqueta={t('v2.avanzadas.seCuentaSobre')}
                  valor={formData.min_purchase_scope === 'cart' ? 'cart' : 'eligible'}
                  onValorChange={(v) => cambiar('min_purchase_scope', v)}
                  opciones={[
                    { valor: 'eligible', etiqueta: t('v2.avanzadas.loQueEntra') },
                    { valor: 'cart', etiqueta: t('v2.avanzadas.todoElCarrito') },
                  ]}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('v2.avanzadas.seSuma')}>
          <span className="text-sm font-semibold text-fg">{t('v2.avanzadas.seSuma')}</span>
          <TarjetaSeleccionable
            orientacion="horizontal"
            titulo={t('v2.avanzadas.noSeSuma')}
            descripcion={t('v2.avanzadas.noSeSumaAyuda')}
            seleccionada={!formData.is_combinable}
            onSeleccionar={() => cambiar('is_combinable', false)}
          />
          <TarjetaSeleccionable
            orientacion="horizontal"
            titulo={t('v2.avanzadas.siSeSuma')}
            descripcion={t('v2.avanzadas.siSeSumaAyuda')}
            seleccionada={!!formData.is_combinable}
            onSeleccionar={() => cambiar('is_combinable', true)}
          />
        </div>

        {/* Listas de precios (Figma «05 POS y ventas» 09): casilla apagada por defecto. */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-fg">{t('v2.avanzadas.listasPrecios')}</span>
          <label className="flex items-start gap-3">
            <Checkbox
              className="mt-0.5"
              checked={formData.applies_with_price_lists === false}
              onCheckedChange={(v) => cambiar('applies_with_price_lists', v !== true)}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm text-fg">{t('v2.avanzadas.listasPreciosCasilla')}</span>
              <span className="text-[13px] text-fg-secondary">{t('v2.avanzadas.listasPreciosAyuda')}</span>
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5" data-testid="promo-metodos-pago">
            <span id="etiqueta-promo-metodos" className="text-sm font-semibold text-fg">{t('v2.avanzadas.mediosPago')}</span>
            {metodosPagoParaPromocion(metodosPago, formData.branches).length === 0 ? (
              <p className="text-[13px] text-fg-secondary">{t('v2.avanzadas.sinMedios')}</p>
            ) : (
              <>
                <ChipsOpcion
                  multiple
                  aria-labelledby="etiqueta-promo-metodos"
                  opciones={metodosPagoParaPromocion(metodosPago, formData.branches).map((m) => ({ valor: m.code, etiqueta: m.name }))}
                  valor={formData.payment_method_codes ?? []}
                  onValorChange={(v) => cambiar('payment_method_codes', v.length === 0 ? null : v)}
                />
                <p className="text-[13px] text-fg-secondary">
                  {(formData.payment_method_codes ?? []).length === 0 ? t('v2.avanzadas.cualquierMedio') : t('v2.avanzadas.soloMedios')}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-fg">{t('v2.avanzadas.nota')}</span>
            <RichTextEditor
              value={formData.description || ''}
              onChange={(html) => cambiar('description', html)}
              placeholder={t('v2.avanzadas.notaPlaceholder')}
            />
          </div>
        </div>

        <AvisoTonal tono="informacion" titulo={t('v2.avanzadas.sinPrioridad')} compacto />
      </div>
    </SeccionPlegable>
  );

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <FormSection titulo={t('v2.esencial.titulo')} descripcion={t('v2.esencial.descripcion')}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-nombre" className="text-fg">
                {t('v2.esencial.nombre')} <span className="text-danger-text" aria-hidden="true">*</span>
              </Label>
              <div className="flex items-center gap-4">
                <Input
                  id="promo-nombre"
                  value={formData.name}
                  placeholder={t('formulario.nombrePlaceholder')}
                  onChange={(e) => {
                    quitarError('nombre');
                    cambiar('name', e.target.value);
                  }}
                  {...aria('nombre')}
                />
                <label className="flex shrink-0 items-center gap-2 text-sm text-fg">
                  <Switch checked={formData.is_active !== false} onCheckedChange={(v) => cambiar('is_active', v)} />
                  {t('v2.esencial.activa')}
                </label>
              </div>
              {error('nombre') ?? <p className="text-[13px] text-fg-secondary">{t('v2.esencial.nombreAyuda')}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-fg">{t('v2.esencial.tipo')}</span>
              <div role="radiogroup" aria-label={t('v2.esencial.tipo')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tiposVisibles.map((tp) => (
                  <TarjetaSeleccionable
                    key={tp}
                    orientacion="horizontal"
                    icono={ICONO_TIPO[tp]}
                    titulo={t(`tipos.${tp}`)}
                    descripcion={
                      <span className="flex flex-col gap-1">
                        {tp === 'volume_tiers' && (
                          <span><Badge tono="advertencia" apariencia="suave" tamano="sm">{t('v2.esencial.nuevo')}</Badge></span>
                        )}
                        <span>{t(`v2.tiposEjemplo.${tp}`)}</span>
                      </span>
                    }
                    seleccionada={tipo === tp}
                    onSeleccionar={() => {
                      setErrores({});
                      setFormData((prev) => cambiarTipo(prev, tp));
                    }}
                  />
                ))}
              </div>
              <AvisoTonal
                tono="informacion"
                compacto
                titulo={t('v2.esencial.envioGratis')}
                accion={{ etiqueta: t('v2.esencial.irTarifas'), href: '/app/logistica/zonas' }}
              />
            </div>
          </FormSection>

          {bloqueDescuento}
          {bloqueAlcance}
          {bloqueDondeCuando}
          {bloqueAvanzadas}
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <Tarjeta titulo={t('v2.vista.titulo')}>
            <VistaPreviaCliente datos={formData} tiers={tiers} producto={ejemplo} t={t} formatear={formatear} />
          </Tarjeta>
          <Tarjeta titulo={t('v2.palabras.titulo')} tono="informacion">
            <p className="text-[13px] leading-[18px] text-info-text" data-testid="promo-en-palabras">{enPalabras}</p>
          </Tarjeta>
          <AvisoSolapamiento conflictos={conflictos} />
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 sm:-mx-6 sm:px-6">
        <p className="hidden text-[13px] text-fg-secondary md:block">{t('v2.pie')}</p>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => router.push(editando ? `/app/pos/promociones/${promotionId}` : '/app/pos/promociones')} className={clasesBoton({ variante: 'fantasma' })}>
            {t('formulario.cancelar')}
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className={clasesBoton({ variante: 'primario' })}>
            <Check className="size-4" aria-hidden="true" />
            {guardando ? t('formulario.guardando') : editando ? t('v2.guardarCambios') : t('v2.crear')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ayudaCompraLleva(
  t: (clave: string, valores?: Record<string, string | number>) => string,
  compra: number | null | undefined,
  lleva: number | null | undefined,
): string {
  const x = Math.trunc(compra || 0);
  const y = Math.trunc(lleva || 0);
  if (x > 0 && y > 0 && y < x) return t('formulario.llevaPaga', { x, y, gratis: x - y });
  if (x > 0 && y > 0) return t('formulario.compraLlevaGratis', { x, y, grupo: x + y });
  return t('formulario.compraLlevaAyuda');
}
