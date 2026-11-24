'use client';

/**
 * Transporte › Boletos › Vender pasaje (Figma «23 Transporte» › 8, 2881:5394). Taquilla: elegir
 * el viaje, tocar un puesto libre del PlanoPuestos (queda retenido los minutos del canal que
 * dice Configuración › Transporte), llenar el pasajero y la tarifa y emitir el boleto.
 *
 * Todo pasa por las RPC de la migración 20261124001000 (organización y permiso en la base).
 * Diferencia con el diseño: «Cobrar» con la caja del POS aún no está integrado (debe reutilizar
 * posService/caja, nunca otra caja): el boleto se emite «Pendiente de pago» o «Pagado» como en el
 * diálogo de siempre. Si el vehículo no tiene plano, quien gestiona Transporte lo crea aquí desde
 * una plantilla (bus 40, buseta 19, lancha 24, yate 12).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Armchair, Bus, Clock, Ticket, User } from 'lucide-react';
import { AvisoTonal, EmptyState, PageHeader, StatusBadge, clasesBoton } from '@/components/kit';
import { AtajoConfigurar } from '@/components/configuracion/AtajoConfigurar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedControl } from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { ticketsService, type RouteStop } from '@/lib/services/ticketsService';
import {
  aplicarPlantilla,
  emitirBoleto,
  puestosDeViaje,
  retenerPuesto,
  soltarPuesto,
  tarifasDeRuta,
  viajesVendibles,
  type TarifaPasaje,
  type ViajeVendible,
} from '@/lib/services/transporte/pasajesService';
import { PLANTILLAS, formatoCuenta, plantilla, resumenPuestos, segundosRestantes, type Plantilla, type PuestoViaje } from '@/lib/transporte/pasajes';
import { PlanoPuestos } from './PlanoPuestos';

export function VenderPasajePage() {
  const t = useTranslations('transporte.pasajes');
  const router = useRouter();
  const moneda = useMonedaOrganizacion();
  const { formatTime, formatPlain, getToday } = useFormatDate();
  const organizationId = Number(getOrganizationId()) || null;

  const [viajes, setViajes] = useState<ViajeVendible[]>([]);
  const [viajeId, setViajeId] = useState('');
  const [puestos, setPuestos] = useState<PuestoViaje[]>([]);
  const [paradas, setParadas] = useState<RouteStop[]>([]);
  const [tarifas, setTarifas] = useState<TarifaPasaje[]>([]);
  const [cargando, setCargando] = useState(true);
  const [elegido, setElegido] = useState<string | null>(null);
  const [hasta, setHasta] = useState<string | null>(null);
  const [minutos, setMinutos] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => new Date());
  const [ocupado, setOcupado] = useState(false);
  const [plantillaElegida, setPlantillaElegida] = useState<Plantilla>('bus40');
  const [form, setForm] = useState({ documento: '', nombre: '', telefono: '', tarifaId: 'base', sube: '', baja: '', pagado: false });

  const viaje = viajes.find((v) => v.id === viajeId) ?? null;

  useEffect(() => {
    if (!organizationId) return;
    viajesVendibles(supabase, organizationId, getToday())
      .then((lista) => {
        setViajes(lista);
        setViajeId((id) => id || lista[0]?.id || '');
      })
      .catch(() => toastError(t('errores.viajes')))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const recargarPuestos = useCallback(async () => {
    if (!viajeId) return;
    try {
      setPuestos(await puestosDeViaje(supabase, viajeId));
    } catch {
      setPuestos([]);
    }
  }, [viajeId]);

  useEffect(() => {
    setElegido(null);
    setHasta(null);
    void recargarPuestos();
    if (!viaje || !organizationId) return;
    ticketsService.getRouteStops(viaje.rutaId).then(setParadas).catch(() => setParadas([]));
    tarifasDeRuta(supabase, organizationId, viaje.rutaId).then(setTarifas).catch(() => setTarifas([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viajeId]);

  // Cuenta regresiva de la retención.
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const restante = segundosRestantes(hasta, ahora);
  useEffect(() => {
    if (hasta && restante === 0) {
      setElegido(null);
      setHasta(null);
      toastError(t('toast.retencionVencida'));
      void recargarPuestos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restante, hasta]);

  const elegir = async (etiqueta: string) => {
    if (!viajeId || ocupado) return;
    setOcupado(true);
    if (elegido && elegido !== etiqueta) await soltarPuesto(supabase, viajeId, elegido);
    const r = await retenerPuesto(supabase, viajeId, etiqueta, 'taquilla');
    setOcupado(false);
    if (r.estado === 'retenido') {
      setElegido(etiqueta);
      setHasta(r.hasta ?? null);
      setMinutos(r.minutos ?? null);
    } else {
      setElegido(null);
      setHasta(null);
      toastError(t(`respuestas.${r.estado === 'error' ? 'error' : r.estado}`));
    }
    void recargarPuestos();
  };

  const tarifa = form.tarifaId === 'base' ? { nombre: t('tarifaBase'), valor: viaje?.tarifaBase ?? 0 } : tarifas.find((f) => f.id === form.tarifaId) ?? null;
  const fmt = (v: number) => (viaje?.moneda && viaje.moneda !== moneda.code ? new Intl.NumberFormat(moneda.locale, { style: 'currency', currency: viaje.moneda }).format(v) : moneda.formatear(v));
  const completo = !!elegido && form.nombre.trim().length >= 3 && !!tarifa;

  const emitir = async () => {
    if (!viajeId || !elegido || !tarifa) return;
    setOcupado(true);
    const r = await emitirBoleto(supabase, viajeId, elegido, {
      nombre: form.nombre,
      documento: form.documento,
      telefono: form.telefono,
      sube: form.sube || null,
      baja: form.baja || null,
      tarifa: tarifa.valor,
      tarifaNombre: tarifa.nombre,
      pagado: form.pagado,
      canal: 'taquilla',
    });
    setOcupado(false);
    if (r.estado === 'emitido') {
      toastSuccess(t('toast.emitido', { numero: r.numero ?? '', puesto: elegido }));
      setElegido(null);
      setHasta(null);
      setForm((f) => ({ ...f, documento: '', nombre: '', telefono: '', pagado: false }));
      void recargarPuestos();
    } else {
      toastError(t(`respuestas.${r.estado === 'error' ? 'error' : r.estado}`));
    }
  };

  const crearPlano = async () => {
    if (!organizationId || !viaje?.vehiculoId) return;
    setOcupado(true);
    const ok = await aplicarPlantilla(supabase, organizationId, viaje.vehiculoId, t(`plantillas.${plantillaElegida}`), plantilla(plantillaElegida));
    setOcupado(false);
    if (ok) {
      toastSuccess(t('toast.planoCreado'));
      void recargarPuestos();
    } else toastError(t('errores.plano'));
  };

  const resumen = useMemo(() => resumenPuestos(puestos), [puestos]);
  const campo = 'flex flex-col gap-1 text-sm font-medium text-fg';
  const etiquetaParada = (p: RouteStop) => p.transport_stops?.name ?? String(p.stop_order);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        icono={Ticket}
        variante="detail"
        volverA="/app/transporte/boletos"
        subtitulo={t('subtitulo')}
        migas={[
          { etiqueta: t('migas.transporte'), href: '/app/transporte/viajes' },
          { etiqueta: t('migas.boletos'), href: '/app/transporte/boletos' },
          { etiqueta: t('titulo') },
        ]}
        debajo={
          <div className="flex flex-wrap gap-2">
            <StatusBadge estado="canal" tono="marca" apariencia="solido" etiqueta={t('canalTaquilla')} />
            {minutos !== null && <StatusBadge estado="retencion" tono="neutro" etiqueta={t('retencionMin', { n: minutos })} />}
          </div>
        }
        acciones={<AtajoConfigurar seccion="transporte.general" ancla="retencion" />}
      />

      <AvisoTonal tono="informacion" compacto titulo={t('sinCaja.titulo')} descripcion={t('sinCaja.descripcion')} />

      {!cargando && viajes.length === 0 ? (
        <EmptyState icono={Bus} titulo={t('sinViajes.titulo')} descripcion={t('sinViajes.descripcion')} accion={{ etiqueta: t('sinViajes.programar'), href: '/app/transporte/viajes?pestana=todos' }} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4" aria-labelledby="venta-viaje">
              <h2 id="venta-viaje" className="flex items-center gap-2 text-base font-semibold text-fg">
                <Bus aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
                {t('viaje')}
              </h2>
              <Select value={viajeId} onValueChange={setViajeId}>
                <SelectTrigger className="h-10 border-line-strong bg-surface" aria-label={t('viaje')}>
                  <SelectValue placeholder={t('eligeViaje')} />
                </SelectTrigger>
                <SelectContent>
                  {viajes.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {[v.codigo, `${formatPlain(v.fecha)} ${formatTime(v.salida)}`, v.ruta, v.placa, t('libres', { n: v.libres })].filter(Boolean).join(' · ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {paradas.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(['sube', 'baja'] as const).map((k) => (
                    <label key={k} className={campo}>
                      {t(k)}
                      <Select value={form[k]} onValueChange={(v) => setForm((f) => ({ ...f, [k]: v }))}>
                        <SelectTrigger className="h-10 border-line-strong bg-surface">
                          <SelectValue placeholder={t('eligeParada')} />
                        </SelectTrigger>
                        <SelectContent>
                          {paradas
                            .filter((p) => (k === 'sube' ? p.is_boarding_allowed !== false : p.is_alighting_allowed !== false))
                            .map((p) => (
                              <SelectItem key={p.id} value={p.transport_stops?.id ?? p.id}>
                                {etiquetaParada(p)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4" aria-labelledby="venta-plano">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 id="venta-plano" className="flex items-center gap-2 text-base font-semibold text-fg">
                    <Armchair aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
                    {t('plano.titulo')}
                  </h2>
                  <p className="text-xs text-fg-muted">{t('plano.ayuda', { n: minutos ?? 5 })}</p>
                </div>
                {puestos.length > 0 && <StatusBadge estado="resumen" tono="neutro" etiqueta={t('plano.resumen', { vendidos: resumen.vendidos, retenidos: resumen.retenidos, libres: resumen.libres })} />}
              </div>
              {viaje && puestos.length === 0 ? (
                <div className="flex flex-col gap-3">
                  <AvisoTonal tono="advertencia" compacto titulo={viaje.vehiculoId ? t('sinPlano.titulo') : t('sinPlano.sinVehiculo')} descripcion={viaje.vehiculoId ? t('sinPlano.descripcion') : undefined} />
                  {viaje.vehiculoId && (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className={campo}>
                        {t('sinPlano.plantilla')}
                        <Select value={plantillaElegida} onValueChange={(v) => setPlantillaElegida(v as Plantilla)}>
                          <SelectTrigger className="h-10 w-56 border-line-strong bg-surface">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PLANTILLAS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {t(`plantillas.${p}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void crearPlano()} disabled={ocupado}>
                        {t('sinPlano.crear')}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <PlanoPuestos puestos={puestos} seleccionado={elegido} onElegir={(e) => void elegir(e)} deshabilitado={ocupado} />
              )}
            </section>
          </div>

          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4" aria-labelledby="venta-pasajero">
              <h2 id="venta-pasajero" className="flex items-center gap-2 text-base font-semibold text-fg">
                <User aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
                {elegido ? t('pasajeroPuesto', { puesto: elegido }) : t('pasajero')}
              </h2>
              {elegido && hasta ? (
                <AvisoTonal tono="advertencia" compacto icono={Clock} titulo={t('retenido', { puesto: elegido, tiempo: formatoCuenta(restante) })} />
              ) : (
                <p className="text-sm text-fg-muted">{t('eligePuesto')}</p>
              )}
              <label className={campo}>
                {t('documento')}
                <Input value={form.documento} onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value.slice(0, 30) }))} className="h-10" />
              </label>
              <label className={campo}>
                {t('nombre')}
                <Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value.slice(0, 120) }))} className="h-10" />
              </label>
              <label className={campo}>
                {t('telefono')}
                <Input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value.slice(0, 20) }))} inputMode="tel" className="h-10" />
              </label>
              <label className={campo}>
                {t('tarifa')}
                <Select value={form.tarifaId} onValueChange={(v) => setForm((f) => ({ ...f, tarifaId: v }))}>
                  <SelectTrigger className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base">{`${t('tarifaBase')} · ${fmt(viaje?.tarifaBase ?? 0)}`}</SelectItem>
                    {tarifas.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{`${f.nombre} · ${fmt(f.valor)}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </section>

            <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4" aria-labelledby="venta-resumen">
              <h2 id="venta-resumen" className="text-base font-semibold text-fg">{t('resumen')}</h2>
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-fg-secondary">{viaje ? `${viaje.codigo} · ${formatTime(viaje.salida)}` : '—'}</dt>
                  <dd className="text-right text-fg">{viaje?.ruta ?? ''}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-fg-secondary">{t('puesto')}</dt>
                  <dd className="text-fg">{elegido ? (puestos.find((p) => p.etiqueta === elegido)?.ventana ? t('puestoVentana', { puesto: elegido }) : elegido) : '—'}</dd>
                </div>
                <div className="flex justify-between gap-2 border-t border-line pt-1.5 font-semibold">
                  <dt className="text-fg">{t('total')}</dt>
                  <dd className="tabular-nums text-fg">{tarifa ? fmt(tarifa.valor) : '—'}</dd>
                </div>
              </dl>
              <SegmentedControl
                opciones={[
                  { valor: 'pendiente', etiqueta: t('pago.pendiente') },
                  { valor: 'pagado', etiqueta: t('pago.pagado') },
                ]}
                valor={form.pagado ? 'pagado' : 'pendiente'}
                onValorChange={(v) => setForm((f) => ({ ...f, pagado: v === 'pagado' }))}
                etiqueta={t('pago.etiqueta')}
              />
              <button type="button" className={clasesBoton({ variante: 'primario', anchoCompleto: true })} onClick={() => void emitir()} disabled={!completo || ocupado} title={!completo ? t('faltan') : undefined}>
                <Ticket aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {tarifa ? t('emitir', { valor: fmt(tarifa.valor) }) : t('emitirSinValor')}
              </button>
              <button type="button" className={clasesBoton({ variante: 'fantasma', anchoCompleto: true })} onClick={() => router.push('/app/transporte/boletos')}>
                {t('verBoletos')}
              </button>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
