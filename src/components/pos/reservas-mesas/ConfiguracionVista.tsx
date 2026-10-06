'use client';

/**
 * POS › Reservas de mesas › Configuración — vista (Figma «Reservas de mesas ·
 * Configuración (propuesta)» 1699:864094):
 * - 01 listo 1699:864097: sede + «Recibiendo reservas en la web», «Copiar a
 *   otra sede», «Ver en el sitio»; columna principal con Reservas en la web,
 *   Horario de servicio, Turnos y capacidad, Anticipación y cancelación, Mesas
 *   y zonas, Depósito, Datos que pedimos al cliente, Avisos y Política; columna
 *   lateral con «Así lo ve el cliente», «Resumen de reglas» y «Dónde se usa»;
 *   barra fija «N cambios · Tienes cambios sin guardar» (Ctrl+S).
 * - 02 cargando, 03 vacío (sede sin fila), 04 error y 05 sin permiso.
 * - 08 celular 1703:867084: lista de secciones con su resumen; cada fila abre
 *   la sección (con «‹ Configuración» para volver) y la barra fija de guardar
 *   se queda abajo. Desde `sm` se ven todas las secciones como en escritorio.
 *
 * Presentacional: datos y acciones llegan por props (el contenedor es
 * `ReservasConfiguracion`). Las reglas de validación son las de
 * `restaurantBookingSettingsService` (las mismas que aplica la ruta).
 */
import { createContext, useContext, useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CalendarClock,
  CalendarCog,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  Globe,
  Info,
  Link2,
  Lock,
  Mail,
  MapPin,
  Plus,
  RotateCcw,
  ScrollText,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CampoNumero, EmptyState, FormField, RowActionsMenu, SegmentedControl, SettingsSaveBar, StatusBadge } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { formatMoneda } from '@/lib/utils/moneda';
import {
  DIAS_SERVICIO,
  INTERVALOS_FRANJA,
  TURNOS_POR_DEFECTO,
  minutosDeHora,
  type AjustesReservaDto,
  type DiaServicio,
  type ErroresAjustes,
} from '@/lib/services/restaurantBookingSettingsService';
import { montoDeposito, nombrePasarela, RUTA_INTEGRACIONES } from '@/lib/services/restaurante/depositoReserva';
import { horaCorta, rangoHorario } from './reservasVista';

export interface SedeConfig {
  id: number;
  nombre: string;
}

export type EstadoConfig = 'listo' | 'cargando' | 'vacio' | 'error' | 'sinPermiso';

export interface ConfiguracionVistaProps {
  estado: EstadoConfig;
  sedes: readonly SedeConfig[];
  sedeId: number | null;
  onSedeChange: (id: number) => void;
  ajustes: AjustesReservaDto | null;
  /** Lo guardado (para «Tienes cambios sin guardar»). */
  cambios: number;
  errores: ErroresAjustes;
  correoNuevo: string;
  onCorreoNuevoChange: (v: string) => void;
  cambiar: <K extends keyof AjustesReservaDto>(clave: K, valor: AjustesReservaDto[K]) => void;
  zonas: readonly string[];
  mesas: { total: number; porZona: Record<string, number> };
  pasarela: string | null;
  moneda: string;
  host: string | null;
  /** El horario es el de la sucursal (no hay turnos propios). */
  horarioDeSucursal: boolean;
  onRestablecerHorario: () => void;
  guardando: boolean;
  onGuardar: () => void;
  onDescartar: () => void;
  onConfigurarRecomendados: () => void;
  onCopiarDe: (() => void) | null;
  nombreSedeCopia: string | null;
  onCopiarA: () => void;
  onReintentar: () => void;
  onIrAgenda: () => void;
}

/** Sección abierta en el celular (null = la lista de secciones). */
const MovilContexto = createContext<{
  abierta: string | null;
  abrir: (id: string | null) => void;
  volver: string;
}>({
  abierta: null,
  abrir: () => undefined,
  volver: '',
});

