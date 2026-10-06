'use client';

/**
 * «Nueva reserva» y «Editar reserva» (Figma 452:226434 y 452:226678; celular
 * 452:227123):
 * - Nueva: cliente OBLIGATORIO con el `CustomerPicker` compartido (la reserva
 *   queda ligada a su ficha: historial, inasistencias y recordatorio) y «Crear
 *   cliente» para quien llama sin estar registrado; fecha, hora y personas;
 *   mesa y duración; notas; origen; recordatorio.
 * - Editar: estado en chips, la ficha del cliente con «Ver ficha», fecha, hora,
 *   personas, mesa («al cambiar de mesa, la anterior vuelve a quedar libre») y
 *   el aviso de solape, y las notas internas.
 *
 * Las mesas que se ofrecen salen de `getAvailableTables` (misma regla de solape
 * y buffer que la base). La creación es la RPC `create_restaurant_reservation`
 * del servicio; nada se inserta desde aquí.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CampoFecha, CustomerPicker, FormField } from '@/components/kit';
import type { ClientePicker } from '@/components/kit/CustomerPicker';
import { cn } from '@/utils/Utils';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz, formatPlainDate } from '@/lib/utils/dateDisplay';
import {
  ORIGENES_DEL_EQUIPO,
  type CreateReservationInput,
  type ReservationStatus,
  type RestaurantReservation,
  type UpdateReservationInput,
} from './reservasMesasService';
import { claveOrigen, horaCorta } from './reservasVista';
import { CrearClienteReservaDialog, type ClienteParecido } from './CrearClienteReservaDialog';

export interface MesaOpcion {
  id: string;
  name: string;
  zone: string | null;
  capacity: number;
}

export interface ReservaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation?: RestaurantReservation | null;
  /** Sede de la reserva (nombre) para el subtítulo. */
  sede: string | null;
  /** Horas antes del recordatorio de la sede (null: la sede no recuerda). */
  horasRecordatorio: number | null;
  onSubmit: (data: CreateReservationInput | UpdateReservationInput, extra: { recordar: boolean }) => Promise<void>;
  onCambiarEstado?: (reserva: RestaurantReservation, estado: ReservationStatus) => Promise<void>;
  /** Mesas libres a esa hora (excluye la propia reserva al editar). */
  mesasLibres: (fecha: string, hora: string, personas: number, duracion: number, excluir?: string) => Promise<MesaOpcion[]>;
  /** Todas las mesas de la sede (para mostrar la elegida aunque esté ocupada). */
  mesasSede: readonly MesaOpcion[];
  buscarClientes: (texto: string) => Promise<readonly ClientePicker[]>;
  buscarPorTelefono: (telefono: string) => Promise<ClienteParecido | null>;
  crearCliente: (d: { nombres: string; apellidos: string; telefono: string; correo: string }) => Promise<ClientePicker>;
  /** Cliente de la reserva al editar (documento, teléfono, visitas). */
  clienteDeReserva?: ClientePicker | null;
  visitasCliente?: number | null;
}

const ESTADOS_EDITABLES: readonly ReservationStatus[] = ['pending', 'confirmed', 'seated', 'completed'];

