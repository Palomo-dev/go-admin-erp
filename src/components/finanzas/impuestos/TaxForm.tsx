"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { esRetencion, type ClaseImpuesto } from '@/lib/services/taxResolverCore';
import { baseMinimaEnMoneda } from '@/lib/services/compras/logica';
import {
  configurarRetencion,
  cuentasDePasivo,
  type CuentaPasivo,
  type RetencionConfigurada,
  type UvtVigente,
} from '@/lib/services/compras/retenciones';

const ERRORES_CONFIGURACION = [
  'cuenta_no_existe',
  'cuenta_no_es_pasivo',
  'cuenta_inactiva',
  'base_minima_invalida',
  'retencion_no_encontrada',
] as const;

interface TaxTemplate {
  id: number;
  country: string;
  code: string;
  name: string;
  rate: number;
  description: string | null;
  /** Clase de la plantilla (get_tax_templates_by_organization_country la devuelve). */
  kind?: string | null;
}

interface OrganizationTax {
  id: string;
  organization_id: number;
  template_id: number | null;
  name: string;
  rate: number;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  tax_included?: boolean;
}

interface TaxFormProps {
  open: boolean;
  onClose: (refreshData?: boolean) => void;
  tax: OrganizationTax | null;
  editMode: boolean;
  organizationId: number;
  /**
   * Clase que se crea o edita: 'tax' (impuesto de venta y compra) o
   * 'withholding' (retención: sin «por defecto» ni «incluido en el precio»).
   */
  clase?: ClaseImpuesto;
  /** Solo retenciones: cuenta y base mínima actuales (fn_retenciones_configuracion). */
  retencion?: RetencionConfigurada | null;
  /** Solo retenciones: UVT vigente, para mostrar la base mínima en moneda. */
  uvt?: UvtVigente | null;
  formatearUvt?: (valor: number) => string;
}