function Tarjeta({
  id,
  resumen,
  interruptor,
  tituloFila,
  titulo,
  descripcion,
  icono: Icono,
  extra,
  children,
}: {
  id: string;
  /** Texto de la fila en el celular («6 días · 12:00 – 23:30»). */
  resumen: string;
  /** Interruptor en la propia fila del celular («Recibir reservas en la web»). */
  interruptor?: {
    marcado: boolean;
    onCambio: (v: boolean) => void;
    deshabilitado?: boolean;
  };
  /** Título de la fila del celular si difiere del de la sección. */
  tituloFila?: string;
  titulo: string;
  descripcion?: string;
  icono: typeof Globe;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const m = useContext(MovilContexto);
  const abierta = m.abierta === id;
  return (
    <>
      {m.abierta === null && (
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:hidden">
          <button type="button" onClick={() => m.abrir(id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <Icono className="size-5 shrink-0 text-fg-secondary" aria-hidden="true" strokeWidth={1.5} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-5 text-fg">{tituloFila ?? titulo}</span>
              <span className="block truncate text-[13px] leading-[18px] text-fg-secondary">{resumen}</span>
            </span>
            {!interruptor && <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />}
          </button>
          {interruptor && (
            <Switch
              checked={interruptor.marcado}
              onCheckedChange={interruptor.onCambio}
              disabled={interruptor.deshabilitado}
              aria-label={tituloFila ?? titulo}
            />
          )}
        </div>
      )}
      <section className={cn('rounded-xl border border-line bg-surface p-4 sm:block sm:p-5', abierta ? 'block' : 'hidden')}>
        {abierta && (
          <button
            type="button"
            onClick={() => m.abrir(null)}
            className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-fg-secondary sm:hidden"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {m.volver}
          </button>
        )}
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-2.5">
            <Icono className="mt-0.5 size-4 shrink-0 text-fg-secondary" aria-hidden="true" strokeWidth={1.5} />
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-5 text-fg">{titulo}</h3>
              {descripcion && <p className="mt-0.5 text-[13px] leading-[18px] text-fg-secondary">{descripcion}</p>}
            </div>
          </div>
          {extra}
        </header>
        <div className="space-y-3">{children}</div>
      </section>
    </>
  );
}

function FilaInterruptor({
  titulo,
  descripcion,
  marcado,
  onCambio,
  deshabilitado,
}: {
  titulo: string;
  descripcion?: React.ReactNode;
  marcado: boolean;
  onCambio: (v: boolean) => void;
  deshabilitado?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line px-3 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[13px] font-medium leading-[18px] text-fg">
          {titulo}
        </label>
        {descripcion && <p className="mt-0.5 text-xs leading-4 text-fg-secondary">{descripcion}</p>}
      </div>
      <Switch id={id} checked={marcado} onCheckedChange={onCambio} disabled={deshabilitado} />
    </div>
  );
}

function Unidad({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] text-fg-secondary">{children}</span>;
}

export function ConfiguracionVista(p: ConfiguracionVistaProps) {
  const t = useTranslations('posReservasMesas.configuracion');
  const tDias = useTranslations('posReservasMesas.config.dias');
  const [abierta, setAbierta] = useState<string | null>(null);
  const a = p.ajustes;
  const soloLectura = p.estado === 'sinPermiso';
  const sede = p.sedes.find((s) => s.id === p.sedeId)?.nombre ?? t('todaLaOrganizacion');

  const cabecera = (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {p.sedes.length > 0 && (
          <Select value={p.sedeId != null ? String(p.sedeId) : undefined} onValueChange={(v) => p.onSedeChange(Number(v))}>
            <SelectTrigger aria-label={t('sede')} className="h-10 w-full border-line-strong bg-surface sm:w-[260px]">
              <SelectValue placeholder={t('elegirSede')} />
            </SelectTrigger>
            <SelectContent>
              {p.sedes.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {p.estado === 'listo' && (
          <RowActionsMenu
            className="sm:hidden"
            orientacion="vertical"
            tamano="md"
            titulo={t('sede')}
            acciones={[
              { id: 'copiar', etiqueta: t('copiarA'), icono: Copy, onSelect: p.onCopiarA, deshabilitada: soloLectura || p.sedes.length < 2 },
              ...(p.host ? [{ id: 'ver', etiqueta: t('verEnSitio'), icono: ExternalLink, onSelect: () => window.open(`https://${p.host}/`, '_blank', 'noopener,noreferrer') }] : []),
            ]}
          />
        )}
        {p.estado !== 'cargando' && p.estado !== 'error' && p.estado !== 'sinPermiso' && (
          <StatusBadge
            className="max-sm:hidden"
            estado={a?.is_enabled && p.estado === 'listo' ? 'activo' : 'inactivo'}
            tono={a?.is_enabled && p.estado === 'listo' ? 'exito' : 'neutro'}
            etiqueta={a?.is_enabled && p.estado === 'listo' ? t('recibiendo') : t('noRecibe')}
          />
        )}
      </div>
      {p.estado === 'listo' && (
        <div className="hidden shrink-0 gap-2 sm:flex">
          <Button variant="outline" className="h-10 gap-2" onClick={p.onCopiarA} disabled={soloLectura || p.sedes.length < 2}>
            <Copy className="size-4" aria-hidden="true" strokeWidth={1.5} />
            {t('copiarA')}
          </Button>
          {p.host && (
            <Button asChild variant="ghost" className="h-10 gap-2">
              <a href={`https://${p.host}/`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" strokeWidth={1.5} />
                {t('verEnSitio')}
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (p.estado === 'sinPermiso') {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState
          variante="forbidden"
          icono={Lock}
          titulo={t('sinPermiso.titulo')}
          descripcion={t('sinPermiso.descripcion')}
          accion={{ etiqueta: t('sinPermiso.irAgenda'), onClick: p.onIrAgenda }}
        />
      </div>
    );
  }

  if (p.estado === 'error') {
    return (
      <div className="space-y-4">
        {cabecera}
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="error" icono={CalendarCog} titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={p.onReintentar} />
        </div>
      </div>
    );
  }

  if (p.estado === 'cargando' || !a) {
    return (
      <div className="space-y-4" aria-busy="true">
        {cabecera}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            {[180, 320, 220].map((h) => (
              <div key={h} className="space-y-3 rounded-xl border border-line bg-surface p-5">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-72" />
                <Skeleton className="w-full" style={{ height: h - 80 }} />
              </div>
            ))}
          </div>
          <div className="hidden space-y-4 xl:block">
            <Skeleton className="h-[300px] rounded-xl" />
            <Skeleton className="h-[200px] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (p.estado === 'vacio') {
    return (
      <div className="space-y-4">
        {cabecera}
        <EmptyState
          variante="empty"
          icono={CalendarClock}
          titulo={t('vacio.titulo', { sede })}
          descripcion={t('vacio.descripcion')}
          accion={{
            etiqueta: t('vacio.recomendados'),
            onClick: p.onConfigurarRecomendados,
            icono: Plus,
          }}
          accionSecundaria={
            p.onCopiarDe && p.nombreSedeCopia
              ? {
                  etiqueta: t('vacio.copiaDe', { sede: p.nombreSedeCopia }),
                  onClick: p.onCopiarDe,
                  icono: Upload,
                }
              : undefined
          }
        />
      </div>
    );
  }

  const horario = a.service_hours as Partial<Record<DiaServicio, Array<{ from: string; to: string }>>>;
  const turnosDe = (dia: DiaServicio) => horario[dia] ?? TURNOS_POR_DEFECTO.map((x) => ({ ...x }));
  const cambiarTurnos = (dia: DiaServicio, turnos: Array<{ from: string; to: string }>) => p.cambiar('service_hours', { ...horario, [dia]: turnos });
  // Un código que no esté en el catálogo (p. ej. un mensaje de zod) se muestra como «Valor fuera de rango».
  const err = (clave: string) => {
    const codigo = p.errores[clave];
    if (!codigo) return null;
    const llave = `errores.${codigo}` as 'errores.VALOR_INVALIDO';
    return t.has(llave) ? t(llave) : t('errores.VALOR_INVALIDO');
  };

  const abrir = (id: string | null) => {
    setAbierta(id);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };
  const rango = rangoHorario(horario, DIAS_SERVICIO, TURNOS_POR_DEFECTO);
  const r = {
    web: a.require_confirmation
      ? t('resumen.manual')
      : a.large_party_threshold != null
        ? t('resumen.automaticaGrupos', { n: a.large_party_threshold })
        : t('resumen.automatica'),
    horario:
      rango.dias > 0 && rango.desde && rango.hasta
        ? t('movil.horario', {
            dias: rango.dias,
            desde: rango.desde,
            hasta: rango.hasta,
          })
        : t('movil.horarioCerrado'),
    turnos: t('movil.turnos', {
      intervalo: a.slot_interval_minutes,
      duracion: a.turn_duration_minutes,
      cupo: a.max_covers_per_slot != null ? t('movil.cupo', { n: a.max_covers_per_slot }) : t('resumen.segunMesas'),
    }),
    anticipacion: t('movil.anticipacion', {
      min: Math.round((a.min_advance_minutes / 60) * 10) / 10,
      dias: a.max_advance_days,
      cancelar: a.cancellation_hours,
    }),
    mesas: [
      a.auto_assign_table ? t('resumen.automatica') : t('resumen.manual'),
      a.allow_zone_choice && (a.allowed_zones ?? []).length > 0 ? (a.allowed_zones ?? []).join(' y ') : t('movil.todasZonas'),
    ].join(' · '),
    deposito:
      a.require_deposit && a.deposit_amount
        ? `${formatMoneda(a.deposit_amount, p.moneda, { decimals: 0 })} ${a.deposit_per_person ? t('resumen.porPersona') : t('resumen.porReserva')}`
        : t('resumen.sinDeposito'),
    datos: t('movil.datos', {
      n: Number(a.require_phone) + Number(a.require_email),
    }),
    avisos: [
      a.send_customer_email ? t('movil.correo') : t('movil.sinCorreo'),
      a.reminder_hours_before != null ? t('movil.recordatorio', { n: a.reminder_hours_before }) : t('movil.sinRecordatorio'),
    ].join(' · '),
    politica: t('movil.politica', { n: (a.policy_text ?? '').length }),
  };

  return (
    <MovilContexto.Provider value={{ abierta, abrir, volver: t('movil.volver') }}>
      <div className="space-y-4 pb-24">
        {cabecera}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div
            className={cn(
              'min-w-0 space-y-4',
              abierta === null && 'max-sm:space-y-0 max-sm:overflow-hidden max-sm:rounded-xl max-sm:border max-sm:border-line max-sm:bg-surface',
            )}
          >
            {/* Reservas en la web */}
            <Tarjeta
              id="web"
              resumen={r.web}
              interruptor={{
                marcado: a.is_enabled,
                onCambio: (v) => p.cambiar('is_enabled', v),
                deshabilitado: soloLectura,
              }}
              tituloFila={t('web.recibir')}
              titulo={t('web.titulo')}
              descripcion={t('web.descripcion')}
              icono={Globe}
            >
              <FilaInterruptor
                titulo={t('web.recibir')}
                descripcion={t('web.recibirAyuda', { sede })}
                marcado={a.is_enabled}
                onCambio={(v) => p.cambiar('is_enabled', v)}
                deshabilitado={soloLectura}
              />
              <FormField etiqueta={t('web.comoSeConfirman')} ayuda={t('web.comoAyuda')}>
                <SegmentedControl
                  opciones={[
                    { valor: 'auto', etiqueta: t('web.automatica') },
                    { valor: 'manual', etiqueta: t('web.manual') },
                  ]}
                  valor={a.require_confirmation ? 'manual' : 'auto'}
                  onValorChange={(v) => p.cambiar('require_confirmation', v === 'manual')}
                  deshabilitado={soloLectura}
                />
              </FormField>
            </Tarjeta>

            {/* Horario de servicio */}
            <Tarjeta
              id="horario"
              resumen={r.horario}
              titulo={t('horario.titulo')}
              descripcion={t('horario.descripcion')}
              icono={Clock}
              extra={p.horarioDeSucursal ? <StatusBadge estado="info" tono="informacion" etiqueta={t('horario.deSucursal')} /> : undefined}
            >
              <ul className="divide-y divide-line">
                {DIAS_SERVICIO.map((dia) => {
                  const turnos = turnosDe(dia);
                  const abierto = turnos.length > 0;
                  return (
                    <li key={dia} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                      <div className="flex w-36 shrink-0 items-center gap-3">
                        <Switch
                          checked={abierto}
                          onCheckedChange={(v) => cambiarTurnos(dia, v ? TURNOS_POR_DEFECTO.map((x) => ({ ...x })) : [])}
                          disabled={soloLectura}
                          aria-label={tDias(dia)}
                        />
                        <span className="text-[13px] font-medium text-fg">{tDias(dia)}</span>
                      </div>
                      {abierto ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {turnos.map((tr, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-md border border-line bg-subtle px-2 py-1 text-xs text-fg">
                              <input
                                type="time"
                                aria-label={t('horario.desde')}
                                value={tr.from}
                                disabled={soloLectura}
                                onChange={(e) =>
                                  cambiarTurnos(
                                    dia,
                                    turnos.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)),
                                  )
                                }
                                className="w-[64px] bg-transparent tabular-nums outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                              />
                              <span aria-hidden="true">–</span>
                              <input
                                type="time"
                                aria-label={t('horario.hasta')}
                                value={tr.to}
                                disabled={soloLectura}
                                onChange={(e) =>
                                  cambiarTurnos(
                                    dia,
                                    turnos.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)),
                                  )
                                }
                                className="w-[64px] bg-transparent tabular-nums outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                              />
                              <button
                                type="button"
                                aria-label={t('horario.quitar')}
                                disabled={soloLectura}
                                onClick={() =>
                                  cambiarTurnos(
                                    dia,
                                    turnos.filter((_, j) => j !== i),
                                  )
                                }
                                className="text-fg-muted hover:text-fg"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                          {turnos.length < 4 && (
                            <button
                              type="button"
                              disabled={soloLectura}
                              onClick={() => cambiarTurnos(dia, [...turnos, { from: '19:00', to: '22:00' }])}
                              className="inline-flex items-center gap-1 px-1 text-xs font-medium text-fg hover:text-brand"
                            >
                              <Plus className="size-3.5" aria-hidden="true" />
                              {t('horario.franja')}
                            </button>
                          )}
                          {err(`service_hours.${dia}.0`) && <span className="text-xs text-danger-text">{err(`service_hours.${dia}.0`)}</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-fg-muted">{t('horario.cerrado')}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={p.onRestablecerHorario} disabled={soloLectura}>
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {t('horario.restablecer')}
                </Button>
                <span className="text-xs text-fg-muted">{t('horario.restablecerAyuda')}</span>
              </div>
            </Tarjeta>

            {/* Turnos y capacidad */}
            <Tarjeta id="turnos" resumen={r.turnos} titulo={t('turnos.titulo')} descripcion={t('turnos.descripcion')} icono={Users}>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField etiqueta={t('turnos.intervalo')} ayuda={t('turnos.intervaloAyuda')} error={err('slot_interval_minutes')}>
                  {(c) => (
                    <Select value={String(a.slot_interval_minutes)} onValueChange={(v) => p.cambiar('slot_interval_minutes', Number(v))} disabled={soloLectura}>
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INTERVALOS_FRANJA.map((v) => (
                          <SelectItem key={v} value={String(v)}>
                            {t('turnos.min', { n: v })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField etiqueta={t('turnos.duracion')} ayuda={t('turnos.duracionAyuda')} error={err('turn_duration_minutes')}>
                  <CampoNumero
                    decimales={0}
                    minimo={15}
                    maximo={480}
                    valor={a.turn_duration_minutes}
                    onValorChange={(v) => p.cambiar('turn_duration_minutes', v ?? 90)}
                    sufijo={<Unidad>min</Unidad>}
                    disabled={soloLectura}
                  />
                </FormField>
                <FormField etiqueta={t('turnos.margen')} ayuda={t('turnos.margenAyuda')} error={err('buffer_minutes')}>
                  <CampoNumero
                    decimales={0}
                    minimo={0}
                    maximo={120}
                    valor={a.buffer_minutes}
                    onValorChange={(v) => p.cambiar('buffer_minutes', v ?? 0)}
                    sufijo={<Unidad>min</Unidad>}
                    disabled={soloLectura}
                  />
                </FormField>
                <FormField etiqueta={t('turnos.minimo')} error={err('min_party_size')}>
                  <CampoNumero
                    decimales={0}
                    minimo={1}
                    valor={a.min_party_size}
                    onValorChange={(v) => p.cambiar('min_party_size', v ?? 1)}
                    sufijo={<Unidad>{t('turnos.pers')}</Unidad>}
                    disabled={soloLectura}
                  />
                </FormField>
                <FormField etiqueta={t('turnos.maximo')} error={err('max_party_size')}>
                  <CampoNumero
                    decimales={0}
                    minimo={1}
                    valor={a.max_party_size}
                    onValorChange={(v) => p.cambiar('max_party_size', v ?? 1)}
                    sufijo={<Unidad>{t('turnos.pers')}</Unidad>}
                    disabled={soloLectura}
                  />
                </FormField>
                <FormField etiqueta={t('turnos.cubiertos')} ayuda={t('turnos.cubiertosAyuda')} error={err('max_covers_per_slot')}>
                  <CampoNumero
                    decimales={0}
                    minimo={1}
                    valor={a.max_covers_per_slot}
                    onValorChange={(v) => p.cambiar('max_covers_per_slot', v)}
                    sufijo={<Unidad>{t('turnos.pers')}</Unidad>}
                    disabled={soloLectura}
                  />
                </FormField>
              </div>
              <div className="grid items-start gap-4 sm:grid-cols-3">
                <FormField etiqueta={t('turnos.grupoGrande')} error={err('large_party_threshold')}>
                  <CampoNumero
                    decimales={0}
                    minimo={1}
                    valor={a.large_party_threshold}
                    onValorChange={(v) => p.cambiar('large_party_threshold', v)}
                    sufijo={<Unidad>{t('turnos.pers')}</Unidad>}
                    disabled={soloLectura}
                  />
                </FormField>
                {a.large_party_threshold != null && (
                  <div className="flex gap-2.5 rounded-lg border border-line-info bg-info-subtle p-3 sm:col-span-2">
                    <Info className="mt-0.5 size-4 shrink-0 text-info-text" aria-hidden="true" />
                    <div className="text-xs leading-4">
                      <p className="font-medium text-info-text">{t('turnos.grupoTitulo')}</p>
                      <p className="mt-1 text-fg-secondary">{t('turnos.grupoTexto', { n: a.large_party_threshold })}</p>
                    </div>
                  </div>
                )}
              </div>
            </Tarjeta>

            {/* Anticipación y cancelación */}
            <Tarjeta id="anticipacion" resumen={r.anticipacion} titulo={t('anticipacion.titulo')} icono={CalendarClock}>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  etiqueta={t('anticipacion.minima')}
                  ayuda={t('anticipacion.minimaAyuda', {
                    n: Math.round((a.min_advance_minutes / 60) * 10) / 10,
                  })}
                  error={err('min_advance_minutes')}
                >
                  <CampoNumero
                    decimales={1}
                    minimo={0}
                    valor={Math.round((a.min_advance_minutes / 60) * 10) / 10}
                    onValorChange={(v) => p.cambiar('min_advance_minutes', Math.round((v ?? 0) * 60))}
                    sufijo={<Unidad>{t('anticipacion.horas')}</Unidad>}
                    disabled={soloLectura}
                  />
                </FormField>
                <FormField etiqueta={t('anticipacion.maxDias')} error={err('max_advance_days')}>
                  <CampoNumero
                    decimales={0}
                    minimo={0}
                    maximo={365}
                    valor={a.max_advance_days}
                    onValorChange={(v) => p.cambiar('max_advance_days', v ?? 0)}
                    sufijo={<Unidad>{t('anticipacion.dias')}</Unidad>}
                    disabled={soloLectura}
                  />
                </FormField>
                <FormField etiqueta={t('anticipacion.cancelacion')} ayuda={t('anticipacion.cancelacionAyuda')} error={err('cancellation_hours')}>
                  <CampoNumero
                    decimales={0}
                    minimo={0}
                    valor={a.cancellation_hours}
                    onValorChange={(v) => p.cambiar('cancellation_hours', v ?? 0)}
                    sufijo={<Unidad>{t('anticipacion.horasAntes')}</Unidad>}
                    disabled={soloLectura}
                  />
                </FormField>
              </div>
            </Tarjeta>

            {/* Mesas y zonas */}
            <Tarjeta id="mesas" resumen={r.mesas} titulo={t('mesas.titulo')} icono={MapPin}>
              <FilaInterruptor
                titulo={t('mesas.asignar')}
                descripcion={t('mesas.asignarAyuda')}
                marcado={a.auto_assign_table}
                onCambio={(v) => p.cambiar('auto_assign_table', v)}
                deshabilitado={soloLectura}
              />
              <FilaInterruptor
                titulo={t('mesas.zona')}
                descripcion={t('mesas.zonaAyuda')}
                marcado={a.allow_zone_choice}
                onCambio={(v) => p.cambiar('allow_zone_choice', v)}
                deshabilitado={soloLectura}
              />
              {a.allow_zone_choice && (
                <FormField etiqueta={t('mesas.zonasWeb')} ayuda={t('mesas.zonasAyuda')} error={err('allowed_zones')}>
                  <div role="group" className="flex flex-wrap gap-2">
                    {p.zonas.length === 0 && <span className="text-xs text-fg-muted">{t('mesas.sinZonas')}</span>}
                    {p.zonas.map((zona) => {
                      const activa = (a.allowed_zones ?? []).includes(zona);
                      return (
                        <button
                          key={zona}
                          type="button"
                          aria-pressed={activa}
                          disabled={soloLectura}
                          onClick={() =>
                            p.cambiar('allowed_zones', activa ? (a.allowed_zones ?? []).filter((z) => z !== zona) : [...(a.allowed_zones ?? []), zona])
                          }
                          className={cn(
                            'inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium',
                            activa ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover',
                          )}
                        >
                          {activa && <Check className="size-3" aria-hidden="true" />}
                          {zona}
                        </button>
                      );
                    })}
                  </div>
                </FormField>
              )}
            </Tarjeta>

            {/* Depósito */}
            <Tarjeta id="deposito" resumen={r.deposito} titulo={t('deposito.titulo')} icono={CreditCard}>
              <FilaInterruptor
                titulo={t('deposito.pedir')}
                descripcion={t('deposito.pedirAyuda')}
                marcado={a.require_deposit}
                onCambio={(v) => p.cambiar('require_deposit', v)}
                deshabilitado={soloLectura || (!p.pasarela && !a.require_deposit)}
              />
              {!p.pasarela && (
                <div className="flex flex-col gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-4 text-warning-text">{t('deposito.sinPasarela')}</p>
                  <Button asChild variant="outline" size="sm" className="shrink-0 bg-surface">
                    <Link href={RUTA_INTEGRACIONES}>{t('deposito.irIntegraciones')}</Link>
                  </Button>
                </div>
              )}
              {err('require_deposit') && <p className="text-xs text-danger-text">{t('deposito.sinPasarela')}</p>}
              {a.require_deposit && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField etiqueta={t('deposito.monto')} error={err('deposit_amount')}>
                      <CampoNumero
                        decimales={0}
                        minimo={1}
                        valor={a.deposit_amount}
                        onValorChange={(v) => p.cambiar('deposit_amount', v)}
                        sufijo={<Unidad>{p.moneda}</Unidad>}
                        disabled={soloLectura}
                      />
                    </FormField>
                    <FormField etiqueta={t('deposito.seCobra')}>
                      <SegmentedControl
                        opciones={[
                          {
                            valor: 'reserva',
                            etiqueta: t('deposito.porReserva'),
                          },
                          {
                            valor: 'persona',
                            etiqueta: t('deposito.porPersona'),
                          },
                        ]}
                        valor={a.deposit_per_person ? 'persona' : 'reserva'}
                        onValorChange={(v) => p.cambiar('deposit_per_person', v === 'persona')}
                        deshabilitado={soloLectura}
                      />
                    </FormField>
                  </div>
                  <FilaInterruptor
                    titulo={t('deposito.reembolsable')}
                    descripcion={t('deposito.reembolsableAyuda', {
                      n: a.cancellation_hours,
                    })}
                    marcado={a.deposit_refundable}
                    onCambio={(v) => p.cambiar('deposit_refundable', v)}
                    deshabilitado={soloLectura}
                  />
                  {p.pasarela && (
                    <div className="flex flex-col gap-2 rounded-lg border border-line-info bg-info-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex gap-2.5">
                        <Info className="mt-0.5 size-4 shrink-0 text-info-text" aria-hidden="true" />
                        <div className="text-xs leading-4">
                          <p className="font-medium text-info-text">
                            {t('deposito.conPasarela', {
                              pasarela: nombrePasarela(p.pasarela),
                            })}
                          </p>
                          {a.deposit_amount != null && a.deposit_amount > 0 && (
                            <p className="mt-1 text-fg-secondary">
                              {a.deposit_per_person
                                ? t('deposito.ejemploPersona', {
                                    base: formatMoneda(a.deposit_amount, p.moneda, { decimals: 0 }),
                                    total: formatMoneda(montoDeposito(a, 4) ?? 0, p.moneda, { decimals: 0 }),
                                  })
                                : t('deposito.ejemploFijo', {
                                    base: formatMoneda(a.deposit_amount, p.moneda, { decimals: 0 }),
                                  })}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button asChild variant="outline" size="sm" className="shrink-0 bg-surface">
                        <Link href={RUTA_INTEGRACIONES}>{t('deposito.verPasarela')}</Link>
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Tarjeta>

            {/* Datos que pedimos al cliente */}
            <Tarjeta id="datos" resumen={r.datos} titulo={t('datos.titulo')} icono={UserRound}>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-[13px] text-fg">
                  <Checkbox checked={a.require_phone} onCheckedChange={(v) => p.cambiar('require_phone', v === true)} disabled={soloLectura} />
                  {t('datos.telefono')}
                </label>
                <label className="flex items-center gap-2 text-[13px] text-fg">
                  <Checkbox checked={a.require_email} onCheckedChange={(v) => p.cambiar('require_email', v === true)} disabled={soloLectura} />
                  {t('datos.correo')}
                </label>
              </div>
            </Tarjeta>

            {/* Avisos */}
            <Tarjeta id="avisos" resumen={r.avisos} titulo={t('avisos.titulo')} icono={Mail}>
              <FormField etiqueta={t('avisos.equipo')} error={err('notify_emails') ?? err('notify_emails.0')}>
                <div className="flex flex-wrap items-center gap-2">
                  {(a.notify_emails ?? []).map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 rounded-md border border-line-brand bg-brand-tint px-2 py-1 text-xs text-brand-deep"
                    >
                      {c}
                      <button
                        type="button"
                        aria-label={t('avisos.quitar', { correo: c })}
                        disabled={soloLectura}
                        onClick={() =>
                          p.cambiar(
                            'notify_emails',
                            (a.notify_emails ?? []).filter((x) => x !== c),
                          )
                        }
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1">
                    <Input
                      value={p.correoNuevo}
                      disabled={soloLectura}
                      onChange={(e) => p.onCorreoNuevoChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          const c = p.correoNuevo.trim().toLowerCase();
                          if (c && !(a.notify_emails ?? []).includes(c)) p.cambiar('notify_emails', [...(a.notify_emails ?? []), c]);
                          p.onCorreoNuevoChange('');
                        }
                      }}
                      placeholder={t('avisos.anadir')}
                      aria-label={t('avisos.anadir')}
                      className="h-8 w-48 text-xs"
                    />
                  </span>
                </div>
              </FormField>
              <FilaInterruptor
                titulo={t('avisos.correoCliente')}
                descripcion={t('avisos.correoClienteAyuda')}
                marcado={a.send_customer_email}
                onCambio={(v) => p.cambiar('send_customer_email', v)}
                deshabilitado={soloLectura}
              />
              <FilaInterruptor titulo={t('avisos.whatsapp')} descripcion={t('avisos.whatsappAyuda')} marcado={false} onCambio={() => undefined} deshabilitado />
              <div className="flex flex-col gap-2 rounded-lg border border-line px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[13px] font-medium text-fg">{t('avisos.recordatorio')}</p>
                  <p className="mt-0.5 text-xs text-fg-secondary">{t('avisos.recordatorioAyuda')}</p>
                </div>
                <Select
                  value={a.reminder_hours_before != null ? String(a.reminder_hours_before) : 'no'}
                  onValueChange={(v) => p.cambiar('reminder_hours_before', v === 'no' ? null : Number(v))}
                  disabled={soloLectura}
                >
                  <SelectTrigger aria-label={t('avisos.recordatorio')} className="h-10 w-full border-line-strong bg-surface sm:w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">{t('avisos.sinRecordatorio')}</SelectItem>
                    {[2, 4, 12, 24, 48].map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {t('avisos.horasAntes', { n: h })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Tarjeta>

            {/* Política */}
            <Tarjeta id="politica" resumen={r.politica} titulo={t('politica.titulo')} descripcion={t('politica.descripcion')} icono={ScrollText}>
              <Textarea
                rows={4}
                maxLength={600}
                value={a.policy_text ?? ''}
                disabled={soloLectura}
                onChange={(e) => p.cambiar('policy_text', e.target.value || null)}
                aria-label={t('politica.titulo')}
              />
              <p className="text-xs text-fg-muted">{t('politica.contador', { n: (a.policy_text ?? '').length })}</p>
            </Tarjeta>
          </div>

          {/* Columna lateral */}
          <aside className="space-y-4 max-sm:hidden xl:sticky xl:top-4">
            <VistaCliente a={a} sede={sede} moneda={p.moneda} t={t} />
            <ResumenReglas a={a} mesas={p.mesas} moneda={p.moneda} t={t} />
            <section className="rounded-xl border border-line bg-surface p-4">
              <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-fg">
                <Link2 className="size-4 text-fg-secondary" aria-hidden="true" />
                {t('donde.titulo')}
              </h3>
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">{t('donde.sitio')}</dt>
                  <dd className={a.is_enabled ? 'text-success-text' : 'text-fg-muted'}>{a.is_enabled ? t('donde.activas') : t('donde.apagadas')}</dd>
                </div>
                {p.host && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-secondary">{t('donde.enlace')}</dt>
                    <dd className="truncate text-fg">{p.host}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">{t('donde.pos')}</dt>
                  <dd className="text-fg">{t('donde.mismas')}</dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>

        {!soloLectura && (
          <SettingsSaveBar cambios={p.cambios} onGuardar={p.onGuardar} onDescartar={p.onDescartar} guardando={p.guardando} textoGuardar={t('guardar')} />
        )}
      </div>
    </MovilContexto.Provider>
  );
}

type T = ReturnType<typeof useTranslations>;

/** «Así lo ve el cliente»: vista previa del widget con las horas que ofrecería hoy. */
function VistaCliente({ a, sede, moneda, t }: { a: AjustesReservaDto; sede: string; moneda: string; t: T }) {
  const horas = useMemo(() => {
    const dia = (a.service_hours as Partial<Record<DiaServicio, Array<{ from: string; to: string }>>>).fri ?? TURNOS_POR_DEFECTO;
    const out: string[] = [];
    for (const tr of dia) {
      for (let m = minutosDeHora(tr.from); m < minutosDeHora(tr.to) && out.length < 8; m += a.slot_interval_minutes) {
        out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
      }
    }
    return out.slice(0, 8);
  }, [a.service_hours, a.slot_interval_minutes]);
  const elegida = horas.find((h) => h >= '20:00') ?? horas[horas.length - 1];
  const deposito = a.require_deposit && a.deposit_amount ? montoDeposito(a, 4) : null;
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
        <Eye className="size-4 text-fg-secondary" aria-hidden="true" />
        {t('vista.titulo')}
      </h3>
      <p className="mt-0.5 text-xs text-fg-secondary">{t('vista.descripcion')}</p>
      <div className="mt-3 rounded-lg bg-subtle p-3">
        <p className="text-[15px] font-semibold text-fg">{t('vista.reservaTuMesa', { sede })}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-brand-deep">
          <span>{t('vista.fecha')} ×</span>
          <span>{t('vista.personas')} ×</span>
          {a.allow_zone_choice && (a.allowed_zones ?? [])[0] && <span>{(a.allowed_zones ?? [])[0]} ›</span>}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {horas.map((h) => (
            <span
              key={h}
              className={cn(
                'rounded-full border px-1 py-1 text-center text-[11px] tabular-nums',
                h === elegida ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary',
              )}
            >
              {horaCorta(h).replace(' p. m.', '').replace(' a. m.', '').replace(' m.', '')}
            </span>
          ))}
        </div>
        {(deposito != null || a.cancellation_hours > 0) && (
          <p className="mt-3 text-[11px] leading-4 text-fg-secondary">
            {[
              deposito != null
                ? t('vista.deposito', {
                    monto: formatMoneda(deposito, moneda, { decimals: 0 }),
                  })
                : null,
              t('vista.cancelacion', { n: a.cancellation_hours }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        <div className="mt-3 rounded-lg bg-brand py-2 text-center text-[13px] font-medium text-white">{t('vista.reservar')}</div>
      </div>
    </section>
  );
}

function ResumenReglas({ a, mesas, moneda, t }: { a: AjustesReservaDto; mesas: { total: number; porZona: Record<string, number> }; moneda: string; t: T }) {
  const ofrecidos = useMemo(() => {
    let max = 0;
    for (const dia of DIAS_SERVICIO) {
      const turnos = (a.service_hours as Partial<Record<DiaServicio, Array<{ from: string; to: string }>>>)[dia] ?? TURNOS_POR_DEFECTO;
      const n = turnos.reduce((s, tr) => s + Math.max(0, Math.floor((minutosDeHora(tr.to) - minutosDeHora(tr.from)) / a.slot_interval_minutes)), 0);
      max = Math.max(max, n);
    }
    return max;
  }, [a.service_hours, a.slot_interval_minutes]);
  const enWeb = a.allow_zone_choice ? (a.allowed_zones ?? []).reduce((s, z) => s + (mesas.porZona[z] ?? 0), 0) : mesas.total;
  const filas: Array<[string, string]> = [
    [t('resumen.horarios'), t('resumen.hasta', { n: ofrecidos })],
    [t('resumen.cupo'), a.max_covers_per_slot != null ? t('resumen.personas', { n: a.max_covers_per_slot }) : t('resumen.segunMesas')],
    [t('resumen.mesas'), t('resumen.deTotal', { n: enWeb, total: mesas.total })],
    [t('resumen.zonas'), a.allow_zone_choice && (a.allowed_zones ?? []).length > 0 ? (a.allowed_zones ?? []).join(' · ') : t('resumen.todas')],
    [
      t('resumen.confirmacion'),
      a.require_confirmation
        ? t('resumen.manual')
        : a.large_party_threshold != null
          ? t('resumen.automaticaGrupos', { n: a.large_party_threshold })
          : t('resumen.automatica'),
    ],
    [
      t('resumen.deposito'),
      a.require_deposit && a.deposit_amount
        ? `${formatMoneda(a.deposit_amount, moneda, { decimals: 0 })} ${a.deposit_per_person ? t('resumen.porPersona') : t('resumen.porReserva')}`
        : t('resumen.sinDeposito'),
    ],
  ];
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-fg">
        <Info className="size-4 text-fg-secondary" aria-hidden="true" />
        {t('resumen.titulo')}
      </h3>
      <dl className="space-y-2 text-[13px]">
        {filas.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-fg-secondary">{k}</dt>
            <dd className="text-right text-fg">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
