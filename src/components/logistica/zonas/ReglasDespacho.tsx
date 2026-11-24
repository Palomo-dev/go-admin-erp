'use client';

/**
 * «Reglas de despacho» (Figma 2794:1488). Fase 1: todas entregan con domicilio propio (CHECK
 * `delivery_rules_fase1_solo_propio`); lo de terceros y transportadoras llega en la Fase 2.
 * CRUD con `zonasEnvioService`; la hoja lateral (2794:2281) edita y «Probar con un pedido»
 * (2795:2020) pregunta a la cotización del servidor qué regla decide.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Copy, Info, Lock, Pencil, Play, Plus, Route, Trash2 } from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  DataTable,
  KpiStrip,
  StatCard,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useBranch } from '@/lib/context/BranchContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  actualizarRegla,
  crearRegla,
  eliminarRegla,
  listarReglas,
  listarZonas,
  type ZonaConUbicaciones,
} from '@/lib/services/logistica/zonasEnvioService';
import type { ReglaDespacho } from '@/lib/logistica/zonas';
import { CabeceraZonas } from './CabeceraZonas';
import { HojaRegla } from './HojaRegla';
import { PruebaReglas } from './PruebaReglas';
import { camposConCondicion, ordenEvaluacion } from './reglasPresentacion';

interface Props {
  organizationId: number;
}

export interface MetodoPagoOpcion {
  codigo: string;
  nombre: string;
}

export function ReglasDespacho({ organizationId }: Props) {
  const t = useTranslations('logistica.reglas');
  const { toast } = useToast();
  const { formatear } = useMonedaOrganizacion();
  const { branches, branchFilter } = useBranch();
  const [reglas, setReglas] = useState<ReglaDespacho[]>([]);
  const [zonas, setZonas] = useState<ZonaConUbicaciones[]>([]);
  const [metodos, setMetodos] = useState<MetodoPagoOpcion[]>([]);
  const [carga, setCarga] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [hoja, setHoja] = useState<{ abierta: boolean; regla: ReglaDespacho | null }>({ abierta: false, regla: null });
  const [prueba, setPrueba] = useState(false);
  const [borrar, setBorrar] = useState<ReglaDespacho | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setCarga('cargando');
    try {
      const [r, z, m] = await Promise.all([
        listarReglas(supabase, organizationId),
        listarZonas(supabase, organizationId),
        supabase
          .from('organization_payment_methods')
          .select('payment_method_code, payment_methods!inner(name)')
          .eq('organization_id', organizationId)
          .eq('is_active', true),
      ]);
      setReglas(r);
      setZonas(z);
      const filas = (m.data ?? []) as unknown as Array<{ payment_method_code: string; payment_methods: { name: string } | { name: string }[] | null }>;
      setMetodos(
        filas.map((f) => {
          const pm = Array.isArray(f.payment_methods) ? f.payment_methods[0] : f.payment_methods;
          return { codigo: f.payment_method_code, nombre: pm?.name ?? f.payment_method_code };
        }),
      );
      setCarga('listo');
    } catch (e) {
      console.error('[logistica] no se pudieron leer las reglas', e);
      setCarga('error');
    }
  }, [organizationId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(
    () => ordenEvaluacion(reglas.filter((r) => branchFilter === null || r.branch_id === null || r.branch_id === branchFilter)),
    [reglas, branchFilter],
  );
  const activas = reglas.filter((r) => r.is_active).length;
  const nombreZona = (id: string) => zonas.find((z) => z.id === id)?.name ?? '—';
  const nombreMetodo = (c: string) => metodos.find((m) => m.codigo === c)?.nombre ?? c;
  const nombreSede = (id: number | null) => (id === null ? t('todasLasSedes') : branches.find((b) => b.id === id)?.name ?? `#${id}`);

  const condiciones = (r: ReglaDespacho): string[] =>
    camposConCondicion(r).map((campo) => {
      switch (campo) {
        case 'zona':
          return t('chips.zona', { valor: (r.zone_ids ?? []).map(nombreZona).join(', ') });
        case 'canal':
          return t('chips.canal', { valor: (r.channels ?? []).map((c) => t(`canales.${c}`)).join(', ') });
        case 'metodo_pago':
          return t('chips.metodo', { valor: (r.payment_methods ?? []).map(nombreMetodo).join(', ') });
        case 'valor':
          return t('chips.valor', { desde: r.min_order_value != null ? formatear(r.min_order_value) : '—', hasta: r.max_order_value != null ? formatear(r.max_order_value) : '—' });
        case 'peso':
          return t('chips.peso', { desde: r.min_weight_kg ?? '—', hasta: r.max_weight_kg ?? '—' });
        case 'dias':
          return t('chips.dias', { valor: (r.weekdays ?? []).map((d) => t(`dias.${d}`)).join(', ') });
        case 'horario':
          return t('chips.horario', { desde: r.time_from?.slice(0, 5) ?? '—', hasta: r.time_to?.slice(0, 5) ?? '—' });
      }
    });

  const cambiarActiva = async (r: ReglaDespacho, activa: boolean) => {
    setReglas((l) => l.map((x) => (x.id === r.id ? { ...x, is_active: activa } : x)));
    try {
      await actualizarRegla(supabase, organizationId, r.id, { is_active: activa });
    } catch (e) {
      console.error('[logistica] no se pudo cambiar la regla', e);
      toast({ title: t('toast.error'), variant: 'destructive' });
      void cargar();
    }
  };

  const duplicar = async (r: ReglaDespacho) => {
    setOcupado(true);
    try {
      const { id: _i, organization_id: _o, created_at: _c, updated_at: _u, ...resto } = r;
      void _i; void _o; void _c; void _u;
      await crearRegla(supabase, organizationId, { ...resto, name: t('copia', { nombre: r.name }).slice(0, 120), is_active: false, priority: r.priority + 1 });
      toast({ title: t('toast.duplicada') });
      await cargar();
    } catch (e) {
      console.error('[logistica] no se pudo duplicar la regla', e);
      toast({ title: t('toast.error'), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const confirmarBorrar = async () => {
    if (!borrar) return;
    setOcupado(true);
    try {
      await eliminarRegla(supabase, organizationId, borrar.id);
      toast({ title: t('toast.eliminada') });
      setBorrar(null);
      await cargar();
    } catch (e) {
      console.error('[logistica] no se pudo eliminar la regla', e);
      toast({ title: t('toast.error'), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const acciones = (r: ReglaDespacho): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => setHoja({ abierta: true, regla: r }) },
    { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => void duplicar(r) },
    { id: 'probar', etiqueta: t('acciones.probar'), icono: Play, onSelect: () => setPrueba(true) },
    { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, destructiva: true, onSelect: () => setBorrar(r) },
  ];

  const columnas: ColumnaTabla<ReglaDespacho>[] = [
    { id: 'orden', encabezado: t('columnas.orden'), ancho: 72, celda: (r) => <span className="tabular-nums text-fg">{r.priority}</span> },
    {
      id: 'condiciones',
      encabezado: t('columnas.condiciones'),
      celda: (r) => {
        const chips = condiciones(r);
        return (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">{r.name}</span>
            <div className="flex flex-wrap items-center gap-1">
              {chips.length === 0 ? (
                <span className="text-xs text-fg-secondary">{t('siempreAplica')}</span>
              ) : (
                chips.map((c, i) => (
                  <span key={i} className="rounded-full bg-subtle px-2 py-0.5 text-xs text-fg-secondary">
                    {c}
                  </span>
                ))
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: 'entrega',
      encabezado: t('columnas.entrega'),
      ocultarDebajo: 'md',
      celda: (r) => (
        <div className="flex items-center gap-2">
          <ArrowRight aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
          <div className="flex flex-col gap-0.5">
            <StatusBadge estado="own" etiqueta={t('acciones.propio')} tono="marca" tamano="sm" />
            <span className="text-xs text-fg-secondary">{nombreSede(r.branch_id)}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'activa',
      encabezado: t('columnas.activa'),
      ancho: 88,
      celda: (r) => (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
          <Switch checked={r.is_active} onCheckedChange={(v) => void cambiarActiva(r, v)} aria-label={t('activarRegla', { nombre: r.name })} />
        </span>
      ),
    },
  ];

  return (
    <>
      <CabeceraZonas
        pestana="reglas"
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={Route}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => setPrueba(true)}>
              <Play aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('probar')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={() => setHoja({ abierta: true, regla: null })}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nueva')}
            </button>
          </>
        }
      />

      <KpiStrip etiqueta={t('kpi.etiqueta')} columnas={2}>
        <StatCard etiqueta={t('kpi.activas')} valor={t('kpi.activasValor', { activas, total: reglas.length })} detalle={t('kpi.pausadas', { n: reglas.length - activas })} cargando={carga === 'cargando'} />
        <StatCard etiqueta={t('kpi.fase')} valor={t('kpi.faseValor')} detalle={t('kpi.faseDetalle')} cargando={carga === 'cargando'} />
      </KpiStrip>

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(r) => r.id}
        estado={carga === 'cargando' ? 'cargando' : carga === 'error' ? 'error' : 'listo'}
        onFilaClick={(r) => setHoja({ abierta: true, regla: r })}
        etiquetaFila={(r) => r.name}
        acciones={acciones}
        onReintentar={() => void cargar()}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: Route, accion: { etiqueta: t('nueva'), onClick: () => setHoja({ abierta: true, regla: null }), icono: Plus } }}
        tarjetaMovil={(r) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              {r.priority} · {r.name}
            </span>
            <span className="text-xs text-fg-secondary">{condiciones(r).join(' · ') || t('siempreAplica')}</span>
          </div>
        )}
        pie={
          <div className="flex items-center gap-3 border-t border-line bg-subtle px-4 py-3 text-sm">
            <Lock aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
            <span className="font-medium text-fg">{t('final.titulo')}</span>
            <ArrowRight aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
            <span className="text-fg-secondary">{t('final.entrega')}</span>
          </div>
        }
      />

      <AvisoTonal tono="informacion" icono={Info} titulo={t('como.titulo')} descripcion={t('como.descripcion')} />

      <HojaRegla
        abierta={hoja.abierta}
        onAbiertaChange={(v) => setHoja((h) => ({ ...h, abierta: v }))}
        organizationId={organizationId}
        regla={hoja.regla}
        total={reglas.length}
        zonas={zonas}
        metodos={metodos}
        onGuardada={() => {
          setHoja({ abierta: false, regla: null });
          void cargar();
        }}
        onProbar={() => setPrueba(true)}
      />

      <PruebaReglas abierto={prueba} onAbiertoChange={setPrueba} reglas={reglas} metodos={metodos} />

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
