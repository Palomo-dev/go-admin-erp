'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Tag,
  Calendar,
  Filter,
  Percent,
  Gift,
  DollarSign,
  Package,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Stepper } from '@/components/kit/Stepper';
import { FormSection } from '@/components/kit/FormSection';
import { TarjetaSeleccionable } from '@/components/kit/TarjetaSeleccionable';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { SettingGroup, SettingRow } from '@/components/kit/SettingRow';
import { clasesBoton } from '@/components/kit/botonClases';
import { PromotionsService } from '../promotionsService';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { plainDayOfInstant } from '@/lib/services/businessInstant';
import {
  CreatePromotionData,
  PromotionType,
  AppliesTo,
  CreatePromotionRuleData,
  MinPurchaseScope,
  RuleType,
  RuleTypeDB,
  WeekDay,
  PROMOTION_TYPE_LABELS,
  APPLIES_TO_LABELS,
} from '../types';
import { toast } from 'sonner';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { formatearEnteroEn } from '@/components/kit/idioma';
import { diasDelIdioma } from '../diasPromocion';

/** Fila de `PromotionsService.getProducts` que usa el paso «Productos». */
interface ProductoPromocion {
  id: number;
  name: string;
  sku: string | null;
  parent_name?: string | null;
  variant_data?: Record<string, unknown> | null;
}

/** Fila de `PromotionsService.getCategories`. */
interface CategoriaPromocion {
  id: number;
  name: string;
}

interface PromotionWizardProps {
  initialData?: CreatePromotionData;
  promotionId?: string;
  onSuccess?: () => void;
}

const WIZARD_STEPS = [
  { id: 'basic', icon: Tag },
  { id: 'discount', icon: Percent },
  { id: 'validity', icon: Calendar },
  { id: 'rules', icon: Filter },
] as const;

const ICONO_TIPO: Record<PromotionType, LucideIcon> = {
  percentage: Percent,
  fixed_amount: DollarSign,
  buy_x_get_y: Gift,
  bundle: Package,
  free_shipping: Truck,
};

type Traductor = (clave: string, valores?: Record<string, string | number>) => string;

/**
 * Dia calendario (YYYY-MM-DD) que debe mostrar el `CampoFecha` para un valor que
 * puede llegar como instante (timestamptz de la base) o ya como dia.
 */
function diaDelFormulario(valor: string, timezone: string): string {
  return valor.length <= 10 ? valor : plainDayOfInstant(valor, timezone);
}