const TaxForm: React.FC<TaxFormProps> = ({
  open,
  onClose,
  tax,
  editMode,
  organizationId,
  clase = 'tax',
  retencion = null,
  uvt = null,
  formatearUvt,
}) => {
  const t = useTranslations('impuestosRetenciones');
  const esClaseRetencion = clase === 'withholding';
  // Estado para el formulario
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [taxIncluded, setTaxIncluded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<TaxTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [useTemplate, setUseTemplate] = useState(false);
  // '' es la cuenta automática de su clase (2365 / 2367 / 2368).
  const [cuenta, setCuenta] = useState('');
  const [baseMinima, setBaseMinima] = useState('');
  const [cuentas, setCuentas] = useState<CuentaPasivo[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!esClaseRetencion || !organizationId) return;
    let cancelado = false;
    cuentasDePasivo(organizationId)
      .then((lista) => {
        if (!cancelado) setCuentas(lista);
      })
      .catch((err) => console.error('Error al cargar las cuentas de pasivo:', err));
    return () => {
      cancelado = true;
    };
  }, [esClaseRetencion, organizationId]);

  useEffect(() => {
    setCuenta(retencion?.cuentaPropia ? retencion.cuenta : '');
    setBaseMinima(retencion?.baseMinimaUvt != null ? String(retencion.baseMinimaUvt) : '');
  }, [retencion]);

  const baseMinimaUvt = baseMinima.trim() === '' ? null : Number(baseMinima);
  const baseMinimaValida = baseMinimaUvt === null || (Number.isFinite(baseMinimaUvt) && baseMinimaUvt >= 0);
  const baseMinimaMoneda = baseMinimaValida ? baseMinimaEnMoneda(baseMinimaUvt, uvt?.valor ?? null) : null;
  // Una cuenta propia que ya no es pasivo activo se sigue mostrando para no perderla de vista.
  const cuentaFueraDeLista = cuenta !== '' && !cuentas.some((c) => c.codigo === cuenta);

  // Cargar datos de plantillas de impuestos filtradas por país de la organización
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const { data, error } = await supabase
          .rpc('get_tax_templates_by_organization_country', {
            org_id: organizationId
          });

        if (error) throw error;
        setTemplates(data || []);
        
        // Si hay plantillas disponibles y no estamos en modo edición, 
        // activar automáticamente el uso de plantillas
        const deLaClase = ((data || []) as TaxTemplate[]).filter(
          (tpl) => esRetencion({ kind: tpl.kind, tax_templates: { code: tpl.code } }) === (clase === 'withholding'),
        );
        if (!editMode && deLaClase.length > 0) {
          setUseTemplate(true);
        }
      } catch (error) {
        console.error('Error al cargar plantillas:', error);
        // En caso de error, intentar cargar todas las plantillas como fallback
        try {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('tax_templates')
            .select('*')
            .order('name');
          
          if (!fallbackError && fallbackData) {
            setTemplates(fallbackData);
          }
        } catch (fallbackErrorFinal) {
          console.error('Error en fallback de plantillas:', fallbackErrorFinal);
        }
      }
    };

    if (organizationId) {
      fetchTemplates();
    }
  }, [organizationId, editMode, clase]);

  // Inicializar formulario con datos del impuesto si estamos en modo edición
  useEffect(() => {
    if (editMode && tax) {
      setName(tax.name);
      setRate(tax.rate.toString());
      setDescription(tax.description || '');
      setIsDefault(tax.is_default);
      setIsActive(tax.is_active);
      setTaxIncluded(tax.tax_included || false);
      setSelectedTemplate(tax.template_id);
      setUseTemplate(!!tax.template_id);
    } else {
      // Valores por defecto para un nuevo impuesto
      setName('');
      setRate('');
      setDescription('');
      setIsDefault(false);
      setIsActive(true);
      setTaxIncluded(false);
      setSelectedTemplate(null);
      setUseTemplate(false);
    }
  }, [editMode, tax]);

  // Solo las plantillas de la clase que se está creando: una retención no se
  // ofrece como impuesto de venta ni al revés.
  const plantillas = templates.filter(
    (tpl) => esRetencion({ kind: tpl.kind, tax_templates: { code: tpl.code } }) === esClaseRetencion,
  );

  // Función para aplicar datos de la plantilla seleccionada
  const applyTemplate = () => {
    if (!selectedTemplate) return;
    
    const template = plantillas.find(tpl => tpl.id === selectedTemplate);
    if (template) {
      setName(template.name);
      setRate(template.rate.toString());
      setDescription(template.description || '');
    }
  };

  // Efecto para aplicar la plantilla cuando cambia la selección. A propósito
  // NO depende de la lista de plantillas: al editar, cuando llegan las
  // plantillas no se debe pisar el nombre ni la tarifa ya guardados.
  useEffect(() => {
    if (useTemplate && selectedTemplate) {
      applyTemplate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate, useTemplate]);

  // Validación básica
  const isFormValid = () => {
    return name.trim() !== '' && !isNaN(parseFloat(rate)) && (!esClaseRetencion || baseMinimaValida);
  };

  // Guardar el impuesto
  const handleSave = async () => {
    // Validaciones básicas
    if (!name.trim()) {
      toast({
        title: 'Error',
        description: 'El nombre del impuesto es obligatorio.',
        variant: 'destructive',
      });
      return;
    }

    if (parseFloat(rate.toString()) < 0 || parseFloat(rate.toString()) > 100) {
      toast({
        title: 'Error',
        description: 'La tasa debe estar entre 0 y 100%.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Llamar a la función RPC con SECURITY DEFINER para evitar problemas de RLS
      const { data, error } = await supabase.rpc('manage_organization_tax', {
        p_organization_id: organizationId,
        p_name: name,
        p_rate: parseFloat(rate.toString()),
        p_description: description || null,
        p_is_default: esClaseRetencion ? false : isDefault,
        p_is_active: isActive,
        p_template_id: useTemplate ? selectedTemplate : null,
        p_id: editMode && tax ? tax.id : null,
        p_tax_included: esClaseRetencion ? false : taxIncluded,
        p_kind: clase,
      });

      if (error) {
        throw error;
      }

      if (data && !data.success) {
        throw new Error(data.message || 'Error desconocido al guardar el impuesto');
      }

      // La cuenta y la base mínima van por su propia RPC (con permiso de impuestos):
      // si fallan, la retención ya quedó guardada y se dice qué faltó.
      const idGuardado: string | null = (data?.id as string | undefined) ?? (editMode && tax ? tax.id : null);
      if (esClaseRetencion && idGuardado) {
        try {
          await configurarRetencion(organizationId, idGuardado, { cuenta: cuenta || null, baseMinimaUvt });
        } catch (errConfig) {
          console.error('Error al guardar la cuenta o la base mínima de la retención:', errConfig);
          const mensaje = errConfig instanceof Error ? errConfig.message : String((errConfig as { message?: string })?.message ?? '');
          const codigo = ERRORES_CONFIGURACION.find((c) => mensaje.includes(c));
          toast({
            title: t('formulario.errorConfiguracionTitulo'),
            description: t('formulario.errorConfiguracion', {
              detalle: codigo ? t(`formulario.errores.${codigo}`) : t('formulario.errores.otro'),
            }),
            variant: 'destructive',
          });
          onClose(true);
          return;
        }
      }

      // Mostrar mensaje de éxito
      toast({
        title: 'Éxito',
        description: data.message || (editMode ? 'Impuesto actualizado correctamente.' : 'Impuesto creado correctamente.'),
      });

      // No necesitamos actualizar manualmente otros impuestos como predeterminados
      // porque la función RPC ya se encarga de eso

      onClose(true);
    } catch (error) {
      console.error('Error al guardar el impuesto:', error);
      toast({
        title: 'Error',
        // El mensaje del servidor dice por qué (sin permiso, tasa fuera de rango…).
        description: error instanceof Error && error.message ? error.message : 'No se pudo guardar el impuesto. Intente de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => !loading && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-200">
        <DialogHeader className="px-4 sm:px-6">
          <DialogTitle className="text-lg sm:text-xl text-blue-600 dark:text-blue-400">
            {esClaseRetencion
              ? t(editMode ? 'formulario.editar' : 'formulario.nueva')
              : editMode ? 'Editar Impuesto' : 'Nuevo Impuesto'}
          </DialogTitle>
        </DialogHeader>

        {esClaseRetencion && (
          <p className="mx-4 sm:mx-6 text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {t('formulario.nota')}
          </p>
        )}
        
        {!editMode && !esClaseRetencion && plantillas.length > 0 && (
          <div className="mx-4 sm:mx-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
              ℹ️ <strong>Plantillas sugeridas:</strong> Se muestran automáticamente los impuestos 
              configurados para su país de operación. Puede usar una plantilla o crear un impuesto personalizado.
            </p>
          </div>
        )}
        
        <div className="grid gap-4 py-4 px-4 sm:px-6">
          {!editMode && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="useTemplate" 
                  checked={useTemplate} 
                  onCheckedChange={(checked) => setUseTemplate(!!checked)}
                  className="dark:border-gray-600"
                />
                <Label htmlFor="useTemplate" className="text-sm dark:text-gray-300 cursor-pointer">
                  Usar plantilla de impuesto
                </Label>
              </div>
              
              {useTemplate && (
                <div className="grid grid-cols-1 gap-2">
                  <Label htmlFor="template" className="text-sm dark:text-gray-300">
                    Plantillas de Impuestos Disponibles
                    {plantillas.length > 0 && plantillas[0]?.country && (
                      <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-medium">
                        ({plantillas[0].country})
                      </span>
                    )}
                  </Label>
                  {plantillas.length === 0 ? (
                    <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50 text-center">
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        No hay plantillas de impuestos disponibles para su país
                      </p>
                    </div>
                  ) : (
                    <>
                      <select
                        id="template"
                        value={selectedTemplate || ''}
                        onChange={(e) => setSelectedTemplate(Number(e.target.value))}
                        className="flex h-10 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-200 ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:ring-offset-2"
                      >
                        <option value="" className="dark:bg-gray-900 dark:text-gray-400">Seleccionar plantilla del país</option>
                        {plantillas.map((template) => (
                          <option key={template.id} value={template.id} className="dark:bg-gray-900 dark:text-gray-200">
                            {template.name} - {template.rate}% {template.description ? `(${template.description})` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Se muestran solo las plantillas específicas para su país de operación
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="name" className="text-sm dark:text-gray-300">
              Nombre <span className="text-red-500">*</span>
            </Label>
            <Input 
              id="name" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200 dark:placeholder:text-gray-500"
              placeholder="Ej: IVA 19%"
            />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="rate" className="text-sm dark:text-gray-300">
              Tasa (%) <span className="text-red-500">*</span>
            </Label>
            <Input 
              id="rate" 
              value={rate} 
              onChange={(e) => {
                // Solo permitir números y punto decimal
                const value = e.target.value.replace(/[^0-9.]/g, '');
                setRate(value);
              }}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200 dark:placeholder:text-gray-500"
              placeholder="Ej: 19"
              type="text"
              inputMode="decimal"
            />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="description" className="text-sm dark:text-gray-300">
              Descripción
            </Label>
            <Textarea 
              id="description" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none min-h-[80px] dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200 dark:placeholder:text-gray-500"
              placeholder="Descripción del impuesto"
            />
          </div>

          {esClaseRetencion && (
            <>
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="cuentaRetencion" className="text-sm dark:text-gray-300">
                  {t('formulario.cuenta')}
                </Label>
                <select
                  id="cuentaRetencion"
                  value={cuenta}
                  onChange={(e) => setCuenta(e.target.value)}
                  aria-describedby="cuentaRetencionAyuda"
                  className="flex h-10 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:ring-offset-2"
                >
                  <option value="">
                    {retencion && !retencion.cuentaPropia
                      ? t('formulario.cuentaAutomaticaActual', { cuenta: retencion.cuenta })
                      : t('formulario.cuentaAutomatica')}
                  </option>
                  {cuentaFueraDeLista && <option value={cuenta}>{cuenta}</option>}
                  {cuentas.map((c) => (
                    <option key={c.codigo} value={c.codigo}>
                      {c.codigo} · {c.nombre}
                    </option>
                  ))}
                </select>
                <p id="cuentaRetencionAyuda" className="text-xs text-gray-500 dark:text-gray-400">
                  {t('formulario.cuentaAyuda')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="baseMinimaUvt" className="text-sm dark:text-gray-300">
                  {t('formulario.baseMinima')}
                </Label>
                <Input
                  id="baseMinimaUvt"
                  value={baseMinima}
                  onChange={(e) => setBaseMinima(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200 dark:placeholder:text-gray-500"
                  placeholder={t('formulario.baseMinimaPlaceholder')}
                  type="text"
                  inputMode="decimal"
                  aria-invalid={!baseMinimaValida}
                  aria-describedby="baseMinimaAyuda"
                />
                <p id="baseMinimaAyuda" className="text-xs text-gray-500 dark:text-gray-400">
                  {!baseMinimaValida
                    ? t('formulario.errores.base_minima_invalida')
                    : baseMinimaMoneda !== null && uvt && formatearUvt
                      ? t('formulario.baseMinimaEquivale', { valor: formatearUvt(baseMinimaMoneda), anio: uvt.anio })
                      : t('formulario.baseMinimaAyuda')}
                </p>
              </div>
            </>
          )}

          <div className="flex items-center space-x-2">
            <Switch 
              id="isActive" 
              checked={isActive} 
              onCheckedChange={setIsActive}
              className="data-[state=checked]:bg-green-600 dark:data-[state=checked]:bg-green-700"
            />
            <Label htmlFor="isActive" className="text-sm dark:text-gray-300 cursor-pointer">
              Impuesto activo
            </Label>
          </div>

          {!esClaseRetencion && (
          <>
          <div className="flex items-center space-x-2">
            <Switch 
              id="isDefault" 
              checked={isDefault} 
              onCheckedChange={setIsDefault}
              className="data-[state=checked]:bg-amber-600 dark:data-[state=checked]:bg-amber-700"
            />
            <Label htmlFor="isDefault" className="text-sm dark:text-gray-300 cursor-pointer">
              Impuesto predeterminado
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Switch 
              id="taxIncluded" 
              checked={taxIncluded} 
              onCheckedChange={setTaxIncluded}
              className="data-[state=checked]:bg-blue-600 dark:data-[state=checked]:bg-blue-700"
            />
            <Label htmlFor="taxIncluded" className="text-sm dark:text-gray-300 cursor-pointer">
              Impuesto incluido en el precio
            </Label>
          </div>
          {taxIncluded && (
            <p className="text-xs text-blue-600 dark:text-blue-400 -mt-2 ml-10">
              El precio del producto ya incluye este impuesto. No se sumará al total.
            </p>
          )}
          </>
          )}
        </div>

        <DialogFooter className="px-4 sm:px-6 flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={() => onClose()} 
            disabled={loading}
            className="w-full sm:w-auto dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-300"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || !isFormValid()}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span className="text-sm sm:text-base">Guardando...</span>
              </>
            ) : (
              <span className="text-sm sm:text-base">Guardar</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TaxForm;
