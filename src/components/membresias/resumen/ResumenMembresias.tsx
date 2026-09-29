'use client';

/**
 * Membresías — Resumen (Figma E1 987:7301, móvil E2 987:8102). Cifras del día, lo que pide
 * atención (en gracia, por vencer, pendientes de pago, planes sin producto), próximos
 * vencimientos, desglose por plan, actividad reciente y accesos rápidos. Datos:
 * `GET /api/membresias/resumen` (la organización y la zona salen de la sesión).
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  BarChart3,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  DoorOpen,
  History,
  PackagePlus,
  ScanLine,
  ShoppingCart,
  TriangleAlert,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState, KpiCompacto, KpiStrip, PageHeader, StatCard, Tarjeta } from '@/components/kit';
import { apiMembresias } from '@/lib/services/membresias/clienteMembresias';
import type { MembresiaFila, ResumenMembresias as Resumen } from '@/lib/services/membresias/tipos';
import { todayInTz } from '@/lib/utils/dateCore';
import { cn } from '@/utils/Utils';
import { BadgeEstadoMembresia } from '../comun/BadgeEstadoMembresia';
import { EsqueletoPantalla, EstadoPantalla } from '../comun/EstadoPantalla';
import { useCargaMembresias } from '../comun/useCargaMembresias';
import { useFormatoMembresias, type FormatoMembresias } from '../comun/useFormatoMembresias';
import { RUTA_MEMBRESIAS, rutaDetalle, tipoEvento } from '../logica';

const LISTADO = `${RUTA_MEMBRESIAS}/membresias`;
const CLASE_PRIMARIO =
  'inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';
const CLASE_SECUNDARIO =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
const CLASE_ENLACE = 'text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export default function ResumenMembresias() {
  const t = useTranslations('membresias.resumen');
  const tc = useTranslations('membresias.comun');
  const carga = useCargaMembresias('resumen', () => apiMembresias.resumen());
  const r = carga.datos;
  const f = useFormatoMembresias(r?.zona);
  const hoy = r ? f.dia(todayInTz(r.zona)) : '';

  const cabecera = (
    <PageHeader
      titulo={tc('modulo')}
      subtitulo={r ? t('subtitulo', { fecha: hoy }) : t('cargando')}
      icono={UserCheck}
      cargando={carga.cargando}
      migas={[{ etiqueta: tc('modulo'), href: RUTA_MEMBRESIAS }, { etiqueta: t('titulo') }]}
      acciones={
        <>
          <Link href={`${RUTA_MEMBRESIAS}/check-in`} className={CLASE_SECUNDARIO}>
            <ScanLine aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {tc('accesos.checkin')}
          </Link>
          <Link href="/app/pos" className={CLASE_PRIMARIO}>
            <ShoppingCart aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {tc('venderMembresia')}
          </Link>
        </>
      }
      movil={{
        subtitulo: t('subtituloMovil'),
        accion: (
          <Link
            href="/app/pos"
            aria-label={tc('venderMembresia')}
            className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ShoppingCart aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </Link>
        ),
      }}
    />
  );

  if (!r) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        {cabecera}
        {carga.error ? <EstadoPantalla error={carga.error} onReintentar={carga.recargar} tituloError={t('error')} /> : <EsqueletoPantalla bloques={3} />}
      </div>
    );
  }

  const c = r.conteo;
  const sinDatos = c.total === 0;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      <KpiCompacto
        className="lg:hidden"
        etiqueta={t('kpis.etiqueta')}
        cifras={[
          { id: 'activas', etiqueta: t('kpis.activas'), valor: f.entero(c.activa), href: `${LISTADO}?estado=activa` },
          { id: 'gracia', etiqueta: t('kpis.enGracia'), valor: f.entero(c.en_gracia), tono: c.en_gracia > 0 ? 'advertencia' : undefined, href: `${LISTADO}?estado=en_gracia` },
          { id: 'hoy', etiqueta: t('kpis.entradasHoyCorto'), valor: f.entero(r.entradasHoy) },
        ]}
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')} columnas={3} className="hidden lg:grid">
        <StatCard etiqueta={t('kpis.activas')} icono={UserCheck} valor={f.entero(c.activa)} tono="exito" detalle={t('kpis.totalDetalle', { count: c.total })} href={`${LISTADO}?estado=activa`} />
        <StatCard
          etiqueta={t('kpis.enGracia')}
          icono={TriangleAlert}
          valor={f.entero(c.en_gracia)}
          tono={c.en_gracia > 0 ? 'advertencia' : 'neutro'}
          detalle={t('kpis.enGraciaDetalle')}
          href={`${LISTADO}?estado=en_gracia`}
        />
        <StatCard
          etiqueta={t('kpis.porVencer')}
          icono={CalendarClock}
          valor={f.entero(c.porVencer)}
          tono={c.porVencer > 0 ? 'advertencia' : 'neutro'}
          detalle={t('kpis.porVencerDetalle')}
          href={`${LISTADO}?estado=por_vencer`}
        />
        <StatCard etiqueta={t('kpis.nuevasMes')} icono={UserPlus} valor={f.entero(r.nuevasMes)} detalle={t('kpis.nuevasMesDetalle')} />
        <StatCard etiqueta={t('kpis.ingresosMes')} icono={CircleDollarSign} valor={f.moneda(r.ingresosMes)} detalle={t('kpis.ingresosMesDetalle')} href={`${RUTA_MEMBRESIAS}/pagos`} />
        <StatCard etiqueta={t('kpis.entradasHoy')} icono={DoorOpen} valor={f.entero(r.entradasHoy)} detalle={t('kpis.entradasHoyDetalle')} href={`${RUTA_MEMBRESIAS}/check-in`} />
      </KpiStrip>

      {sinDatos && r.planesSinProducto === 0 ? (
        <EmptyState
          titulo={t('vacio.titulo')}
          descripcion={t('vacio.descripcion')}
          icono={UserCheck}
          accion={{ etiqueta: t('vacio.irAlPos'), href: '/app/pos', icono: ShoppingCart }}
          accionSecundaria={{ etiqueta: t('vacio.crearProducto'), href: '/app/inventario/productos/nuevo', icono: PackagePlus }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <RequiereAtencion r={r} f={f} />
            <ListaMembresias
              titulo={t('porVencer.titulo')}
              icono={CalendarClock}
              filas={r.porVencer}
              vacio={t('porVencer.vacio')}
              verTodos={`${LISTADO}?estado=por_vencer`}
              f={f}
            />
            <ListaMembresias
              titulo={t('enGracia.titulo')}
              icono={TriangleAlert}
              filas={r.enGracia}
              vacio={t('enGracia.vacio')}
              verTodos={`${LISTADO}?estado=en_gracia`}
              f={f}
            />
          </div>
          <div className="flex flex-col gap-4">
            <PorPlan r={r} f={f} />
            <Actividad r={r} f={f} />
            <AccesosRapidos />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Requiere atención ──────────────────────────────────────────────────────

interface ItemAtencion {
  id: string;
  icono: LucideIcon;
  tono: 'peligro' | 'advertencia' | 'informacion';
  titulo: string;
  descripcion: string;
  accion: string;
  href: string;
}

const TONO_ICONO: Record<ItemAtencion['tono'], string> = {
  peligro: 'bg-danger-subtle text-danger-text',
  advertencia: 'bg-warning-subtle text-warning-text',
  informacion: 'bg-info-subtle text-info-text',
};

function RequiereAtencion({ r, f }: { r: Resumen; f: FormatoMembresias }) {
  const t = useTranslations('membresias.resumen.atencion');
  const c = r.conteo;
  const items: ItemAtencion[] = [];
  if (c.en_gracia > 0) {
    items.push({
      id: 'gracia',
      icono: TriangleAlert,
      tono: 'peligro',
      titulo: t('enGracia.titulo', { count: c.en_gracia, n: f.entero(c.en_gracia) }),
      descripcion: t('enGracia.descripcion'),
      accion: t('enGracia.accion'),
      href: `${LISTADO}?estado=en_gracia`,
    });
  }
  if (c.porVencer > 0) {
    items.push({
      id: 'vencer',
      icono: CalendarClock,
      tono: 'advertencia',
      titulo: t('porVencer.titulo', { count: c.porVencer, n: f.entero(c.porVencer) }),
      descripcion: t('porVencer.descripcion'),
      accion: t('porVencer.accion'),
      href: `${LISTADO}?estado=por_vencer`,
    });
  }
  if (c.pendiente > 0) {
    items.push({
      id: 'pendientes',
      icono: CircleDollarSign,
      tono: 'advertencia',
      titulo: t('pendientes.titulo', { count: c.pendiente, n: f.entero(c.pendiente) }),
      descripcion: t('pendientes.descripcion'),
      accion: t('pendientes.accion'),
      href: `${LISTADO}?estado=pendiente`,
    });
  }
  if (r.planesSinProducto > 0) {
    items.push({
      id: 'planes',
      icono: PackagePlus,
      tono: 'informacion',
      titulo: t('planesSinProducto.titulo', { count: r.planesSinProducto }),
      descripcion: t('planesSinProducto.descripcion'),
      accion: t('planesSinProducto.accion'),
      href: `${RUTA_MEMBRESIAS}/planes`,
    });
  }
  return (
    <Tarjeta titulo={t('titulo')} icono={TriangleAlert}>
      {items.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('nada')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((i) => {
            const Icono = i.icono;
            return (
              <li key={i.id} className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', TONO_ICONO[i.tono])}>
                    <Icono className="size-4" strokeWidth={1.5} />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium text-fg">{i.titulo}</span>
                    <span className="text-sm text-fg-secondary">{i.descripcion}</span>
                  </div>
                </div>
                <Link href={i.href} className={cn(CLASE_SECUNDARIO, 'h-8 self-end px-3 sm:self-auto')}>
                  {i.accion}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}

// ─── Listas «Por vencer» y «En gracia» ──────────────────────────────────────

function ListaMembresias({
  titulo,
  icono,
  filas,
  vacio,
  verTodos,
  f,
}: {
  titulo: string;
  icono: LucideIcon;
  filas: MembresiaFila[];
  vacio: string;
  verTodos: string;
  f: FormatoMembresias;
}) {
  const t = useTranslations('membresias.resumen');
  return (
    <Tarjeta
      titulo={titulo}
      icono={icono}
      accion={
        <Link href={verTodos} className={CLASE_ENLACE}>
          {t('verTodos')}
        </Link>
      }
    >
      {filas.length === 0 ? (
        <p className="text-sm text-fg-secondary">{vacio}</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {filas.map((m) => (
            <li key={m.id}>
              <Link
                href={rutaDetalle(m.id)}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-fg">{m.cliente.nombre}</span>
                  <span className="truncate text-xs text-fg-secondary">{m.plan.nombre}</span>
                </span>
                <span className="shrink-0 text-sm text-fg-secondary tabular-nums">
                  {m.estadoVisual === 'en_gracia' ? t('vencio', { fecha: f.fechaCorta(m.hasta) }) : f.fechaCorta(m.hasta)}
                </span>
                <BadgeEstadoMembresia estado={m.estadoVisual} dias={m.dias} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

// ─── Por plan (barras) ──────────────────────────────────────────────────────

function PorPlan({ r, f }: { r: Resumen; f: FormatoMembresias }) {
  const t = useTranslations('membresias.resumen.porPlan');
  const max = Math.max(...r.porPlan.map((p) => p.activas), 1);
  return (
    <Tarjeta
      titulo={t('titulo')}
      icono={BarChart3}
      accion={
        <Link href={`${RUTA_MEMBRESIAS}/planes`} className={CLASE_ENLACE}>
          {t('verPlanes')}
        </Link>
      }
    >
      {r.porPlan.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('vacio')}</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t('descripcion')}>
          {r.porPlan.map((p) => (
            <li key={p.plan.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-fg">{p.plan.nombre}</span>
                <span className="shrink-0 font-medium tabular-nums text-fg">{t('activas', { count: p.activas, n: f.entero(p.activas) })}</span>
              </div>
              <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-subtle">
                <div className="h-full rounded-full bg-brand-action" style={{ width: `${Math.round((p.activas / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

// ─── Actividad reciente ─────────────────────────────────────────────────────

function Actividad({ r, f }: { r: Resumen; f: FormatoMembresias }) {
  const t = useTranslations('membresias.resumen.actividad');
  const te = useTranslations('membresias.detalle.eventos');
  return (
    <Tarjeta titulo={t('titulo')} icono={History}>
      {r.actividad.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('vacio')}</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {r.actividad.map((e) => (
            <li key={e.id}>
              <Link
                href={rutaDetalle(e.membresiaId)}
                className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-fg">{e.cliente ?? t('sinCliente')}</span>
                  <span className="truncate text-xs text-fg-secondary">{te(tipoEvento(e.tipo))}</span>
                </span>
                <span className="shrink-0 text-xs text-fg-secondary tabular-nums">{f.fechaCorta(e.fecha)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

// ─── Accesos rápidos ────────────────────────────────────────────────────────

function AccesosRapidos() {
  const t = useTranslations('membresias.comun.accesos');
  const accesos: Array<{ href: string; icono: LucideIcon; etiqueta: string }> = [
    { href: '/app/pos', icono: ShoppingCart, etiqueta: t('vender') },
    { href: `${RUTA_MEMBRESIAS}/check-in`, icono: ScanLine, etiqueta: t('checkin') },
    { href: `${RUTA_MEMBRESIAS}/planes`, icono: PackagePlus, etiqueta: t('planes') },
    { href: `${RUTA_MEMBRESIAS}/miembros`, icono: UserCheck, etiqueta: t('miembros') },
    { href: `${RUTA_MEMBRESIAS}/pagos`, icono: CircleDollarSign, etiqueta: t('pagos') },
  ];
  return (
    <Tarjeta titulo={t('titulo')}>
      <nav aria-label={t('titulo')}>
        <ul className="-mx-2 flex flex-col">
          {accesos.map((a) => {
            const Icono = a.icono;
            return (
              <li key={a.href}>
                <Link
                  href={a.href}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Icono aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
                  <span className="flex-1">{a.etiqueta}</span>
                  <ChevronRight aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </Tarjeta>
  );
}
