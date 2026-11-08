'use client';

/**
 * Naturaleza y retenciones de un anticipo a proveedor (P1 del Contador). Es el
 * `complemento` del diálogo compartido `RegistrarAnticipoDialog`: solo existe en
 * la variante del proveedor.
 *
 * - Naturaleza OBLIGATORIA y sin valor por defecto: «anticipo de financiación»
 *   (la retención se practica al causar con la factura) o «pago anticipado del
 *   precio» (la retención se evalúa al girar).
 * - Pago anticipado: tarifa de IVA de la operación y los conceptos de retención
 *   configurados de la organización (renta; ICA del municipio).
 * - La evaluación la hace la base (`POST /api/anticipos-proveedor/retenciones`):
 *   renta, reteIVA y reteICA según el perfil tributario vigente y los datos del
 *   proveedor. Lo que falte queda «pendiente» y se ve; nunca se asume 0.
 *
 * El diálogo recibe `{ naturaleza, tarifaIva, retefuenteId, reteicaId }` y si
 * está completo; los valores los vuelve a calcular la base al registrar.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, FilaDato, FormField, StatusBadge } from '@/components/kit';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  NATURALEZAS_ANTICIPO,
  type EstadoRetencionAnticipo,
  type EvaluacionRetenciones,
  type NaturalezaAnticipo,
} from '@/lib/finanzas/anticiposProveedor/contrato';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { anticiposProveedorService } from './anticiposProveedorService';

const NS = 'finanzasTercerosR4.anticipos';
/** Tarifas generales del IVA para elegir la de la operación; la base las valida contra los impuestos de la organización. */
const TARIFAS_IVA = [19, 5, 0] as const;
const SIN_ELEGIR = '__sin__';
const BADGE: Readonly<Record<EstadoRetencionAnticipo, string>> = { practicar: 'activo', no_aplica: 'inactivo', pendiente: 'pendiente' };

export interface SeccionRetencionesAnticipoProps {
  proveedorId: string | null;
  monto: number | null;
  /** El usuario intentó registrar: se muestran los errores. */
  tocado: boolean;
  onCambio: (valor: Record<string, unknown> | null, valido: boolean) => void;
}

