'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, FileText, Info, Loader2, Trophy } from 'lucide-react';
import { FormField } from '@/components/kit/FormField';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { CLASE_AREA, CLASE_AVISO_INFO, CLASE_CAMPO, simboloMoneda, type OpcionUsuario } from './camposCrm';
import {
  ACCIONES_GANAR,
  alternarAccion,
  cuerpoGanar,
  facturaCreada,
  validarGanar,
  valoresInicialesGanar,
  type DocumentoCreado,
  type PasoGanar,
  type ValoresGanar,
} from './winDialogLogica';

/**
 * Ganar oportunidad (Figma `WinDialog` 761:23994): ficha de venta → qué hacer
 * al ganar → resumen. Un solo camino desde lista, tablero, drawer y detalle.
 * `onGanar` recibe el cuerpo de `POST …/win` y devuelve los documentos
 * creados para el resumen; si falla, el diálogo no se cierra y conserva lo
 * escrito.
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
}

export function WinDialog({ abierto, onAbiertoChange, oportunidad, monedaBase, monedas, motivos = [], comision, stageId, onGanar, onVerFactura }: WinDialogProps) {
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
    setPaso('ficha'); setV(valoresInicialesGanar(oportunidad, monedaBase.code, hoy)); setIntentado(false); setError(null); setDocs([]);
    // Solo al abrir: la oportunidad puede cambiar de identidad por cada render de la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

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
      setDocs(await onGanar(cuerpoGanar(v, oportunidad.win_data, stageId)));
      setPaso('resumen');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('errorGanar'));
    } finally {
      setOcupado(false);
    }
  };

  const factura = facturaCreada(docs);
  const titulo = paso === 'resumen' ? t('ganada') : t('titulo', { nombre: oportunidad.name });
  const descripcion =
    paso === 'resumen'
      ? [oportunidad.clienteNombre, formatMoneda(oportunidad.amount, monedaBase)].filter(Boolean).join(' · ')
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
          {t('ganarOportunidad')}
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
              <select value={v.moneda} onChange={(e) => cambiar({ moneda: e.target.value })} className={CLASE_CAMPO}>
                {listaMonedas.map((m) => <option key={m} value={m}>{m === monedaBase.code ? t('monedaBase', { moneda: m }) : m}</option>)}
              </select>
            </FormField>
          </div>
          <FormField etiqueta={t('fechaCierre')} obligatorio error={err('fechaCierre')}>
            <input type="date" value={v.fechaCierre} max={hoy} onChange={(e) => cambiar({ fechaCierre: e.target.value })} className={CLASE_CAMPO} />
          </FormField>
          {motivos.length > 0 && (
            <FormField etiqueta={t('motivo')}>
              <select value={v.motivoId} onChange={(e) => cambiar({ motivoId: e.target.value })} className={CLASE_CAMPO}>
                <option value="">{t('elegir')}</option>
                {motivos.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
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
      {paso === 'acciones' && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t('paso2')}</legend>
            {ACCIONES_GANAR.map((a) => (
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
            {t('resumen', { n: docs.length })}
          </p>
          <ul className="flex flex-col gap-2">
            {docs.map((d) => (
              <li key={`${d.tipo}-${d.numero}`} className="inline-flex items-center gap-1.5 self-start rounded-full bg-brand-tint px-3 py-1 text-[13px] text-brand-deep">
                <FileText aria-hidden="true" className="size-3.5" />
                {d.href ? <a href={d.href} className="hover:underline">{d.numero}</a> : d.numero}
              </li>
            ))}
          </ul>
        </>
      )}
    </PanelAdaptable>
  );
}
