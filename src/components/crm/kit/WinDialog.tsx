'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, FileText, Info, Loader2, Trophy } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { FormField } from '@/components/kit/FormField';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { CLASE_AREA, CLASE_AVISO_INFO, CLASE_CAMPO, simboloMoneda, type OpcionUsuario } from './camposCrm';
import { SelectCrm } from './SelectCrm';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/kit/StatusBadge';
import {
  ACCIONES_GANAR,
  accionesEfectivas,
  accionesIniciales,
  alternarAccion,
  conteoResumen,
  cuerpoGanar,
  facturaCreada,
  validarGanar,
  valoresInicialesGanar,
  type DocumentoCreado,
  type PasoGanar,
  type PasoGanarVista,
  type ValoresGanar,
} from './winDialogLogica';

/**
 * Ganar oportunidad (Figma `WinDialog` 761:23994): ficha de venta → qué hacer
 * al ganar → resumen. Un solo camino desde lista, tablero, drawer y detalle.
 * `onGanar` recibe el cuerpo de `POST …/win` y devuelve los documentos
 * creados para el resumen; si falla, el diálogo no se cierra y conserva lo
 * escrito.
 *
 * Con `pasos` (Figma 1787:900392), el paso 2 muestra solo lo que piden las
 * líneas: cada paso dice qué hará y con qué RPC; «Emitir la factura ahora» es
 * un interruptor opcional. La oportunidad queda ganada aunque un paso falle.
 */
export interface WinDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  oportunidad: { name: string; amount: number | string | null; currency: string | null; win_data?: Record<string, unknown> | null; clienteNombre?: string | null };
  /** Moneda base de la organización (`useMonedaOrganizacion`). */
  monedaBase: ContextoMoneda;
  /** Monedas elegibles (código ISO); la base primero. */
  monedas?: readonly string[];
  /** Catálogo de motivos de ganancia de la organización. */
  motivos?: readonly { id: string; label: string }[];
  /** Comisión que registrará el sistema («Carlos Ruiz · 5 % · $ 625.000»), solo informativa. */
  comision?: { responsable: OpcionUsuario; porcentaje: number } | null;
  /** Etapa ganadora elegida al soltar la tarjeta; sin ella, la primera `is_won`. */
  stageId?: string;
  onGanar: (cuerpo: ReturnType<typeof cuerpoGanar>) => Promise<DocumentoCreado[]>;
  onVerFactura?: (doc: DocumentoCreado) => void;
  /** Pasos derivados de las líneas (sin ellos, la lista por defecto). */
  pasos?: readonly PasoGanarVista[] | null;
  /** «6 líneas · $ 6.197.520» para el subtítulo del paso 2. */
  resumenLineas?: string | null;
}

/** Sin líneas que derivar: la lista corta de siempre (sin la venta POS, que se retiró). */
const ACCIONES_POR_DEFECTO_VISIBLES = ACCIONES_GANAR.filter((a) => ['factura', 'onboarding', 'renovacion', 'referido', 'agradecimiento'].includes(a));