export function SeccionRetencionesAnticipo({ proveedorId, monto, tocado, onCambio }: SeccionRetencionesAnticipoProps) {
  const t = useTranslations(NS);
  const moneda = useMonedaOrganizacion();
  const idNaturaleza = useId();
  const [naturaleza, setNaturaleza] = useState<NaturalezaAnticipo | null>(null);
  const [tarifaIva, setTarifaIva] = useState<number | null>(null);
  const [retefuenteId, setRetefuenteId] = useState<string | null>(null);
  const [reteicaId, setReteicaId] = useState<string | null>(null);
  const [evaluacion, setEvaluacion] = useState<EvaluacionRetenciones | null>(null);
  const [evaluando, setEvaluando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avisar = useRef(onCambio);
  useEffect(() => {
    avisar.current = onCambio;
  });

  const esPrecio = naturaleza === 'pago_anticipado_precio';
  const listoParaEvaluar = !!proveedorId && monto !== null && monto > 0 && naturaleza !== null && (!esPrecio || tarifaIva !== null);

  // La base evalúa con lo elegido; se espera un momento para no consultar en cada tecla del monto.
  useEffect(() => {
    if (!listoParaEvaluar || !proveedorId || monto === null || naturaleza === null) {
      setEvaluacion(null);
      setError(null);
      return;
    }
    let vigente = true;
    setEvaluando(true);
    const temporizador = setTimeout(() => {
      anticiposProveedorService
        .evaluarRetenciones({ proveedorId, monto, naturaleza, tarifaIva: esPrecio ? tarifaIva : null, retefuenteId, reteicaId })
        .then((r) => {
          if (!vigente) return;
          setEvaluacion(r);
          setError(null);
        })
        .catch((e) => {
          if (!vigente) return;
          setEvaluacion(null);
          setError(textoErrorSaldo(t, e));
        })
        .finally(() => vigente && setEvaluando(false));
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [listoParaEvaluar, proveedorId, monto, naturaleza, tarifaIva, esPrecio, retefuenteId, reteicaId, t]);

  const faltaConcepto = !!evaluacion?.clases.some((c) => c.motivo === 'concepto_sin_elegir');
  const valido = naturaleza !== null && (!esPrecio || tarifaIva !== null) && !!evaluacion && !faltaConcepto && !error && !evaluando;

  useEffect(() => {
    avisar.current(
      naturaleza ? { naturaleza, tarifaIva: esPrecio ? tarifaIva : null, retefuenteId: esPrecio ? retefuenteId : null, reteicaId: esPrecio ? reteicaId : null } : null,
      valido,
    );
  }, [naturaleza, tarifaIva, esPrecio, retefuenteId, reteicaId, valido]);

  const opcionesFuente = evaluacion?.opciones.retefuente ?? [];
  const opcionesIca = evaluacion?.opciones.reteica ?? [];
  const pendientes = useMemo(() => (evaluacion?.clases ?? []).filter((c) => c.estado === 'pendiente'), [evaluacion]);

  const motivoTexto = (motivo: string | null) => {
    if (!motivo) return null;
    const clave = `retenciones.motivos.${motivo}`;
    return t.has(clave) ? t(clave) : motivo;
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line p-3 sm:p-4">
      <div className="flex flex-col gap-2">
        <span id={idNaturaleza} className="text-sm font-medium text-fg">
          {t('retenciones.naturaleza')} <span className="text-danger-text">*</span>
        </span>
        <RadioGroup
          aria-labelledby={idNaturaleza}
          value={naturaleza ?? ''}
          onValueChange={(v) => {
            setNaturaleza(v as NaturalezaAnticipo);
            if (v === 'financiacion') {
              setTarifaIva(null);
              setRetefuenteId(null);
              setReteicaId(null);
            }
          }}
        >
          {NATURALEZAS_ANTICIPO.map((n) => (
            <OpcionNaturaleza key={n} valor={n} etiqueta={t(`retenciones.naturalezas.${n}.titulo`)} ayuda={t(`retenciones.naturalezas.${n}.ayuda`)} />
          ))}
        </RadioGroup>
        {tocado && naturaleza === null && (
          <p role="alert" className="text-xs text-danger-text">
            {t('validacion.naturaleza')}
          </p>
        )}
      </div>

      {esPrecio && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('retenciones.tarifaIva')} obligatorio error={tocado && tarifaIva === null ? t('validacion.tarifaIva') : null}>
            {(c) => (
              <Select value={tarifaIva === null ? '' : String(tarifaIva)} onValueChange={(v) => setTarifaIva(Number(v))}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('retenciones.tarifaIvaPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {TARIFAS_IVA.map((tarifa) => (
                    <SelectItem key={tarifa} value={String(tarifa)}>
                      {tarifa === 0 ? t('retenciones.sinIva') : t('retenciones.tarifa', { tarifa })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          {opcionesFuente.length > 0 && (
            <FormField etiqueta={t('retenciones.conceptoFuente')} error={tocado && faltaConcepto ? t('validacion.conceptoFuente') : null}>
              {(c) => (
                <Select value={retefuenteId ?? ''} onValueChange={(v) => setRetefuenteId(v || null)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue placeholder={t('retenciones.conceptoPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {opcionesFuente.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )}
          {opcionesIca.length > 0 && (
            <FormField etiqueta={t('retenciones.conceptoIca')} ayuda={t('retenciones.conceptoIcaAyuda')}>
              {(c) => (
                <Select value={reteicaId ?? SIN_ELEGIR} onValueChange={(v) => setReteicaId(v === SIN_ELEGIR ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_ELEGIR}>{t('retenciones.icaSinConfirmar')}</SelectItem>
                    {opcionesIca.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )}
        </div>
      )}

      {naturaleza !== null && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <span className="text-sm font-medium text-fg">{t('retenciones.titulo')}</span>
          {!listoParaEvaluar && <p className="text-sm text-fg-muted">{t('retenciones.completa')}</p>}
          {listoParaEvaluar && evaluando && !evaluacion && <p className="text-sm text-fg-muted">{t('cargando')}</p>}
          {evaluacion && (
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
              {evaluacion.clases.map((c) => (
                <li key={c.clase} className="flex flex-col gap-1 p-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium text-fg">
                      {t(`retenciones.clases.${c.clase}`)}
                      {c.concepto ? <span className="font-normal text-fg-muted"> · {c.concepto}</span> : null}
                    </span>
                    {c.estado === 'practicar' && c.base !== null && (
                      <span className="text-xs text-fg-muted">{t('retenciones.sobreBase', { tarifa: c.tarifa ?? 0, base: moneda.formatear(c.base) })}</span>
                    )}
                    {c.estado !== 'practicar' && motivoTexto(c.motivo) && <span className="text-xs text-fg-muted">{motivoTexto(c.motivo)}</span>}
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <StatusBadge estado={BADGE[c.estado]} etiqueta={t(`retenciones.estados.${c.estado}`)} />
                    <span className="tabular-nums text-sm text-fg">{c.estado === 'practicar' ? moneda.formatear(c.valor) : '—'}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {evaluacion && (
            <dl className="flex flex-col">
              <FilaDato etiqueta={t('retenciones.total')} valor={moneda.formatear(evaluacion.total)} />
              <FilaDato etiqueta={t('retenciones.girado')} valor={moneda.formatear(evaluacion.neto)} tono="fuerte" />
            </dl>
          )}
          {pendientes.length > 0 && (
            <AvisoTonal
              tono="advertencia"
              titulo={t('retenciones.pendienteTitulo')}
              descripcion={t('retenciones.pendienteDescripcion', { clases: pendientes.map((c) => t(`retenciones.clases.${c.clase}`)).join(', ') })}
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OpcionNaturaleza({ valor, etiqueta, ayuda }: { valor: NaturalezaAnticipo; etiqueta: string; ayuda: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <RadioGroupItem id={id} value={valor} className="mt-0.5" />
      <Label htmlFor={id} className="flex flex-col gap-0.5 font-normal">
        <span className="text-sm text-fg">{etiqueta}</span>
        <span className="text-xs text-fg-muted">{ayuda}</span>
      </Label>
    </div>
  );
}
