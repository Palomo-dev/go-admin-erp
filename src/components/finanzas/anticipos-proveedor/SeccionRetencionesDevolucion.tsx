'use client';

/**
 * Procedimiento de la devolución de un anticipo (ronda 3 del Contador). Es el `complemento` del diálogo
 * compartido `DevolverSaldoDialog`, solo en la variante del proveedor.
 *
 * Se elige la CAUSA, no las retenciones: las retenciones afectadas salen del procedimiento.
 * - Operación anulada o resuelta: se revierten todas las retenciones vigentes; se devuelve todo el saldo.
 * - Devolución parcial: el cálculo da la parte devuelta (base sin IVA e IVA); renta e ICA salen de la base y el
 *   reteIVA del IVA, cada uno con la tarifa con que se practicó.
 * - No se puede determinar: baja solo el dinero y queda un pendiente contable.
 * Con retenciones afectadas se exigen el cálculo, el certificado (expedido, anulado o corregido), la norma de ICA si
 * aplica, el período en que se descuentan y si la declaración requiere corrección. La base vuelve a calcularlo todo.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, CampoNumero, FilaDato, FormField, simboloMoneda } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  retencionesDelProcedimiento,
  type CausaDevolucion,
  type ProcedimientoDevolucion,
  type RetencionDelAnticipo,
} from '@/lib/finanzas/anticiposProveedor/contrato';

const NS = 'finanzasTercerosR4.anticipos';
type Modo = CausaDevolucion | 'sin_determinar';
const MODOS: readonly Modo[] = ['operacion_anulada', 'devolucion_parcial', 'sin_determinar'];
const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface SeccionRetencionesDevolucionProps {
  /** Retenciones del anticipo con base, tarifa y lo que sigue vigente. */
  retenciones: readonly RetencionDelAnticipo[];
  /** Saldo del anticipo (la anulación devuelve todo el saldo). */
  saldo: number;
  /** Dinero que escribió el usuario en el diálogo. */
  dinero: number | null;
  tocado: boolean;
  onCambio: (valor: Record<string, unknown> | null, valido: boolean, adicional: number) => void;
}

