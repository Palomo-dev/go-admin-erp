'use client';

/**
 * Naturaleza y retenciones de un anticipo a proveedor (P1 y ronda 2 del
 * Contador). Es el `complemento` del diálogo compartido `RegistrarAnticipoDialog`:
 * solo existe en la variante del proveedor.
 *
 * - Naturaleza OBLIGATORIA y sin valor por defecto: «anticipo de financiación»
 *   (la retención se evalúa cuando se convierte en pago o abono del precio: queda
 *   «diferida») o «pago anticipado del precio» (se evalúa al girar).
 * - Composición de la operación (ronda 2, ítem 3): una suma homogénea con IVA
 *   incluido solo a la tarifa general (19 %), o componentes por línea y tarifa
 *   (gravado, exento, excluido, no sujeto, AIU). La base del reteIVA es el IVA de
 *   los gravados (en el AIU, el de la utilidad).
 * - ReteICA (ítem 4): regla municipal registrada (municipio, actividad, tarifa por
 *   mil, norma) y territorialidad confirmada; si falta, queda «pendiente».
 * - La evaluación la hace la base (`POST /api/anticipos-proveedor/retenciones`)
 *   con el perfil vigente y las calidades VERIFICADAS del proveedor (SIMPLE
 *   acreditado, autorretenedor con sus conceptos). Lo que falte queda «pendiente»
 *   y se ve; nunca se asume 0.
 *
 * El diálogo recibe `{ naturaleza, tarifaIva, componentes, retefuenteId,
 * reteicaId, icaTerritorial }` y si está completo; los valores los vuelve a
 * calcular la base al registrar.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { AvisoTonal, CampoNumero, FilaDato, FormField, SegmentedControl, StatusBadge, clasesBoton, simboloMoneda } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  NATURALEZAS_ANTICIPO,
  TARIFA_IVA_GENERAL,
  TRATAMIENTOS_COMPONENTE,
  TRATAMIENTOS_CON_IVA,
  totalComponentes,
  type ComponenteOperacion,
  type EstadoRetencionAnticipo,
  type EvaluacionRetenciones,
  type NaturalezaAnticipo,
  type TratamientoComponente,
} from '@/lib/finanzas/anticiposProveedor/contrato';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { anticiposProveedorService } from './anticiposProveedorService';

const NS = 'finanzasTercerosR4.anticipos';
/** Ronda 6 del Contador: motivos nuevos del AIU (anticipo sin costo directo, contrato cerrado). */
const NS_R6 = 'finanzasTercerosR6.anticipos';
/** Tarifas del IVA para un componente gravado; la base las valida contra los impuestos de la organización. */
const TARIFAS_COMPONENTE = [19, 5] as const;
const SIN_ELEGIR = '__sin__';
const BADGE: Readonly<Record<EstadoRetencionAnticipo, string>> = { practicar: 'activo', no_aplica: 'inactivo', pendiente: 'pendiente', diferida: 'borrador' };
type Composicion = 'homogenea' | 'componentes';

interface FilaComponente {
  clave: number;
  tratamiento: TratamientoComponente;
  descripcion: string;
  base: number | null;
  tarifaIva: number | null;
}

export interface SeccionRetencionesAnticipoProps {
  proveedorId: string | null;
  monto: number | null;
  /** El usuario intentó registrar: se muestran los errores. */
  tocado: boolean;
  onCambio: (valor: Record<string, unknown> | null, valido: boolean) => void;
}

const llevaIva = (t: TratamientoComponente) => TRATAMIENTOS_CON_IVA.includes(t);

