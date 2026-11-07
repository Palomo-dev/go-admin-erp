'use client';

/**
 * Salud contable (Figma 987:618210 pendientes · 987:618932 descuadres ·
 * 987:619696 huérfanos · 987:620398 estructura · 987:621082 vacío feliz ·
 * 987:621726 sin permiso; móvil 989:76697 y 989:76959). Decisión 3 del dueño:
 * la bandeja de «Pendientes contables» es su primera pestaña y
 * `/contabilidad/pendientes` redirige aquí.
 *
 * Ningún botón corrige datos contables desde aquí: cada fila lleva a donde se
 * corrige (asiento, documento, regla, cuenta). Lo que no se pudo leer nunca se
 * muestra como cero.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import {
  AvisoTonal,
  ChipDocumento,
  DataTable,
  EmptyState,
  KpiStrip,
  PageHeader,
  StatCard,
  StatusBadge,
  TabBar,
  Tarjeta,
  clasesBoton,
  idPanel,
  idPestana,
  useOpcionUrl,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import {
  PESTANAS_SALUD,
  saludSinProblemas,
  type CruceSalud,
  type DescuadreSalud,
  type HuerfanoSalud,
  type PestanaSalud,
} from '@/lib/finanzas/contabilidad/saludLogica';
import { documentoDeOrigen, numeroCorto } from '@/lib/finanzas/contabilidad/origenAsiento';
import { PendientesContablesPage } from '../pendientes/PendientesContablesPage';
import { EnlaceAsiento, EtiquetaOrigen } from '../piezas';
import { SaludContableService, type EstructuraSalud } from './SaludContableService';

type Lectura<T> = { estado: 'cargando' } | { estado: 'listo'; datos: T } | { estado: 'error' };

const RUTA_DOCUMENTO: Record<DescuadreSalud['tipo'], string> = {
  factura: '/app/finanzas/facturas-venta',
  facturaCompra: '/app/finanzas/facturas-compra',
};

export function SaludContablePage() {
  const t = useTranslations('finanzasContabilidadR3.salud');
  const permisos = usePermisosFinanzas();
  const { formatear } = useMonedaOrganizacion();
  const { formatDate, formatTime } = useFormatDate();
  const [pestana, setPestana] = useOpcionUrl<PestanaSalud>('pestana', PESTANAS_SALUD, 'pendientes');

  const [pendientes, setPendientes] = useState<Lectura<number>>({ estado: 'cargando' });
  const [balance, setBalance] = useState<Lectura<{ cuadra: boolean; diferencia: number }>>({ estado: 'cargando' });
  // `null` en datos = la revisión aún no está activada en la base.
  const [cruce, setCruce] = useState<Lectura<CruceSalud | null>>({ estado: 'cargando' });
  const [estructura, setEstructura] = useState<Lectura<EstructuraSalud>>({ estado: 'cargando' });
  const [revisadoEn, setRevisadoEn] = useState<Date | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const turno = useRef(0);

  const cargar = useCallback(async () => {
    const mio = ++turno.current;
    setPendientes({ estado: 'cargando' });
    setBalance({ estado: 'cargando' });
    setCruce({ estado: 'cargando' });
    setEstructura({ estado: 'cargando' });
    const leer = <T,>(promesa: Promise<T>, fijar: (l: Lectura<T>) => void, nombre: string) =>
      promesa
        .then((datos) => mio === turno.current && fijar({ estado: 'listo', datos }))
        .catch((error) => {
          console.error(`Salud contable: no se pudo leer ${nombre}:`, error);
          if (mio === turno.current) fijar({ estado: 'error' });
        });
    await Promise.all([
      leer(SaludContableService.pendientes(), setPendientes, 'los pendientes'),
      leer(SaludContableService.balance(), setBalance, 'el balance'),
      leer(SaludContableService.cruce(), setCruce, 'descuadres y huérfanos'),
      leer(SaludContableService.estructura(), setEstructura, 'la estructura'),
    ]);
    if (mio === turno.current) setRevisadoEn(new Date());
  }, []);

  useEffect(() => {
    if (permisos.cargando || !permisos.ver) return;
    void cargar();
  }, [cargar, permisos.cargando, permisos.ver]);

  const nPendientes = pendientes.estado === 'listo' ? pendientes.datos : null;
  const nDescuadres = cruce.estado === 'listo' && cruce.datos ? cruce.datos.totalDescuadres : null;
  const nHuerfanos = cruce.estado === 'listo' && cruce.datos ? cruce.datos.totalHuerfanos : null;
  const nEstructura = estructura.estado === 'listo' ? estructura.datos.agrupadoras.length + new Set(estructura.datos.reglas.map((r) => r.regla_id)).size : null;
  const todoEnOrden =
    balance.estado === 'listo' && balance.datos.cuadra && saludSinProblemas([nPendientes, nDescuadres, nHuerfanos, nEstructura]);

  const cifra = (l: Lectura<unknown>, n: number | null, inactiva = false) =>
    l.estado === 'cargando' ? '' : inactiva ? '—' : n === null ? '—' : n;

  const cruceInactivo = cruce.estado === 'listo' && cruce.datos === null;

  if (!permisos.cargando && !permisos.ver) {
    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <Cabecera />
        <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Cabecera
        subtitulo={revisadoEn ? t('subtituloRevisado', { hora: formatTime(revisadoEn) }) : t('subtitulo')}
        acciones={
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => {
            setVuelta((v) => v + 1);
            void cargar();
          }}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('actualizar')}
          </button>
        }
      />

      <KpiStrip etiqueta={t('kpis.resumen')}>
        <StatCard
          etiqueta={t('kpis.balance')}
          valor={balance.estado === 'listo' ? (balance.datos.cuadra ? t('kpis.cuadra') : t('kpis.noCuadra')) : balance.estado === 'error' ? '—' : ''}
          detalle={balance.estado === 'listo' ? (balance.datos.cuadra ? t('kpis.cuadraDetalle') : t('kpis.diferencia', { valor: formatear(Math.abs(balance.datos.diferencia)) })) : undefined}
          tono={balance.estado === 'listo' ? (balance.datos.cuadra ? 'exito' : 'peligro') : undefined}
          cargando={balance.estado === 'cargando'}
        />
        <StatCard
          etiqueta={t('pestanas.pendientes')}
          valor={cifra(pendientes, nPendientes)}
          tono={nPendientes ? 'peligro' : undefined}
          cargando={pendientes.estado === 'cargando'}
          onClick={() => setPestana('pendientes')}
        />
        <StatCard
          etiqueta={t('pestanas.descuadres')}
          valor={cifra(cruce, nDescuadres, cruceInactivo)}
          detalle={cruceInactivo ? t('inactivo.corto') : t('kpis.descuadresDetalle')}
          tono={nDescuadres ? 'advertencia' : undefined}
          cargando={cruce.estado === 'cargando'}
          onClick={() => setPestana('descuadres')}
        />
        <StatCard
          etiqueta={t('pestanas.huerfanos')}
          valor={cifra(cruce, nHuerfanos, cruceInactivo)}
          detalle={cruceInactivo ? t('inactivo.corto') : t('kpis.huerfanosDetalle')}
          cargando={cruce.estado === 'cargando'}
          onClick={() => setPestana('huerfanos')}
        />
      </KpiStrip>

      {todoEnOrden && <AvisoTonal tono="exito" titulo={t('enOrden.titulo')} descripcion={t('enOrden.descripcion')} />}
      {balance.estado === 'listo' && !balance.datos.cuadra && (
        <AvisoTonal
          tono="peligro"
          rol="alert"
          titulo={t('balanceMal.titulo')}
          descripcion={t('balanceMal.descripcion', { valor: formatear(Math.abs(balance.datos.diferencia)) })}
        />
      )}

      <TabBar<PestanaSalud>
        id="salud"
        etiqueta={t('titulo')}
        valor={pestana}
        onValorChange={setPestana}
        pestanas={PESTANAS_SALUD.map((p) => ({
          valor: p,
          etiqueta: t(`pestanas.${p}`),
          contador:
            p === 'pendientes' ? nPendientes ?? undefined : p === 'descuadres' ? nDescuadres ?? undefined : p === 'huerfanos' ? nHuerfanos ?? undefined : nEstructura ?? undefined,
        }))}
      />

      <div role="tabpanel" id={idPanel('salud', pestana)} aria-labelledby={idPestana('salud', pestana)}>
        {pestana === 'pendientes' && <PendientesContablesPage key={vuelta} incrustada />}

        {pestana === 'descuadres' && (
          <PanelCruce lectura={cruce} onReintentar={() => void cargar()}>
            {(datos) => (
              <TablaDescuadres filas={datos.descuadres} total={datos.totalDescuadres} formatear={formatear} />
            )}
          </PanelCruce>
        )}

        {pestana === 'huerfanos' && (
          <PanelCruce lectura={cruce} onReintentar={() => void cargar()}>
            {(datos) => <TablaHuerfanos filas={datos.huerfanos} total={datos.totalHuerfanos} formatear={formatear} formatDate={formatDate} />}
          </PanelCruce>
        )}

        {pestana === 'estructura' && (
          <PanelEstructura lectura={estructura} formatear={formatear} onReintentar={() => void cargar()} />
        )}
      </div>

    </div>
  );
}

function Cabecera({ subtitulo, acciones }: { subtitulo?: string; acciones?: React.ReactNode }) {
  const t = useTranslations('finanzasContabilidadR3.salud');
  const tc = useTranslations('finanzasContabilidadR3.comun');
  return (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={subtitulo ?? t('subtitulo')}
      icono={ShieldCheck}
      migas={[
        { etiqueta: tc('migas.finanzas'), href: '/app/finanzas' },
        { etiqueta: tc('migas.contabilidad'), href: '/app/finanzas/contabilidad' },
        { etiqueta: t('titulo') },
      ]}
      acciones={acciones}
    />
  );
}

function PanelCruce({
  lectura,
  onReintentar,
  children,
}: {
  lectura: Lectura<CruceSalud | null>;
  onReintentar: () => void;
  children: (datos: CruceSalud) => React.ReactNode;
}) {
  const t = useTranslations('finanzasContabilidadR3.salud');
  if (lectura.estado === 'cargando') {
    return <DataTable etiqueta={t('titulo')} columnas={[]} filas={[]} obtenerId={() => ''} estado="cargando" />;
  }
  if (lectura.estado === 'error') {
    return (
      <AvisoTonal
        tono="peligro"
        rol="alert"
        titulo={t('error.titulo')}
        descripcion={t('error.descripcion')}
        accion={{ etiqueta: t('error.reintentar'), onClick: onReintentar }}
      />
    );
  }
  if (lectura.datos === null) {
    return <AvisoTonal tono="informacion" titulo={t('inactivo.titulo')} descripcion={t('inactivo.descripcion')} />;
  }
  return <>{children(lectura.datos)}</>;
}

function TablaDescuadres({ filas, total, formatear }: { filas: DescuadreSalud[]; total: number; formatear: (v: number) => string }) {
  const t = useTranslations('finanzasContabilidadR3.salud');
  const columnas = useMemo<ColumnaTabla<DescuadreSalud>[]>(
    () => [
      {
        id: 'documento',
        encabezado: t('columnas.documento'),
        celda: (f) => (
          <ChipDocumento tipo={f.tipo} numero={f.numero ?? numeroCorto(f.documentoId)} href={`${RUTA_DOCUMENTO[f.tipo]}/${encodeURIComponent(f.documentoId)}`} />
        ),
      },
      {
        id: 'tipo',
        encabezado: t('columnas.tipo'),
        celda: (f) => (
          <StatusBadge
            estado={f.subtipo}
            etiqueta={t(`subtipos.${f.subtipo}`)}
            tono={f.subtipo === 'devengo_duplicado' ? 'peligro' : 'advertencia'}
            apariencia="contorno"
          />
        ),
      },
      { id: 'totalDocumento', encabezado: t('columnas.totalDocumento'), variante: 'importe', ocultarDebajo: 'md', celda: (f) => formatear(f.totalDocumento) },
      { id: 'totalAsiento', encabezado: t('columnas.totalAsiento'), variante: 'importe', ocultarDebajo: 'md', celda: (f) => formatear(f.totalAsiento) },
      {
        id: 'diferencia',
        encabezado: t('columnas.diferencia'),
        variante: 'importe',
        celda: (f) => (
          <span className="font-semibold text-danger-text">
            {f.diferencia > 0 ? '+ ' : f.diferencia < 0 ? '− ' : ''}
            {formatear(Math.abs(f.diferencia))}
          </span>
        ),
      },
      {
        id: 'asiento',
        encabezado: t('columnas.asiento'),
        celda: (f) => (
          <span className="flex flex-wrap gap-x-2">
            {f.asientos.map((id) => (
              <EnlaceAsiento key={id} id={id} />
            ))}
          </span>
        ),
      },
    ],
    [t, formatear],
  );
  return (
    <div className="space-y-3">
      <DataTable
        etiqueta={t('pestanas.descuadres')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => `${f.tipo}-${f.documentoId}`}
        vacio={{ titulo: t('vacios.descuadres.titulo'), descripcion: t('vacios.descuadres.descripcion') }}
        tarjetaMovil={(f) => (
          <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <ChipDocumento tipo={f.tipo} numero={f.numero ?? numeroCorto(f.documentoId)} href={`${RUTA_DOCUMENTO[f.tipo]}/${encodeURIComponent(f.documentoId)}`} />
              <span className="font-semibold text-danger-text">{formatear(Math.abs(f.diferencia))}</span>
            </div>
            <p className="text-sm text-fg-secondary">{t(`subtipos.${f.subtipo}`)}</p>
            <span className="flex flex-wrap gap-x-2 text-sm">
              {f.asientos.map((id) => (
                <EnlaceAsiento key={id} id={id} />
              ))}
            </span>
          </div>
        )}
      />
      {total > filas.length && <p className="text-sm text-fg-secondary">{t('limite', { n: filas.length, total })}</p>}
      <p className="text-sm text-fg-secondary">{t('soloLectura')}</p>
    </div>
  );
}

function TablaHuerfanos({
  filas,
  total,
  formatear,
  formatDate,
}: {
  filas: HuerfanoSalud[];
  total: number;
  formatear: (v: number) => string;
  formatDate: (v: string | null) => string;
}) {
  const t = useTranslations('finanzasContabilidadR3.salud');
  const columnas = useMemo<ColumnaTabla<HuerfanoSalud>[]>(
    () => [
      { id: 'asiento', encabezado: t('columnas.asiento'), celda: (f) => <EnlaceAsiento id={f.asientoId} /> },
      { id: 'fecha', encabezado: t('columnas.fecha'), ocultarDebajo: 'md', celda: (f) => (f.fecha ? formatDate(f.fecha) : '—') },
      { id: 'origen', encabezado: t('columnas.origen'), celda: (f) => <EtiquetaOrigen source={f.origen} /> },
      {
        id: 'motivo',
        encabezado: t('columnas.motivo'),
        celda: (f) => {
          const doc = f.origenId ? documentoDeOrigen(f.origen, f.origenId) : null;
          return (
            <span className="text-fg-secondary">
              {t(`motivos.${f.motivo}`)}
              {doc && f.origenId && <span className="ml-1 font-mono text-xs">({numeroCorto(f.origenId)})</span>}
            </span>
          );
        },
      },
      { id: 'importe', encabezado: t('columnas.importe'), variante: 'importe', celda: (f) => formatear(f.importe) },
    ],
    [t, formatear, formatDate],
  );
  return (
    <div className="space-y-3">
      <DataTable
        etiqueta={t('pestanas.huerfanos')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => String(f.asientoId)}
        vacio={{ titulo: t('vacios.huerfanos.titulo'), descripcion: t('vacios.huerfanos.descripcion') }}
        tarjetaMovil={(f) => (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-4">
            <span className="space-y-1">
              <EnlaceAsiento id={f.asientoId} />
              <span className="block text-sm text-fg-secondary">{t(`motivos.${f.motivo}`)}</span>
            </span>
            <span className="font-semibold tabular-nums text-fg">{formatear(f.importe)}</span>
          </div>
        )}
      />
      {total > filas.length && <p className="text-sm text-fg-secondary">{t('limite', { n: filas.length, total })}</p>}
      <p className="text-sm text-fg-secondary">{t('huerfanosAyuda')}</p>
    </div>
  );
}

function PanelEstructura({
  lectura,
  formatear,
  onReintentar,
}: {
  lectura: Lectura<EstructuraSalud>;
  formatear: (v: number) => string;
  onReintentar: () => void;
}) {
  const t = useTranslations('finanzasContabilidadR3.salud');
  if (lectura.estado === 'error') {
    return (
      <AvisoTonal
        tono="peligro"
        rol="alert"
        titulo={t('error.titulo')}
        descripcion={t('error.descripcion')}
        accion={{ etiqueta: t('error.reintentar'), onClick: onReintentar }}
      />
    );
  }
  const datos = lectura.estado === 'listo' ? lectura.datos : null;
  const reglas = datos ? [...new Map(datos.reglas.map((r) => [`${r.regla_id}-${r.lado}`, r])).values()] : [];
  return (
    <div className="space-y-6">
      <Tarjeta titulo={t('estructura.agrupadorasTitulo')} descripcion={t('estructura.agrupadorasAyuda')} sinRelleno>
        <DataTable
          etiqueta={t('estructura.agrupadorasTitulo')}
          estado={lectura.estado === 'cargando' ? 'cargando' : 'listo'}
          filas={datos?.agrupadoras ?? []}
          obtenerId={(f) => f.codigo}
          vacio={{ titulo: t('vacios.agrupadoras.titulo'), descripcion: t('vacios.agrupadoras.descripcion') }}
          columnas={[
            {
              id: 'cuenta',
              encabezado: t('columnas.cuenta'),
              celda: (f) => (
                <Link href={`/app/finanzas/contabilidad/mayor-contable?cuenta=${encodeURIComponent(f.codigo)}`} className="text-brand hover:underline">
                  <span className="font-mono">{f.codigo}</span> · {f.nombre}
                </Link>
              ),
            },
            { id: 'subcuentas', encabezado: t('columnas.subcuentas'), alinear: 'derecha', ocultarDebajo: 'md', celda: (f) => f.subcuentas },
            { id: 'movimientos', encabezado: t('columnas.movimientos'), alinear: 'derecha', celda: (f) => f.movimientos },
            { id: 'saldo', encabezado: t('columnas.saldo'), variante: 'importe', ocultarDebajo: 'md', celda: (f) => formatear(f.saldo) },
          ]}
        />
      </Tarjeta>
      <Tarjeta
        titulo={t('estructura.reglasTitulo')}
        descripcion={t('estructura.reglasAyuda')}
        accion={
          <Link href="/app/finanzas/reglas-contables" className="text-sm font-medium text-brand hover:underline">
            {t('estructura.irReglas')}
          </Link>
        }
        sinRelleno
      >
        <DataTable
          etiqueta={t('estructura.reglasTitulo')}
          estado={lectura.estado === 'cargando' ? 'cargando' : 'listo'}
          filas={reglas}
          obtenerId={(r) => `${r.regla_id}-${r.lado}`}
          vacio={{ titulo: t('vacios.reglas.titulo'), descripcion: t('vacios.reglas.descripcion') }}
          columnas={[
            { id: 'cuenta', encabezado: t('columnas.cuenta'), celda: (r) => <span className="font-mono">{r.cuenta}</span> },
            { id: 'lado', encabezado: t('columnas.lado'), celda: (r) => t(`lados.${r.lado}`) },
            {
              id: 'estado',
              encabezado: t('columnas.estado'),
              celda: (r) => <StatusBadge estado={r.estado} etiqueta={t(`estadosCuenta.${r.estado}`)} tono={r.estado === 'inexistente' ? 'peligro' : 'advertencia'} apariencia="contorno" />,
            },
            {
              id: 'propuesta',
              encabezado: t('columnas.propuesta'),
              ocultarDebajo: 'md',
              celda: (r) => (r.propuesta ? <span className="text-fg-secondary">{[r.propuesta, r.propuesta_nombre].filter(Boolean).join(' · ')}</span> : '—'),
            },
          ]}
        />
      </Tarjeta>
    </div>
  );
}
