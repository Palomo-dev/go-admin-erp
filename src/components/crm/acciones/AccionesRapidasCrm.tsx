'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { QuickActionsBarCrm } from '@/components/crm/kit/QuickActionsBarCrm';
import { ActivityDialog, type DatosActividad } from '@/components/crm/kit/ActivityDialog';
import { estadoAccionesRapidas, type AccionRapidaCrm, type VarianteBarraAcciones } from '@/components/crm/kit/quickActionLogica';
import type { TipoActividad } from '@/components/crm/kit/activityDialogLogica';
import { normalizePhone } from '@/components/crm/shared/quickActionsConfig';
import { useOrgDefaultCountry } from '@/components/crm/shared/useOrgDefaultCountry';
import { useSoftphone } from '@/components/voice/SoftphoneProvider';
import { useCallModePolicy } from '@/components/voice/hooks/useCallModePolicy';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { claveError, emitirCambioCrm, pedirCrm } from './apiCrm';
import { cuerpoLlamada, cuerpoNota, cuerpoReunion, cuerpoSeguimiento, cuerpoTarea, type ModoLlamada, type ValoresTarea } from './accionesRapidasLogica';
import { ModoLlamadaDialog } from './ModoLlamadaDialog';
import { TareaRapidaDialog } from './TareaRapidaDialog';

const ComposeEmailDialog = dynamic(() => import('@/components/crm/shared/ComposeEmailDialog').then((m) => m.ComposeEmailDialog), { ssr: false });
const ComposeWhatsAppDialog = dynamic(() => import('@/components/crm/whatsapp/ComposeWhatsAppDialog').then((m) => m.ComposeWhatsAppDialog), { ssr: false });
const MobileCallDialog = dynamic(() => import('@/components/crm/shared/MobileCallDialog').then((m) => m.MobileCallDialog), { ssr: false });

/**
 * Acciones rápidas del CRM en sus 5 lugares (Figma 773:472568: tarjeta del
 * kanban, drawer, detalle, ficha del cliente y tarjeta móvil). Un solo
 * componente: la barra del kit (`QuickActionsBarCrm`, siempre visible y con
 * el motivo de cada acción deshabilitada, incluido `do_not_call`) y lo que
 * hace cada botón (773:472975):
 *
 * - Llamar → modos (navegador, mi celular, agente IA, solo registrar) →
 *   «Registrar llamada» (`activities`) con tarea de seguimiento para mí;
 * - Email y WhatsApp → sus compositores únicos (servidor; WhatsApp cobra créditos);
 * - Reunión y Nota → `ActivityDialog` → `/api/crm/meetings` · `/api/crm/notes`;
 * - Tarea → `/api/crm/tasks`, asignada al usuario actual.
 *
 * Tras cada acción emite `crm:entity-changed` para que las pantallas refresquen.
 */
export interface AccionesRapidasCrmProps {
  variante: VarianteBarraAcciones;
  clienteId?: string | null;
  oportunidadId?: string | null;
  oportunidadNombre?: string | null;
  cliente?: { id?: string | null; full_name?: string | null; email?: string | null; phone?: string | null; do_not_call?: boolean | null } | null;
  onAccionCompletada?: (accion: AccionRapidaCrm, resultado?: unknown) => void;
  onPropuesta?: () => void;
  onNuevaOportunidad?: () => void;
  puedeCrearOportunidad?: boolean;
  /**
   * Abre una acción sin pulsar la barra («Nueva actividad» de Actividades, el
   * vacío de la ficha). `clave` distinta = abrir otra vez.
   */
  abrirAccion?: { accion: AccionRapidaCrm; clave: number } | null;
  /** Solo los diálogos, sin la barra. */
  sinBarra?: boolean;
  /** Se cerró el diálogo (con o sin guardar). */
  onCerrado?: () => void;
  className?: string;
}

