'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, Info, Package, Tag, type LucideIcon } from 'lucide-react';
import { CampoNumero, Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ReturnReason, CreateReturnReasonData, UpdateReturnReasonData } from '../types';
import { ReturnReasonsService, claveErrorMotivo } from './returnReasonsService';
import { toast } from 'sonner';

interface ReturnReasonFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: ReturnReason | null;
  onSuccess: () => void;
}

export function ReturnReasonForm({ 
  open, 
  onOpenChange, 
  reason, 
  onSuccess 
}: ReturnReasonFormProps) {
  const [loading, setLoading] = useState(false);
  const t = useTranslations('posDevoluciones.motivos.formulario');
  const tErrores = useTranslations('posDevoluciones.motivos.errores');
  const tComun = useTranslations('posDevoluciones.comun');
  const [formData, setFormData] = useState<CreateReturnReasonData>({
    code: '',
    name: '',
    description: '',
    requires_photo: false,
    affects_inventory: true,
    is_active: true,
    display_order: 0
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const isEditing = !!reason;

  useEffect(() => {
    if (open) {
      if (reason) {
        setFormData({
          code: reason.code,
          name: reason.name,
          description: reason.description || '',
          requires_photo: reason.requires_photo,
          affects_inventory: reason.affects_inventory,
          is_active: reason.is_active,
          display_order: reason.display_order
        });
      } else {
        setFormData({
          code: '',
          name: '',
          description: '',
          requires_photo: false,
          affects_inventory: true,
          is_active: true,
          display_order: 0
        });
      }
      setErrors({});
    }
  }, [open, reason]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.code.trim()) {
      newErrors.code = t('validacion.codigoRequerido');
    } else if (formData.code.length > 20) {
      newErrors.code = t('validacion.codigoLargo');
    } else if (!/^[A-Za-z0-9_-]+$/.test(formData.code)) {
      newErrors.code = t('validacion.codigoFormato');
    }

    if (!formData.name.trim()) {
      newErrors.name = t('validacion.nombreRequerido');
    } else if (formData.name.length > 100) {
      newErrors.name = t('validacion.nombreLargo');
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = t('validacion.descripcionLarga');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    setLoading(true);
    try {
      if (isEditing && reason) {
        await ReturnReasonsService.update(reason.id, formData as UpdateReturnReasonData);
        toast.success(t('actualizado'));
      } else {
        await ReturnReasonsService.create(formData);
        toast.success(t('creado'));
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      const { clave, valores } = claveErrorMotivo(error, 'guardar');
      toast.error(tErrores(clave, valores));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = <K extends keyof CreateReturnReasonData>(field: K, value: CreateReturnReasonData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const interruptor = (
    campo: 'requires_photo' | 'affects_inventory' | 'is_active',
    Icono: LucideIcon,
    etiqueta: string,
    ayuda: string,
  ) => {
    const id = `motivo-${campo}`;
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle p-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
            <Icono className="size-4" strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <label htmlFor={id} className="text-sm font-medium text-fg">
              {etiqueta}
            </label>
            <p id={`${id}-ayuda`} className="text-xs text-fg-secondary">
              {ayuda}
            </p>
          </div>
        </div>
        <Switch
          id={id}
          aria-describedby={`${id}-ayuda`}
          checked={formData[campo]}
          onCheckedChange={(checked) => handleChange(campo, checked)}
          disabled={loading}
        />
      </div>
    );
  };

  return (
    <Dialogo
      abierto={open}
      onAbiertoChange={onOpenChange}
      titulo={isEditing ? t('tituloEditar') : t('tituloNuevo')}
      icono={Tag}
      ancho={520}
      textoCancelar={tComun('cancelar')}
      primario={{
        etiqueta: isEditing ? t('actualizar') : t('crear'),
        onClick: () => formRef.current?.requestSubmit(),
        cargando: loading,
      }}
    >
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField etiqueta={t('codigo')} obligatorio error={errors.code || null}>
          <Input
            value={formData.code}
            onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
            placeholder={t('codigoPlaceholder')}
            disabled={loading}
          />
        </FormField>

        <FormField etiqueta={t('nombre')} obligatorio error={errors.name || null}>
          <Input
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder={t('nombrePlaceholder')}
            disabled={loading}
          />
        </FormField>

        <FormField etiqueta={t('descripcion')} error={errors.description || null}>
          <Textarea
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder={t('descripcionPlaceholder')}
            rows={3}
            className="resize-none"
            disabled={loading}
          />
        </FormField>

        <FormField etiqueta={t('orden')} ayuda={t('ordenAyuda')}>
          {(c) => (
            <CampoNumero
              id={c.id}
              aria-describedby={c['aria-describedby']}
              valor={formData.display_order ?? 0}
              onValorChange={(v) => handleChange('display_order', v ?? 0)}
              decimales={0}
              minimo={0}
              alinear="izquierda"
              disabled={loading}
              className="w-32"
            />
          )}
        </FormField>

        <div className="flex flex-col gap-3 pt-1">
          {interruptor('requires_photo', Camera, t('requiereFoto'), t('requiereFotoAyuda'))}
          {interruptor('affects_inventory', Package, t('afectaInventario'), t('afectaInventarioAyuda'))}
          {interruptor('is_active', Info, t('activo'), t('activoAyuda'))}
        </div>
      </form>
    </Dialogo>
  );
}
