'use client';

/**
 * Membresía — detalle del miembro (Figma C2 984:611992, móvil C7 985:618292).
 * Acciones según los permisos que calcula el servidor (`permisos` de la respuesta) y las reglas
 * copiadas del plan al venderse (`reglas`): Congelar, Descongelar, Cancelar (con motivo) y Renovar
 * (que lleva al POS o a la factura: renovar es vender). Tras cada acción se recarga el detalle.
 */
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Ban,
  CalendarClock,
  CircleDollarSign,
  DoorOpen,
  FileText,
  History,
  KeyRound,
  Link2,
  List,
  Package,
  Pause,
  Play,
  Receipt,
  RefreshCw,
  User,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  AvatarIniciales,
  Dialogo,
  EmptyState,
  FilaDato,
  KpiStrip,
  ListaDatos,
  PageHeader,
  RelatedLinkCard,
  RowActionsMenu,
  StatCard,
  StatusBadge,
  TabBar,
  Tarjeta,
  idPanel,
  idPestana,
  type AccionFila,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { apiMembresias } from '@/lib/services/membresias/clienteMembresias';
import type { DetalleMembresia as Detalle, ReglasPlan } from '@/lib/services/membresias/tipos';
import { addPlainDays, todayInTz } from '@/lib/utils/dateCore';
import { cn } from '@/utils/Utils';
import { BadgeEstadoMembresia } from '../comun/BadgeEstadoMembresia';
import { EsqueletoPantalla, EstadoPantalla } from '../comun/EstadoPantalla';
import { useLineaVigencia } from '../comun/LineaVigencia';
import { useCargaMembresias } from '../comun/useCargaMembresias';
import { useFormatoMembresias, type FormatoMembresias } from '../comun/useFormatoMembresias';
import { useMensajeError } from '../comun/useMensajeError';
import { DialogoCancelar } from '../dialogos/DialogoCancelar';
import { DialogoCongelar } from '../dialogos/DialogoCongelar';
import { DialogoRenovar } from '../dialogos/DialogoRenovar';
import {
  RUTA_MEMBRESIAS,
  congelamientoVigente,
  diasSemana,
  estadoCongelable,
  metodoEntrada,
  motivoRechazo,
  progresoVigencia,
  rutaListadoCliente,
  tipoEvento,
} from '../logica';

type Pestana = 'resumen' | 'entradas' | 'pagos' | 'congelamientos' | 'historial';
type DialogoAbierto = 'congelar' | 'descongelar' | 'cancelar' | 'renovar' | null;

const CLASE_SECUNDARIO =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';
const CLASE_PRIMARIO =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';

