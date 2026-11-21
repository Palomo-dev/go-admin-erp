"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Copy, Percent, Pencil, Plus } from 'lucide-react';
import { AvisoTonal, Dialogo, FormField, SettingGroup, SettingRow } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';
import { useTranslations } from 'next-intl';
import { esRetencion, type ClaseImpuesto } from '@/lib/services/taxResolverCore';
import { baseMinimaEnMoneda } from '@/lib/services/compras/logica';
import { esCuentaDeTitulo } from '@/lib/finanzas/cuentasTitulo';
import { esImpuestoIva } from '@/lib/finanzas/mapeoImpuesto';
import { codigoDian, tipoImpuesto } from './impuestosLogica';
import {
  configurarRetencion,
  cuentasDePasivo,
  vincularCuentaImpuesto,
  type CuentaPasivo,
  type RetencionConfigurada,
  type UvtVigente,
} from '@/lib/services/compras/retenciones';

const ERRORES_CONFIGURACION = [
  'cuenta_no_existe',
  'cuenta_no_es_pasivo',
  'cuenta_inactiva',
  'cuenta_de_titulo',
  'cuenta_requerida',
  'impuesto_no_encontrado',
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
  /** Duplicar (menú ⋯ de la fila, Figma 830:529376): impuesto nuevo con los datos de este. */
  duplicarDe?: OrganizationTax | null;
  /** Productos que usan el impuesto (subtítulo «usado en N productos», Figma 1012:87865). */
  productos?: number | null;
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
  duplicarDe = null,
  productos = null,
}) => {
  const t = useTranslations('impuestosRetenciones');
  const tf = useTranslations('finanzasImpuestos.formulario');
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
  const [mapeoInexistente, setMapeoInexistente] = useState<string | null>(null);
  const cuentaTocada = useRef(false);
  const { toast } = useToast();

  const cuentasDetalle = useMemo(() => {
    const todas = cuentas.map((c) => ({ account_code: c.codigo, parent_code: c.parent_code }));
    return cuentas.filter(
      (c) => !esCuentaDeTitulo({ account_code: c.codigo, parent_code: c.parent_code }, todas),
    );
  }, [cuentas]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    cuentasDePasivo(organizationId)
      .then((lista) => {
        if (!cancelado) setCuentas(lista);
      })
      .catch((err) => console.error('Error al cargar las cuentas de pasivo:', err));
    return () => {
      cancelado = true;
    };
  }, [organizationId]);

  useEffect(() => {
    setCuenta(retencion?.cuentaPropia ? retencion.cuenta : '');
    setBaseMinima(retencion?.baseMinimaUvt != null ? String(retencion.baseMinimaUvt) : '');
  }, [retencion]);

  const baseMinimaUvt = baseMinima.trim() === '' ? null : Number(baseMinima);
  const baseMinimaValida = baseMinimaUvt === null || (Number.isFinite(baseMinimaUvt) && baseMinimaUvt >= 0);
  const baseMinimaMoneda = baseMinimaValida ? baseMinimaEnMoneda(baseMinimaUvt, uvt?.valor ?? null) : null;
  const cuentaEnDetalle = cuentasDetalle.some((c) => c.codigo === cuenta);

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
    } else if (duplicarDe) {
      // Copia: mismos datos, impuesto nuevo; nunca nace predeterminado (solo hay uno).
      setName(tf('nombreCopia', { nombre: duplicarDe.name }));
      setRate(duplicarDe.rate.toString());
      setDescription(duplicarDe.description || '');
      setIsDefault(false);
      setIsActive(true);
      setTaxIncluded(duplicarDe.tax_included || false);
      setSelectedTemplate(duplicarDe.template_id);
      setUseTemplate(false);
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
    // tf es estable; la copia solo se arma al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, tax, duplicarDe]);

  // Solo las plantillas de la clase que se está creando: una retención no se
  // ofrece como impuesto de venta ni al revés.
  const plantillas = templates.filter(
    (tpl) => esRetencion({ kind: tpl.kind, tax_templates: { code: tpl.code } }) === esClaseRetencion,
  );
  const plantillaElegida = templates.find(
    (tpl) => tpl.id === (useTemplate ? selectedTemplate : tax?.template_id ?? duplicarDe?.template_id ?? null),
  );
  const esIva = !esClaseRetencion && esImpuestoIva(plantillaElegida?.code ?? null, name);

  useEffect(() => {
    cuentaTocada.current = false;
    setMapeoInexistente(null);
  }, [open, tax?.id]);

  useEffect(() => {
    if (!open || !esIva || cuentas.length === 0 || cuentaTocada.current) return;
    let cancelado = false;
    const aplicar = (codigoGuardado: string | null) => {
      if (cancelado || cuentaTocada.current) return;
      const codigos = new Set(cuentasDetalle.map((c) => c.codigo));
      if (codigoGuardado && codigos.has(codigoGuardado)) {
        setMapeoInexistente(null);
        setCuenta(codigoGuardado);
        return;
      }
      setMapeoInexistente(codigoGuardado);
      setCuenta(cuentaIvaSugerida(cuentasDetalle) ?? '');
    };

    if (!editMode || !tax) {
      aplicar(null);
      return;
    }

    const filtro = tax.template_id
      ? `organization_tax_id.eq.${tax.id},tax_template_id.eq.${tax.template_id}`
      : `organization_tax_id.eq.${tax.id}`;
    supabase
      .from('tax_account_mapping')
      .select('account_code, organization_tax_id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .or(filtro)
      .then(({ data, error }) => {
        if (error) {
          console.error('No se pudo leer el mapeo del impuesto:', error);
          aplicar(null);
          return;
        }
        const filas = (data ?? []) as Array<{ account_code: string; organization_tax_id: string | null }>;
        const propia = filas.find((fila) => fila.organization_tax_id === tax.id);
        aplicar((propia ?? filas[0])?.account_code ?? null);
      });

    return () => {
      cancelado = true;
    };
  }, [open, esIva, cuentas, cuentasDetalle, editMode, tax, organizationId]);

  useEffect(() => {
    if (!esClaseRetencion || cuenta === '' || cuentas.length === 0) return;
    if (!cuentasDetalle.some((c) => c.codigo === cuenta)) {
      setMapeoInexistente(cuenta);
      setCuenta('');
    }
  }, [esClaseRetencion, cuenta, cuentas, cuentasDetalle]);

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
    const ivaListo = !esIva || cuentaEnDetalle;
    const retencionLista = !esClaseRetencion || (baseMinimaValida && (cuenta === '' || cuentaEnDetalle));
    return name.trim() !== '' && !isNaN(parseFloat(rate)) && ivaListo && retencionLista;
  };

  // Guardar el impuesto
  const handleSave = async () => {
    // Validaciones básicas
    if (!name.trim()) {
      toast({ title: tf('errorTitulo'), description: tf('validacion.nombre'), variant: 'destructive' });
      return;
    }

    if (parseFloat(rate.toString()) < 0 || parseFloat(rate.toString()) > 100) {
      toast({ title: tf('errorTitulo'), description: tf('validacion.tasa'), variant: 'destructive' });
      return;
    }

    if (esIva && !cuentaEnDetalle) {
      toast({ title: tf('validacion.cuentaTitulo'), description: tf('validacion.cuenta'), variant: 'destructive' });
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

      if (esIva && idGuardado) {
        try {
          await vincularCuentaImpuesto(organizationId, idGuardado, cuenta);
        } catch (errConfig) {
          console.error('Error al vincular la cuenta del IVA:', errConfig);
          const mensaje = errConfig instanceof Error ? errConfig.message : String((errConfig as { message?: string })?.message ?? '');
          const codigo = ERRORES_CONFIGURACION.find((c) => mensaje.includes(c));
          const detalle = codigo === 'cuenta_no_existe' || codigo === 'cuenta_de_titulo' || codigo === 'cuenta_no_es_pasivo'
            ? tf(`cuentaErrores.${codigo}`)
            : tf('cuentaErrores.otro');
          toast({ title: tf('cuentaGuardadaSinCuenta'), description: tf('cuentaErrorDetalle', { detalle }), variant: 'destructive' });
          onClose(true);
          return;
        }
      }

      // Mostrar mensaje de éxito
      toast({ description: data?.message || tf(editMode ? 'actualizado' : 'creado') });

      // No necesitamos actualizar manualmente otros impuestos como predeterminados
      // porque la función RPC ya se encarga de eso

      onClose(true);
    } catch (error) {
      console.error('Error al guardar el impuesto:', error);
      toast({
        title: tf('errorTitulo'),
        // El mensaje del servidor dice por qué (sin permiso, tasa fuera de rango…).
        description: error instanceof Error && error.message ? error.message : tf('errorGuardar'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const tipo = tipoImpuesto(plantillaElegida?.code ?? null, name);
  const dian = esClaseRetencion ? null : codigoDian(plantillaElegida?.code ?? null, name);
  const selectorCuenta = 'h-10 border-line-strong bg-surface';
  const opcionAutomatica = '__automatica__';

  const titulo = esClaseRetencion
    ? t(editMode ? 'formulario.editar' : 'formulario.nueva')
    : tf(editMode ? 'editar' : duplicarDe ? 'duplicar' : 'nuevo');
  const descripcionDialogo = editMode && tax
    ? productos !== null && productos !== undefined
      ? tf('subtituloUso', { nombre: tax.name, count: productos })
      : tax.name
    : undefined;

  // Diálogo del kit (Figma 1012:87865 editar, 195:13699 nuevo con plantilla del país).
  return (
    <Dialogo
      abierto={open}
      onAbiertoChange={(abierto) => !abierto && !loading && onClose()}
      titulo={titulo}
      descripcion={descripcionDialogo}
      icono={editMode ? Pencil : duplicarDe ? Copy : esClaseRetencion ? Plus : Percent}
      ancho={560}
      primario={{
        etiqueta: tf(editMode ? 'guardarCambios' : 'guardar'),
        onClick: () => void handleSave(),
        cargando: loading,
        deshabilitada: !isFormValid(),
      }}
    >
      <div className="flex flex-col gap-4">
        {esClaseRetencion && <AvisoTonal tono="informacion" compacto titulo={t('formulario.nota')} />}

        {!editMode && !duplicarDe && !esClaseRetencion && plantillas.length > 0 && (
          <AvisoTonal tono="informacion" compacto titulo={tf('plantillas.aviso')} />
        )}

        {!editMode && !duplicarDe && (
          <div className="flex flex-col gap-3">
            <label htmlFor="useTemplate" className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <Checkbox id="useTemplate" checked={useTemplate} onCheckedChange={(checked) => setUseTemplate(!!checked)} />
              {tf('plantillas.usar')}
            </label>

            {useTemplate && (
              <FormField
                etiqueta={plantillas[0]?.country ? tf('plantillas.etiquetaPais', { pais: plantillas[0].country }) : tf('plantillas.etiqueta')}
                ayuda={plantillas.length > 0 ? tf('plantillas.ayuda') : undefined}
              >
                {(c) =>
                  plantillas.length === 0 ? (
                    <p id={c.id} className="rounded-lg border border-line bg-subtle px-3 py-2.5 text-sm text-fg-secondary">
                      {tf('plantillas.sinPlantillas')}
                    </p>
                  ) : (
                    <Select value={selectedTemplate ? String(selectedTemplate) : ''} onValueChange={(v) => setSelectedTemplate(Number(v))}>
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={selectorCuenta}>
                        <SelectValue placeholder={tf('plantillas.elegir')} />
                      </SelectTrigger>
                      <SelectContent>
                        {plantillas.map((template) => (
                          <SelectItem key={template.id} value={String(template.id)}>
                            {template.name} · {template.rate} %{template.description ? ` (${template.description})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                }
              </FormField>
            )}
          </div>
        )}

        <FormField etiqueta={tf('nombre')} obligatorio>
          {(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} placeholder={tf('nombreEjemplo')} maxLength={100} className="h-10" />}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={tf('tasa')} obligatorio ayuda={tf('tasaAyuda')}>
            {(c) => (
              <Input
                {...c}
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder={tf('tasaEjemplo')}
                type="text"
                inputMode="decimal"
                className="h-10"
              />
            )}
          </FormField>
          {!esClaseRetencion && (
            <FormField etiqueta={tf('codigoDian')} ayuda={tf('codigoDianAyuda')}>
              {(c) => (
                <p id={c.id} className="flex h-10 items-center rounded-lg border border-line bg-subtle px-3 text-sm text-fg">
                  {dian ? tf('codigoDianValor', { codigo: dian, tipo: tf(`tipos.${tipo}`) }) : tf('codigoDianNinguno')}
                </p>
              )}
            </FormField>
          )}
        </div>

        <FormField etiqueta={tf('descripcion')}>
          {(c) => (
            <Textarea
              {...c}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[72px] resize-none"
              placeholder={tf('descripcionEjemplo')}
            />
          )}
        </FormField>

        {esIva && (
          <FormField
            etiqueta={tf('cuentaIva')}
            obligatorio
            ayuda={tf('cuentaIvaAyuda')}
            error={
              mapeoInexistente
                ? tf('cuentaIvaInexistente', { cuenta: mapeoInexistente })
                : !cuentasDetalle.some((c) => c.codigo === '2408') && !cuentaIvaSugerida(cuentasDetalle)
                  ? tf('cuentaIvaSinDetalle')
                  : null
            }
          >
            {(c) => (
              <div className="flex flex-col gap-1.5">
                <Select
                  value={cuentaEnDetalle ? cuenta : ''}
                  onValueChange={(v) => {
                    cuentaTocada.current = true;
                    setMapeoInexistente(null);
                    setCuenta(v);
                  }}
                >
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className={selectorCuenta}>
                    <SelectValue placeholder={tf('elegirCuenta')} />
                  </SelectTrigger>
                  <SelectContent>
                    {cuentasDetalle.map((cta) => (
                      <SelectItem key={cta.codigo} value={cta.codigo}>
                        {cta.codigo} · {cta.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!cuentasDetalle.some((cta) => cta.codigo === '2408') && cuentaIvaSugerida(cuentasDetalle) && (
                  <p className="text-xs text-fg-secondary">{tf('cuentaIvaAuxiliar', { cuenta: cuentaIvaSugerida(cuentasDetalle) ?? '' })}</p>
                )}
              </div>
            )}
          </FormField>
        )}

        {esClaseRetencion && (
          <>
            <FormField
              etiqueta={t('formulario.cuenta')}
              ayuda={t('formulario.cuentaAyuda')}
              error={mapeoInexistente ? tf('cuentaRetencionInexistente', { cuenta: mapeoInexistente }) : null}
            >
              {(c) => (
                <Select
                  value={cuentaEnDetalle ? cuenta : opcionAutomatica}
                  onValueChange={(v) => {
                    cuentaTocada.current = true;
                    setCuenta(v === opcionAutomatica ? '' : v);
                  }}
                >
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className={selectorCuenta}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={opcionAutomatica}>
                      {retencion && !retencion.cuentaPropia
                        ? t('formulario.cuentaAutomaticaActual', { cuenta: retencion.cuenta })
                        : t('formulario.cuentaAutomatica')}
                    </SelectItem>
                    {cuentasDetalle.map((cta) => (
                      <SelectItem key={cta.codigo} value={cta.codigo}>
                        {cta.codigo} · {cta.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <FormField
              etiqueta={t('formulario.baseMinima')}
              error={!baseMinimaValida ? t('formulario.errores.base_minima_invalida') : null}
              ayuda={
                baseMinimaMoneda !== null && uvt && formatearUvt
                  ? t('formulario.baseMinimaEquivale', { valor: formatearUvt(baseMinimaMoneda), anio: uvt.anio })
                  : t('formulario.baseMinimaAyuda')
              }
            >
              {(c) => (
                <Input
                  {...c}
                  value={baseMinima}
                  onChange={(e) => setBaseMinima(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder={t('formulario.baseMinimaPlaceholder')}
                  type="text"
                  inputMode="decimal"
                  className="h-10"
                />
              )}
            </FormField>
          </>
        )}

        <SettingGroup etiqueta={tf('opciones')}>
          <SettingRow titulo={tf(esClaseRetencion ? 'activaRetencion' : 'activo')} htmlFor="isActive">
            <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
          </SettingRow>
          {!esClaseRetencion && (
            <>
              <SettingRow titulo={tf('predeterminado')} descripcion={tf('predeterminadoAyuda')} htmlFor="isDefault">
                <Switch id="isDefault" checked={isDefault} onCheckedChange={setIsDefault} />
              </SettingRow>
              <SettingRow titulo={tf('incluido')} descripcion={tf('incluidoAyuda')} htmlFor="taxIncluded">
                <Switch id="taxIncluded" checked={taxIncluded} onCheckedChange={setTaxIncluded} />
              </SettingRow>
            </>
          )}
        </SettingGroup>
      </div>
    </Dialogo>
  );
};


/** 2408 si es de detalle; si no 24080501; si no la primera de detalle bajo 240805 y luego bajo 2408. */
export function cuentaIvaSugerida(cuentas: Array<{ codigo: string }>): string | null {
  const codigos = cuentas.map((c) => c.codigo).sort();
  if (codigos.includes('2408')) return '2408';
  if (codigos.includes('24080501')) return '24080501';
  return codigos.find((c) => c.startsWith('240805')) ?? codigos.find((c) => c.startsWith('2408')) ?? null;
}

export default TaxForm;
