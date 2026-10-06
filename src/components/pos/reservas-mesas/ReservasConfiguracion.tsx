'use client';

/**
 * POS › Reservas de mesa › Configuración (Figma 1801:169066, paso 1).
 *
 * Ajustes de `restaurant_booking_settings` de la sede activa (o de toda la
 * organización con «Todas» las sucursales). Lee y guarda por
 * `/api/pos/reservas-mesas/configuracion` (organización de la sesión, permiso
 * resuelto en el servidor); la validación es la de
 * `restaurantBookingSettingsService` (la misma que aplica la ruta).
 *
 * Sede sin fila propia: estado vacío «Sede sin configurar» que dice qué valores
 * se están usando (los de la organización o los de la base) y ofrece
 * «Configurar con valores recomendados», que guarda `is_enabled = true` de
 * forma EXPLÍCITA.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarCog, Clock, Mail, MapPin, Plus, ShieldCheck, Trash2, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { FormSection, FormField, EmptyState } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DIAS_SERVICIO,
  INTERVALOS_FRANJA,
  TURNOS_POR_DEFECTO,
  validarAjustesReserva,
  type AjustesReservaDto,
  type AjustesSede,
  type DiaServicio,
  type ErroresAjustes,
} from '@/lib/services/restaurantBookingSettingsService';

interface RespuestaConfiguracion {
  sede: AjustesSede;
  recomendados: AjustesReservaDto;
  porDefecto: AjustesReservaDto;
  zonas: string[];
  puedeEditar: boolean;
}

interface Props {
  /** Sede activa (`useBranch().branchFilter`); null = toda la organización. */
  branchId: number | null;
  nombreSede?: string | null;
}

/** Códigos de `restaurantBookingSettingsService` con texto propio; el resto (rangos de zod) es «valor inválido». */
const CODIGOS_ERROR = new Set([
  'HORA_INVALIDA',
  'TURNO_INVERTIDO',
  'MIN_MAYOR_QUE_MAX',
  'GRUPO_GRANDE_BAJO',
  'DEPOSITO_REQUERIDO',
  'ZONAS_REQUERIDAS',
  'CORREO_INVALIDO',
  'INTERVALO_INVALIDO',
]);