export default function DetalleMembresia({ id }: { id: number }) {
  const t = useTranslations('membresias.detalle');
  const tc = useTranslations('membresias.comun');
  const router = useRouter();
  const mensajeError = useMensajeError();
  const carga = useCargaMembresias(`membresia-${id}`, () => apiMembresias.membresia(id));
  const d = carga.datos;
  const f = useFormatoMembresias(d?.zona);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [dialogo, setDialogo] = useState<DialogoAbierto>(null);
  const [descongelando, setDescongelando] = useState(false);

  const migasBase = [
    { etiqueta: tc('modulo'), href: RUTA_MEMBRESIAS },
    { etiqueta: tc('membresias'), href: `${RUTA_MEMBRESIAS}/membresias` },
  ];

  if (!d) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        <PageHeader
          titulo={tc('membresia')}
          icono={UserCheck}
          variante="detail"
          cargando={carga.cargando}
          migas={[...migasBase, { etiqueta: `#${id}` }]}
        />
        {carga.error ? <EstadoPantalla error={carga.error} onReintentar={carga.recargar} tituloError={t('error')} /> : <EsqueletoPantalla />}
      </div>
    );
  }

  const m = d.membresia;
  const vigente = congelamientoVigente(d.congelamientos);
  const puedeCongelar = d.permisos.congelar && m.reglas.freezeAllowed && estadoCongelable(m.estado) && !vigente;
  const puedeDescongelar = d.permisos.congelar && !!vigente;
  const puedeCancelar = d.permisos.cancelar && m.estado !== 'cancelled';
  const puedeRenovar = m.estado !== 'cancelled';
  const codigo = m.codigo ?? `#${m.id}`;

  const descongelar = async () => {
    setDescongelando(true);
    try {
      await apiMembresias.descongelar(m.id);
      toast.success(t('toasts.descongelada'));
      setDialogo(null);
      carga.recargar();
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setDescongelando(false);
    }
  };

  const accionesMas: AccionFila[] = [
    { id: 'cliente', etiqueta: t('acciones.verCliente'), icono: User, onSelect: () => router.push(`/app/clientes/${m.cliente.id}`), oculta: !m.cliente.id },
    { id: 'otras', etiqueta: t('acciones.otrasMembresias'), icono: List, onSelect: () => router.push(rutaListadoCliente(m.cliente.id)), oculta: !m.cliente.id },
    { id: 'congelar', etiqueta: t('acciones.congelar'), icono: Pause, onSelect: () => setDialogo('congelar'), oculta: !puedeCongelar },
    { id: 'descongelar', etiqueta: t('acciones.descongelar'), icono: Play, onSelect: () => setDialogo('descongelar'), oculta: !puedeDescongelar },
    { id: 'cancelar', etiqueta: t('acciones.cancelar'), icono: Ban, destructiva: true, onSelect: () => setDialogo('cancelar'), oculta: !puedeCancelar },
  ];

  const botonCongelar = puedeDescongelar ? (
    <button type="button" className={CLASE_SECUNDARIO} onClick={() => setDialogo('descongelar')}>
      <Play aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('acciones.descongelar')}
    </button>
  ) : puedeCongelar ? (
    <button type="button" className={CLASE_SECUNDARIO} onClick={() => setDialogo('congelar')}>
      <Pause aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('acciones.congelar')}
    </button>
  ) : null;

  const botonRenovar = puedeRenovar ? (
    <button type="button" className={CLASE_PRIMARIO} onClick={() => setDialogo('renovar')}>
      <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('acciones.renovar')}
    </button>
  ) : null;

  const pestanas = [
    { valor: 'resumen' as const, etiqueta: t('pestanas.resumen') },
    { valor: 'entradas' as const, etiqueta: t('pestanas.entradas'), contador: d.entradas.length },
    { valor: 'pagos' as const, etiqueta: t('pestanas.pagos'), contador: d.pagos.length },
    { valor: 'congelamientos' as const, etiqueta: t('pestanas.congelamientos'), contador: d.congelamientos.length },
    { valor: 'historial' as const, etiqueta: t('pestanas.historial'), contador: d.eventos.length },
  ];

  const subtitulo = [t('subtituloCodigo', { codigo }), m.plan.nombre, m.cliente.documento].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={m.cliente.nombre}
        subtitulo={subtitulo}
        icono={UserCheck}
        variante="detail"
        badge={<BadgeEstadoMembresia estado={m.estadoVisual} dias={m.dias} tamano="md" />}
        cargando={carga.cargando}
        migas={[...migasBase, { etiqueta: codigo }]}
        acciones={
          <>
            {botonCongelar}
            {botonRenovar}
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={codigo} acciones={accionesMas} />
          </>
        }
        movil={{
          subtitulo: `${codigo} · ${m.plan.nombre}`,
          accion: <RowActionsMenu orientacion="horizontal" titulo={codigo} acciones={accionesMas} />,
        }}
        debajo={
          <TabBar id="membresia" etiqueta={t('pestanas.etiqueta')} pestanas={pestanas} valor={pestana} onValorChange={setPestana} />
        }
      />

      <TarjetaMovil d={d} f={f} acciones={accionesMas} botonCongelar={botonCongelar} botonRenovar={botonRenovar} />

      {d.renovacionPendiente && puedeRenovar && (
        <section
          aria-label={t('renovacionPendiente.titulo')}
          className="flex flex-col gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4 sm:flex-row sm:items-center"
        >
          <CalendarClock aria-hidden="true" className="size-5 shrink-0 text-warning-text" strokeWidth={1.5} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-sm font-semibold text-fg">{t('renovacionPendiente.titulo')}</p>
            <p className="text-sm text-fg-secondary">
              {t('renovacionPendiente.descripcion', { fecha: f.fecha(d.renovacionPendiente.generada) })}
              {d.renovacionPendiente.precio !== null && (
                <> · {t('renovacionPendiente.precio', { precio: f.moneda(d.precioRenovacion ?? d.renovacionPendiente.precio) })}</>
              )}
            </p>
          </div>
          <button type="button" className={CLASE_SECUNDARIO} onClick={() => setDialogo('renovar')}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('renovacionPendiente.accion')}
          </button>
        </section>
      )}

      <div role="tabpanel" id={idPanel('membresia', pestana)} aria-labelledby={idPestana('membresia', pestana)} className="flex flex-col gap-4">
        {pestana === 'resumen' && <PanelResumen d={d} f={f} />}
        {pestana === 'entradas' && <PanelEntradas d={d} f={f} />}
        {pestana === 'pagos' && <PanelPagos d={d} f={f} />}
        {pestana === 'congelamientos' && (
          <PanelCongelamientos
            d={d}
            f={f}
            accion={
              puedeDescongelar ? (
                <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => setDialogo('descongelar')}>
                  {t('acciones.descongelar')}
                </button>
              ) : puedeCongelar ? (
                <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => setDialogo('congelar')}>
                  {t('acciones.congelar')}
                </button>
              ) : null
            }
          />
        )}
        {pestana === 'historial' && <PanelHistorial d={d} f={f} />}
      </div>

      <DialogoCongelar abierto={dialogo === 'congelar'} onAbiertoChange={(v) => setDialogo(v ? 'congelar' : null)} detalle={d} onHecho={carga.recargar} />
      <DialogoCancelar abierto={dialogo === 'cancelar'} onAbiertoChange={(v) => setDialogo(v ? 'cancelar' : null)} detalle={d} onHecho={carga.recargar} />
      <DialogoRenovar abierto={dialogo === 'renovar'} onAbiertoChange={(v) => setDialogo(v ? 'renovar' : null)} detalle={d} />
      <Dialogo
        abierto={dialogo === 'descongelar'}
        onAbiertoChange={(v) => setDialogo(v ? 'descongelar' : null)}
        titulo={t('descongelar.titulo', { codigo })}
        descripcion={
          vigente?.estado === 'scheduled'
            ? t('descongelar.descripcionProgramado', { desde: f.dia(vigente.desde) })
            : t('descongelar.descripcionEnCurso')
        }
        icono={Play}
        ancho={440}
        primario={{ etiqueta: t('descongelar.confirmar'), onClick: descongelar, cargando: descongelando }}
      />
    </div>
  );
}