export function ReservaFormDialog({
  open,
  onOpenChange,
  reservation,
  sede,
  horasRecordatorio,
  onSubmit,
  onCambiarEstado,
  mesasLibres,
  mesasSede,
  buscarClientes,
  buscarPorTelefono,
  crearCliente,
  clienteDeReserva,
  visitasCliente,
}: ReservaFormDialogProps) {
  const t = useTranslations('posReservasMesas.form');
  const te = useTranslations('posReservasMesas.estados');
  const tor = useTranslations('posReservasMesas.origenes');
  const { getToday, timezone } = useFormatDate();
  const hoyRef = useRef(getToday);
  hoyRef.current = getToday;
  const editando = !!reservation;

  const [cliente, setCliente] = useState<ClientePicker | null>(null);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('19:00');
  const [personas, setPersonas] = useState(2);
  const [duracion, setDuracion] = useState(90);
  const [mesa, setMesa] = useState<string>('');
  const [notas, setNotas] = useState('');
  const [origen, setOrigen] = useState<(typeof ORIGENES_DEL_EQUIPO)[number]>('phone');
  const [recordar, setRecordar] = useState(true);
  const [libres, setLibres] = useState<MesaOpcion[]>([]);
  const [cargandoMesas, setCargandoMesas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [tocado, setTocado] = useState(false);
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [textoCrear, setTextoCrear] = useState('');

  useEffect(() => {
    if (!open) return;
    setTocado(false);
    if (reservation) {
      setCliente(clienteDeReserva ?? { id: reservation.customer_id ?? '', nombre: reservation.customer_name, telefono: reservation.customer_phone, correo: reservation.customer_email });
      setFecha(reservation.reservation_date);
      setHora(reservation.reservation_time.slice(0, 5));
      setPersonas(reservation.party_size);
      setDuracion(reservation.duration_minutes || 90);
      setMesa(reservation.restaurant_table_id ?? '');
      setNotas(reservation.notes ?? '');
      setRecordar(true);
    } else {
      setCliente(null);
      setFecha(hoyRef.current());
      setHora('19:00');
      setPersonas(2);
      setDuracion(90);
      setMesa('');
      setNotas('');
      setOrigen('phone');
      setRecordar(true);
    }
  }, [open, reservation, clienteDeReserva]);

  const excluir = reservation?.id;
  useEffect(() => {
    if (!open || !fecha || !hora) return;
    let vivo = true;
    setCargandoMesas(true);
    const id = setTimeout(() => {
      mesasLibres(fecha, hora, personas, duracion, excluir)
        .then((m) => vivo && setLibres(m))
        .catch(() => vivo && setLibres([]))
        .finally(() => vivo && setCargandoMesas(false));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [open, fecha, hora, personas, duracion, excluir, mesasLibres]);

  // La mesa elegida debe seguir en la lista aunque ya no esté libre (para avisar del solape).
  const opcionesMesa = useMemo(() => {
    const elegida = mesa && !libres.some((m) => m.id === mesa) ? mesasSede.find((m) => m.id === mesa) : undefined;
    return elegida ? [elegida, ...libres] : libres;
  }, [libres, mesa, mesasSede]);
  const solape = !!mesa && !cargandoMesas && !libres.some((m) => m.id === mesa);
  const mesaNombre = mesasSede.find((m) => m.id === mesa)?.name ?? reservation?.restaurant_table?.name ?? '';

  const errorCliente = tocado && !cliente ? t('errores.cliente') : null;
  const errorMesa = tocado && !mesa && !editando ? t('errores.mesa') : null;

  const guardar = async () => {
    setTocado(true);
    if (!cliente || !fecha || !hora || personas < 1 || (!editando && !mesa)) return;
    setGuardando(true);
    try {
      if (editando) {
        const datos: UpdateReservationInput = {
          customer_name: cliente.nombre,
          party_size: personas,
          reservation_date: fecha,
          reservation_time: hora,
          duration_minutes: duracion,
          restaurant_table_id: mesa || null,
          notes: notas.trim() || undefined,
        };
        await onSubmit(datos, { recordar });
      } else {
        const datos: CreateReservationInput = {
          customer_id: cliente.id || undefined,
          customer_name: cliente.nombre,
          customer_phone: cliente.telefono ?? undefined,
          customer_email: cliente.correo ?? undefined,
          party_size: personas,
          reservation_date: fecha,
          reservation_time: hora,
          duration_minutes: duracion,
          restaurant_table_id: mesa || null,
          source: origen,
          notes: notas.trim() || undefined,
        };
        await onSubmit(datos, { recordar });
      }
      onOpenChange(false);
    } catch {
      /* el error lo muestra la página */
    } finally {
      setGuardando(false);
    }
  };

  const buscar = useCallback(async (texto: string) => buscarClientes(texto), [buscarClientes]);

  const subtitulo = editando
    ? reservation?.confirmed_at
      ? t('confirmadaEl', {
          dia: formatDateInTz(reservation.confirmed_at, timezone, { day: 'numeric', month: 'long' }),
          hora: horaCorta(formatDateInTz(reservation.confirmed_at, timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })),
        })
      : t('creadaPor', { origen: tor(claveOrigen(reservation!.source)) })
    : t('descripcionNueva', { sede: sede ?? '—', fecha: formatPlainDate(fecha || hoyRef.current(), { weekday: 'long', day: 'numeric', month: 'long' }) });

  return (
    <>
      <Dialog open={open} onOpenChange={(a) => !guardando && onOpenChange(a)}>
        <DialogContent className="flex max-h-[92vh] max-w-[672px] flex-col gap-0 p-0">
          <div className="px-6 pb-2 pt-6">
            <DialogTitle className="text-xl font-semibold leading-7 text-fg">
              {editando ? t('tituloEditar', { nombre: reservation!.customer_name }) : t('tituloNueva')}
            </DialogTitle>
            <DialogDescription className="mt-2 text-[13px] leading-[18px] text-fg-secondary">{subtitulo}</DialogDescription>
          </div>

          <form
            id="form-reserva"
            noValidate
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void guardar();
            }}
          >
            {editando ? (
              <>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('estado')}>
                  <span className="mr-1 text-[13px] text-fg-secondary">{t('estado')}</span>
                  {ESTADOS_EDITABLES.map((s) => {
                    const activo = reservation!.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={activo}
                        disabled={activo || !onCambiarEstado}
                        onClick={() => onCambiarEstado?.(reservation!, s)}
                        className={cn(
                          'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors',
                          activo ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg',
                        )}
                      >
                        {activo && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                        {te(s)}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-subtle px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-fg">{cliente?.nombre ?? reservation!.customer_name}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {[cliente?.documento, cliente?.telefono ?? reservation!.customer_phone, visitasCliente != null ? t('visitas', { n: visitasCliente }) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {reservation!.customer_id && (
                    <a href={`/app/clientes/${reservation!.customer_id}`} className="shrink-0 text-[13px] font-medium text-brand hover:underline">
                      {t('verFicha')}
                    </a>
                  )}
                </div>
              </>
            ) : (
              <>
                <FormField etiqueta={t('cliente')} obligatorio error={errorCliente}>
                  {(c) => (
                    <CustomerPicker
                      id={c.id}
                      aria-describedby={c['aria-describedby']}
                      aria-invalid={c['aria-invalid']}
                      layout="campo"
                      cliente={cliente}
                      buscar={buscar}
                      onCambiar={setCliente}
                      onQuitar={() => setCliente(null)}
                      onCrear={(texto) => {
                        setTextoCrear(texto);
                        setCrearAbierto(true);
                      }}
                    />
                  )}
                </FormField>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                  <span className="text-[13px] text-fg-secondary">{t('llamaSinRegistro')}</span>
                  <button
                    type="button"
                    className="shrink-0 text-[13px] font-medium text-brand hover:underline"
                    onClick={() => {
                      setTextoCrear('');
                      setCrearAbierto(true);
                    }}
                  >
                    {t('crearCliente')}
                  </button>
                </div>
                <p className="-mt-2 text-xs text-fg-muted">{t('clienteAyuda')}</p>
              </>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FormField etiqueta={t('fecha')} obligatorio>
                <CampoFecha valor={fecha} onValorChange={setFecha} />
              </FormField>
              <FormField etiqueta={t('hora')} obligatorio>
                <Input type="time" step={900} value={hora} onChange={(e) => setHora(e.target.value)} />
              </FormField>
              <FormField etiqueta={t('personas')} obligatorio className="col-span-2 sm:col-span-1">
                <Input type="number" min={1} max={200} value={personas} onChange={(e) => setPersonas(Math.max(1, Number(e.target.value) || 1))} />
              </FormField>
            </div>

            <div className={cn('grid gap-3', editando ? 'grid-cols-1' : 'grid-cols-2')}>
              <FormField etiqueta={t('mesa')} obligatorio={!editando} error={errorMesa} ayuda={editando ? t('mesaAyuda') : undefined}>
                {(c) => (
                  <Select value={mesa || (editando ? 'ninguna' : '')} onValueChange={(v) => setMesa(v === 'ninguna' ? '' : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue placeholder={cargandoMesas ? t('buscandoMesas') : t('elegirMesa')} />
                    </SelectTrigger>
                    <SelectContent>
                      {editando && <SelectItem value="ninguna">{t('sinMesa')}</SelectItem>}
                      {opcionesMesa.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {t('opcionMesa', { mesa: m.name, zona: m.zone ?? '—', n: m.capacity })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              {!editando && (
                <FormField etiqueta={t('duracion')}>
                  {(c) => (
                    <Select value={String(duracion)} onValueChange={(v) => setDuracion(Number(v))}>
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[60, 90, 120, 150, 180].map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {t('minutos', { n: m })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
              )}
            </div>

            {solape && (
              <p role="alert" className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-2.5 text-[13px] leading-[18px] text-warning-text">
                {t('solape', { mesa: mesaNombre, hora: horaCorta(hora) })}
              </p>
            )}

            <FormField etiqueta={editando ? t('notasInternas') : t('notas')}>
              <Textarea rows={editando ? 1 : 2} maxLength={500} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder={t('notasPlaceholder')} />
            </FormField>

            {!editando && (
              <FormField etiqueta={t('origen')}>
                {(c) => (
                  <Select value={origen} onValueChange={(v) => setOrigen(v as typeof origen)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORIGENES_DEL_EQUIPO.map((o) => (
                        <SelectItem key={o} value={o}>
                          {tor(claveOrigen(o))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            )}

            {!editando && horasRecordatorio != null && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-line px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg">{t('recordar', { n: horasRecordatorio })}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {cliente?.correo ? t('recordarPor', { destino: cliente.correo }) : t('recordarSinCorreo')}
                  </p>
                </div>
                <Switch checked={recordar && !!cliente?.correo} disabled={!cliente?.correo} onCheckedChange={setRecordar} aria-label={t('recordar', { n: horasRecordatorio })} />
              </div>
            )}
          </form>

          <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={guardando}>
              {t('cancelar')}
            </Button>
            <Button type="submit" form="form-reserva" disabled={guardando}>
              {editando ? t('guardarCambios') : t('crear')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CrearClienteReservaDialog
        abierto={crearAbierto}
        onAbiertoChange={setCrearAbierto}
        textoInicial={textoCrear}
        buscarPorTelefono={buscarPorTelefono}
        onCrear={crearCliente}
        onUsar={setCliente}
      />
    </>
  );
}
