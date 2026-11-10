'use client';

/**
 * Procedimiento de la devolución de un anticipo (rondas 3 y 4 del Contador). Es el `complemento` del diálogo
 * compartido `DevolverSaldoDialog`, solo en la variante del proveedor.
 *
 * Se elige la CAUSA y se documenta el HECHO (la solicitud del proveedor sola no prueba la anulación ni la resolución);
 * las retenciones afectadas salen del procedimiento, nunca se eligen a mano:
 * - Operación anulada: se revierten todas las retenciones vigentes; se devuelve todo el saldo.
 * - Resolución parcial o devolución parcial: por las LÍNEAS afectadas de la operación; cada retención se revierte sobre
 *   lo que ella cubrió (la vista previa aproxima; la base calcula línea por línea).
 * - No se puede determinar: baja solo el dinero y queda un pendiente contable.
 * El período de descuento NO se elige (lo fija la regla de cada impuesto); con reteICA se exigen las pruebas del
 * procedimiento validado del municipio.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, CampoNumero, FilaDato, FormField, simboloMoneda } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  ivaDeLaParte,
  retencionesDelProcedimiento,
  TIPOS_HECHO_DEVOLUCION,
  type CausaDevolucion,
  type ComponenteAnticipo,
  type ProcedimientoDevolucion,
  type RetencionDelAnticipo,
  type TipoHechoDevolucion,
} from '@/lib/finanzas/anticiposProveedor/contrato';
import { CamposPruebasIca } from './CamposPruebasIca';

const NS = 'finanzasTercerosR4.anticipos';
/** Ronda 5 del Contador: período de descuento y saldo por impuesto (renta 1.2.4.8; reteIVA 1.3.2.3.1; ReteICA sin límite). */
const NS_R5 = 'finanzasTercerosR5.anticipos';
type Modo = CausaDevolucion | 'sin_determinar';
const MODOS: readonly Modo[] = ['operacion_anulada', 'resolucion_parcial', 'devolucion_parcial', 'sin_determinar'];

export interface SeccionRetencionesDevolucionProps {
  /** Retenciones del anticipo con base, tarifa y lo que sigue vigente. */
  retenciones: readonly RetencionDelAnticipo[];
  /** Líneas de la operación (giro y conversiones) y lo ya devuelto de cada una. */
  componentes?: readonly ComponenteAnticipo[];
  /** Pruebas del procedimiento de ReteICA validado del municipio; `null` = sin procedimiento validado. */
  pruebasIca?: readonly string[] | null;
  /** Saldo del anticipo (la anulación devuelve todo el saldo). */
  saldo: number;
  /** Dinero que escribió el usuario en el diálogo. */
  dinero: number | null;
  tocado: boolean;
  onCambio: (valor: Record<string, unknown> | null, valido: boolean, adicional: number) => void;
}

