'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, Loader2, Mail, MessageSquare, Phone, Save, Send, StickyNote, type LucideIcon } from 'lucide-react';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { CamposCorreo, CamposLlamada, CamposNota, CamposReunion, CamposWhatsApp, type OpcionSimple } from './ActivityDialogCampos';
import { aFechaHoraLocal, diasDesde } from './fechasCrm';
import {
  datosLlamada,
  datosNota,
  datosReunion,
  dentroDeVentana,
  validarCorreo,
  validarLlamada,
  validarNota,
  validarReunion,
  validarWhatsApp,
  type DestinoActividad,
  type TipoActividad,
  type ValoresCorreo,
  type ValoresLlamada,
  type ValoresNota,
  type ValoresReunion,
  type ValoresWhatsApp,
} from './activityDialogLogica';

/**
 * Diálogo de actividad (Figma `ActivityDialog` 760:445129): llamada (registrar
 * resultado), correo, WhatsApp, reunión y nota; diálogo en escritorio y hoja
 * en móvil. El mismo componente desde la ficha del cliente, el detalle, la
 * tarjeta del kanban y Actividades. Solo arma los datos: `onGuardar` los
 * manda a la ruta del servidor (ola 3A), que emite `crm:entity-changed`.
 * Fechas y horas en la zona de la organización.
 */
export type DatosActividad =
  | { tipo: 'llamada'; datos: ReturnType<typeof datosLlamada> }
  | { tipo: 'correo'; datos: ValoresCorreo }
  | { tipo: 'whatsapp'; datos: ValoresWhatsApp & { enviar_en: string | null } }
  | { tipo: 'reunion'; datos: ReturnType<typeof datosReunion> }
  | { tipo: 'nota'; datos: ReturnType<typeof datosNota> };

export interface ActivityDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  tipo: TipoActividad;
  destino: DestinoActividad;
  telefono?: string | null;
  correo?: string | null;
  remitentes?: readonly (OpcionSimple & { verificado?: boolean })[];
  plantillasCorreo?: readonly OpcionSimple[];
  canalesWhatsApp?: readonly OpcionSimple[];
  plantillasWhatsApp?: readonly (OpcionSimple & { vistaPrevia?: string })[];
  /** Último mensaje del cliente (ventana de 24 h de WhatsApp). */
  ultimaRespuestaCliente?: string | null;
  /** Participantes propuestos de la reunión (cliente y responsable). */
  participantes?: readonly string[];
  onGuardar: (datos: DatosActividad) => void;
  ocupado?: boolean;
  error?: string | null;
  ahora?: Date;
}

const ICONO: Record<TipoActividad, LucideIcon> = { llamada: Phone, correo: Mail, whatsapp: MessageSquare, reunion: Calendar, nota: StickyNote };
const ICONO_PRIMARIO: Record<TipoActividad, LucideIcon> = { llamada: Save, correo: Send, whatsapp: Send, reunion: Calendar, nota: Save };

