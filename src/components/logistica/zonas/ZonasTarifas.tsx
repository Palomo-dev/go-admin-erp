'use client';

/**
 * «Zonas y tarifas de domicilio» (Figma 2792:413 escritorio, 2793:2613 celular).
 *
 * Lista las zonas de la organización (las de la sucursal activa y las de todas) con
 * `zonasEnvioService`; escribir lo autoriza la RLS (`organization_settings`). El editor
 * (2793:801) se abre en la misma página y el simulador (2793:1477) usa la cotización del servidor.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calculator, Copy, Info, MapPin, Pause, Pencil, Play, Plus, Trash2, Truck } from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  DataTable,
  KpiStrip,
  SearchInput,
  StatCard,
  StatusBadge,
  Tarjeta,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useBranch } from '@/lib/context/BranchContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  actualizarZona,
  agregarUbicaciones,
  crearZona,
  eliminarZona,
  listarZonas,
  type ZonaConUbicaciones,
} from '@/lib/services/logistica/zonasEnvioService';
import { resumenCobertura, textoPromesa, zonaCoincideBusqueda } from '@/lib/logistica/presentacionEnvio';
import type { ZonaEnvioEntrada } from '@/lib/logistica/zonas';
import { CabeceraZonas } from './CabeceraZonas';
import { AvisoPesoProductos } from '@/components/logistica/peso/AvisoPesoProductos';
import { EditorZona } from './EditorZona';
import { SimuladorEnvio } from './SimuladorEnvio';

interface Props {
  organizationId: number;
}

type EstadoCarga = 'cargando' | 'listo' | 'error';

/** 'HH:MM:SS' → '9:00 p. m.' con el formato del idioma (es la hora de la sede, no se convierte). */
function horaCorte(hora: string | null, locale: string): string | null {
  if (!hora) return null;
  const [h, m] = hora.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hora;
  const d = new Date(Date.UTC(2000, 0, 1, h, m));
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(d);
}