export function SeccionRetencionesDevolucion({ retenciones, componentes = [], pruebasIca = null, saldo, dinero, tocado, onCambio }: SeccionRetencionesDevolucionProps) {
  const t = useTranslations(NS);
  const tR5 = useTranslations(NS_R5);
  const moneda = useMonedaOrganizacion();
  const idModo = useId();
  const idCorreccion = useId();
  const vigentes = useMemo(() => retenciones.filter((r) => r.vigente > 0), [retenciones]);
  const [modo, setModo] = useState<Modo | null>(null);
  const [tipoHecho, setTipoHecho] = useState<TipoHechoDevolucion | ''>('');
  const [documento, setDocumento] = useState('');
  const [fechaHecho, setFechaHecho] = useState('');
  const [basesLinea, setBasesLinea] = useState<Record<string, number | null>>({});
  const [calculo, setCalculo] = useState('');
  const [certificado, setCertificado] = useState('');
  const [ica, setIca] = useState<Record<string, string>>({});
  const [requiereCorreccion, setRequiereCorreccion] = useState(false);
  const avisar = useRef(onCambio);
  useEffect(() => {
    avisar.current = onCambio;
  });

  const causa = modo && modo !== 'sin_determinar' ? modo : null;
  const parcial = causa === 'resolucion_parcial' || causa === 'devolucion_parcial';
  const lineas = useMemo(
    () =>
      componentes
        .map((c) => ({ c, base: basesLinea[c.clave] ?? 0 }))
        .filter((x) => x.base > 0)
        .map((x) => ({ componente: x.c.clave, base: x.base, iva: ivaDeLaParte(x.c, x.base), pendiente: x.c.base - x.c.devueltoBase })),
    [componentes, basesLinea],
  );
  const afectadas = useMemo(() => (causa ? retencionesDelProcedimiento(vigentes, { causa, lineas: parcial ? lineas : null }) : []), [causa, parcial, vigentes, lineas]);
  const totalRet = afectadas.reduce((s, a) => s + a.valor, 0);
  const conIca = afectadas.some((a) => a.clase === 'reteica');
  const camposIca = useMemo(() => ['solicitud', 'certificado', ...(pruebasIca ?? [])], [pruebasIca]);
  const parte = lineas.reduce((s, l) => s + l.base + l.iva, 0);
  const dineroEsperado = causa === 'operacion_anulada' ? saldo - totalRet : parcial ? parte - totalRet : null;

  const errores = {
    hecho: !!causa && (!tipoHecho || documento.trim().length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(fechaHecho)),
    lineas: parcial && lineas.length === 0,
    lineaExcede: parcial && lineas.some((l) => l.base > l.pendiente + 0.005),
    excede: afectadas.some((a) => a.excede),
    soportes: totalRet > 0 && (calculo.trim().length < 3 || certificado.trim().length < 3),
    ica: conIca && (!pruebasIca || camposIca.some((k) => (ica[k] ?? '').trim().length < 3)),
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
      hecho: { tipo: (tipoHecho || 'acta_devolucion') as TipoHechoDevolucion, documento: documento.trim(), fecha: fechaHecho },
      lineas: parcial ? lineas.map(({ componente, base, iva }) => ({ componente, base, iva })) : null,
      soportes: {
        calculo: calculo.trim() || null,
        certificado: certificado.trim() || null,
        ica: conIca ? Object.fromEntries(camposIca.map((k) => [k, (ica[k] ?? '').trim()])) : null,
      },
      requiere_correccion: totalRet > 0 ? requiereCorreccion : null,
    };
    avisar.current({ procedimiento }, !hayError, totalRet);
  }, [vigentes, modo, parcial, tipoHecho, documento, fechaHecho, lineas, calculo, certificado, ica, conIca, camposIca, requiereCorreccion, totalRet, hayError]);

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField etiqueta={t('devolver.procedimiento.hecho.tipo')} obligatorio error={tocado && errores.hecho && !tipoHecho ? t('validacion.hecho') : null}>
            {(c) => (
              <Select value={tipoHecho} onValueChange={(v) => setTipoHecho(v as TipoHechoDevolucion)}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('devolver.procedimiento.hecho.tipoPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_HECHO_DEVOLUCION.map((h) => (
                    <SelectItem key={h} value={h}>
                      {t(`devolver.procedimiento.hecho.tipos.${h}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('devolver.procedimiento.hecho.documento')} obligatorio error={tocado && errores.hecho && documento.trim().length < 3 ? t('validacion.soporte') : null}>
            <Input value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={500} />
          </FormField>
          <FormField etiqueta={t('devolver.procedimiento.hecho.fecha')} obligatorio error={tocado && errores.hecho && !fechaHecho ? t('validacion.hecho') : null}>
            {(c) => <Input id={c.id} type="date" value={fechaHecho} onChange={(e) => setFechaHecho(e.target.value)} />}
          </FormField>
          <p className="text-xs text-fg-muted sm:col-span-3">{t('devolver.procedimiento.hecho.ayuda')}</p>
        </div>
      )}

      {parcial && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-fg">{t('devolver.procedimiento.lineas.titulo')}</legend>
          {componentes.length === 0 ? (
            <AvisoTonal tono="advertencia" titulo={t('devolver.procedimiento.lineas.sinLineas')} descripcion={t('devolver.procedimiento.lineas.sinLineasAyuda')} />
          ) : (
            componentes.map((c) => {
              const pendiente = c.base - c.devueltoBase;
              const valor = basesLinea[c.clave] ?? null;
              return (
                <FormField
                  key={c.clave}
                  etiqueta={t('devolver.procedimiento.lineas.linea', { descripcion: c.descripcion, pendiente: moneda.formatear(pendiente) })}
                  error={tocado && valor !== null && valor > pendiente + 0.005 ? t('errores.linea_excede_lo_pendiente') : null}
                >
                  {(f) => (
                    <CampoNumero id={f.id} aria-describedby={f['aria-describedby']} aria-invalid={f['aria-invalid']} valor={valor}
                      onValorChange={(v) => setBasesLinea((b) => ({ ...b, [c.clave]: v }))} minimo={0} prefijo={simboloMoneda(moneda.paraDocumento(null))} />
                  )}
                </FormField>
              );
            })
          )}
          {tocado && errores.lineas && (
            <p role="alert" className="text-xs text-danger-text">
              {t('errores.lineas_afectadas_obligatorias')}
            </p>
          )}
        </fieldset>
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
            <div className="sm:col-span-2">
              <CamposPruebasIca pruebas={pruebasIca} valores={ica} onCambio={setIca} tocado={tocado} />
            </div>
          )}
          <p className="text-xs text-fg-muted sm:col-span-2">{tR5('devolver.periodoRegla')}</p>
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