export function WinDialog({ abierto, onAbiertoChange, oportunidad, monedaBase, monedas, motivos = [], comision, stageId, onGanar, onVerFactura, pasos, resumenLineas }: WinDialogProps) {
  const t = useTranslations('crm.kit.ganar');
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const [paso, setPaso] = useState<PasoGanar>('ficha');
  const [v, setV] = useState<ValoresGanar>(() => valoresInicialesGanar(oportunidad, monedaBase.code, hoy));
  const [intentado, setIntentado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentoCreado[]>([]);

  useEffect(() => {
    if (!abierto) return;
    setPaso('ficha'); setV(valoresInicialesGanar(oportunidad, monedaBase.code, hoy, accionesIniciales(pasos))); setIntentado(false); setError(null); setDocs([]);
    // Solo al abrir: la oportunidad puede cambiar de identidad por cada render de la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);
  // Los pasos derivados llegan cuando se leen las líneas: se marcan los suyos.
  const clavePasos = (pasos ?? []).map((p) => p.accion).join(',');
  useEffect(() => {
    if (abierto && pasos && pasos.length) setV((x) => ({ ...x, acciones: accionesIniciales(pasos) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clavePasos]);
  const efectivas = accionesEfectivas(v.acciones, pasos);

  const errores = validarGanar(v, hoy);
  const err = (k: keyof typeof errores) => (intentado && errores[k] ? t(`error.${errores[k]}`) : null);
  const cambiar = (p: Partial<ValoresGanar>) => setV((x) => ({ ...x, ...p }));
  const listaMonedas = Array.from(new Set([monedaBase.code, ...(monedas ?? []), v.moneda]));
  const montoComision = comision ? ((Number(oportunidad.amount) || 0) * comision.porcentaje) / 100 : null;

  const siguiente = () => {
    setIntentado(true);
    if (!Object.keys(errores).length) setPaso('acciones');
  };
  const ganar = async () => {
    setOcupado(true);
    setError(null);
    try {
      setDocs(await onGanar(cuerpoGanar({ ...v, acciones: efectivas }, oportunidad.win_data, stageId)));
      setPaso('resumen');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('errorGanar'));
    } finally {
      setOcupado(false);
    }
  };

  const factura = facturaCreada(docs);
  const conteo = conteoResumen(docs);
  const titulo = paso === 'resumen' ? t('ganada') : t('titulo', { nombre: oportunidad.name });
  const descripcion =
    paso === 'resumen'
      ? [oportunidad.clienteNombre, formatMoneda(oportunidad.amount, monedaBase)].filter(Boolean).join(' · ')
      : paso === 'acciones' && pasos && pasos.length && resumenLineas
        ? t('paso2Lineas', { resumen: resumenLineas })
        : t(paso === 'ficha' ? 'paso1' : 'paso2');

  const pie =
    paso === 'ficha' ? (
      <>
        <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'secundario' })}>{t('cancelar')}</button>
        <button type="button" onClick={siguiente} className={clasesBoton()}>{t('siguiente')}</button>
      </>
    ) : paso === 'acciones' ? (
      <>
        <button type="button" onClick={() => setPaso('ficha')} disabled={ocupado} className={clasesBoton({ variante: 'fantasma' })}>{t('atras')}</button>
        <button type="button" onClick={ganar} disabled={ocupado} aria-busy={ocupado || undefined} className={clasesBoton()}>
          {ocupado ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Trophy aria-hidden="true" className="size-4" strokeWidth={1.5} />}
          {pasos && pasos.length ? t('ganarYEjecutar', { n: efectivas.length }) : t('ganarOportunidad')}
        </button>
      </>
    ) : (
      <>
        {factura && onVerFactura && <button type="button" onClick={() => onVerFactura(factura)} className={clasesBoton({ variante: 'secundario' })}>{t('verFactura')}</button>}
        <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton()}>{t('cerrar')}</button>
      </>
    );

  return (
    <PanelAdaptable abierto={abierto} onAbiertoChange={onAbiertoChange} titulo={titulo} descripcion={descripcion} icono={Trophy} ancho={520} ocupado={ocupado} pie={pie}>
      {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
      {paso === 'ficha' && (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <FormField etiqueta={t('monto')} obligatorio error={err('monto')}>
              <input inputMode="decimal" value={v.monto} onChange={(e) => cambiar({ monto: e.target.value })} placeholder={`${simboloMoneda(monedaBase)} 0`} className={CLASE_CAMPO} />
            </FormField>
            <FormField etiqueta={t('moneda')}>
              <SelectCrm
                valor={v.moneda}
                onValorChange={(moneda) => cambiar({ moneda })}
                opciones={listaMonedas.map((m) => ({ valor: m, etiqueta: m === monedaBase.code ? t('monedaBase', { moneda: m }) : m }))}
                className="sm:min-w-[160px]"
              />
            </FormField>
          </div>
          <FormField etiqueta={t('fechaCierre')} obligatorio error={err('fechaCierre')}>
            <CampoFecha valor={v.fechaCierre} max={hoy} hoy={hoy} onValorChange={(fechaCierre) => cambiar({ fechaCierre })} />
          </FormField>
          {motivos.length > 0 && (
            <FormField etiqueta={t('motivo')}>
              <SelectCrm valor={v.motivoId} onValorChange={(motivoId) => cambiar({ motivoId })} opcionVacia={t('elegir')} opciones={motivos.map((m) => ({ valor: m.id, etiqueta: m.label }))} />
            </FormField>
          )}
          {comision && (
            <FormField etiqueta={t('comision')} ayuda={t('comisionAyuda')}>
              <input readOnly disabled value={`${comision.responsable.nombre} · ${comision.porcentaje} % · ${formatMoneda(montoComision, monedaBase)}`} className={CLASE_CAMPO} />
            </FormField>
          )}
          <FormField etiqueta={t('notas')}>
            <textarea value={v.notas} onChange={(e) => cambiar({ notas: e.target.value })} className={CLASE_AREA} />
          </FormField>
        </>
      )}
      {paso === 'acciones' && pasos && pasos.length > 0 && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t('paso2')}</legend>
            {pasos.map((p) => {
              const elegido = efectivas.includes(p.accion);
              const bloqueado = !!p.requiere && !v.acciones.includes(p.requiere);
              const alternar = () => cambiar({ acciones: alternarAccion(v.acciones, p.accion) });
              return p.interruptor ? (
                <div key={p.accion} className={cn('flex items-start gap-3 rounded-lg bg-subtle px-4 py-3', bloqueado && 'opacity-60')}>
                  <Switch checked={elegido} disabled={bloqueado} onCheckedChange={alternar} aria-label={p.titulo} className="mt-0.5" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium text-fg">{p.titulo}</span>
                    <span className="text-[13px] text-fg-secondary">{p.detalle}</span>
                    {p.tecnico && <span className="text-xs text-fg-muted">{p.tecnico}</span>}
                  </div>
                </div>
              ) : (
                <label key={p.accion} className={cn('flex items-start gap-3 rounded-lg border border-line px-4 py-3', bloqueado ? 'opacity-60' : 'cursor-pointer hover:bg-hover')}>
                  <input type="checkbox" checked={elegido} disabled={bloqueado} onChange={alternar} className="mt-1 size-4 rounded border-line-strong accent-brand-action" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium text-fg">{p.titulo}</span>
                    <span className="text-[13px] text-fg-secondary">{p.detalle}</span>
                    {p.tecnico && <span className="text-xs text-fg-muted">{p.tecnico}</span>}
                  </span>
                  <StatusBadge estado={elegido ? 'sehara' : 'omitido'} etiqueta={elegido ? t('seHara') : t('omitido')} tono="neutro" tamano="sm" />
                </label>
              );
            })}
          </fieldset>
          <p className={CLASE_AVISO_INFO}>
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            {t('comisionSistema')}
          </p>
        </>
      )}
      {paso === 'acciones' && !(pasos && pasos.length > 0) && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t('paso2')}</legend>
            {ACCIONES_POR_DEFECTO_VISIBLES.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm text-fg">
                <input type="checkbox" checked={v.acciones.includes(a)} onChange={() => cambiar({ acciones: alternarAccion(v.acciones, a) })} className="size-4 rounded border-line-strong accent-brand-action" />
                {t(`acciones.${a}`)}
              </label>
            ))}
          </fieldset>
          <p className={CLASE_AVISO_INFO}>
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            {t('comisionSistema')}
          </p>
        </>
      )}
      {paso === 'resumen' && (
        <>
          <p role="status" className="flex items-start gap-2 rounded-lg bg-success-subtle px-3 py-2 text-[13px] text-success-text">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            {t('resumen', { n: conteo.creados })}
          </p>
          {conteo.fallidos > 0 && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              {t('pasosFallidos', { n: conteo.fallidos })}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {docs.map((d) => (
              <li
                key={`${d.tipo}-${d.numero}`}
                className={cn(
                  'inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-[13px]',
                  d.estado === 'error' ? 'bg-danger-subtle text-danger-text' : d.estado === 'omitido' ? 'bg-subtle text-fg-muted' : 'bg-brand-tint text-brand-deep',
                )}
              >
                {d.estado === 'error' ? <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" /> : <FileText aria-hidden="true" className="size-3.5 shrink-0" />}
                {d.href ? <a href={d.href} className="hover:underline">{d.numero}</a> : d.numero}
              </li>
            ))}
          </ul>
        </>
      )}
    </PanelAdaptable>
  );
}