export function SeccionRetencionesAnticipo({ proveedorId, monto, tocado, onCambio }: SeccionRetencionesAnticipoProps) {
  const t = useTranslations(NS);
  const tR6 = useTranslations(NS_R6);
  const moneda = useMonedaOrganizacion();
  const idNaturaleza = useId();
  const idTerritorial = useId();
  const [naturaleza, setNaturaleza] = useState<NaturalezaAnticipo | null>(null);
  const [composicion, setComposicion] = useState<Composicion>('homogenea');
  const [filas, setFilas] = useState<FilaComponente[]>([]);
  const siguiente = useRef(1);
  const [retefuenteId, setRetefuenteId] = useState<string | null>(null);
  const [reteicaId, setReteicaId] = useState<string | null>(null);
  const [icaTerritorial, setIcaTerritorial] = useState(false);
  const [evaluacion, setEvaluacion] = useState<EvaluacionRetenciones | null>(null);
  const [evaluando, setEvaluando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avisar = useRef(onCambio);
  useEffect(() => {
    avisar.current = onCambio;
  });

  const esPrecio = naturaleza === 'pago_anticipado_precio';
  const porComponentes = esPrecio && composicion === 'componentes';

  // Componentes completos (base > 0; tarifa en los que llevan IVA) y que cuadren con el monto (±1).
  const componentes: ComponenteOperacion[] | null = useMemo(() => {
    if (!porComponentes || filas.length === 0) return null;
    if (filas.some((f) => f.base === null || f.base <= 0 || (llevaIva(f.tratamiento) && f.tarifaIva === null))) return null;
    return filas.map((f) => ({
      tratamiento: f.tratamiento,
      descripcion: f.descripcion.trim() || null,
      base: f.base as number,
      tarifa_iva: llevaIva(f.tratamiento) ? f.tarifaIva : 0,
    }));
  }, [porComponentes, filas]);
  const sumaComponentes = componentes ? totalComponentes(componentes) : null;
  const componentesCuadran = sumaComponentes !== null && monto !== null && Math.abs(sumaComponentes - monto) <= 1;
  const composicionLista = !esPrecio || composicion === 'homogenea' || componentesCuadran;

  const listoParaEvaluar = !!proveedorId && monto !== null && monto > 0 && naturaleza !== null && composicionLista;
  const tarifaIva = esPrecio && composicion === 'homogenea' ? TARIFA_IVA_GENERAL : null;

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
        .evaluarRetenciones({
          proveedorId,
          monto,
          naturaleza,
          tarifaIva,
          componentes: porComponentes ? componentes : null,
          retefuenteId: esPrecio ? retefuenteId : null,
          reteicaId: esPrecio ? reteicaId : null,
          icaTerritorial: esPrecio && reteicaId ? icaTerritorial : null,
        })
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
  }, [listoParaEvaluar, proveedorId, monto, naturaleza, tarifaIva, porComponentes, componentes, esPrecio, retefuenteId, reteicaId, icaTerritorial, t]);

  const faltaConcepto = !!evaluacion?.clases.some((c) => c.motivo === 'concepto_sin_elegir');
  const valido = naturaleza !== null && composicionLista && !!evaluacion && !faltaConcepto && !error && !evaluando;

  useEffect(() => {
    avisar.current(
      naturaleza
        ? {
            naturaleza,
            tarifaIva,
            componentes: porComponentes ? componentes : null,
            retefuenteId: esPrecio ? retefuenteId : null,
            reteicaId: esPrecio ? reteicaId : null,
            icaTerritorial: esPrecio && reteicaId ? icaTerritorial : null,
          }
        : null,
      valido,
    );
  }, [naturaleza, tarifaIva, porComponentes, componentes, esPrecio, retefuenteId, reteicaId, icaTerritorial, valido]);

  const opcionesFuente = evaluacion?.opciones.retefuente ?? [];
  const opcionesIca = evaluacion?.opciones.reteica ?? [];
  const pendientes = useMemo(() => (evaluacion?.clases ?? []).filter((c) => c.estado === 'pendiente'), [evaluacion]);
  const diferidas = !!evaluacion?.clases.some((c) => c.estado === 'diferida');

  const motivoTexto = (motivo: string | null) => {
    if (!motivo) return null;
    const clave = `retenciones.motivos.${motivo}`;
    if (t.has(clave)) return t(clave);
    return tR6.has(clave) ? tR6(clave) : motivo;
  };

  const agregarFila = () => {
    const clave = siguiente.current++;
    setFilas((fs) => [...fs, { clave, tratamiento: 'gravado', descripcion: '', base: null, tarifaIva: TARIFA_IVA_GENERAL }]);
  };
  const cambiarFila = (clave: number, cambio: Partial<FilaComponente>) =>
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));
  const quitarFila = (clave: number) => setFilas((fs) => fs.filter((f) => f.clave !== clave));

  const elegirComposicion = (c: Composicion) => {
    setComposicion(c);
    if (c === 'componentes' && filas.length === 0) agregarFila();
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
              setRetefuenteId(null);
              setReteicaId(null);
              setIcaTerritorial(false);
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
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg">{t('retenciones.composicion.titulo')}</span>
          <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            <SegmentedControl<Composicion>
              etiqueta={t('retenciones.composicion.titulo')}
              valor={composicion}
              onValorChange={elegirComposicion}
              className="w-max"
              opciones={[
                { valor: 'homogenea', etiqueta: t('retenciones.composicion.homogenea') },
                { valor: 'componentes', etiqueta: t('retenciones.composicion.componentes') },
              ]}
            />
          </div>
          <p className="text-xs text-fg-muted">
            {composicion === 'homogenea'
              ? t('retenciones.composicion.homogeneaAyuda', { tarifa: TARIFA_IVA_GENERAL })
              : t('retenciones.composicion.componentesAyuda')}
          </p>

          {composicion === 'componentes' && (
            <div className="flex flex-col gap-3">
              {filas.map((f, i) => (
                <fieldset key={f.clave} className="flex flex-col gap-3 rounded-md border border-line p-3">
                  <legend className="px-1 text-xs font-medium text-fg-secondary">{t('retenciones.composicion.linea', { n: i + 1 })}</legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormField etiqueta={t('retenciones.composicion.tratamiento')} obligatorio>
                      {(c) => (
                        <Select
                          value={f.tratamiento}
                          onValueChange={(v) => {
                            const tr = v as TratamientoComponente;
                            cambiarFila(f.clave, { tratamiento: tr, tarifaIva: llevaIva(tr) ? (f.tarifaIva ?? TARIFA_IVA_GENERAL) : null });
                          }}
                        >
                          <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TRATAMIENTOS_COMPONENTE.map((tr) => (
                              <SelectItem key={tr} value={tr}>
                                {t(`retenciones.composicion.tratamientos.${tr}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </FormField>
                    <FormField
                      etiqueta={t('retenciones.composicion.base')}
                      obligatorio
                      error={tocado && (f.base === null || f.base <= 0) ? t('validacion.componenteBase') : null}
                    >
                      {(c) => (
                        <CampoNumero
                          id={c.id}
                          aria-describedby={c['aria-describedby']}
                          aria-invalid={c['aria-invalid']}
                          valor={f.base}
                          onValorChange={(v) => cambiarFila(f.clave, { base: v })}
                          minimo={0}
                          prefijo={simboloMoneda(moneda.paraDocumento(null))}
                        />
                      )}
                    </FormField>
                    {llevaIva(f.tratamiento) && (
                      <FormField etiqueta={t('retenciones.tarifaIva')} obligatorio>
                        {(c) => (
                          <Select value={f.tarifaIva === null ? '' : String(f.tarifaIva)} onValueChange={(v) => cambiarFila(f.clave, { tarifaIva: Number(v) })}>
                            <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                              <SelectValue placeholder={t('retenciones.tarifaIvaPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                              {TARIFAS_COMPONENTE.map((tarifa) => (
                                <SelectItem key={tarifa} value={String(tarifa)}>
                                  {t('retenciones.tarifa', { tarifa })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </FormField>
                    )}
                    <FormField etiqueta={t('retenciones.composicion.descripcion')}>
                      <Input value={f.descripcion} onChange={(e) => cambiarFila(f.clave, { descripcion: e.target.value })} maxLength={200} />
                    </FormField>
                  </div>
                  {filas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => quitarFila(f.clave)}
                      className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                      aria-label={t('retenciones.composicion.quitar', { n: i + 1 })}
                    >
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('retenciones.composicion.quitarCorto')}
                    </button>
                  )}
                </fieldset>
              ))}
              <button type="button" onClick={agregarFila} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} disabled={filas.length >= 50}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('retenciones.composicion.agregar')}
              </button>
              {sumaComponentes !== null && monto !== null && (
                <FilaDato
                  etiqueta={t('retenciones.composicion.suma')}
                  valor={moneda.formatear(sumaComponentes)}
                  tono={componentesCuadran ? undefined : 'peligro'}
                />
              )}
              {tocado && !componentesCuadran && (
                <p role="alert" className="text-xs text-danger-text">
                  {t('validacion.componentesNoSuman', { monto: moneda.formatear(monto ?? 0) })}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <FormField etiqueta={t('retenciones.conceptoIca')} ayuda={opcionesIca.length > 0 ? t('retenciones.conceptoIcaAyuda') : t('retenciones.sinReglasIca')}>
              {(c) => (
                <Select value={reteicaId ?? SIN_ELEGIR} onValueChange={(v) => setReteicaId(v === SIN_ELEGIR ? null : v)} disabled={opcionesIca.length === 0}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_ELEGIR}>{t('retenciones.icaSinConfirmar')}</SelectItem>
                    {opcionesIca.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {t('retenciones.reglaIca', { nombre: o.nombre, tarifa: o.tarifaPorMil ?? o.tarifa * 10 })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </div>
          {reteicaId && (
            <div className="flex items-start gap-2">
              <Checkbox id={idTerritorial} checked={icaTerritorial} onCheckedChange={(v) => setIcaTerritorial(v === true)} className="mt-0.5" />
              <Label htmlFor={idTerritorial} className="flex flex-col gap-0.5 font-normal">
                <span className="text-sm text-fg">{t('retenciones.territorial')}</span>
                <span className="text-xs text-fg-muted">{t('retenciones.territorialAyuda')}</span>
              </Label>
            </div>
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
          {diferidas && <p className="text-xs text-fg-muted">{t('retenciones.diferidaAyuda')}</p>}
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
