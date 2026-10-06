'use client';

/**
 * /app/crm/campanas — listado UNIFICADO de campañas de mensajes (WhatsApp,
 * correo) y de voz (Figma CRM 1395:17 listo, 1404:829863 vacío, 1404:830283
 * cargando, 1404:830739 error).
 *
 * Una sola petición (`GET /api/crm/campaigns/unified` → RPC
 * `crm_campaigns_unificadas`) trae filas, total por canal y `canManage`. Las de
 * voz abren su detalle en marcha (`/app/crm/campanas/voz/[id]`), donde están
 * pausa, reanudación y parada de emergencia; las de mensajes conservan aquí
 * sus acciones de siempre (`CampanasService`).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, Copy, Eye, Mail, MessageSquare, Pause, Play, Plus, RefreshCw, Send, Trash2, XCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { SearchInput } from '@/components/kit/SearchInput';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { Pagination } from '@/components/kit/Pagination';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { BarraProgreso } from '@/components/kit/BarraProgreso';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { clasesBoton } from '@/components/kit/botonClases';
import type { AccionFila } from '@/components/kit/acciones';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { CANALES_CAMPANA, TAMANO_PAGINA_CAMPANAS, type CampanaUnificada, type CanalCampana } from '@/lib/services/crm/campaignsUnificadasLogica';
import { CampanasService } from './CampanasService';
import { accionesCampanaMensajes, estadoFilaCampana, parametrosCampanas, rutaCampana, type AccionCampana } from './campanasListaLogica';

interface Respuesta {
  rows: CampanaUnificada[];
  total: number;
  porCanal: Record<CanalCampana, number>;
  canManage: boolean;
}

const ICONO_CANAL = { voice: Bot, whatsapp: MessageSquare, email: Mail } as const;

export function CampanasPage() {
  const t = useTranslations('crm.campanasLista');
  const router = useRouter();
  const entero = useFormatoEntero();
  const [canal, setCanal] = useState<CanalCampana>('all');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const [revision, setRevision] = useState(0);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [borrar, setBorrar] = useState<CampanaUnificada | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setEstado('cargando');
    pedirCrm<Respuesta>(`/api/crm/campaigns/unified?${parametrosCampanas({ channel: canal, q, page: pagina })}`, { signal: ctrl.signal })
      .then(({ data }) => {
        if (ctrl.signal.aborted) return;
        setDatos(data);
        setEstado(data.rows.length ? 'listo' : q.trim() || canal !== 'all' ? 'sinResultados' : 'vacio');
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setEstado(e instanceof ErrorApiCrm && (e.status === 401 || e.status === 403) ? 'sinPermiso' : 'error');
      });
    return () => ctrl.abort();
  }, [canal, q, pagina, revision]);

  const recargar = () => setRevision((n) => n + 1);

  const ejecutar = async (c: CampanaUnificada, accion: AccionCampana) => {
    if (accion === 'eliminar') return setBorrar(c);
    setOcupado(true);
    try {
      if (accion === 'pausar') await CampanasService.pause(c.id);
      else if (accion === 'reanudar') await CampanasService.resume(c.id);
      else if (accion === 'cancelar') await CampanasService.cancel(c.id);
      else if (accion === 'duplicar') await CampanasService.duplicateCampaign(c.id);
      toast({ title: t(`ok.${accion}`) });
      recargar();
    } catch (e) {
      toast({ title: t('errores.accion'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const ICONO_ACCION = { pausar: Pause, reanudar: Play, cancelar: XCircle, duplicar: Copy, eliminar: Trash2 } as const;
  const acciones = (c: CampanaUnificada): AccionFila[] => [
    { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => router.push(rutaCampana(c)) },
    ...(c.source === 'message'
      ? accionesCampanaMensajes(c.status, datos?.canManage === true).map((a) => ({
          id: a,
          etiqueta: t(`acciones.${a}`),
          icono: ICONO_ACCION[a],
          destructiva: a === 'eliminar',
          deshabilitada: ocupado,
          onSelect: () => void ejecutar(c, a),
        }))
      : []),
  ];

  const resultado = (c: CampanaUnificada) => {
    if (c.progress.total === 0) return <span className="text-fg-muted">—</span>;
    const r = c.result;
    return c.source === 'voice' ? (
      <span className="text-[13px] text-fg-secondary">
        {t('resultado.voz', { completadas: entero(r.completed ?? 0), fallidas: entero(r.failed ?? 0) })}
        {(r.active ?? 0) > 0 && <span className="block text-success-text">{t('resultado.enCurso', { n: entero(r.active) })}</span>}
      </span>
    ) : (
      <span className="text-[13px] text-fg-secondary">{t('resultado.mensajes', { entregados: entero(r.delivered ?? 0), leidos: entero(r.read ?? 0), respondieron: entero(r.replied ?? 0) })}</span>
    );
  };

  const nombre = (c: CampanaUnificada) => (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-fg">{c.name}</p>
      {c.contentName && <p className="truncate text-xs text-fg-secondary">{t(c.source === 'voice' ? 'contenido.agente' : 'contenido.plantilla', { nombre: c.contentName })}</p>}
    </div>
  );
  const canalCelda = (c: CampanaUnificada) => {
    const Icono = ICONO_CANAL[c.channel as keyof typeof ICONO_CANAL] ?? Send;
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-fg">
        <Icono aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
        {t(`canales.${c.channel in ICONO_CANAL ? c.channel : 'otro'}`)}
      </span>
    );
  };
  const estadoCelda = (c: CampanaUnificada) => {
    const e = estadoFilaCampana(c);
    return <StatusBadge estado={e.clave} etiqueta={t(`estados.${e.clave}`)} tono={e.tono} />;
  };
  const progreso = (c: CampanaUnificada) =>
    c.progress.total > 0 ? (
      <BarraProgreso valor={c.progress.pct} etiqueta={t('columnas.progreso')} textoValor={t('progreso', { hechos: entero(c.progress.done), total: entero(c.progress.total) })} tamano="sm" />
    ) : (
      <span className="text-[13px] text-fg-muted">{t('sinAudiencia')}</span>
    );

  const columnas: ColumnaTabla<CampanaUnificada>[] = [
    { id: 'nombre', encabezado: t('columnas.campana'), celda: nombre },
    { id: 'canal', encabezado: t('columnas.canal'), celda: canalCelda, ocultarDebajo: 'sm' },
    { id: 'segmento', encabezado: t('columnas.segmento'), celda: (c) => <span className="text-[13px] text-fg-secondary">{c.segmentName ?? '—'}</span>, ocultarDebajo: 'lg' },
    { id: 'estado', encabezado: t('columnas.estado'), celda: estadoCelda },
    { id: 'progreso', encabezado: t('columnas.progreso'), celda: progreso, ocultarDebajo: 'md', ancho: 200 },
    { id: 'resultado', encabezado: t('columnas.resultado'), celda: resultado, ocultarDebajo: 'xl' },
  ];

  const nueva = (
    <Link href="/app/crm/campanas/nuevo" className={clasesBoton({ variante: 'primario' })}>
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('nueva')}
    </Link>
  );

  return (
    <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={Send}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('titulo') }]}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={recargar} disabled={estado === 'cargando'} aria-label={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <Link href="/app/crm/agentes-ia?pestana=campanas" className={clasesBoton({ variante: 'secundario' })}>
              <Bot aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevaVoz')}
            </Link>
            {nueva}
          </>
        }
        movil={{ accion: nueva }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl<CanalCampana>
          etiqueta={t('canal')}
          valor={canal}
          onValorChange={(v) => {
            setCanal(v);
            setPagina(1);
          }}
          opciones={CANALES_CAMPANA.map((v) => ({ valor: v, etiqueta: t(`filtros.${v}`), contador: datos?.porCanal[v] }))}
        />
        <SearchInput
          className="w-full sm:ml-auto sm:max-w-xs"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPagina(1);
          }}
          etiqueta={t('buscar')}
          placeholder={t('buscar')}
          pistaAtajo={false}
        />
      </div>

      <DataTable
        columnas={columnas}
        filas={estado === 'listo' ? datos?.rows ?? [] : []}
        obtenerId={(c) => `${c.source}:${c.id}`}
        etiqueta={t('titulo')}
        estado={estado}
        onFilaClick={(c) => router.push(rutaCampana(c))}
        etiquetaFila={(c) => c.name}
        acciones={acciones}
        tarjetaMovil={(c) => (
          <div className="space-y-2 p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">{nombre(c)}</div>
              {estadoCelda(c)}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {canalCelda(c)}
              {c.segmentName && <span className="text-xs text-fg-secondary">{c.segmentName}</span>}
            </div>
            {progreso(c)}
          </div>
        )}
        termino={q.trim() || undefined}
        vacio={{ icono: Send, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), accion: { etiqueta: t('nueva'), href: '/app/crm/campanas/nuevo', icono: Plus } }}
        sinResultados={{ titulo: t('sinResultados.titulo'), descripcion: t('sinResultados.descripcion') }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onReintentar={recargar}
        onLimpiarFiltros={() => {
          setQ('');
          setCanal('all');
          setPagina(1);
        }}
        filasEsqueleto={6}
        pie={
          (datos?.total ?? 0) > TAMANO_PAGINA_CAMPANAS ? (
            <Pagination pagina={pagina} tamano={TAMANO_PAGINA_CAMPANAS} total={datos?.total ?? 0} onPaginaChange={setPagina} sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.otros') }} cargando={estado === 'cargando'} />
          ) : undefined
        }
      />

      <ConfirmDialog
        abierto={!!borrar}
        onAbiertoChange={(a) => !a && setBorrar(null)}
        titulo={t('borrar.titulo')}
        descripcion={t('borrar.descripcion')}
        textoConfirmar={t('borrar.confirmar')}
        tono="peligro"
        icono={Trash2}
        cargando={ocupado}
        onConfirmar={async () => {
          if (!borrar) return;
          setOcupado(true);
          try {
            await CampanasService.deleteCampaign(borrar.id);
            toast({ title: t('ok.eliminar') });
            setBorrar(null);
            recargar();
          } catch (e) {
            toast({ title: t('errores.accion'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
          } finally {
            setOcupado(false);
          }
        }}
      />
    </div>
  );
}