// ─── Móvil: tarjeta de estado con acciones (C7) ─────────────────────────────

function TarjetaMovil({
  d,
  f,
  acciones,
  botonCongelar,
  botonRenovar,
}: {
  d: Detalle;
  f: FormatoMembresias;
  acciones: AccionFila[];
  botonCongelar: ReactNode;
  botonRenovar: ReactNode;
}) {
  const t = useTranslations('membresias.detalle');
  const linea = useLineaVigencia(f);
  const m = d.membresia;
  const p = progresoVigencia(m.desde, m.hasta, new Date(), d.zona);
  return (
    <section aria-label={t('estadoActual')} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 lg:hidden">
      <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
        <BadgeEstadoMembresia estado={m.estadoVisual} dias={m.dias} />
        <span>
          {t('venceEl', { fecha: f.fecha(m.hasta) })} · {linea(m)}
        </span>
      </div>
      {p && <BarraProgreso p={p} />}
      <div className="flex items-center gap-2 [&>*]:flex-1">
        {botonRenovar}
        {botonCongelar}
        <RowActionsMenu orientacion="horizontal" tamano="md" titulo={m.codigo ?? `#${m.id}`} acciones={acciones} className="flex-none" />
      </div>
    </section>
  );
}

function BarraProgreso({ p }: { p: { dia: number; total: number; porcentaje: number } }) {
  const t = useTranslations('membresias.detalle');
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-fg-secondary">{t('diaDe', { dia: p.dia, total: p.total })}</span>
        <span className="font-medium tabular-nums text-fg">{p.porcentaje} %</span>
      </div>
      <div
        role="progressbar"
        aria-label={t('diaDe', { dia: p.dia, total: p.total })}
        aria-valuemin={0}
        aria-valuemax={p.total}
        aria-valuenow={p.dia}
        className="h-2 w-full overflow-hidden rounded-full bg-subtle"
      >
        <div className="h-full rounded-full bg-warning" style={{ width: `${p.porcentaje}%` }} />
      </div>
    </div>
  );
}

