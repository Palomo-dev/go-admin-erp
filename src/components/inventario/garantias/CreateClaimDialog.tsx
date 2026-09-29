'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ErrorPeticionSeriales, clienteGarantias } from '@/lib/services/seriales/cliente';
import type { EvaluacionSerial } from '@/lib/services/seriales/contrato';
import { mesesYDias } from '@/components/inventario/seriales/logica';
import { MOTIVOS_RECLAMO, validarReclamo, type MotivoReclamo } from './logica';

export interface CreateClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Serial elegido desde el listado, el detalle o la sub-pestaña del producto. */
  preselectedSerialId?: number | null;
  /** Se llama con el id del reclamo creado. */
  onCreated?: (id?: string) => void;
}

/**
 * «Nuevo reclamo de garantía» (Figma 592:332573, 672 px). Se escanea o escribe
 * el serial vendido; la garantía y el cliente salen de la venta. Solo deja
 * crear si el serial está vendido, con garantía vigente y sin otro reclamo
 * abierto (lo mismo que exige `fn_garantia_crear`). Al crear, el serial pasa a
 * «Reclamo garantía» y el paso queda en su historial.
 */
export function CreateClaimDialog({ open, onOpenChange, preselectedSerialId, onCreated }: CreateClaimDialogProps) {
  const t = useTranslations('inventarioGarantias.nuevo');
  const tm = useTranslations('inventarioGarantias.motivos');
  const te = useTranslations('inventarioGarantias.errores');
  const { toast } = useToast();
  const { formatDate } = useFormatDate();

  const [codigo, setCodigo] = useState('');
  const [evaluacion, setEvaluacion] = useState<EvaluacionSerial | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoReclamo | ''>('');
  const [descripcion, setDescripcion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  const peticion = useRef<AbortController | null>(null);

  // Al abrir: limpia y, si llega un serial, lo evalúa por id.
  useEffect(() => {
    if (!open) return;
    setCodigo('');
    setEvaluacion(null);
    setMotivo('');
    setDescripcion('');
    setError(null);
    setIntento(false);
    if (preselectedSerialId) void evaluar({ id: preselectedSerialId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselectedSerialId]);

  const evaluar = async (consulta: { id?: number; codigo?: string }) => {
    peticion.current?.abort();
    const control = new AbortController();
    peticion.current = control;
    setBuscando(true);
    setError(null);
    try {
      const r = await clienteGarantias.evaluarSerial(consulta, control.signal);
      if (control.signal.aborted) return;
      setEvaluacion(r);
      if (r.serial && consulta.id) setCodigo(r.serial);
    } catch (e) {
      if (control.signal.aborted) return;
      setEvaluacion(null);
      setError(e instanceof ErrorPeticionSeriales && e.sinPermiso ? te('sin_permiso') : te('error_desconocido'));
    } finally {
      if (!control.signal.aborted) setBuscando(false);
    }
  };

  const buscarCodigo = () => {
    const c = codigo.trim();
    if (!c || (evaluacion?.serial && evaluacion.serial.toLowerCase() === c.toLowerCase())) return;
    void evaluar({ codigo: c });
  };

  const errorForm = validarReclamo({ serialId: evaluacion?.id ?? null, puede: !!evaluacion?.puede, motivo, descripcion });

  const crear = async () => {
    setIntento(true);
    if (errorForm || !evaluacion?.id || !motivo) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await clienteGarantias.crear({
        serial_id: evaluacion.id,
        motivo: tm(motivo),
        descripcion: descripcion.trim() || null,
      });
      toast({ title: t('creado', { codigo: r.codigo }) });
      onCreated?.(r.id);
      onOpenChange(false);
    } catch (e) {
      const codigoError = e instanceof ErrorPeticionSeriales ? e.codigo : 'error_desconocido';
      setError(te.has(codigoError) ? te(codigoError) : te('error_desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  const hoy = evaluacion?.hoy ?? '';
  const garantia = evaluacion?.garantia;
  const restante = garantia?.estado === 'vigente' && garantia.fin && hoy ? mesesYDias(hoy, garantia.fin.slice(0, 10)) : null;
  const ayudaSerial = evaluacion?.encontrado
    ? [
        evaluacion.producto?.nombre,
        evaluacion.fecha_venta || evaluacion.venta?.numero
          ? t('vendido', {
              fecha: evaluacion.fecha_venta ? formatDate(evaluacion.fecha_venta) : '—',
              venta: evaluacion.venta?.numero ?? '—',
              cliente: evaluacion.cliente?.nombre ?? t('sinCliente'),
            })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  const motivoBloqueo = errorForm === 'serial' ? t('bloqueo.serial') : errorForm === 'noReclamable' ? t('bloqueo.noReclamable') : undefined;

  return (
    <Dialogo
      abierto={open}
      onAbiertoChange={onOpenChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      ancho={672}
      primario={{
        etiqueta: t('crear'),
        onClick: crear,
        cargando: guardando,
        deshabilitada: !!motivoBloqueo || buscando,
        motivo: motivoBloqueo,
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField
          etiqueta={t('serial')}
          obligatorio
          ayuda={ayudaSerial}
          error={intento && errorForm === 'serial' ? t('errores.serial') : undefined}
        >
          <Input
            value={codigo}
            onChange={(e) => {
              setCodigo(e.target.value);
              if (evaluacion) setEvaluacion(null);
            }}
            onBlur={buscarCodigo}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                buscarCodigo();
              }
            }}
            placeholder={t('serialPlaceholder')}
            autoComplete="off"
            autoFocus={!preselectedSerialId}
            className="h-10 tabular-nums"
          />
        </FormField>

        <div aria-live="polite">
          {buscando && (
            <p className="flex items-center gap-2 text-sm text-fg-secondary">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              {t('buscando')}
            </p>
          )}
          {!buscando && evaluacion && (
            evaluacion.puede ? (
              <p className="flex items-start gap-2 rounded-lg bg-success-subtle px-3 py-2.5 text-sm text-success-text">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                {restante
                  ? t('garantiaVigente', { meses: garantia?.meses ?? 0, restanteMeses: restante.meses, restanteDias: restante.dias })
                  : t('garantiaVigenteCorta')}
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-lg bg-danger-subtle px-3 py-2.5 text-sm text-danger-text" role="alert">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                {evaluacion.motivo === 'reclamo_abierto' && evaluacion.reclamo_abierto?.codigo
                  ? t('noReclamable.reclamo_abierto_codigo', { codigo: evaluacion.reclamo_abierto.codigo })
                  : t(`noReclamable.${evaluacion.motivo ?? 'serial_no_encontrado'}`)}
              </p>
            )
          )}
        </div>

        <FormField etiqueta={t('motivo')} obligatorio error={intento && errorForm === 'motivo' ? t('errores.motivo') : undefined}>
          {(c) => (
            <Select value={motivo} onValueChange={(v) => setMotivo(v as MotivoReclamo)}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('motivoPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_RECLAMO.map((m) => (
                  <SelectItem key={m} value={m}>
                    {tm(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField
          etiqueta={t('descripcionCampo')}
          obligatorio={motivo === 'otro'}
          error={intento && errorForm === 'descripcionOtro' ? t('errores.descripcionOtro') : undefined}
        >
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} placeholder={t('descripcionPlaceholder')} className="h-10" />
        </FormField>

        <p className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-2.5 text-[13px] text-fg-secondary">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          {t('nota')}
        </p>

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

export default CreateClaimDialog;
