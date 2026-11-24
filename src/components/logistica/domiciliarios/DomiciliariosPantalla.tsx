'use client';

/**
 * Logística › Domiciliarios: lista con estado (libre, en ruta, fuera de turno) y carga del día, la
 * ficha sencilla de cada uno y el alta rápida (Figma 2800:8493).
 *
 * Lee con el cliente del navegador (RLS de miembro activo, filtrado por organización); escribe
 * por `/api/logistica/domiciliarios` (permiso resuelto en el servidor). El selector de sucursal del
 * header es el único filtro de sede (PATRONES §9).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bike, Eye, HandCoins, Phone, Plus, Power, RefreshCw, Users } from 'lucide-react';
import {
  BranchBadgeActiva,
  DataTable,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  StatCard,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { plainDateToInstant } from '@/lib/utils/dateCore';
import {
  TONO_ESTADO_DOMICILIARIO,
  cargaDelDia,
  cobraContraentrega,
  estadoDomiciliario,
  nombreDomiciliario,
  type CargaDelDia,
} from '@/lib/logistica/domiciliarios';
import { enlaceLlamar } from '@/lib/logistica/misEnvios';
import { RUTAS_LOGISTICA } from '@/lib/logistica/rutas';
import {
  enviosDeCarga,
  listarDomiciliarios,
  type CandidatosAlta,
  type DomiciliarioFila,
  type EnvioCargaFila,
} from '@/lib/services/logistica/domiciliariosService';
import { LogisticaApiError, cambiarActivoDomiciliario, leerCandidatos } from '../logisticaApi';
import { RegistrarDomiciliarioDialog } from './RegistrarDomiciliarioDialog';
import { FichaDomiciliario } from './FichaDomiciliario';
import type { FilaDomiciliario } from './tipos';


const RUTA_CUADRES = RUTAS_LOGISTICA.cuadres;

export function DomiciliariosPantalla() {
  const t = useTranslations('logistica.domiciliario');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const moneda = useMonedaOrganizacion();
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const { branchFilter, branches } = useBranch();
  const { getToday, timezone } = useFormatDate(null);
  const hoy = getToday();

  const [domiciliarios, setDomiciliarios] = useState<DomiciliarioFila[]>([]);
  const [envios, setEnvios] = useState<EnvioCargaFila[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [version, setVersion] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [alta, setAlta] = useState(false);
  const [candidatos, setCandidatos] = useState<CandidatosAlta | null>(null);
  const [puedeGestionar, setPuedeGestionar] = useState<boolean | null>(null);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!orgId) return;
    let cancelado = false;
    setEstado((e) => (e === 'listo' ? e : 'cargando'));
    const desde = new Date(plainDateToInstant(hoy, timezone)).toISOString();
    Promise.all([listarDomiciliarios(supabase, orgId), enviosDeCarga(supabase, orgId, desde)])
      .then(([d, e]) => {
        if (cancelado) return;
        setDomiciliarios(d);
        setEnvios(e);
        setEstado('listo');
      })
      .catch(() => !cancelado && setEstado('error'));
    return () => {
      cancelado = true;
    };
  }, [orgId, hoy, timezone, version]);

  // El permiso lo decide el servidor: la misma ruta de candidatos responde 403 sin él.
  useEffect(() => {
    if (!orgId) return;
    leerCandidatos()
      .then((c) => {
        setCandidatos(c);
        setPuedeGestionar(true);
      })
      .catch((err) => setPuedeGestionar(!(err instanceof LogisticaApiError && err.status === 403)));
  }, [orgId, version]);

  const filas = useMemo<FilaDomiciliario[]>(() => {
    const porDomiciliario = new Map<string, EnvioCargaFila[]>();
    for (const e of envios) porDomiciliario.set(e.driver_id, [...(porDomiciliario.get(e.driver_id) ?? []), e]);
    return domiciliarios
      .filter((d) => branchFilter == null || d.branch_id == null || d.branch_id === branchFilter)
      .map((d) => {
        const propios = porDomiciliario.get(d.id) ?? [];
        const carga = cargaDelDia(propios, hoy, timezone);
        return { d, nombre: nombreDomiciliario(d) || t('sinNombre'), estado: estadoDomiciliario(d, carga, hoy, timezone), carga, envios: propios };
      });
  }, [domiciliarios, envios, branchFilter, hoy, timezone, t]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) => [f.nombre, f.d.phone, f.d.document_number].some((v) => (v ?? '').toLowerCase().includes(q)));
  }, [filas, busqueda]);

  const kpis = useMemo(
    () => ({
      libres: filas.filter((f) => f.estado === 'libre').length,
      enRuta: filas.filter((f) => f.estado === 'en_ruta').length,
      fuera: filas.filter((f) => f.estado === 'fuera_de_turno').length,
      entregasHoy: filas.reduce((s, f) => s + f.carga.entregadosHoy, 0),
      porCuadrar: filas.reduce((s, f) => s + Math.round(f.carga.porCuadrar * 100), 0) / 100,
    }),
    [filas],
  );

  const abierto = searchParams?.get('domiciliario') ?? null;
  const filaAbierta = filas.find((f) => f.d.id === abierto) ?? null;
  const abrir = useCallback(
    (id: string | null) => {
      const q = new URLSearchParams(searchParams?.toString() ?? '');
      if (id) q.set('domiciliario', id);
      else q.delete('domiciliario');
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname ?? '', { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const cambiarActivo = async (f: FilaDomiciliario) => {
    try {
      await cambiarActivoDomiciliario(f.d.id, !f.d.is_active);
      toastSuccess(f.d.is_active ? t('acciones.desactivado', { nombre: f.nombre }) : t('acciones.activado', { nombre: f.nombre }));
      recargar();
    } catch (err) {
      toastError(t('errorAccion'), err instanceof LogisticaApiError && err.status === 403 ? t('sinPermiso.descripcion') : undefined);
    }
  };

  const accionesDe = (f: FilaDomiciliario): AccionFila[] => {
    const llamar = enlaceLlamar(f.d.phone ?? f.d.employee?.phone);
    return [
      { id: 'ver', etiqueta: t('acciones.verFicha'), icono: Eye, onSelect: () => abrir(f.d.id) },
      { id: 'llamar', etiqueta: t('acciones.llamar'), icono: Phone, onSelect: () => llamar && window.open(llamar, '_self'), oculta: !llamar },
      { id: 'cuadres', etiqueta: t('acciones.verCuadres'), icono: HandCoins, onSelect: () => router.push(`${RUTA_CUADRES}?domiciliario=${f.d.id}`), separadorAntes: true },
      {
        id: 'activo',
        etiqueta: f.d.is_active ? t('acciones.desactivar') : t('acciones.activar'),
        icono: Power,
        onSelect: () => void cambiarActivo(f),
        oculta: puedeGestionar === false,
        deshabilitada: f.d.is_active && f.carga.enCamino > 0,
        motivo: f.d.is_active && f.carga.enCamino > 0 ? t('acciones.noDesactivarEnRuta') : undefined,
        separadorAntes: true,
      },
    ];
  };

  const badge = (f: FilaDomiciliario) => <StatusBadge estado={f.estado} etiqueta={t(`estados.${f.estado}`)} tono={TONO_ESTADO_DOMICILIARIO[f.estado]} />;
  const textoCarga = (c: CargaDelDia) =>
    c.asignados + c.entregadosHoy + c.novedades === 0
      ? t('carga.sinCarga')
      : t('carga.resumen', { entregados: c.entregadosHoy, total: c.entregadosHoy + c.asignados, novedades: c.novedades });
  const nombreSede = (id: number | null) => (id == null ? t('todasLasSedes') : branches.find((b) => b.id === id)?.name ?? '—');

  const columnas: ColumnaTabla<FilaDomiciliario>[] = [
    {
      id: 'nombre',
      encabezado: t('columnas.domiciliario'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.nombre}</span>
          <span className="truncate text-xs text-fg-muted">
            {[f.d.is_external ? t('externo') : t('empleado'), !cobraContraentrega(f.d.metadata) ? t('noCobraContraentrega') : null].filter(Boolean).join(' · ')}
          </span>
        </div>
      ),
    },
    { id: 'celular', encabezado: t('columnas.celular'), celda: (f) => f.d.phone ?? f.d.employee?.phone ?? '—', ocultarDebajo: 'md' },
    { id: 'vehiculo', encabezado: t('columnas.vehiculo'), celda: (f) => (f.d.vehicle_type ? t(`alta.vehiculos.${f.d.vehicle_type}`) : '—'), ocultarDebajo: 'lg' },
    { id: 'sede', encabezado: t('columnas.sede'), celda: (f) => nombreSede(f.d.branch_id), ocultarDebajo: 'lg' },
    { id: 'estado', encabezado: t('columnas.estado'), celda: badge },
    { id: 'carga', encabezado: t('columnas.carga'), celda: (f) => textoCarga(f.carga) },
    { id: 'porCuadrar', encabezado: t('columnas.porCuadrar'), variante: 'importe', alinear: 'derecha', celda: (f) => (f.carga.porCuadrar > 0 ? moneda.formatear(f.carga.porCuadrar) : '—') },
  ];

  const botonAlta =
    puedeGestionar === false ? null : (
      <button type="button" onClick={() => setAlta(true)} className={clasesBoton()}>
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('acciones.registrar')}
      </button>
    );

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={Bike}
        migas={[{ etiqueta: t('migaLogistica') }, { etiqueta: t('titulo') }]}
        cargando={estado === 'cargando'}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            <button type="button" onClick={recargar} aria-label={t('acciones.recargar')} className={clasesBoton({ variante: 'secundario' })}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            {botonAlta}
          </>
        }
        movil={{
          accion:
            puedeGestionar === false ? undefined : (
              <button
                type="button"
                onClick={() => setAlta(true)}
                aria-label={t('acciones.registrar')}
                className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </button>
            ),
        }}
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')}>
        <StatCard etiqueta={t('kpis.libres')} icono={Users} cargando={estado === 'cargando'} valor={String(kpis.libres)} tono={kpis.libres > 0 ? 'exito' : 'neutro'} />
        <StatCard etiqueta={t('kpis.enRuta')} icono={Bike} cargando={estado === 'cargando'} valor={String(kpis.enRuta)} detalle={t('kpis.entregasHoy', { n: kpis.entregasHoy })} />
        <StatCard etiqueta={t('kpis.fuera')} icono={Power} cargando={estado === 'cargando'} valor={String(kpis.fuera)} />
        <StatCard
          etiqueta={t('kpis.porCuadrar')}
          icono={HandCoins}
          cargando={estado === 'cargando'}
          valor={moneda.formatear(kpis.porCuadrar)}
          tono={kpis.porCuadrar > 0 ? 'advertencia' : 'neutro'}
          href={RUTA_CUADRES}
        />
      </KpiStrip>

      <ListToolbar busqueda={<SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscar')} etiqueta={t('buscar')} />} />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(f) => f.d.id}
        estado={estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : visibles.length > 0 ? 'listo' : busqueda.trim() ? 'sinResultados' : 'vacio'}
        onFilaClick={(f) => abrir(f.d.id)}
        etiquetaFila={(f) => t('etiquetaFila', { nombre: f.nombre, estado: t(`estados.${f.estado}`) })}
        tonoFila={(f) => (f.d.is_active ? undefined : 'advertencia')}
        acciones={accionesDe}
        tarjetaMovil={(f) => (
          <ListCard
            icono={Bike}
            titulo={f.nombre}
            subtitulo={textoCarga(f.carga)}
            meta={f.d.phone ?? undefined}
            valor={f.carga.porCuadrar > 0 ? moneda.formatear(f.carga.porCuadrar) : undefined}
            estado={badge(f)}
            acciones={accionesDe(f)}
            onClick={() => abrir(f.d.id)}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Bike,
          accion: puedeGestionar === false ? undefined : { etiqueta: t('acciones.registrar'), onClick: () => setAlta(true), icono: Plus },
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        onReintentar={recargar}
        onLimpiarFiltros={() => setBusqueda('')}
        termino={busqueda}
      />

      <FichaDomiciliario
        fila={filaAbierta}
        onCerrar={() => abrir(null)}
        nombreSede={nombreSede}
        puedeGestionar={puedeGestionar !== false}
        onCambiarActivo={(f) => void cambiarActivo(f)}
      />

      <RegistrarDomiciliarioDialog
        abierto={alta}
        onAbiertoChange={setAlta}
        candidatos={candidatos}
        onRegistrado={(d) => {
          toastSuccess(t('alta.hecho', { nombre: nombreDomiciliario(d) }));
          recargar();
        }}
      />
    </div>
  );
}