export function SeccionRetencionesDevolucion({ retenciones, saldo, dinero, tocado, onCambio }: SeccionRetencionesDevolucionProps) {
  const t = useTranslations(NS);
  const moneda = useMonedaOrganizacion();
  const idModo = useId();
  const idCorreccion = useId();
  const vigentes = useMemo(() => retenciones.filter((r) => r.vigente > 0), [retenciones]);
  const [modo, setModo] = useState<Modo | null>(null);
  const [baseDevuelta, setBaseDevuelta] = useState<number | null>(null);
  const [ivaDevuelto, setIvaDevuelto] = useState<number | null>(null);
  const [documento, setDocumento] = useState('');
  const [calculo, setCalculo] = useState('');
  const [certificado, setCertificado] = useState('');
  const [normaIca, setNormaIca] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [requiereCorreccion, setRequiereCorreccion] = useState(false);
  const avisar = useRef(onCambio);
  useEffect(() => {
    avisar.current = onCambio;
  });

  const causa = modo && modo !== 'sin_determinar' ? modo : null;
  const afectadas = useMemo(
    () => (causa ? retencionesDelProcedimiento(vigentes, { causa, base_devuelta: baseDevuelta, iva_devuelto: ivaDevuelto }) : []),
    [causa, vigentes, baseDevuelta, ivaDevuelto],
  );
  const totalRet = afectadas.reduce((s, a) => s + a.valor, 0);
  const conIca = afectadas.some((a) => a.clase === 'reteica');
  const dineroEsperado =
    causa === 'operacion_anulada' ? saldo - totalRet : causa === 'devolucion_parcial' ? (baseDevuelta ?? 0) + (ivaDevuelto ?? 0) - totalRet : null;

  const errores = {
    documento: !!causa && documento.trim().length < 3,
    base: causa === 'devolucion_parcial' && !(baseDevuelta && baseDevuelta > 0),
    excede: afectadas.some((a) => a.excede),
    soportes: totalRet > 0 && (calculo.trim().length < 3 || certificado.trim().length < 3),
    norma: conIca && normaIca.trim().length < 3,
    periodo: totalRet > 0 && !PERIODO.test(periodo),
    dinero: dineroEsperado !== null && dinero !== null && Math.abs(dinero - dineroEsperado) > 1,
  };
  const hayError = Object.values(errores).some(Boolean);

  useEffect(() => {
    if (vigentes.length === 0 && modo === null) {
      // Sin retenciones vigentes no hay nada que revertir: la devolución no las afecta.
      avisar.current(null, true, 0);
      return;
    }
    if (modo === null) {
      avisar.current(null, false, 0);
      return;
    }
    if (modo === 'sin_determinar') {
      avisar.current({ procedimiento: null }, true, 0);
      return;
    }
    const procedimiento: ProcedimientoDevolucion = {
      causa: modo,
      soportes: {
        documento: documento.trim(),
        calculo: calculo.trim() || null,
        certificado: certificado.trim() || null,
        norma_ica: conIca ? normaIca.trim() || null : null,
      },
      periodo_descuento: totalRet > 0 ? periodo : null,
      requiere_correccion: totalRet > 0 ? requiereCorreccion : null,
      base_devuelta: modo === 'devolucion_parcial' ? baseDevuelta : null,
      iva_devuelto: modo === 'devolucion_parcial' ? (ivaDevuelto ?? 0) : null,
    };
    avisar.current({ procedimiento }, !hayError, totalRet);
  }, [vigentes, modo, documento, calculo, certificado, normaIca, conIca, periodo, requiereCorreccion, baseDevuelta, ivaDevuelto, totalRet, hayError]);

  if (vigentes.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3 sm:p-4">
      <span id={idModo} className="text-sm font-medium text-fg">
        {t('devolver.procedimiento.titulo')} <span className="text-danger-text">*</span>
      </span>
      <p className="text-xs text-fg-muted">
        {t('devolver.retenciones.vigentes', {
          lista: vigentes.map((r) => `${t(`retenciones.clases.${r.clase}`)} ${moneda.formatear(r.vigente)}`).join(' · '),
        })}
      </p>
      <RadioGroup aria-labelledby={idModo} value={modo ?? ''} onValueChange={(v) => setModo(v as Modo)}>
        {MODOS.map((m) => (
          <OpcionModo key={m} valor={m} etiqueta={t(`devolver.procedimiento.causas.${m}.titulo`)} ayuda={t(`devolver.procedimiento.causas.${m}.ayuda`)} />
        ))}
      </RadioGroup>
      {tocado && modo === null && (
        <p role="alert" className="text-xs text-danger-text">
          {t('validacion.retencionesDevolucion')}
        </p>
      )}

      {causa && (
        <FormField etiqueta={t(`devolver.procedimiento.documento.${causa}`)} obligatorio error={tocado && errores.documento ? t('validacion.soporte') : null}>
          <Input value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={500} />
        </FormField>
      )}

      {causa === 'devolucion_parcial' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('devolver.procedimiento.baseDevuelta')} obligatorio error={tocado && errores.base ? t('validacion.componenteBase') : null}>
            {(c) => (
              <CampoNumero id={c.id} aria-describedby={c['aria-describedby']} aria-invalid={c['aria-invalid']} valor={baseDevuelta}
                onValorChange={setBaseDevuelta} minimo={0} prefijo={simboloMoneda(moneda.paraDocumento(null))} />
            )}
          </FormField>
          <FormField etiqueta={t('devolver.procedimiento.ivaDevuelto')}>
            {(c) => (
              <CampoNumero id={c.id} aria-describedby={c['aria-describedby']} valor={ivaDevuelto} onValorChange={setIvaDevuelto} minimo={0}
                prefijo={simboloMoneda(moneda.paraDocumento(null))} />
            )}
          </FormField>
        </div>
      )}

      {causa && afectadas.length > 0 && (
        <dl className="flex flex-col rounded-md border border-line p-2" aria-live="polite">
          {afectadas.map((a) => (
            <FilaDato key={a.clase} etiqueta={t(`retenciones.clases.${a.clase}`)} valor={moneda.formatear(a.valor)} tono={a.excede ? 'peligro' : undefined} />
          ))}
          <FilaDato etiqueta={t('devolver.procedimiento.totalRetenciones')} valor={moneda.formatear(totalRet)} tono="fuerte" />
          {dineroEsperado !== null && <FilaDato etiqueta={t('devolver.procedimiento.dineroEsperado')} valor={moneda.formatear(dineroEsperado)} />}
        </dl>
      )}
      {tocado && errores.excede && (
        <p role="alert" className="text-xs text-danger-text">
          {t('errores.retencion_devolucion_invalida')}
        </p>
      )}
      {tocado && errores.dinero && dineroEsperado !== null && (
        <p role="alert" className="text-xs text-danger-text">
          {t('validacion.dineroProcedimiento', { monto: moneda.formatear(dineroEsperado) })}
        </p>
      )}

      {causa && totalRet > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('devolver.procedimiento.calculo')} obligatorio error={tocado && errores.soportes && calculo.trim().length < 3 ? t('validacion.soporte') : null}>
            <Input value={calculo} onChange={(e) => setCalculo(e.target.value)} maxLength={500} />
          </FormField>
          <FormField etiqueta={t('devolver.procedimiento.certificado')} obligatorio error={tocado && errores.soportes && certificado.trim().length < 3 ? t('validacion.soporte') : null}>
            <Input value={certificado} onChange={(e) => setCertificado(e.target.value)} maxLength={500} />
          </FormField>
          {conIca && (
            <FormField etiqueta={t('devolver.retenciones.normaIca')} obligatorio error={tocado && errores.norma ? t('validacion.normaIca') : null}>
              <Input value={normaIca} onChange={(e) => setNormaIca(e.target.value)} maxLength={300} />
            </FormField>
          )}
          <FormField etiqueta={t('devolver.procedimiento.periodo')} obligatorio error={tocado && errores.periodo ? t('validacion.periodo') : null}>
            {(c) => <Input id={c.id} type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />}
          </FormField>
          <div className="flex items-start gap-2 sm:col-span-2">
            <Checkbox id={idCorreccion} checked={requiereCorreccion} onCheckedChange={(v) => setRequiereCorreccion(v === true)} className="mt-0.5" />
            <Label htmlFor={idCorreccion} className="flex flex-col gap-0.5 font-normal">
              <span className="text-sm text-fg">{t('devolver.procedimiento.requiereCorreccion')}</span>
              <span className="text-xs text-fg-muted">{t('devolver.procedimiento.requiereCorreccionAyuda')}</span>
            </Label>
          </div>
        </div>
      )}

      {modo === 'sin_determinar' && (
        <AvisoTonal tono="advertencia" titulo={t('devolver.retenciones.pendienteTitulo')} descripcion={t('devolver.retenciones.pendienteDescripcion')} />
      )}
    </div>
  );
}

function OpcionModo({ valor, etiqueta, ayuda }: { valor: Modo; etiqueta: string; ayuda: string }) {
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