export function ActivityDialog(props: ActivityDialogProps) {
  const { abierto, onAbiertoChange, tipo, destino, telefono, correo, onGuardar, ocupado, error, ahora = new Date() } = props;
  const t = useTranslations('crm.kit.actividad');
  const { timezone, getToday } = useFormatDate();
  const hoy = getToday();
  const iniciales = useMemo(
    () => ({
      llamada: { direccion: 'outbound', resultado: '', duracion: '', fechaHora: aFechaHoraLocal(ahora, timezone), notas: '', crearSeguimiento: true, fechaSeguimiento: '' } as ValoresLlamada,
      correo: { remitenteId: props.remitentes?.[0]?.id ?? '', para: correo ?? '', plantillaId: '', asunto: '', mensaje: '' } as ValoresCorreo,
      whatsapp: { canalId: props.canalesWhatsApp?.[0]?.id ?? '', plantillaId: '', texto: '', programar: false, fechaHora: '' } as ValoresWhatsApp,
      reunion: { titulo: '', dia: hoy, hora: '10:00', duracionMin: 60, participantes: [...(props.participantes ?? [])], lugar: '' } as ValoresReunion,
      nota: { cuerpo: '', fijar: false } as ValoresNota,
    }),
    // Se recalculan al abrir: `abierto` cambia y el efecto de abajo los aplica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [abierto, tipo],
  );
  const [valores, setValores] = useState(iniciales);
  const [intentado, setIntentado] = useState(false);
  useEffect(() => {
    if (abierto) {
      setValores(iniciales);
      setIntentado(false);
    }
  }, [abierto, iniciales]);

  const enVentana = dentroDeVentana(props.ultimaRespuestaCliente, ahora);
  const codigos: Record<string, string | undefined> =
    tipo === 'llamada' ? validarLlamada(valores.llamada, hoy)
    : tipo === 'correo' ? validarCorreo(valores.correo)
    : tipo === 'whatsapp' ? validarWhatsApp(valores.whatsapp, { dentroVentana: enVentana })
    : tipo === 'reunion' ? validarReunion(valores.reunion, hoy)
    : validarNota(valores.nota);
  const errores = Object.fromEntries(Object.entries(codigos).map(([k, c]) => [k, intentado && c ? t(`error.${c}`) : null]));
  const cambiar = <K extends TipoActividad>(k: K) => (parcial: Partial<(typeof valores)[K]>) => setValores((x) => ({ ...x, [k]: { ...x[k], ...parcial } }));

  const guardar = () => {
    setIntentado(true);
    if (Object.keys(codigos).length > 0) return;
    if (tipo === 'llamada') onGuardar({ tipo, datos: datosLlamada(valores.llamada, destino, timezone) });
    else if (tipo === 'correo') onGuardar({ tipo, datos: valores.correo });
    else if (tipo === 'whatsapp') onGuardar({ tipo, datos: { ...valores.whatsapp, enviar_en: valores.whatsapp.programar ? valores.whatsapp.fechaHora : null } });
    else if (tipo === 'reunion') onGuardar({ tipo, datos: datosReunion(valores.reunion, destino, timezone) });
    else onGuardar({ tipo, datos: datosNota(valores.nota, destino) });
  };

  const contacto = tipo === 'llamada' || tipo === 'whatsapp' ? telefono : tipo === 'correo' ? correo : destino.oportunidadNombre;
  const Primario = ICONO_PRIMARIO[tipo];
  const relacionadas = [t('nota.cliente', { nombre: destino.clienteNombre }), ...(destino.oportunidadNombre ? [t('nota.oportunidad', { nombre: destino.oportunidadNombre })] : [])];

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t(`titulo.${tipo}`)}
      descripcion={[destino.clienteNombre, contacto].filter(Boolean).join(' · ')}
      icono={ICONO[tipo]}
      ancho={520}
      ocupado={ocupado}
      pie={
        <>
          <button type="button" onClick={() => onAbiertoChange(false)} disabled={ocupado} className={clasesBoton({ variante: 'secundario' })}>
            {t('cancelar')}
          </button>
          <button type="button" onClick={guardar} disabled={ocupado} aria-busy={ocupado || undefined} className={clasesBoton()}>
            {ocupado ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Primario aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {t(`primario.${tipo}`)}
          </button>
        </>
      }
    >
      {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
      {tipo === 'llamada' && <CamposLlamada v={valores.llamada} cambiar={cambiar('llamada')} errores={errores} />}
      {tipo === 'correo' && (
        <CamposCorreo v={valores.correo} cambiar={cambiar('correo')} errores={errores} remitentes={props.remitentes ?? []} plantillas={props.plantillasCorreo ?? []} />
      )}
      {tipo === 'whatsapp' && (
        <CamposWhatsApp
          v={valores.whatsapp}
          cambiar={cambiar('whatsapp')}
          errores={errores}
          canales={props.canalesWhatsApp ?? []}
          plantillas={props.plantillasWhatsApp ?? []}
          dentroVentana={enVentana}
          diasSinRespuesta={diasDesde(props.ultimaRespuestaCliente, ahora, timezone)}
          nombreCliente={destino.clienteNombre}
          zonaNombre={timezone}
        />
      )}
      {tipo === 'reunion' && (
        <CamposReunion v={valores.reunion} cambiar={cambiar('reunion')} errores={errores} hoy={hoy} zonaNombre={timezone} oportunidad={destino.oportunidadNombre} />
      )}
      {tipo === 'nota' && <CamposNota v={valores.nota} cambiar={cambiar('nota')} errores={errores} relacionadas={relacionadas} />}
    </PanelAdaptable>
  );
}