export function ZonasTarifas({ organizationId }: Props) {
  const t = useTranslations('logistica.zonas');
  const { toast } = useToast();
  const { formatear, locale } = useMonedaOrganizacion();
  const { branchFilter, branches } = useBranch();
  const [zonas, setZonas] = useState<ZonaConUbicaciones[]>([]);
  const [carga, setCarga] = useState<EstadoCarga>('cargando');
  const [sinZona30, setSinZona30] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<ZonaConUbicaciones | 'nueva' | null>(null);
  const [simular, setSimular] = useState<{ abierto: boolean; zona: ZonaConUbicaciones | null }>({ abierto: false, zona: null });
  const [borrar, setBorrar] = useState<ZonaConUbicaciones | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setCarga('cargando');
    try {
      const lista = await listarZonas(supabase, organizationId, { branchId: branchFilter });
      setZonas(lista);
      setCarga('listo');
    } catch (e) {
      console.error('[logistica] no se pudieron leer las zonas', e);
      setCarga('error');
    }
    // Envíos propios sin zona en 30 días: se cobraron con lo que mandó el canal (o la tarifa general).
    const desde = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    let q = supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('fulfillment_mode', 'own')
      .is('shipping_zone_id', null)
      .gte('created_at', desde);
    if (branchFilter !== null) q = q.eq('branch_id', branchFilter);
    const { count } = await q;
    setSinZona30(typeof count === 'number' ? count : null);
  }, [organizationId, branchFilter]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtradas = useMemo(() => zonas.filter((z) => zonaCoincideBusqueda(z, busqueda)), [zonas, busqueda]);
  const activas = zonas.filter((z) => z.is_active);
  const promesas = activas
    .map((z) => (z.promise_min_minutes != null && z.promise_max_minutes != null ? (z.promise_min_minutes + z.promise_max_minutes) / 2 : z.promise_max_minutes ?? z.promise_min_minutes))
    .filter((n): n is number => typeof n === 'number');
  const promedio = promesas.length > 0 ? Math.round(promesas.reduce((a, b) => a + b, 0) / promesas.length) : null;
  const gratis = activas.filter((z) => z.free_shipping_from != null).sort((a, b) => Number(a.free_shipping_from) - Number(b.free_shipping_from))[0] ?? null;
  const nombreSede = (id: number | null) => (id === null ? t('todasLasSedes') : branches.find((b) => b.id === id)?.name ?? `#${id}`);

  const guardarCambio = async (zona: ZonaConUbicaciones, cambios: Partial<ZonaEnvioEntrada>, mensaje: string) => {
    setOcupado(true);
    try {
      await actualizarZona(supabase, organizationId, zona.id, cambios);
      toast({ title: mensaje });
      await cargar();
    } catch (e) {
      console.error('[logistica] no se pudo actualizar la zona', e);
      toast({ title: t('toast.error'), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const duplicar = async (zona: ZonaConUbicaciones) => {
    setOcupado(true);
    try {
      const { id: _id, organization_id: _org, created_at: _c, updated_at: _u, ubicaciones, ...resto } = zona;
      void _id; void _org; void _c; void _u;
      const copia = await crearZona(supabase, organizationId, {
        ...resto,
        name: t('copia', { nombre: zona.name }).slice(0, 120),
        is_active: false,
        is_fallback: false,
      });
      if (ubicaciones.length > 0) {
        await agregarUbicaciones(
          supabase,
          organizationId,
          copia.id,
          ubicaciones.map((u) => ({
            location_type: u.location_type,
            municipality_code: u.municipality_code,
            neighborhood: u.neighborhood,
            postal_code: u.postal_code,
            polygon: u.polygon,
            label: u.label,
          })),
        );
      }
      toast({ title: t('toast.duplicada') });
      await cargar();
    } catch (e) {
      console.error('[logistica] no se pudo duplicar la zona', e);
      toast({ title: t('toast.error'), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const confirmarBorrar = async () => {
    if (!borrar) return;
    setOcupado(true);
    try {
      await eliminarZona(supabase, organizationId, borrar.id);
      toast({ title: t('toast.eliminada') });
      setBorrar(null);
      await cargar();
    } catch (e) {
      console.error('[logistica] no se pudo eliminar la zona', e);
      toast({ title: t('toast.error'), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const textoCobertura = (z: ZonaConUbicaciones) => {
    const grupos = resumenCobertura(z.ubicaciones);
    if (grupos.length === 0) return { titulo: z.is_fallback ? t('cobertura.general') : t('cobertura.ninguna'), detalle: null };
    return {
      titulo: grupos.map((g) => t(`cobertura.${g.tipo}`, { n: g.cantidad })).join(' · '),
      detalle: grupos.flatMap((g) => g.muestra).slice(0, 4).join(', ') || null,
    };
  };

  const acciones = (z: ZonaConUbicaciones): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => setEditando(z) },
    { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => void duplicar(z) },
    { id: 'simular', etiqueta: t('acciones.simular'), icono: Play, onSelect: () => setSimular({ abierto: true, zona: z }) },
    z.is_active
      ? { id: 'pausar', etiqueta: t('acciones.pausar'), icono: Pause, onSelect: () => void guardarCambio(z, { is_active: false }, t('toast.pausada')) }
      : { id: 'activar', etiqueta: t('acciones.activar'), icono: Play, onSelect: () => void guardarCambio(z, { is_active: true }, t('toast.activada')) },
    { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, destructiva: true, onSelect: () => setBorrar(z) },
  ];

  const gratisTexto = (z: ZonaConUbicaciones) =>
    z.free_shipping_from != null ? `${formatear(z.free_shipping_from)} · ${t(`gratisAplica.${z.free_shipping_applies_to}`)}` : '—';

  const columnas: ColumnaTabla<ZonaConUbicaciones>[] = [
    {
      id: 'zona',
      encabezado: t('columnas.zona'),
      celda: (z) => (
        <div className="flex flex-col">
          <span className="font-medium text-fg">{z.name}</span>
          <span className="text-xs text-fg-secondary">{z.is_fallback ? t('tarifaGeneral') : nombreSede(z.branch_id)}</span>
        </div>
      ),
    },
    {
      id: 'cobertura',
      encabezado: t('columnas.cobertura'),
      ocultarDebajo: 'md',
      celda: (z) => {
        const c = textoCobertura(z);
        return (
          <div className="flex max-w-[260px] flex-col">
            <span className="text-fg">{c.titulo}</span>
            {c.detalle && <span className="truncate text-xs text-fg-secondary">{c.detalle}</span>}
          </div>
        );
      },
    },
    { id: 'tarifa', encabezado: t('columnas.tarifa'), variante: 'importe', celda: (z) => formatear(z.fee) },
    { id: 'tiempo', encabezado: t('columnas.tiempo'), ocultarDebajo: 'lg', celda: (z) => textoPromesa(z) ?? '—' },
    { id: 'minimo', encabezado: t('columnas.minimo'), variante: 'importe', ocultarDebajo: 'lg', celda: (z) => (Number(z.min_order_amount) > 0 ? formatear(z.min_order_amount) : '—') },
    { id: 'gratis', encabezado: t('columnas.gratis'), ocultarDebajo: 'xl', celda: gratisTexto },
    { id: 'corte', encabezado: t('columnas.corte'), ocultarDebajo: 'xl', celda: (z) => horaCorte(z.cutoff_time, locale) ?? '—' },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (z) => <StatusBadge estado={z.is_active ? 'active' : 'paused'} etiqueta={z.is_active ? t('estado.activa') : t('estado.pausada')} tono={z.is_active ? 'exito' : 'advertencia'} tamano="sm" />,
    },
  ];

  if (editando) {
    return (
      <EditorZona
        organizationId={organizationId}
        zona={editando === 'nueva' ? null : editando}
        sedeInicial={branchFilter}
        onCerrar={(guardo) => {
          setEditando(null);
          if (guardo) void cargar();
        }}
      />
    );
  }

  return (
    <>
      <CabeceraZonas
        pestana="zonas"
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={Truck}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => setSimular({ abierto: true, zona: null })}>
              <Calculator aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('simulador')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={() => setEditando('nueva')}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nueva')}
            </button>
          </>
        }
      />

      <SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={t('buscar')} etiqueta={t('buscar')} />

      <AvisoTonal tono="informacion" icono={Info} titulo={t('avisoServidor.titulo')} descripcion={t('avisoServidor.descripcion')} />

      <AvisoPesoProductos organizationId={organizationId} />

      <KpiStrip etiqueta={t('kpi.etiqueta')}>
        <StatCard
          etiqueta={t('kpi.activas')}
          valor={t('kpi.activasValor', { activas: activas.length, total: zonas.length })}
          detalle={t('kpi.pausadas', { n: zonas.length - activas.length })}
          cargando={carga === 'cargando'}
        />
        <StatCard
          etiqueta={t('kpi.sinZona')}
          valor={sinZona30 ?? '—'}
          detalle={t('kpi.sinZonaDetalle')}
          tono={sinZona30 ? 'advertencia' : undefined}
          cargando={carga === 'cargando'}
        />
        <StatCard
          etiqueta={t('kpi.tiempo')}
          valor={promedio !== null ? t('kpi.minutos', { n: promedio }) : '—'}
          detalle={t('kpi.tiempoDetalle', { n: promesas.length })}
          cargando={carga === 'cargando'}
        />
        <StatCard
          etiqueta={t('kpi.gratis')}
          valor={gratis ? t('kpi.gratisValor', { valor: formatear(gratis.free_shipping_from) }) : t('kpi.sinGratis')}
          detalle={gratis?.name}
          cargando={carga === 'cargando'}
        />
      </KpiStrip>

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filtradas}
        obtenerId={(z) => z.id}
        estado={carga === 'cargando' ? 'cargando' : carga === 'error' ? 'error' : filtradas.length === 0 && busqueda ? 'sinResultados' : 'listo'}
        onFilaClick={(z) => setEditando(z)}
        etiquetaFila={(z) => z.name}
        acciones={acciones}
        termino={busqueda}
        onLimpiarFiltros={() => setBusqueda('')}
        onReintentar={() => void cargar()}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: MapPin,
          accion: { etiqueta: t('nueva'), onClick: () => setEditando('nueva'), icono: Plus },
        }}
        tarjetaMovil={(z) => (
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
              <MapPin className="size-5" strokeWidth={1.5} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-fg">{z.name}</span>
              <span className="text-xs text-fg-secondary">{[textoCobertura(z).titulo, textoPromesa(z)].filter(Boolean).join(' · ')}</span>
              {z.free_shipping_from != null && <span className="text-xs text-fg-muted">{t('kpi.gratisValor', { valor: formatear(z.free_shipping_from) })}</span>}
            </div>
            <span className="text-sm font-semibold tabular-nums text-fg">{formatear(z.fee)}</span>
          </div>
        )}
      />

      <Tarjeta titulo={t('mapa.titulo')} icono={MapPin}>
        <p className="text-sm text-fg-secondary">{t('mapa.pendiente')}</p>
      </Tarjeta>

      <SimuladorEnvio
        abierto={simular.abierto}
        onAbiertoChange={(v) => setSimular((s) => ({ ...s, abierto: v }))}
        zonaInicial={simular.zona}
        sedeInicial={branchFilter}
      />

      <ConfirmDialog
        abierto={borrar !== null}
        onAbiertoChange={(v) => !v && setBorrar(null)}
        titulo={t('eliminar.titulo')}
        descripcion={t('eliminar.descripcion', { nombre: borrar?.name ?? '' })}
        textoConfirmar={t('eliminar.confirmar')}
        tono="peligro"
        cargando={ocupado}
        onConfirmar={confirmarBorrar}
      />
    </>
  );
}