// ─── Resumen ────────────────────────────────────────────────────────────────

function useTextosReglas(f: FormatoMembresias) {
  const t = useTranslations('membresias.detalle.reglas');
  const td = useTranslations('membresias.duracion');
  const tb = useTranslations('membresias.cobro');
  return {
    duracion: (r: ReglasPlan, periodos = 1) => td(r.durationUnit, { n: r.durationValue * Math.max(periodos, 1) }),
    cobro: (r: ReglasPlan) => tb(r.billingMode),
    gracia: (r: ReglasPlan) => (r.graceDays > 0 ? t('graciaDias', { count: r.graceDays }) : t('sinGracia')),
    activacion: (r: ReglasPlan) =>
      r.requiresActivation
        ? r.activationWindowDays
          ? t('activacionPrimeraEntradaVentana', { count: r.activationWindowDays })
          : t('activacionPrimeraEntrada')
        : t('activacionAlPagar'),
    congelar: (r: ReglasPlan) =>
      !r.freezeAllowed
        ? t('noCongela')
        : t('congela', {
            veces: r.freezeMaxTimes === null ? t('sinTope') : t('veces', { count: r.freezeMaxTimes }),
            dias: r.freezeMaxDays === null ? t('sinTope') : t('dias', { count: r.freezeMaxDays }),
          }),
    sedes: (r: ReglasPlan) => (r.allowedBranchIds ? t('sedes', { count: r.allowedBranchIds.length }) : t('todasLasSedes')),
    horario: (r: ReglasPlan) => {
      const s = r.accessSchedule;
      if (!s || (!s.dias?.length && !s.desde && !s.hasta)) return t('horarioLibre');
      const dias = diasSemana(s.dias, f.locale).join(', ');
      const horas = s.desde && s.hasta ? `${s.desde}–${s.hasta}` : '';
      return [dias, horas].filter(Boolean).join(' · ') || t('horarioLibre');
    },
    tope: (r: ReglasPlan) => (r.dailyCheckinLimit ? t('topeDiario', { count: r.dailyCheckinLimit }) : t('sinTopeDiario')),
  };
}