type Abierto = 'modos' | 'movil' | 'email' | 'whatsapp' | 'tarea' | TipoActividad | null;

export function AccionesRapidasCrm(props: AccionesRapidasCrmProps) {
  const { variante, oportunidadId, oportunidadNombre, cliente, onAccionCompletada } = props;
  const t = useTranslations('crm.accionesRapidas');
  const { timezone } = useFormatDate();
  const pais = useOrgDefaultCountry() ?? undefined;
  const softphone = useSoftphone();
  const { decision } = useCallModePolicy();
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claveReunion = useRef<string | null>(null);

  const clienteId = props.clienteId ?? cliente?.id ?? null;
  const nombre = cliente?.full_name?.trim() || t('sinNombre');
  const telefono = normalizePhone(cliente?.phone, pais);
  const destino = { clienteId: clienteId ?? '', clienteNombre: nombre, oportunidadId: oportunidadId ?? null, oportunidadNombre: oportunidadNombre ?? null };
  const estados = estadoAccionesRapidas({ cliente, tieneDestino: Boolean(clienteId || oportunidadId), paisPorDefecto: pais });

  const abrir = (a: Abierto) => {
    if (a === 'reunion') claveReunion.current = crypto.randomUUID();
    setError(null);
    setAbierto(a);
  };
  const terminar = (accion: AccionRapidaCrm, mensaje: string, resultado?: unknown) => {
    setAbierto(null);
    toast({ title: mensaje });
    emitirCambioCrm({ entidad: oportunidadId ? 'opportunity' : 'customer', id: oportunidadId ?? clienteId, accion });
    onAccionCompletada?.(accion, resultado);
  };
  const ejecutar = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(t(`errores.${claveError(e)}`));
    } finally {
      setOcupado(false);
    }
  };

  const alPulsar = (accion: AccionRapidaCrm) => {
    const mapa: Record<AccionRapidaCrm, Abierto> = { llamar: 'modos', email: 'email', whatsapp: 'whatsapp', reunion: 'reunion', tarea: 'tarea', nota: 'nota' };
    abrir(mapa[accion]);
  };
  const claveApertura = props.abrirAccion?.clave;
  useEffect(() => {
    if (props.abrirAccion) alPulsar(props.abrirAccion.accion);
    // Solo cuando cambia la clave: es un «abrir ahora», no un estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveApertura]);
  const { onCerrado } = props;
  const [habiaAbierto, setHabiaAbierto] = useState(false);
  useEffect(() => {
    if (abierto) setHabiaAbierto(true);
    else if (habiaAbierto) {
      setHabiaAbierto(false);
      onCerrado?.();
    }
  }, [abierto, habiaAbierto, onCerrado]);

  const elegirModo = async (modo: ModoLlamada) => {
    if (modo === 'registrar') return abrir('llamada');
    if (modo === 'mobile') return abrir('movil');
    if (modo !== 'browser' || !softphone.available || !telefono) return;
    const r = await softphone.makeCall(telefono, { customerId: clienteId ?? undefined, opportunityId: oportunidadId ?? undefined });
    if (!r.ok) {
      if (r.reason === 'mic_denied') abrir('movil');
      return;
    }
    toast({ title: t('llamar.llamando'), description: telefono });
    // La llamada sigue en el softphone: se abre el registro para anotar el resultado.
    abrir('llamada');
  };

  const guardarActividad = (d: DatosActividad) =>
    ejecutar(async () => {
      if (d.tipo === 'llamada') {
        await pedirCrm('/api/crm/activities', { method: 'POST', cuerpo: cuerpoLlamada(d.datos) });
        const seg = cuerpoSeguimiento(d.datos, destino, timezone, t('llamar.tituloSeguimiento', { nombre }));
        if (seg) await pedirCrm('/api/crm/tasks', { method: 'POST', cuerpo: seg });
        terminar('llamar', seg ? t('toast.llamadaConSeguimiento') : t('toast.llamada'));
      } else if (d.tipo === 'reunion') {
        const { data } = await pedirCrm('/api/crm/meetings', { method: 'POST', cuerpo: { ...cuerpoReunion(d.datos), client_key: claveReunion.current } });
        terminar('reunion', t('toast.reunion'), data);
      } else if (d.tipo === 'nota') {
        const { data } = await pedirCrm('/api/crm/notes', { method: 'POST', cuerpo: cuerpoNota(d.datos) });
        terminar('nota', t('toast.nota'), data);
      }
    });

  const guardarTarea = (v: ValoresTarea) =>
    ejecutar(async () => {
      const { data } = await pedirCrm('/api/crm/tasks', { method: 'POST', cuerpo: cuerpoTarea(v, destino, timezone) });
      terminar('tarea', t('toast.tarea'), data);
    });

  const tipoDialogo = abierto === 'llamada' || abierto === 'reunion' || abierto === 'nota' ? abierto : null;
  const clienteCompositor = cliente ? { id: clienteId ?? undefined, full_name: cliente.full_name ?? null, email: cliente.email ?? null, phone: cliente.phone ?? null } : null;

  return (
    <>
      {!props.sinBarra && <QuickActionsBarCrm
        variante={variante}
        estados={estados}
        onAccion={alPulsar}
        enCurso={ocupado && abierto === 'tarea' ? 'tarea' : null}
        onPropuesta={props.onPropuesta}
        onNuevaOportunidad={props.onNuevaOportunidad}
        puedeCrearOportunidad={props.puedeCrearOportunidad}
        className={props.className}
      />}
      <ModoLlamadaDialog
        abierto={abierto === 'modos'}
        onAbiertoChange={(x) => !x && setAbierto(null)}
        nombre={nombre}
        telefono={telefono}
        softphoneListo={softphone.available && softphone.deviceState === 'registered'}
        predeterminado={decision?.mode ?? null}
        onElegir={(m) => void elegirModo(m)}
      />
      {tipoDialogo && (
        <ActivityDialog
          abierto
          onAbiertoChange={(x) => !x && !ocupado && setAbierto(null)}
          tipo={tipoDialogo}
          destino={destino}
          telefono={telefono}
          correo={cliente?.email ?? null}
          participantes={[cliente?.email, nombre].filter((x): x is string => Boolean(x))}
          onGuardar={(d) => void guardarActividad(d)}
          ocupado={ocupado}
          error={error}
        />
      )}
      <TareaRapidaDialog
        abierto={abierto === 'tarea'}
        onAbiertoChange={(x) => !x && !ocupado && setAbierto(null)}
        contexto={[nombre, oportunidadNombre].filter(Boolean).join(' · ')}
        onGuardar={(v) => void guardarTarea(v)}
        ocupado={ocupado}
        error={error}
      />
      {abierto === 'email' && (
        <ComposeEmailDialog open onOpenChange={(o) => !o && setAbierto(null)} opportunityId={oportunidadId ?? undefined} customerId={clienteId ?? undefined} customer={clienteCompositor} onSent={(r) => terminar('email', t('toast.correo'), r)} />
      )}
      {abierto === 'whatsapp' && (
        <ComposeWhatsAppDialog open onOpenChange={(o) => !o && setAbierto(null)} opportunityId={oportunidadId ?? undefined} customerId={clienteId ?? undefined} customer={clienteCompositor} onSent={(r) => terminar('whatsapp', t('toast.whatsapp'), r)} />
      )}
      {abierto === 'movil' && (
        <MobileCallDialog
          open
          onOpenChange={(o) => !o && setAbierto(null)}
          opportunityId={oportunidadId ?? undefined}
          customerId={clienteId ?? undefined}
          targetPhone={telefono ?? ''}
          customerName={nombre}
          onStarted={() => abrir('llamada')}
        />
      )}
    </>
  );
}
