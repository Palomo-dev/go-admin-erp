'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowRight, Loader2, Lock, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/kit/FormField';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { CLASE_CAMPO } from './camposCrm';
import { aFechaHoraLocal, deFechaHoraLocal } from './fechasCrm';
import { aQuienPedir, destinosPosibles, resultadoMover, type EtapaDestino, type RequisitoPendiente } from './moveStageDialogLogica';

/**
 * Mover de etapa (Figma `MoveStageDialog` 761:24498): desde el menú «⋯», la
 * selección masiva y el teclado. `confirmar` pide la etapa y el próximo
 * contacto; `gate` lista los requisitos pendientes con «Completar» y
 * «Avanzar de todos modos» (solo con el permiso de omitir requisitos, y queda
 * en el historial); `sinPermiso` explica quién puede hacerlo. Los permisos
 * llegan resueltos por el servidor.
 */
export interface MoveStageDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  oportunidad: { name: string; clienteNombre?: string | null; next_contact_at?: string | null };
  etapas: readonly EtapaDestino[];
  etapaActualId: string;
  etapaDestinoId: string;
  onEtapaDestinoChange?: (id: string) => void;
  requisitosPendientes?: readonly RequisitoPendiente[];
  /** `crm.opportunities.edit` (o `close` si el destino es de desenlace). */
  puedeMover?: boolean;
  /** `crm.stages.override_gate`. */
  puedeOmitirRequisitos?: boolean;
  /** Personas con el permiso que falta (lo resuelve el servidor). */
  quienesPueden?: readonly string[];
  /** Nombre del permiso que falta, ya traducido. */
  permisoFaltante?: string;
  onMover: (datos: { stageId: string; nextContactAt: string | null; override?: boolean }) => void;
  onCompletar?: (requisito: RequisitoPendiente) => void;
  onPedirAcceso?: (persona: string) => void;
  ocupado?: boolean;
  error?: string | null;
}

export function MoveStageDialog(props: MoveStageDialogProps) {
  const { abierto, onAbiertoChange, oportunidad, etapas, etapaActualId, etapaDestinoId, requisitosPendientes = [], puedeMover = true, ocupado, error } = props;
  const t = useTranslations('crm.kit.mover');
  const { timezone } = useFormatDate();
  const [proximo, setProximo] = useState('');
  useEffect(() => {
    if (abierto) setProximo(aFechaHoraLocal(oportunidad.next_contact_at, timezone));
  }, [abierto, oportunidad.next_contact_at, timezone]);

  const resultado = resultadoMover({ puedeMover, pendientes: requisitosPendientes });
  const actual = etapas.find((e) => e.id === etapaActualId);
  const destino = etapas.find((e) => e.id === etapaDestinoId);
  const nombreDestino = destino?.name ?? '';
  const persona = aQuienPedir(props.quienesPueden ?? []);
  const etiquetaEtapa = (e: EtapaDestino | undefined) => (e ? (e.probability === null ? e.name : t('etapaProb', { etapa: e.name, prob: e.probability })) : '—');
  const mover = (override?: boolean) => props.onMover({ stageId: etapaDestinoId, nextContactAt: deFechaHoraLocal(proximo, timezone), ...(override ? { override } : {}) });

  const pie =
    resultado === 'sinPermiso' ? (
      <>
        {persona && props.onPedirAcceso && <button type="button" onClick={() => props.onPedirAcceso?.(persona)} className={clasesBoton({ variante: 'secundario' })}>{t('pedirA', { nombre: persona })}</button>}
        <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton()}>{t('entendido')}</button>
      </>
    ) : resultado === 'gate' ? (
      <>
        <button type="button" onClick={() => onAbiertoChange(false)} disabled={ocupado} className={clasesBoton({ variante: 'fantasma', className: 'sm:mr-auto' })}>{t('cancelar')}</button>
        {props.puedeOmitirRequisitos && (
          <button type="button" onClick={() => mover(true)} disabled={ocupado} className={clasesBoton({ variante: 'secundario' })}>{t('avanzarIgual')}</button>
        )}
        {props.onCompletar && requisitosPendientes[0] && (
          <button type="button" onClick={() => props.onCompletar?.(requisitosPendientes[0])} disabled={ocupado} className={clasesBoton()}>{t('completarRequisitos')}</button>
        )}
      </>
    ) : (
      <>
        <button type="button" onClick={() => onAbiertoChange(false)} disabled={ocupado} className={clasesBoton({ variante: 'secundario' })}>{t('cancelar')}</button>
        <button type="button" onClick={() => mover()} disabled={ocupado || !etapaDestinoId} aria-busy={ocupado || undefined} className={clasesBoton()}>
          {ocupado && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          {t('mover')}
        </button>
      </>
    );

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={resultado === 'sinPermiso' ? t('tituloSinPermiso', { etapa: nombreDestino }) : t('titulo', { etapa: nombreDestino })}
      descripcion={[`«${oportunidad.name}»`, oportunidad.clienteNombre].filter(Boolean).join(' · ')}
      ancho={520}
      ocupado={ocupado}
      pie={pie}
    >
      {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-3 py-2" aria-label={t('cambio', { desde: actual?.name ?? '—', hasta: nombreDestino })}>
        <Badge tono="marca" apariencia="contorno" tamano="sm">{etiquetaEtapa(actual)}</Badge>
        <ArrowRight aria-hidden="true" className="size-4 text-fg-muted" />
        <Badge tono={destino?.is_won ? 'exito' : destino?.is_lost ? 'peligro' : 'marca'} apariencia="contorno" tamano="sm">{etiquetaEtapa(destino)}</Badge>
      </div>
      {resultado === 'confirmar' && (
        <>
          <FormField etiqueta={t('destino')}>
            <select value={etapaDestinoId} onChange={(e) => props.onEtapaDestinoChange?.(e.target.value)} disabled={!props.onEtapaDestinoChange} className={CLASE_CAMPO}>
              {destinosPosibles(etapas, etapaActualId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </FormField>
          <FormField etiqueta={t('proximoContacto')} ayuda={t('zona', { zona: timezone })}>
            <input type="datetime-local" value={proximo} onChange={(e) => setProximo(e.target.value)} className={CLASE_CAMPO} />
          </FormField>
        </>
      )}
      {resultado === 'gate' && (
        <>
          <div className="flex flex-col gap-2 rounded-lg bg-warning-subtle px-3 py-3">
            <p className="flex items-center gap-2 text-[13px] font-medium text-warning-text">
              <AlertTriangle aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('faltan', { n: requisitosPendientes.length })}
            </p>
            <ul className="flex flex-col gap-1.5">
              {requisitosPendientes.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-[13px] text-fg">
                  <XCircle aria-hidden="true" className="size-4 shrink-0 text-warning-text" strokeWidth={1.5} />
                  <span className="flex-1">{r.etiqueta}</span>
                  {props.onCompletar && <button type="button" onClick={() => props.onCompletar?.(r)} className="text-[13px] font-medium text-brand-deep hover:underline">{t('completar')}</button>}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-fg-muted">{t(props.puedeOmitirRequisitos ? 'historial' : 'sinOmitir')}</p>
        </>
      )}
      {resultado === 'sinPermiso' && (
        <p className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-3 text-[13px] text-fg-secondary">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {persona ? t('sinPermisoQuien', { permiso: props.permisoFaltante ?? t('permisoMover'), nombre: persona }) : t('sinPermiso', { permiso: props.permisoFaltante ?? t('permisoMover') })}
        </p>
      )}
    </PanelAdaptable>
  );
}
