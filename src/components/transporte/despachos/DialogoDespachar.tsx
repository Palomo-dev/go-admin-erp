'use client';

/**
 * Despachar un viaje (Figma «23 Transporte» › 6, diálogo 672 · 2877:4386). Revisa vehículo,
 * conductor y viaje; si algo bloquea, dice qué y ofrece la salida más corta (cambiar de
 * vehículo) o la excepción autorizada: motivo + PIN de Recursos humanos de quien tenga
 * «Autorizar excepción de despacho» (decisión 4). Todo se decide en la base
 * (`transporte_despachar_viaje`); aquí solo se arma la petición y se muestra la respuesta.
 *
 * «Supervisor que autoriza» (decisión del dueño, 2026-11-23): se elige a la persona y se escribe
 * SU PIN de Recursos humanos; la base lo compara con el de esa persona. Si no tiene PIN asignado,
 * se dice claramente y se enlaza a Recursos humanos › Marcación, donde se asigna.
 */
import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2, Clock, Stamp, XCircle } from 'lucide-react';
import { AvisoTonal, Dialogo } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { MOTIVO_MAX, MOTIVO_MIN, RUTA_ASIGNAR_PIN, excepcionCompleta, ocupacion, type Cumplimiento, type ResultadoDespacho } from '@/lib/transporte/despachos';
import type { Autorizador, ViajeDelDia } from '@/lib/services/transporte/despachosService';

export interface VehiculoOpcion {
  id: string;
  plate: string;
  vehicle_type?: string | null;
  passenger_capacity?: number | null;
}

interface Props {
  viaje: ViajeDelDia;
  cumplimiento: Cumplimiento | null;
  vehiculos: readonly VehiculoOpcion[];
  /** Quién puede autorizar (con si tiene PIN). */
  autorizadores: readonly Autorizador[];
  onCerrar: () => void;
  /** Despacha (con o sin excepción) y devuelve la respuesta de la base. */
  onDespachar: (excepcion?: { motivo: string; pin: string; supervisor: string | null }) => Promise<ResultadoDespacho | null>;
  /** Cambia el vehículo del viaje y vuelve a revisar el cumplimiento. */
  onCambiarVehiculo: (vehiculoId: string) => Promise<void>;
}

type Linea = { clave: string; etiqueta: string; estado: 'ok' | 'vence' | 'vencido' | 'sin_dato' | 'pendiente'; detalle: string };