/** `HH:mm` para un `<input type="time">`. La columna `time` llega como `HH:mm:ss`. */
function horaDelFormulario(valor: string | null | undefined): string {
  if (!valor) return '';
  const m = String(valor).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function enteroDelCampo(valor: string): number | null {
  if (valor.trim() === '') return null;
  const n = Math.trunc(Number(valor));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function PromotionWizard({ initialData, promotionId, onSuccess }: PromotionWizardProps) {
  const router = useRouter();
  const t = useTranslations('posPromociones');
  const locale = useLocale();
  const diasSemana = diasDelIdioma(locale);
  const ejemploRepetir = `$${formatearEnteroEn(5000, locale)}`;
  // `promotions.start_date` / `.end_date` son timestamptz. En el formulario se
  // manejan como dias de la organizacion; el servicio los convierte a instantes
  // al guardar (00:00 y 23:59:59.999 de esa zona).
  const { getToday, timezone } = useFormatDate();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductoPromocion[]>([]);
  const [categories, setCategories] = useState<CategoriaPromocion[]>([]);
  const [productSearch, setProductSearch] = useState('');
  
  const [sucursales, setSucursales] = useState<{ id: number; name: string }[]>([]);
  const [errorFechaFin, setErrorFechaFin] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreatePromotionData>({
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
    is_combinable: false,
    priority: 0,
    applies_to_web: true,
    applies_to_pos: true,
    applies_to_finances: false,
    applicable_days: null,
    rules: [],
    ...initialData,
    // `initialData` viene de la base, donde las dos columnas son timestamptz:
    // se traen al dia de la organizacion UNA vez. A partir de aqui el estado
    // del formulario es siempre un dia calendario, y el servicio lo vuelve a
    // convertir a instante al guardar. Con `.split('T')[0]` se veia el dia UTC:
    // una promocion que empieza el 1 en Bogota se abria como si fuera el 31.
    ...(initialData?.start_date
      ? { start_date: diaDelFormulario(initialData.start_date, timezone) }
      : {}),
    ...(initialData?.end_date
      ? { end_date: diaDelFormulario(initialData.end_date, timezone) }
      : {}),
  });

  // Al editar, las reglas existentes deben cargarse en la selección. Antes estos
  // tres estados arrancaban vacíos aunque `initialData.rules` viniera lleno, así
  // que al guardar se borraban todas las reglas de la promoción.
  const reglasIniciales = initialData?.rules ?? [];
  const [selectedProducts, setSelectedProducts] = useState<number[]>(
    reglasIniciales.filter((r) => r.product_id != null).map((r) => r.product_id as number)
  );
  const [selectedCategories, setSelectedCategories] = useState<number[]>(
    reglasIniciales.filter((r) => r.category_id != null).map((r) => r.category_id as number)
  );
  const [ruleType, setRuleType] = useState<'include' | 'exclude'>(
    reglasIniciales.some((r) => r.rule_type.startsWith('exclude')) ? 'exclude' : 'include'
  );
  const [cantidadesPaquete, setCantidadesPaquete] = useState<Record<number, number>>(() => {
    const cantidades: Record<number, number> = {};
    for (const regla of reglasIniciales) {
      if (regla.product_id == null || regla.quantity == null) continue;
      const n = Math.trunc(Number(regla.quantity));
      if (Number.isFinite(n) && n > 0) cantidades[regla.product_id] = n;
    }
    return cantidades;
  });

  useEffect(() => {
    loadProducts();
    loadCategories();
    PromotionsService.getBranches()
      .then(setSucursales)
      .catch(() => setSucursales([]));
  }, []);

  useEffect(() => {
    if (productSearch) {
      loadProducts(productSearch);
    }
  }, [productSearch]);

  const loadProducts = async (search?: string) => {
    try {
      const data = await PromotionsService.getProducts(search);
      setProducts(data);
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await PromotionsService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleChange = (field: keyof CreatePromotionData, value: CreatePromotionData[keyof CreatePromotionData]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const cambiarFecha = (campo: 'start_date' | 'end_date', dia: string) => {
    const inicio = campo === 'start_date' ? dia : (formData.start_date || '');
    const fin = campo === 'end_date' ? dia : (formData.end_date || '');
    setErrorFechaFin(fin && inicio && fin < inicio ? t('formulario.fechaFinError') : null);
    handleChange(campo, dia || undefined);
  };

  const validateStep = (): boolean => {
    switch (currentStep) {
      case 0: // Datos básicos
        if (!formData.name.trim()) {
          toast.error(t('formulario.nombreRequerido'));
          return false;
        }
        return true;
      case 1: // Descuento
        if (formData.promotion_type === 'percentage' && (!formData.discount_value || formData.discount_value <= 0 || formData.discount_value > 100)) {
          toast.error(t('formulario.porcentajeInvalido'));
          return false;
        }
        if (formData.promotion_type === 'fixed_amount' && (!formData.discount_value || formData.discount_value <= 0)) {
          toast.error(t('formulario.montoInvalido'));
          return false;
        }
        if (formData.promotion_type === 'buy_x_get_y' && (!formData.buy_quantity || !formData.get_quantity)) {
          toast.error(t('formulario.compraLlevaRequerida'));
          return false;
        }
        if (formData.promotion_type === 'bundle') {
          const precio = Number(formData.bundle_price) || 0;
          const porcentaje = Number(formData.discount_value) || 0;
          if (precio <= 0 && (porcentaje <= 0 || porcentaje > 100)) {
            toast.error(t('formulario.paqueteValor'));
            return false;
          }
        }
        return true;
      case 2: // Vigencia
        if (!formData.start_date) {
          toast.error(t('formulario.fechaInicioRequerida'));
          return false;
        }
        if (formData.end_date && formData.end_date < formData.start_date) {
          setErrorFechaFin(t('formulario.fechaFinError'));
          toast.error(t('formulario.fechaFinError'));
          return false;
        }
        setErrorFechaFin(null);
        return true;
      case 3:
        return validarPaquete();
      default:
        return true;
    }
  };

  const validarPaquete = (): boolean => {
    const precio = Number(formData.bundle_price) || 0;
    if (formData.promotion_type !== 'bundle' || precio <= 0) return true;
    if (formData.applies_to !== 'products') {
      toast.error(t('formulario.paqueteProductos'));
      return false;
    }
    if (ruleType !== 'include') {
      toast.error(t('formulario.paqueteIncluir'));
      return false;
    }
    if (selectedProducts.length === 0) {
      toast.error(t('formulario.paqueteAlMenosUno'));
      return false;
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep()) {
      setCurrentStep(prev => Math.min(prev + 1, WIZARD_STEPS.length - 1));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const buildRules = (): CreatePromotionRuleData[] => {
    const rules: CreatePromotionRuleData[] = [];

    // Mapear ruleType ('include'/'exclude') + applies_to al valor compuesto
    // que exige el CHECK constraint de promotion_rules en la BD.
    const mapRuleType = (appliesTo: AppliesTo, type: RuleType): RuleTypeDB => {
      if (appliesTo === 'products') return type === 'include' ? 'include_product' : 'exclude_product';
      if (appliesTo === 'categories') return type === 'include' ? 'include_category' : 'exclude_category';
      return type === 'include' ? 'include_product' : 'exclude_product';
    };

    if (formData.applies_to === 'products') {
      const dbRuleType = mapRuleType(formData.applies_to, ruleType);
      selectedProducts.forEach(productId => {
        const esPaquete = formData.promotion_type === 'bundle' && ruleType === 'include';
        const pedida = cantidadesPaquete[productId];
        rules.push({
          rule_type: dbRuleType,
          product_id: productId,
          quantity: esPaquete ? (pedida != null && pedida > 0 ? Math.trunc(pedida) : 1) : null,
        });
      });
    } else if (formData.applies_to === 'categories') {
      const dbRuleType = mapRuleType(formData.applies_to, ruleType);
      selectedCategories.forEach(categoryId => {
        rules.push({ rule_type: dbRuleType, category_id: categoryId });
      });
    }

    return rules;
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;

    setLoading(true);
    try {
      const dataToSave = {
        ...formData,
        rules: buildRules()
      };

      if (promotionId) {
        await PromotionsService.update(promotionId, dataToSave);
        toast.success(t('formulario.actualizada'));
      } else {
        await PromotionsService.create(dataToSave);
        toast.success(t('formulario.creada'));
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/app/pos/promociones');
      }
    } catch (error: unknown) {
      toast.error((error as { message?: string } | null)?.message || t('formulario.errorGuardar'));
    } finally {
      setLoading(false);
    }
  };

  const pasoActual = WIZARD_STEPS[currentStep];

  return (
    <div className="flex flex-col gap-6">
      <Stepper
        pasos={WIZARD_STEPS.map((step) => ({ valor: step.id, etiqueta: t(`pasos.${step.id}`) }))}
        actual={pasoActual.id}
        onPasoClick={(valor) => {
          const indice = WIZARD_STEPS.findIndex((step) => step.id === valor);
          if (indice >= 0 && indice < currentStep) setCurrentStep(indice);
        }}
        resumenMovil={(n, total, etiqueta) => t('formulario.pasoDe', { n, total, etiqueta })}
        etiqueta={t('formulario.pasosEtiqueta')}
      />

      <FormSection titulo={t(`pasos.${pasoActual.id}`)} icono={pasoActual.icon}>
          {/* Step 0: Datos Básicos */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div>
                <Label className="text-fg">{t('formulario.nombre')}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder={t('formulario.nombrePlaceholder')}
                />
              </div>
              <div>
                <Label className="text-fg">{t('formulario.descripcion')}</Label>
                <RichTextEditor
                  value={formData.description || ''}
                  onChange={(html) => handleChange('description', html)}
                  placeholder={t('formulario.descripcionPlaceholder')}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-fg">{t('formulario.prioridad')}</Label>
                  <Input
                    type="number"
                    value={formData.priority || 0}
                    onChange={(e) => handleChange('priority', parseInt(e.target.value) || 0)}
                    min={0}
                  />
                  <p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">{t('formulario.prioridadAyuda')}</p>
                </div>
                <SettingGroup>
                  <SettingRow titulo={t('formulario.combinable')} descripcion={t('formulario.combinableAyuda')}>
                    <Switch
                      checked={formData.is_combinable}
                      onCheckedChange={(checked) => handleChange('is_combinable', checked)}
                    />
                  </SettingRow>
                </SettingGroup>
              </div>
            </div>
          )}

          {/* Step 1: Descuento */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-sm font-medium text-fg">{t('formulario.tipo')}</p>
                <div role="radiogroup" aria-label={t('formulario.tipo')} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  {(Object.keys(PROMOTION_TYPE_LABELS) as PromotionType[]).map((type) => (
                    <TarjetaSeleccionable
                      key={type}
                      titulo={t(`tipos.${type}`)}
                      icono={ICONO_TIPO[type]}
                      seleccionada={formData.promotion_type === type}
                      onSeleccionar={() => {
                        // Al cambiar de tipo se vacía el valor: el 10 por defecto
                        // (pensado como 10 %) se quedaba puesto al pasar a "Monto
                        // Fijo", el usuario lo tomaba por otra cosa y escribía el
                        // monto real en "Descuento Máximo". Resultado en producción:
                        // discount_value = 10 y max_discount_amount = 8000.
                        setFormData(prev => ({
                          ...prev,
                          promotion_type: type,
                          discount_value: 0,
                          bundle_price: null,
                          max_discount_amount: undefined,
                        }));
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Campos según tipo */}
              {(formData.promotion_type === 'percentage' || formData.promotion_type === 'fixed_amount') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-fg">
                      {formData.promotion_type === 'percentage' ? t('formulario.porcentaje') : t('formulario.monto')}
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={formData.discount_value || ''}
                        onChange={(e) => handleChange('discount_value', parseFloat(e.target.value) || 0)}
                        min={0}
                        max={formData.promotion_type === 'percentage' ? 100 : undefined}
                        className="pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted">
                        {formData.promotion_type === 'percentage' ? '%' : '$'}
                      </span>
                    </div>
                  </div>
                  {/* El tope solo tiene sentido en porcentaje: un monto fijo ya ES
                      su propio máximo. Mostrarlo junto al monto confundía y el
                      usuario acababa escribiendo el descuento real aquí. */}
                  {formData.promotion_type === 'percentage' && (
                    <div>
                      <Label className="text-fg">{t('formulario.descuentoMaximo')}</Label>
                      <Input
                        type="number"
                        value={formData.max_discount_amount || ''}
                        onChange={(e) => handleChange('max_discount_amount', parseFloat(e.target.value) || undefined)}
                        min={0}
                        placeholder={t('formulario.sinLimite')}
                      />
                    </div>
                  )}
                </div>
              )}

              {formData.promotion_type === 'buy_x_get_y' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-fg">{t('formulario.llevaX')}</Label>
                      <Input
                        type="number"
                        value={formData.buy_quantity || ''}
                        onChange={(e) => handleChange('buy_quantity', parseInt(e.target.value) || 0)}
                        min={1}
                      />
                    </div>
                    <div>
                      <Label className="text-fg">{t('formulario.pagaY')}</Label>
                      <Input
                        type="number"
                        value={formData.get_quantity || ''}
                        onChange={(e) => handleChange('get_quantity', parseInt(e.target.value) || 0)}
                        min={1}
                      />
                    </div>
                  </div>
                  <p className="text-[13px] leading-[18px] text-fg-secondary">
                    {ayudaCompraLleva(t, formData.buy_quantity, formData.get_quantity)}
                  </p>
                </div>
              )}

              {formData.promotion_type === 'bundle' && (
                <div className="space-y-3">
                  <p className="text-[13px] leading-[18px] text-fg-secondary">
                    {t('formulario.paqueteAyuda')}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-fg">{t('formulario.precioPaquete')}</Label>
                      <Input
                        type="number"
                        value={formData.bundle_price || ''}
                        onChange={(e) => handleChange('bundle_price', parseFloat(e.target.value) || null)}
                        min={0}
                        placeholder={t('formulario.sinPrecioFijo')}
                      />
                    </div>
                    <div>
                      <Label className="text-fg">{t('formulario.porcentajeSinPrecio')}</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={formData.discount_value || ''}
                          onChange={(e) => handleChange('discount_value', parseFloat(e.target.value) || 0)}
                          min={0}
                          max={100}
                          className="pr-10"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(formData.promotion_type === 'percentage' || formData.promotion_type === 'fixed_amount' || formData.promotion_type === 'bundle') && (
                <div>
                  <Label className="text-fg">{t('formulario.cantidadMinima')}</Label>
                  <Input
                    type="number"
                    value={formData.min_quantity ?? ''}
                    onChange={(e) => handleChange('min_quantity', enteroDelCampo(e.target.value))}
                    min={1}
                    placeholder={t('formulario.sinMinimo')}
                  />
                  <p className="text-[13px] leading-[18px] text-fg-secondary mt-1">
                    {t('formulario.cantidadMinimaAyuda')}
                  </p>
                </div>
              )}

              {(formData.promotion_type === 'percentage' || formData.promotion_type === 'fixed_amount') && (
                <div>
                  <Label className="text-fg">{t('formulario.repetir')}</Label>
                  <Input
                    type="number"
                    value={formData.repeat_every_quantity ?? ''}
                    onChange={(e) => handleChange('repeat_every_quantity', enteroDelCampo(e.target.value))}
                    min={1}
                    placeholder={t('formulario.repetirPlaceholder')}
                  />
                  <p className="text-[13px] leading-[18px] text-fg-secondary mt-1">
                    {t('formulario.repetirAyuda', { ejemplo: ejemploRepetir })}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-fg">{t('formulario.compraMinima')}</Label>
                <Input
                  type="number"
                  value={formData.min_purchase_amount || ''}
                  onChange={(e) => handleChange('min_purchase_amount', parseFloat(e.target.value) || undefined)}
                  min={0}
                  placeholder={t('formulario.sinMinimo')}
                />
                <p className="text-[13px] leading-[18px] text-fg-secondary">
                  {textoCompraMinima(t, formData.applies_to, formData.min_purchase_scope)}
                  {formData.applies_to === 'all' ? ` ${t('formulario.compraMinimaReglas')}` : ''}
                </p>
                {formData.applies_to !== 'all' && (
                  <SettingGroup>
                    <SettingRow titulo={t('formulario.medirTodaLaCuenta')} descripcion={t('formulario.medirTodaLaCuentaAyuda')}>
                      <Switch
                        checked={formData.min_purchase_scope === 'cart'}
                        onCheckedChange={(checked) => handleChange('min_purchase_scope', checked ? 'cart' : 'eligible')}
                      />
                    </SettingRow>
                  </SettingGroup>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Vigencia */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-fg">{t('formulario.fechaInicio')}</Label>
                  <CampoFecha
                    aria-label={t('formulario.fechaInicio')}
                    valor={formData.start_date || ''}
                    onValorChange={(dia) => cambiarFecha('start_date', dia)}
                  />
                </div>
                <div>
                  <Label className="text-fg">{t('formulario.fechaFin')}</Label>
                  <CampoFecha
                    aria-label={t('formulario.fechaFin')}
                    valor={formData.end_date || ''}
                    min={formData.start_date || undefined}
                    aria-invalid={errorFechaFin ? true : undefined}
                    aria-describedby={errorFechaFin ? 'promo-error-fecha-fin' : undefined}
                    onValorChange={(dia) => cambiarFecha('end_date', dia)}
                  />
                  {errorFechaFin && (
                    <p id="promo-error-fecha-fin" role="alert" className="mt-1 text-xs text-danger-text">
                      {errorFechaFin}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-fg">{t('formulario.horaInicio')}</Label>
                  <Input
                    type="time"
                    value={horaDelFormulario(formData.start_time)}
                    onChange={(e) => handleChange('start_time', e.target.value || null)}
                  />
                </div>
                <div>
                  <Label className="text-fg">{t('formulario.horaFin')}</Label>
                  <Input
                    type="time"
                    value={horaDelFormulario(formData.end_time)}
                    onChange={(e) => handleChange('end_time', e.target.value || null)}
                  />
                </div>
              </div>
              <p className="text-[13px] leading-[18px] text-fg-secondary -mt-2">
                {t('formulario.franjaAyuda')}
              </p>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-fg">{t('formulario.sucursales')}</p>
                    <p className="text-[13px] leading-[18px] text-fg-secondary">
                      {t('formulario.sucursalesAyuda')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                    onClick={() => handleChange('branches', undefined)}
                  >
                    {t('formulario.todas')}
                  </button>
                </div>
                {sucursales.length === 0 ? (
                  <p className="text-[13px] leading-[18px] text-fg-secondary">{t('formulario.sinSucursales')}</p>
                ) : (
                  <ChipsOpcion
                    multiple
                    etiqueta={t('formulario.sucursales')}
                    opciones={sucursales.map((sucursal) => ({ valor: String(sucursal.id), etiqueta: sucursal.name }))}
                    valor={(formData.branches || []).map(String)}
                    onValorChange={(valor) => {
                      const ids = valor.map((id) => Number(id)).filter((id) => Number.isFinite(id));
                      handleChange('branches', ids.length === 0 ? undefined : ids);
                    }}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-fg">{t('formulario.limiteUsos')}</Label>
                  <Input
                    type="number"
                    value={formData.usage_limit || ''}
                    onChange={(e) => handleChange('usage_limit', parseInt(e.target.value) || undefined)}
                    min={1}
                    placeholder={t('formulario.sinLimite')}
                  />
                </div>
                <SettingGroup>
                  <SettingRow titulo={t('formulario.activa')} descripcion={t('formulario.activaAyuda')}>
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(checked) => handleChange('is_active', checked)}
                    />
                  </SettingRow>
                </SettingGroup>
              </div>

              {/* Canales de aplicación */}
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-medium text-fg">{t('formulario.canales')}</p>
                  <p className="text-[13px] leading-[18px] text-fg-secondary">
                    {t('formulario.canalesAyuda')}
                  </p>
                </div>
                <SettingGroup etiqueta={t('formulario.canales')}>
                  <SettingRow titulo={t('formulario.canalWeb')} descripcion={t('formulario.canalWebAyuda')}>
                    <Switch
                      checked={formData.applies_to_web ?? true}
                      onCheckedChange={(checked) => handleChange('applies_to_web', checked)}
                    />
                  </SettingRow>
                  <SettingRow titulo={t('formulario.canalPos')} descripcion={t('formulario.canalPosAyuda')}>
                    <Switch
                      checked={formData.applies_to_pos ?? true}
                      onCheckedChange={(checked) => handleChange('applies_to_pos', checked)}
                    />
                  </SettingRow>
                  <SettingRow titulo={t('formulario.canalFinanzas')} descripcion={t('formulario.canalFinanzasAyuda')}>
                    <Switch
                      checked={formData.applies_to_finances ?? false}
                      onCheckedChange={(checked) => handleChange('applies_to_finances', checked)}
                    />
                  </SettingRow>
                </SettingGroup>
              </div>

              {/* Días de la semana recurrentes */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-fg">{t('formulario.dias')}</p>
                    <p className="text-[13px] leading-[18px] text-fg-secondary">
                      {t('formulario.diasAyuda')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                    onClick={() => handleChange('applicable_days', null)}
                  >
                    {t('formulario.todosLosDias')}
                  </button>
                </div>
                <ChipsOpcion<WeekDay>
                  multiple
                  etiqueta={t('formulario.dias')}
                  opciones={diasSemana.map((day) => ({ valor: day.value, etiqueta: day.largo }))}
                  valor={formData.applicable_days || []}
                  onValorChange={(valor) => handleChange('applicable_days', valor.length === 0 ? null : valor)}
                />
                {formData.applicable_days && formData.applicable_days.length > 0 && (
                  <p className="text-[13px] leading-[18px] text-brand-deep">
                    {t('formulario.aplicaLos', {
                      dias: formData.applicable_days
                        .map((d) => diasSemana.find((wd) => wd.value === d)?.largo)
                        .filter((nombre): nombre is string => Boolean(nombre))
                        .join(', '),
                    })}
                  </p>
                )}
                {(!formData.applicable_days || formData.applicable_days.length === 0) && (
                  <p className="text-[13px] leading-[18px] text-fg-secondary">
                    {t('formulario.aplicaTodos')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Reglas */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-sm font-medium text-fg">{t('formulario.aplicaA')}</p>
                <div role="radiogroup" aria-label={t('formulario.aplicaA')} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {(Object.keys(APPLIES_TO_LABELS) as AppliesTo[]).map((type) => (
                    <TarjetaSeleccionable
                      key={type}
                      orientacion="horizontal"
                      titulo={t(`aplicaA.${type}`)}
                      seleccionada={formData.applies_to === type}
                      onSeleccionar={() => handleChange('applies_to', type)}
                    />
                  ))}
                </div>
              </div>

              {formData.applies_to !== 'all' && (
                <SettingGroup>
                  <SettingRow
                    titulo={t('formulario.medirTodaLaCuenta')}
                    descripcion={textoCompraMinima(t, formData.applies_to, formData.min_purchase_scope)}
                  >
                    <Switch
                      checked={formData.min_purchase_scope === 'cart'}
                      onCheckedChange={(checked) => handleChange('min_purchase_scope', checked ? 'cart' : 'eligible')}
                    />
                  </SettingRow>
                </SettingGroup>
              )}

              {formData.applies_to === 'products' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                  <SegmentedControl
                    etiqueta={t('formulario.aplicaA')}
                    tonoActivo="marca"
                    valor={ruleType}
                    onValorChange={(v) => setRuleType(v)}
                    opciones={[
                      { valor: 'include', etiqueta: t('formulario.incluir') },
                      { valor: 'exclude', etiqueta: t('formulario.excluir') },
                    ]}
                  />
                    <Input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder={t('formulario.buscarProductos')}
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto rounded-lg border border-line p-2">
                    {(() => {
                      // Etiqueta legible de variantes (ej: "Color: Rojo · Talla: M")
                      const getVariantLabel = (p: ProductoPromocion): string | null => {
                        if (!p.variant_data) return null;
                        const entries = Object.entries(p.variant_data).filter(
                          ([, v]) => v && String(v).trim() !== ''
                        );
                        if (entries.length === 0) return null;
                        return entries.map(([k, v]) => `${k}: ${v}`).join(' · ');
                      };

                      // Filtrar por término de búsqueda (nombre, sku, padre, atributos)
                      const search = productSearch.trim().toLowerCase();
                      const filtered = products.filter((p) => {
                        if (!search) return true;
                        const variantAttrs = p.variant_data
                          ? Object.values(p.variant_data).join(' ').toLowerCase()
                          : '';
                        return (
                          String(p.name).toLowerCase().includes(search) ||
                          String(p.sku).toLowerCase().includes(search) ||
                          String(p.parent_name || '').toLowerCase().includes(search) ||
                          variantAttrs.includes(search)
                        );
                      });

                      // Agrupar por padre (o por nombre si no tiene)
                      const grouped = filtered.reduce((acc: Record<string, ProductoPromocion[]>, p) => {
                        const key = p.parent_name || p.name;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(p);
                        return acc;
                      }, {});

                      const groups = Object.entries(grouped);
                      if (groups.length === 0) {
                        return (
                          <div className="p-4 text-center text-fg-secondary">
                            <Package className="h-6 w-6 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">{t('formulario.sinProductos')}</p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-1">
                          {groups.map(([groupName, groupProducts]) => {
                            const hasVariants =
                              groupProducts.length > 1 ||
                              (groupProducts[0].variant_data && getVariantLabel(groupProducts[0]));
                            return (
                              <div key={groupName}>
                                {hasVariants && (
                                  <div className="sticky top-0 z-10 border-b border-line bg-subtle px-3 py-1.5">
                                    <span className="text-xs font-semibold text-fg-secondary">
                                      {groupName}
                                    </span>
                                  </div>
                                )}
                                {groupProducts.map((product) => {
                                  const variantLabel = getVariantLabel(product);
                                  const marcado = selectedProducts.includes(product.id);
                                  const pideCantidad = formData.promotion_type === 'bundle' && ruleType === 'include' && marcado;
                                  return (
                                    <div
                                      key={product.id}
                                      className="flex items-center gap-3 rounded-lg p-2 hover:bg-hover"
                                    >
                                      <Checkbox
                                        checked={marcado}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setSelectedProducts([...selectedProducts, product.id]);
                                          } else {
                                            setSelectedProducts(selectedProducts.filter(id => id !== product.id));
                                          }
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="flex-1 min-w-0 text-left"
                                        onClick={() => {
                                          if (marcado) {
                                            setSelectedProducts(selectedProducts.filter(id => id !== product.id));
                                          } else {
                                            setSelectedProducts([...selectedProducts, product.id]);
                                          }
                                        }}
                                      >
                                        <span className="block whitespace-normal break-words text-fg">
                                          {hasVariants && variantLabel ? variantLabel : product.name}
                                        </span>
                                        <span className="font-mono text-xs text-brand-deep">
                                          {product.sku}
                                        </span>
                                      </button>
                                      {pideCantidad && (
                                        <Input
                                          type="number"
                                          min={1}
                                          aria-label={t('formulario.unidadesPaquete', { nombre: product.name })}
                                          value={cantidadesPaquete[product.id] ?? 1}
                                          onChange={(e) => {
                                            const n = Math.trunc(Number(e.target.value));
                                            setCantidadesPaquete((prev) => ({
                                              ...prev,
                                              [product.id]: Number.isFinite(n) && n > 0 ? n : 1,
                                            }));
                                          }}
                                          className="w-20"
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                  {selectedProducts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedProducts.map(id => {
                        const product = products.find(p => p.id === id);
                        if (!product) return null;
                        const variantLabel = product.variant_data
                          ? Object.entries(product.variant_data)
                              .filter(([, v]) => v && String(v).trim() !== '')
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' · ')
                          : null;
                        const label = product.parent_name && variantLabel
                          ? `${product.parent_name} · ${variantLabel}`
                          : product.name;
                        const unidades = formData.promotion_type === 'bundle' && ruleType === 'include'
                          ? (cantidadesPaquete[id] ?? 1)
                          : null;
                        return (
                          <span key={id} className="inline-flex h-8 items-center rounded-full border border-line bg-subtle px-3 text-[13px] font-medium text-fg">
                            {unidades != null ? `${label} × ${unidades}` : label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {formData.applies_to === 'categories' && (
                <div className="space-y-4">
                  <SegmentedControl
                    etiqueta={t('formulario.aplicaA')}
                    tonoActivo="marca"
                    valor={ruleType}
                    onValorChange={(v) => setRuleType(v)}
                    opciones={[
                      { valor: 'include', etiqueta: t('formulario.incluir') },
                      { valor: 'exclude', etiqueta: t('formulario.excluir') },
                    ]}
                  />
                  <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-line p-2">
                    {categories.map(category => (
                      <label key={category.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-hover">
                        <Checkbox
                          checked={selectedCategories.includes(category.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCategories([...selectedCategories, category.id]);
                            } else {
                              setSelectedCategories(selectedCategories.filter(id => id !== category.id));
                            }
                          }}
                        />
                        <span className="text-fg">{category.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </FormSection>

      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={currentStep === 0 ? () => router.push('/app/pos/promociones') : prevStep}
          className={clasesBoton({ variante: 'secundario' })}
        >
          {currentStep > 0 && <ArrowLeft className="size-4" />}
          {currentStep === 0 ? t('formulario.cancelar') : t('formulario.anterior')}
        </button>

        {currentStep < WIZARD_STEPS.length - 1 ? (
          <button type="button" onClick={nextStep} className={clasesBoton({ variante: 'primario' })}>
            {t('formulario.siguiente')}
            <ArrowRight className="size-4" />
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={loading} className={clasesBoton({ variante: 'primario' })}>
            <Save className="size-4" />
            {loading ? t('formulario.guardando') : promotionId ? t('formulario.actualizar') : t('formulario.crear')}
          </button>
        )}
      </div>
    </div>
  );
}

function ayudaCompraLleva(
  t: Traductor,
  compra: number | null | undefined,
  lleva: number | null | undefined,
): string {
  const x = Math.trunc(compra || 0);
  const y = Math.trunc(lleva || 0);
  if (x > 0 && y > 0 && y < x) {
    return t('formulario.llevaPaga', { x, y, gratis: x - y });
  }
  if (x > 0 && y > 0) {
    return t('formulario.compraLlevaGratis', { x, y, grupo: x + y });
  }
  return t('formulario.compraLlevaAyuda');
}

/** Sobre qué subtotal se compara la compra mínima. */
function textoCompraMinima(
  t: Traductor,
  aplicaA: AppliesTo | undefined,
  alcance: MinPurchaseScope | null | undefined,
): string {
  if (aplicaA === 'all' || alcance === 'cart') return t('formulario.compraMinimaCuenta');
  return t('formulario.compraMinimaElegible');
}