function numeroONulo(valor: string): number | null {
  if (valor.trim() === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function FilaInterruptor({
  etiqueta,
  ayuda,
  marcado,
  onCambio,
  deshabilitado,
}: {
  etiqueta: string;
  ayuda?: string;
  marcado: boolean;
  onCambio: (v: boolean) => void;
  deshabilitado?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {etiqueta}
        </label>
        {ayuda && <p className="mt-0.5 text-sm text-fg-secondary">{ayuda}</p>}
      </div>
      <Switch id={id} checked={marcado} onCheckedChange={onCambio} disabled={deshabilitado} />
    </div>
  );
}

export function ReservasConfiguracion({ branchId, nombreSede }: Props) {
  const t = useTranslations('posReservasMesas.config');
  const tDias = useTranslations('posReservasMesas.config.dias');
  const { toast } = useToast();

  const [datos, setDatos] = useState<RespuestaConfiguracion | null>(null);
  const [ajustes, setAjustes] = useState<AjustesReservaDto | null>(null);
  const [editando, setEditando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<ErroresAjustes>({});
  const [correos, setCorreos] = useState('');
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const qs = branchId != null ? `?branchId=${branchId}` : '';
      const res = await fetch(`/api/pos/reservas-mesas/configuracion${qs}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as RespuestaConfiguracion;
      setDatos(json);
      const propia = json.sede.propia;
      setAjustes(propia);
      setEditando(!!propia);
      setCorreos((propia?.notify_emails ?? []).join(', '));
      setErrores({});
    } catch {
      setErrorCarga(t('errorCarga'));
    } finally {
      setCargando(false);
    }
  }, [branchId, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiar = <K extends keyof AjustesReservaDto>(clave: K, valor: AjustesReservaDto[K]) =>
    setAjustes((a) => (a ? { ...a, [clave]: valor } : a));

  const guardar = useCallback(
    async (valores: AjustesReservaDto) => {
      const conCorreos: AjustesReservaDto = {
        ...valores,
        notify_emails: correos
          .split(/[,\s]+/)
          .map((c) => c.trim())
          .filter(Boolean),
      };
      const local = validarAjustesReserva(conCorreos);
      if (!local.ok) {
        setErrores(local.errores);
        toast({ title: t('revisa'), variant: 'destructive' });
        return;
      }
      setGuardando(true);
      try {
        const res = await fetch('/api/pos/reservas-mesas/configuracion', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId, ajustes: local.ajustes }),
        });
        const json = (await res.json().catch(() => ({}))) as { ajustes?: AjustesReservaDto; errores?: ErroresAjustes; codigo?: string };
        if (!res.ok || !json.ajustes) {
          if (json.errores) setErrores(json.errores);
          toast({
            title: t('errorGuardar'),
            description: json.codigo === 'SIN_PERMISO' ? t('sinPermiso') : undefined,
            variant: 'destructive',
          });
          return;
        }
        setAjustes(json.ajustes);
        setEditando(true);
        setErrores({});
        setCorreos((json.ajustes.notify_emails ?? []).join(', '));
        toast({ title: t('guardado') });
        void cargar();
      } finally {
        setGuardando(false);
      }
    },
    [branchId, correos, toast, t, cargar],
  );

  const ambito = branchId != null ? nombreSede || t('estaSede') : t('todaLaOrganizacion');

  const resumenRespaldo = useMemo(() => {
    if (!datos) return '';
    return datos.sede.origen === 'organizacion' ? t('usandoOrganizacion') : t('usandoDefecto');
  }, [datos, t]);

  if (cargando) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (errorCarga || !datos) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState variante="error" icono={CalendarCog} titulo={errorCarga ?? t('errorCarga')} descripcion={t('reintentar')} />
      </div>
    );
  }

  const soloLectura = !datos.puedeEditar;

  // ── Sede sin configurar ──
  if (!editando || !ajustes) {
    const efectiva = datos.sede.efectiva;
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-surface p-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CalendarCog className="h-5 w-5 text-fg-secondary" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-fg">{t('sinConfigurarTitulo', { ambito })}</h2>
            </div>
            <p className="text-sm text-fg-secondary">{resumenRespaldo}</p>
            <ul className="grid gap-1 text-sm text-fg-secondary sm:grid-cols-2">
              <li>{t('resumen.estado', { estado: efectiva.is_enabled ? t('activas') : t('apagadas') })}</li>
              <li>{t('resumen.turnos', { turnos: TURNOS_POR_DEFECTO.map((x) => `${x.from}–${x.to}`).join(' · ') })}</li>
              <li>{t('resumen.franja', { intervalo: efectiva.slot_interval_minutes, turno: efectiva.turn_duration_minutes })}</li>
              <li>{t('resumen.personas', { min: efectiva.min_party_size, max: efectiva.max_party_size })}</li>
              <li>{t('resumen.cancelacion', { horas: efectiva.cancellation_hours })}</li>
            </ul>
            <p className="text-sm text-fg-secondary">{t('avisoIsEnabled')}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button disabled={soloLectura || guardando} onClick={() => void guardar(datos.recomendados)}>
                {guardando ? t('guardando') : t('configurarRecomendados')}
              </Button>
              <Button
                variant="outline"
                disabled={soloLectura}
                onClick={() => {
                  setAjustes({ ...datos.recomendados, ...(datos.sede.organizacion ?? {}), is_enabled: true });
                  setCorreos((datos.sede.organizacion?.notify_emails ?? []).join(', '));
                  setEditando(true);
                }}
              >
                {t('personalizar')}
              </Button>
            </div>
            {soloLectura && <p className="text-sm text-warning-text">{t('sinPermiso')}</p>}
          </div>
        </div>
      </div>
    );
  }

  const err = (clave: string) => {
    const codigo = errores[clave];
    if (!codigo) return null;
    return t(`errores.${CODIGOS_ERROR.has(codigo) ? codigo : 'VALOR_INVALIDO'}` as 'errores.VALOR_INVALIDO');
  };
  const horario = ajustes.service_hours as Partial<Record<DiaServicio, Array<{ from: string; to: string }>>>;

  const cambiarTurnos = (dia: DiaServicio, turnos: Array<{ from: string; to: string }> | undefined) => {
    const siguiente = { ...horario };
    if (turnos === undefined) delete siguiente[dia];
    else siguiente[dia] = turnos;
    cambiar('service_hours', siguiente);
  };

  return (
    <form
      className="space-y-4 pb-24"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar(ajustes);
      }}
    >
      <FormSection titulo={t('secciones.activar')} icono={ShieldCheck} descripcion={t('ambito', { ambito })}>
        <FilaInterruptor
          etiqueta={t('recibirOnline')}
          ayuda={ajustes.is_enabled ? t('recibirOnlineSi') : t('recibirOnlineNo')}
          marcado={ajustes.is_enabled}
          onCambio={(v) => cambiar('is_enabled', v)}
          deshabilitado={soloLectura}
        />
      </FormSection>

      <FormSection titulo={t('secciones.horario')} icono={Clock} descripcion={t('horarioAyuda')}>
        <div className="space-y-3">
          {DIAS_SERVICIO.map((dia) => {
            const turnos = horario[dia];
            const usaDefecto = turnos === undefined;
            return (
              <div key={dia} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 sm:flex-row sm:items-start">
                <span className="w-28 shrink-0 pt-2 text-sm font-medium text-fg">{tDias(dia)}</span>
                <div className="flex flex-1 flex-col gap-2">
                  {usaDefecto ? (
                    <p className="pt-2 text-sm text-fg-secondary">
                      {t('turnosPorDefecto', { turnos: TURNOS_POR_DEFECTO.map((x) => `${x.from}–${x.to}`).join(' · ') })}
                    </p>
                  ) : turnos.length === 0 ? (
                    <p className="pt-2 text-sm text-fg-secondary">{t('cerrado')}</p>
                  ) : (
                    turnos.map((turno, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <Input
                          type="time"
                          aria-label={t('desde')}
                          className="w-32"
                          value={turno.from}
                          disabled={soloLectura}
                          onChange={(e) => cambiarTurnos(dia, turnos.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
                        />
                        <span aria-hidden="true">–</span>
                        <Input
                          type="time"
                          aria-label={t('hasta')}
                          className="w-32"
                          value={turno.to}
                          disabled={soloLectura}
                          onChange={(e) => cambiarTurnos(dia, turnos.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t('quitarTurno')}
                          disabled={soloLectura}
                          onClick={() => cambiarTurnos(dia, turnos.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                  {err(`service_hours.${dia}`) && <p className="text-sm text-danger-text">{err(`service_hours.${dia}`)}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={soloLectura || (turnos?.length ?? 0) >= 4}
                      onClick={() => cambiarTurnos(dia, [...(turnos ?? []), { from: '18:00', to: '22:00' }])}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      {t('anadirTurno')}
                    </Button>
                    {!usaDefecto && (
                      <Button type="button" variant="ghost" size="sm" disabled={soloLectura} onClick={() => cambiarTurnos(dia, undefined)}>
                        {t('usarPorDefecto')}
                      </Button>
                    )}
                    {(usaDefecto || turnos.length > 0) && (
                      <Button type="button" variant="ghost" size="sm" disabled={soloLectura} onClick={() => cambiarTurnos(dia, [])}>
                        {t('marcarCerrado')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </FormSection>

      <FormSection titulo={t('secciones.franjas')} icono={Clock} columnas={3}>
        <FormField etiqueta={t('intervalo')} ayuda={t('intervaloAyuda')} error={err('slot_interval_minutes')}>
          {(c) => (
            // Solo múltiplos de 15 (INTERVALOS_FRANJA): así toda franja que ofrece el sitio pasa la validación de la base.
            <Select
              value={String(ajustes.slot_interval_minutes)}
              onValueChange={(v) => cambiar('slot_interval_minutes', Number(v))}
              disabled={soloLectura}
            >
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(INTERVALOS_FRANJA as readonly number[]).includes(ajustes.slot_interval_minutes) ? null : (
                  <SelectItem value={String(ajustes.slot_interval_minutes)} disabled>
                    {t('intervaloOpcion', { min: ajustes.slot_interval_minutes })}
                  </SelectItem>
                )}
                {INTERVALOS_FRANJA.map((v) => (
                  <SelectItem key={v} value={String(v)}>
                    {t('intervaloOpcion', { min: v })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('duracion')} error={err('turn_duration_minutes')}>
          <Input type="number" min={15} max={480} value={ajustes.turn_duration_minutes} disabled={soloLectura}
            onChange={(e) => cambiar('turn_duration_minutes', Number(e.target.value))} />
        </FormField>
        <FormField etiqueta={t('buffer')} ayuda={t('bufferAyuda')} error={err('buffer_minutes')}>
          <Input type="number" min={0} max={120} value={ajustes.buffer_minutes} disabled={soloLectura}
            onChange={(e) => cambiar('buffer_minutes', Number(e.target.value))} />
        </FormField>
      </FormSection>

      <FormSection titulo={t('secciones.personas')} icono={Users} columnas={2}>
        <FormField etiqueta={t('minPersonas')} error={err('min_party_size')}>
          <Input type="number" min={1} value={ajustes.min_party_size} disabled={soloLectura}
            onChange={(e) => cambiar('min_party_size', Number(e.target.value))} />
        </FormField>
        <FormField etiqueta={t('maxPersonas')} error={err('max_party_size')}>
          <Input type="number" min={1} value={ajustes.max_party_size} disabled={soloLectura}
            onChange={(e) => cambiar('max_party_size', Number(e.target.value))} />
        </FormField>
        <FormField etiqueta={t('grupoGrande')} ayuda={t('grupoGrandeAyuda')} error={err('large_party_threshold')}>
          <Input type="number" min={1} value={ajustes.large_party_threshold ?? ''} disabled={soloLectura}
            onChange={(e) => cambiar('large_party_threshold', numeroONulo(e.target.value))} />
        </FormField>
        <FormField etiqueta={t('aforoFranja')} ayuda={t('aforoFranjaAyuda')} error={err('max_covers_per_slot')}>
          <Input type="number" min={1} value={ajustes.max_covers_per_slot ?? ''} disabled={soloLectura}
            onChange={(e) => cambiar('max_covers_per_slot', numeroONulo(e.target.value))} />
        </FormField>
      </FormSection>

      <FormSection titulo={t('secciones.anticipacion')} icono={CalendarCog} columnas={3}>
        <FormField etiqueta={t('minAnticipacion')} error={err('min_advance_minutes')}>
          <Input type="number" min={0} value={ajustes.min_advance_minutes} disabled={soloLectura}
            onChange={(e) => cambiar('min_advance_minutes', Number(e.target.value))} />
        </FormField>
        <FormField etiqueta={t('maxDias')} error={err('max_advance_days')}>
          <Input type="number" min={0} max={365} value={ajustes.max_advance_days} disabled={soloLectura}
            onChange={(e) => cambiar('max_advance_days', Number(e.target.value))} />
        </FormField>
        <FormField etiqueta={t('horasCancelacion')} ayuda={t('horasCancelacionAyuda')} error={err('cancellation_hours')}>
          <Input type="number" min={0} value={ajustes.cancellation_hours} disabled={soloLectura}
            onChange={(e) => cambiar('cancellation_hours', Number(e.target.value))} />
        </FormField>
      </FormSection>

      <FormSection titulo={t('secciones.mesas')} icono={MapPin}>
        <FilaInterruptor etiqueta={t('asignarMesa')} ayuda={t('asignarMesaAyuda')} marcado={ajustes.auto_assign_table}
          onCambio={(v) => cambiar('auto_assign_table', v)} deshabilitado={soloLectura} />
        <FilaInterruptor etiqueta={t('elegirZona')} marcado={ajustes.allow_zone_choice}
          onCambio={(v) => cambiar('allow_zone_choice', v)} deshabilitado={soloLectura} />
        {ajustes.allow_zone_choice && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('zonasPermitidas')}>
            {datos.zonas.length === 0 && <p className="text-sm text-fg-secondary">{t('sinZonas')}</p>}
            {datos.zonas.map((zona) => {
              const activa = (ajustes.allowed_zones ?? []).includes(zona);
              return (
                <Button key={zona} type="button" size="sm" variant={activa ? 'default' : 'outline'} aria-pressed={activa}
                  disabled={soloLectura}
                  onClick={() =>
                    cambiar('allowed_zones', activa
                      ? (ajustes.allowed_zones ?? []).filter((z) => z !== zona)
                      : [...(ajustes.allowed_zones ?? []), zona])
                  }>
                  {zona}
                </Button>
              );
            })}
            {err('allowed_zones') && <p className="w-full text-sm text-danger-text">{err('allowed_zones')}</p>}
          </div>
        )}
      </FormSection>

      <FormSection titulo={t('secciones.confirmacion')} icono={Wallet} columnas={1}>
        <FilaInterruptor etiqueta={t('confirmacionManual')} ayuda={t('confirmacionManualAyuda')} marcado={ajustes.require_confirmation}
          onCambio={(v) => cambiar('require_confirmation', v)} deshabilitado={soloLectura} />
        {/* Depósito: el sitio aún no lo cobra ni lo muestra y ninguna RPC lo usa. Se deja visible y
            deshabilitado («Próximamente») para no prometer algo que no ocurre. */}
        <FilaInterruptor etiqueta={t('deposito')} ayuda={t('depositoProximamente')} marcado={false}
          onCambio={() => undefined} deshabilitado />
        <FormField etiqueta={t('politica')} ayuda={t('politicaAyuda')} error={err('policy_text')}>
          <Textarea rows={3} maxLength={2000} value={ajustes.policy_text ?? ''} disabled={soloLectura}
            onChange={(e) => cambiar('policy_text', e.target.value || null)} />
        </FormField>
      </FormSection>

      <FormSection titulo={t('secciones.avisos')} icono={Mail} columnas={1}>
        <FormField etiqueta={t('correosEquipo')} ayuda={t('correosEquipoAyuda')} error={err('notify_emails') ?? err('notify_emails.0')}>
          <Input value={correos} disabled={soloLectura} placeholder="reservas@ejemplo.com" onChange={(e) => setCorreos(e.target.value)} />
        </FormField>
        <FilaInterruptor etiqueta={t('correoCliente')} marcado={ajustes.send_customer_email}
          onCambio={(v) => cambiar('send_customer_email', v)} deshabilitado={soloLectura} />
        {/* WhatsApp al cliente: necesita una plantilla aprobada; hasta entonces no se envía nada. */}
        <FilaInterruptor etiqueta={t('whatsappCliente')} ayuda={t('whatsappProximamente')} marcado={false}
          onCambio={() => undefined} deshabilitado />
        <FormField etiqueta={t('recordatorio')} ayuda={t('recordatorioAyuda')} error={err('reminder_hours_before')}>
          <Input type="number" min={1} max={72} value={ajustes.reminder_hours_before ?? ''} disabled={soloLectura}
            onChange={(e) => cambiar('reminder_hours_before', numeroONulo(e.target.value))} />
        </FormField>
        <FilaInterruptor etiqueta={t('pedirCelular')} marcado={ajustes.require_phone}
          onCambio={(v) => cambiar('require_phone', v)} deshabilitado={soloLectura} />
        <FilaInterruptor etiqueta={t('pedirCorreo')} marcado={ajustes.require_email}
          onCambio={(v) => cambiar('require_email', v)} deshabilitado={soloLectura} />
      </FormSection>

      {!soloLectura && (
        <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-line bg-surface/95 p-3 backdrop-blur">
          <Button type="button" variant="outline" disabled={guardando} onClick={() => void cargar()}>
            {t('descartar')}
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? t('guardando') : t('guardar')}
          </Button>
        </div>
      )}
      {soloLectura && <p className="text-sm text-warning-text">{t('sinPermiso')}</p>}
    </form>
  );
}