export function DialogoDespachar({ viaje, cumplimiento, vehiculos, autorizadores, onCerrar, onDespachar, onCambiarVehiculo }: Props) {
  const t = useTranslations('transporte.despachos');
  const tTipos = useTranslations('transporte.tiposVehiculo');
  const { formatTime, formatPlain } = useFormatDate(viaje.sedeId);
  const [motivo, setMotivo] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [supervisorId, setSupervisorId] = React.useState<string>(() => (autorizadores.length === 1 ? autorizadores[0].userId : ''));
  const supervisor = autorizadores.find((a) => a.userId === supervisorId) ?? null;
  const [otroVehiculo, setOtroVehiculo] = React.useState<string>('');
  const [ocupado, setOcupado] = React.useState<'despachar' | 'vehiculo' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const bloqueos = cumplimiento?.bloqueos ?? [];
  const bloqueado = bloqueos.length > 0;
  const causaDe = (c: string) => bloqueos.find((b) => b.causa === c);
  const avisoDe = (c: string) => cumplimiento?.avisos.find((a) => a.causa === c);

  const linea = (clave: string, etiqueta: string, vence: string | null | undefined): Linea => {
    if (causaDe(clave)) return { clave, etiqueta, estado: 'vencido', detalle: t('revision.vencio', { fecha: formatPlain(vence ?? causaDe(clave)?.vence ?? null) }) };
    const a = avisoDe(clave);
    if (a) return { clave, etiqueta, estado: 'vence', detalle: t('revision.vence', { fecha: formatPlain(a.vence) }) };
    if (!vence) return { clave, etiqueta, estado: 'sin_dato', detalle: t('revision.sinFecha') };
    return { clave, etiqueta, estado: 'ok', detalle: t('revision.vence', { fecha: formatPlain(vence) }) };
  };

  const v = viaje.vehiculo;
  const lineasVehiculo: Linea[] = v
    ? [linea('soat', t('causas.soat'), v.soat), linea('tecnomecanica', t('causas.tecnomecanica'), v.tecnomecanica), linea('poliza', t('causas.poliza'), v.poliza), linea('tarjeta_operacion', t('causas.tarjeta_operacion'), v.tarjetaOperacion)]
    : [{ clave: 'sin_vehiculo', etiqueta: t('causas.sin_vehiculo'), estado: 'vencido', detalle: t('revision.asignar') }];
  const c = viaje.conductor;
  const lineasConductor: Linea[] = !viaje.conductorId
    ? [{ clave: 'sin_conductor', etiqueta: t('causas.sin_conductor'), estado: 'vencido', detalle: t('revision.asignar') }]
    : causaDe('sin_credencial')
      ? [{ clave: 'sin_credencial', etiqueta: t('causas.sin_credencial'), estado: 'vencido', detalle: t('revision.registrarLicencia') }]
      : [linea('licencia', t('causas.licencia'), c?.licenciaVence), linea('examen_medico', t('causas.examen_medico'), c?.examenVence)];
  const occ = ocupacion(viaje.puestos, viaje.disponibles);

  const porVehiculo = bloqueos.some((b) => b.grupo === 'vehiculo' || b.causa === 'sin_vehiculo');
  const opcionesVehiculo = vehiculos.filter((x) => x.id !== v?.id);
  const admite = !!cumplimiento?.admiteExcepcion;
  const pidePin = cumplimiento?.pidePin !== false;
  const puedeDespachar = !bloqueado || (admite && excepcionCompleta(motivo, pin, pidePin, supervisor));

  const despachar = async () => {
    setOcupado('despachar');
    setError(null);
    try {
      const r = await onDespachar(bloqueado ? { motivo, pin, supervisor: pidePin ? supervisorId || null : null } : undefined);
      if (r && !['despachado', 'despachado_con_excepcion', 'bloqueado'].includes(r.estado)) {
        setError(t(`resultado.${r.estado}`));
        if (r.estado === 'pin_rechazado') setPin('');
      }
    } finally {
      setOcupado(null);
    }
  };

  const cambiarVehiculo = async () => {
    if (!otroVehiculo) return;
    setOcupado('vehiculo');
    setError(null);
    try {
      await onCambiarVehiculo(otroVehiculo);
      setOtroVehiculo('');
    } finally {
      setOcupado(null);
    }
  };

  const ICONO = { ok: CheckCircle2, vence: AlertCircle, vencido: XCircle, sin_dato: AlertCircle, pendiente: Clock } as const;
  const COLOR = { ok: 'text-success-text', vence: 'text-warning-text', vencido: 'text-danger-text', sin_dato: 'text-fg-muted', pendiente: 'text-fg-muted' } as const;
  const bloque = (titulo: string, lineas: readonly Linea[]) => (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{titulo}</h3>
      <ul className="flex flex-col gap-1.5">
        {lineas.map((l) => {
          const Icono = ICONO[l.estado];
          return (
            <li key={l.clave} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${l.estado === 'vencido' ? 'bg-danger-subtle' : 'bg-subtle'}`}>
              <Icono aria-hidden="true" className={`size-4 shrink-0 ${COLOR[l.estado]}`} strokeWidth={1.5} />
              <span className={`min-w-0 flex-1 ${l.estado === 'vencido' ? 'text-danger-text' : 'text-fg'}`}>{l.etiqueta}</span>
              <span className={`text-xs ${l.estado === 'vencido' ? 'text-danger-text' : 'text-fg-muted'}`}>{l.detalle}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const subtitulo = [viaje.ruta?.nombre, t('revision.hoy', { hora: formatTime(viaje.salida) }), v?.placa, c?.nombre].filter(Boolean).join(' · ');

  return (
    <Dialogo
      abierto
      onAbiertoChange={(a) => !a && ocupado === null && onCerrar()}
      titulo={t('dialogo.titulo', { codigo: viaje.codigo })}
      descripcion={subtitulo}
      ancho={672}
      textoCancelar={t('dialogo.cancelar')}
      primario={{
        etiqueta: bloqueado ? t('dialogo.autorizarYDespachar') : t('dialogo.despachar'),
        onClick: () => void despachar(),
        cargando: ocupado === 'despachar',
        deshabilitada: !puedeDespachar || ocupado !== null,
        motivo: bloqueado ? (admite ? t('dialogo.faltaExcepcion') : t('dialogo.sinExcepcion')) : undefined,
      }}
      secundarios={
        porVehiculo && opcionesVehiculo.length > 0
          ? [{ etiqueta: t('dialogo.cambiarVehiculo'), onClick: () => void cambiarVehiculo(), cargando: ocupado === 'vehiculo', deshabilitada: !otroVehiculo || ocupado !== null, motivo: t('dialogo.eligeVehiculo') }]
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {bloqueado && (
          <AvisoTonal
            tono="peligro"
            rol="alert"
            titulo={t('dialogo.noSale')}
            descripcion={
              bloqueos.map((b) => t(`causas.${b.causa}`) + (b.vence ? ` (${t('revision.vencio', { fecha: formatPlain(b.vence) })})` : '')).join(' · ') +
              '. ' +
              (admite ? t('dialogo.explicaExcepcion') : t('dialogo.explicaSinExcepcion'))
            }
          />
        )}
        {error && <AvisoTonal tono="advertencia" rol="alert" titulo={error} compacto />}

        {bloque(t('revision.vehiculo', { placa: v?.placa ?? '—' }), lineasVehiculo)}
        {bloque(t('revision.conductor', { nombre: c?.nombre || '—' }), lineasConductor)}
        {bloque(t('revision.viaje'), [
          { clave: 'pasajeros', etiqueta: t('revision.pasajeros', { vendidos: occ.vendidos, total: viaje.puestos }), estado: 'ok', detalle: '' },
          { clave: 'planilla', etiqueta: t('revision.planilla'), estado: 'pendiente', detalle: t('revision.planillaAlDespachar') },
        ])}

        {porVehiculo && opcionesVehiculo.length > 0 && (
          <label className="flex flex-col gap-1 text-sm font-medium text-fg">
            {t('dialogo.cambiarA')}
            <Select value={otroVehiculo} onValueChange={setOtroVehiculo}>
              <SelectTrigger className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('dialogo.eligeVehiculo')} />
              </SelectTrigger>
              <SelectContent>
                {opcionesVehiculo.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {[x.plate, x.vehicle_type && tTipos.has(x.vehicle_type) ? tTipos(x.vehicle_type) : x.vehicle_type, x.passenger_capacity ? t('dialogo.puestos', { n: x.passenger_capacity }) : null].filter(Boolean).join(' · ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs font-normal text-fg-muted">{t('dialogo.cambiarNota')}</span>
          </label>
        )}

        {bloqueado && admite && (
          <section className="flex flex-col gap-3 rounded-lg border border-line-warning bg-warning-subtle p-4" aria-labelledby="despacho-excepcion">
            <h3 id="despacho-excepcion" className="flex items-center gap-2 text-sm font-semibold text-warning-text">
              <Stamp aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('excepcion.titulo')}
            </h3>
            <p className="text-xs text-fg-secondary">{t('excepcion.descripcion')}</p>
            <label className="flex flex-col gap-1 text-sm font-medium text-fg">
              {t('excepcion.motivo')}
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, MOTIVO_MAX))} rows={2} placeholder={t('excepcion.motivoPlaceholder')} className="bg-surface" />
              <span className="text-xs font-normal text-fg-muted">{t('excepcion.motivoMin', { n: MOTIVO_MIN })}</span>
            </label>
            {pidePin && (
              <label className="flex flex-col gap-1 text-sm font-medium text-fg">
                {t('excepcion.supervisor')}
                <Select value={supervisorId} onValueChange={(v) => { setSupervisorId(v); setPin(''); }}>
                  <SelectTrigger className="h-10 border-line-strong bg-surface">
                    <SelectValue placeholder={autorizadores.length ? t('excepcion.eligeSupervisor') : t('excepcion.sinAutorizadores')} />
                  </SelectTrigger>
                  <SelectContent>
                    {autorizadores.map((a) => (
                      <SelectItem key={a.userId} value={a.userId}>
                        {a.tienePin ? a.nombre : t('excepcion.sinPinOpcion', { nombre: a.nombre })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}
            {pidePin && supervisor && !supervisor.tienePin && (
              <AvisoTonal
                tono="advertencia"
                compacto
                titulo={t('excepcion.sinPin')}
                descripcion={
                  <Link href={RUTA_ASIGNAR_PIN} className="font-medium text-brand underline-offset-2 hover:underline">
                    {t('excepcion.irAsignarPin')}
                  </Link>
                }
              />
            )}
            {pidePin && (!supervisor || supervisor.tienePin) && (
              <label className="flex w-48 flex-col gap-1 text-sm font-medium text-fg">
                {t('excepcion.pin')}
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="bg-surface tracking-[0.4em]"
                  aria-describedby="despacho-pin-ayuda"
                />
                <span id="despacho-pin-ayuda" className="text-xs font-normal text-fg-muted">{t('excepcion.pinAyuda')}</span>
              </label>
            )}
            <p className="text-xs text-fg-muted">{t('excepcion.registro')}</p>
          </section>
        )}
      </div>
    </Dialogo>
  );
}