function PanelResumen({ d, f }: { d: Detalle; f: FormatoMembresias }) {
  const t = useTranslations('membresias.detalle');
  const to = useTranslations('membresias.origen');
  const linea = useLineaVigencia(f);
  const reglas = useTextosReglas(f);
  const m = d.membresia;
  const r = m.reglas;
  const p = progresoVigencia(m.desde, m.hasta, new Date(), d.zona);
  const hoy = todayInTz(d.zona);
  const entradasMes = d.entradas.filter((e) => e.permitido && f.diaDe(e.fecha).slice(0, 7) === hoy.slice(0, 7)).length;
  const ultimaEntrada = d.entradas.find((e) => e.permitido);
  const pagado = d.pagos.reduce((s, x) => s + x.total, 0);
  const finGracia = m.graceUntil
    ? f.fecha(m.graceUntil)
    : r.graceDays > 0
      ? f.dia(addPlainDays(f.diaDe(m.hasta), r.graceDays))
      : null;
  const factura = d.pagos.find((x) => x.factura && x.factura.id === m.invoiceId)?.factura ?? d.pagos.find((x) => x.factura)?.factura ?? null;

  return (
    <>
      <KpiStrip etiqueta={t('kpis.etiqueta')}>
        <StatCard
          etiqueta={t('kpis.vence')}
          valor={f.fecha(m.hasta)}
          detalle={linea(m)}
          tono={m.estadoVisual === 'activa' && (m.dias ?? 99) <= 7 ? 'advertencia' : m.estadoVisual === 'vencida' ? 'peligro' : 'neutro'}
          icono={CalendarClock}
        />
        <StatCard
          etiqueta={t('kpis.congelamientos')}
          valor={
            r.freezeAllowed
              ? r.freezeMaxTimes === null
                ? f.entero(d.congelamientoUsado.veces)
                : t('kpis.congelamientosValor', { usadas: d.congelamientoUsado.veces, tope: r.freezeMaxTimes })
              : '—'
          }
          detalle={
            r.freezeAllowed
              ? r.freezeMaxDays === null
                ? t('kpis.diasUsadosSinTope', { count: d.congelamientoUsado.dias })
                : t('kpis.diasUsados', { usados: d.congelamientoUsado.dias, tope: r.freezeMaxDays })
              : t('reglas.noCongela')
          }
          icono={Pause}
        />
        <StatCard
          etiqueta={t('kpis.entradasMes')}
          valor={f.entero(entradasMes)}
          detalle={ultimaEntrada ? t('kpis.ultimaEntrada', { fecha: f.fechaHora(ultimaEntrada.fecha) }) : t('kpis.sinEntradas')}
          icono={DoorOpen}
        />
        <StatCard
          etiqueta={t('kpis.pagado')}
          valor={f.moneda(pagado)}
          detalle={t('kpis.nPagos', { count: d.pagos.length })}
          icono={CircleDollarSign}
        />
      </KpiStrip>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Tarjeta titulo={t('vigencia.titulo')} icono={CalendarClock}>
            <div className="flex flex-col gap-4">
              {p && <BarraProgreso p={p} />}
              <ListaDatos>
                <FilaDato etiqueta={t('vigencia.estado')} valor={<BadgeEstadoMembresia estado={m.estadoVisual} dias={m.dias} />} />
                <FilaDato etiqueta={t('vigencia.inicio')} valor={m.desde ? f.fecha(m.desde) : t('vigencia.alPagar')} />
                {m.activadaEn && <FilaDato etiqueta={t('vigencia.activada')} valor={f.fechaHora(m.activadaEn)} />}
                <FilaDato etiqueta={t('vigencia.periodoPagado')} valor={reglas.duracion(r, m.periodos)} />
                {d.congelamientoUsado.dias > 0 && (
                  <FilaDato etiqueta={t('vigencia.diasCongelados')} valor={t('vigencia.masDias', { count: d.congelamientoUsado.dias })} />
                )}
                <FilaDato etiqueta={t('vigencia.vence')} valor={f.fecha(m.hasta)} tono="fuerte" />
                <FilaDato etiqueta={t('vigencia.gracia')} valor={finGracia ? t('vigencia.graciaHasta', { fecha: finGracia }) : reglas.gracia(r)} />
                <FilaDato etiqueta={t('vigencia.origen')} valor={m.origen ? to(m.origen) : '—'} />
                {m.estado === 'cancelled' && (
                  <FilaDato
                    etiqueta={t('vigencia.cancelada')}
                    valor={m.canceladaEn ? f.fechaHora(m.canceladaEn) : '—'}
                    descripcion={m.motivoCancelacion ?? undefined}
                    tono="peligro"
                  />
                )}
              </ListaDatos>
            </div>
          </Tarjeta>

          <Tarjeta titulo={t('reglas.titulo')} descripcion={t('reglas.descripcion')} icono={Package}>
            <ListaDatos>
              <FilaDato etiqueta={t('reglas.duracion')} valor={reglas.duracion(r)} />
              <FilaDato etiqueta={t('reglas.cobro')} valor={reglas.cobro(r)} />
              <FilaDato etiqueta={t('reglas.gracia')} valor={reglas.gracia(r)} />
              <FilaDato etiqueta={t('reglas.activacion')} valor={reglas.activacion(r)} />
              <FilaDato etiqueta={t('reglas.congelar')} valor={reglas.congelar(r)} />
            </ListaDatos>
          </Tarjeta>
        </div>

        <div className="flex flex-col gap-4">
          <Tarjeta
            titulo={t('miembro.titulo')}
            icono={User}
            accion={
              m.cliente.id ? (
                <Link href={`/app/clientes/${m.cliente.id}`} className="text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  {t('miembro.verFicha')}
                </Link>
              ) : undefined
            }
          >
            <div className="flex items-center gap-3">
              <AvatarIniciales nombre={m.cliente.nombre} src={m.cliente.avatarUrl} tamano="md" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-fg">{m.cliente.nombre}</span>
                <span className="truncate text-xs text-fg-secondary tabular-nums">
                  {[m.cliente.documento, m.cliente.telefono].filter(Boolean).join(' · ') || '—'}
                </span>
                {m.cliente.email && <span className="truncate text-xs text-fg-secondary">{m.cliente.email}</span>}
              </div>
            </div>
            {m.cliente.id && (
              <Link
                href={rutaListadoCliente(m.cliente.id)}
                className="mt-3 inline-flex text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {t('miembro.otrasMembresias')}
              </Link>
            )}
          </Tarjeta>

          <Tarjeta titulo={t('origen.titulo')} icono={Link2}>
            <div className="flex flex-col gap-2">
              {m.saleId ? (
                <RelatedLinkCard icono={Receipt} etiqueta={t('origen.venta')} valor={m.origen ? to(m.origen) : '—'} href={`/app/pos/ventas/${m.saleId}`} textoAccion={t('origen.ver')} />
              ) : (
                <RelatedLinkCard icono={Receipt} etiqueta={t('origen.venta')} valor={t('origen.sinVenta')} />
              )}
              {m.invoiceId || factura ? (
                <RelatedLinkCard
                  icono={FileText}
                  etiqueta={t('origen.factura')}
                  valor={factura?.numero ?? '—'}
                  href={`/app/finanzas/facturas-venta/${m.invoiceId ?? factura?.id}`}
                  textoAccion={t('origen.ver')}
                />
              ) : null}
              {m.plan.id > 0 && (
                <RelatedLinkCard icono={Package} etiqueta={t('origen.plan')} valor={m.plan.nombre} href={`${RUTA_MEMBRESIAS}/planes/${m.plan.id}`} textoAccion={t('origen.ver')} />
              )}
            </div>
          </Tarjeta>

          <Tarjeta titulo={t('acceso.titulo')} icono={KeyRound}>
            <ListaDatos>
              <FilaDato etiqueta={t('acceso.codigo')} valor={<span className="font-mono">{m.codigo ?? '—'}</span>} />
              <FilaDato etiqueta={t('acceso.sedes')} valor={reglas.sedes(r)} />
              <FilaDato etiqueta={t('acceso.horario')} valor={reglas.horario(r)} />
              <FilaDato etiqueta={t('acceso.limite')} valor={reglas.tope(r)} />
            </ListaDatos>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

// ─── Listas de las pestañas ─────────────────────────────────────────────────

function Fila({ icono: Icono, children, derecha }: { icono: LucideIcon; children: ReactNode; derecha?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-lg bg-subtle px-3 py-2.5">
      <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">{children}</div>
      {derecha && <div className="shrink-0">{derecha}</div>}
    </li>
  );
}

function PanelEntradas({ d, f }: { d: Detalle; f: FormatoMembresias }) {
  const t = useTranslations('membresias.detalle');
  if (d.entradas.length === 0) {
    return <EmptyState compacto icono={DoorOpen} titulo={t('entradas.vacio.titulo')} descripcion={t('entradas.vacio.descripcion')} />;
  }
  return (
    <Tarjeta titulo={t('entradas.titulo')} icono={DoorOpen} descripcion={t('entradas.descripcion')}>
      <ul className="flex flex-col gap-2">
        {d.entradas.map((e) => (
          <Fila
            key={e.id}
            icono={DoorOpen}
            derecha={
              <Badge tono={e.permitido ? 'exito' : 'peligro'} tamano="sm">
                {e.permitido ? t('entradas.permitida') : t('entradas.rechazada')}
              </Badge>
            }
          >
            <span className="text-fg tabular-nums">{f.fechaHora(e.fecha)}</span>
            <span className="text-xs text-fg-secondary">
              {[e.sucursal, t(`metodos.${metodoEntrada(e.metodo)}`), e.permitido ? null : t(`motivosRechazo.${motivoRechazo(e.motivo)}`)]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </Fila>
        ))}
      </ul>
    </Tarjeta>
  );
}

function PanelPagos({ d, f }: { d: Detalle; f: FormatoMembresias }) {
  const t = useTranslations('membresias.detalle');
  if (d.pagos.length === 0) {
    return <EmptyState compacto icono={CircleDollarSign} titulo={t('pagos.vacio.titulo')} descripcion={t('pagos.vacio.descripcion')} />;
  }
  const claseEnlace = 'font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
  return (
    <Tarjeta titulo={t('pagos.titulo')} icono={CircleDollarSign}>
      <ul className="flex flex-col gap-2">
        {d.pagos.map((p) => (
          <Fila key={p.saleItemId} icono={Receipt} derecha={p.estadoVenta ? <StatusBadge estado={p.estadoVenta} tamano="sm" /> : undefined}>
            <span className="text-fg">
              {[f.fecha(p.fecha), t(`pagos.tipo.${p.tipo}`), f.moneda(p.total)].filter(Boolean).join(' · ')}
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-secondary">
              <Link href={`/app/pos/ventas/${p.saleId}`} className={claseEnlace}>
                {t('pagos.verVenta')}
              </Link>
              {p.factura && (
                <Link href={`/app/finanzas/facturas-venta/${p.factura.id}`} className={claseEnlace}>
                  {t('pagos.factura', { numero: p.factura.numero })}
                </Link>
              )}
              {p.factura && p.factura.saldo > 0.009 && (
                <span className="text-warning-text">{t('pagos.saldo', { saldo: f.moneda(p.factura.saldo) })}</span>
              )}
              {p.cantidad > 1 && <span>{t('pagos.periodos', { count: p.cantidad })}</span>}
            </span>
          </Fila>
        ))}
      </ul>
    </Tarjeta>
  );
}

const TONO_CONGELAMIENTO = { scheduled: 'informacion', active: 'informacion', ended: 'neutro', cancelled: 'neutro' } as const;

function PanelCongelamientos({ d, f, accion }: { d: Detalle; f: FormatoMembresias; accion: ReactNode }) {
  const t = useTranslations('membresias.detalle');
  const r = d.membresia.reglas;
  const pie = r.freezeAllowed
    ? t('congelamientos.usados', {
        veces: d.congelamientoUsado.veces,
        topeVeces: r.freezeMaxTimes ?? '∞',
        dias: d.congelamientoUsado.dias,
        topeDias: r.freezeMaxDays ?? '∞',
      })
    : t('reglas.noCongela');
  return (
    <Tarjeta titulo={t('congelamientos.titulo')} icono={Pause} accion={accion ?? undefined} pie={<span className="text-sm text-fg-secondary">{pie}</span>}>
      {d.congelamientos.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('congelamientos.vacio')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {d.congelamientos.map((c) => (
            <Fila
              key={c.id}
              icono={Pause}
              derecha={
                <Badge tono={TONO_CONGELAMIENTO[c.estado] ?? 'neutro'} tamano="sm">
                  {t(`congelamientos.estados.${c.estado}`)}
                </Badge>
              }
            >
              <span className="text-fg">
                {`${f.diaCorto(c.desde)} – ${c.hasta ? f.dia(c.hasta) : '…'}`} · {t('congelamientos.dias', { count: c.dias })}
              </span>
              {c.motivo && <span className="text-xs text-fg-secondary">{t('congelamientos.motivo', { motivo: c.motivo })}</span>}
            </Fila>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function PanelHistorial({ d, f }: { d: Detalle; f: FormatoMembresias }) {
  const t = useTranslations('membresias.detalle');
  if (d.eventos.length === 0) {
    return <EmptyState compacto icono={History} titulo={t('historial.vacio')} />;
  }
  return (
    <Tarjeta titulo={t('historial.titulo')} icono={History}>
      <ol className="flex flex-col">
        {d.eventos.map((e) => {
          const tipo = tipoEvento(e.tipo);
          const dias = typeof e.metadata.dias === 'number' ? e.metadata.dias : null;
          const motivo = typeof e.metadata.motivo === 'string' && e.metadata.motivo.trim() ? e.metadata.motivo : null;
          return (
            <li key={e.id} className="flex items-start gap-3 border-b border-line py-2.5 text-sm last:border-b-0">
              <span aria-hidden="true" className={cn('mt-1.5 size-2 shrink-0 rounded-full', tipo === 'access_denied' || tipo === 'cancelled' ? 'bg-danger' : 'bg-brand')} />
              <span className="w-36 shrink-0 text-fg-secondary tabular-nums">{f.fechaHora(e.fecha)}</span>
              <span className="min-w-0 flex-1 text-fg">
                {t(`eventos.${tipo}`)}
                {dias !== null && ` · ${t('historial.dias', { count: dias })}`}
                {motivo && <span className="block text-xs text-fg-secondary">{motivo}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </Tarjeta>
  );
}
