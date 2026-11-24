'use client';

/**
 * /app/crm/segmentos/[id] — Figma CRM 1384:1045 «Segmentos / Miembros».
 *
 * Cabecera con migas y «←», cuatro KPI (clientes y quién se puede contactar
 * por teléfono, correo y WhatsApp) y la tabla de miembros: Cliente · Ciudad ·
 * Teléfono · Correo · WhatsApp · Salud · Entró. La contactabilidad de cada
 * fila sale de la misma puerta del envío (`fn_can_contact`, vía
 * `crm_segment_context_page`); los KPI, del conteo del servidor (dinámico) o
 * del último recálculo guardado (`counts_json`).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Copy, Pencil, Play, Send, Trash2, Users } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
  AvatarIniciales,
  ConfirmDialog,
  DataTable,
  EmptyState,
  KpiStrip,
  PageHeader,
  RowActionsMenu,
  StatCard,
  StatusBadge,
  clasesBoton,
  type ColumnaTabla,
  type EstadoTabla,
  type TonoBadge,
} from '@/components/kit';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { cn } from '@/utils/Utils';
import type { ConteoSegmento } from '@/lib/services/crm/segmentosConteoService';
import { SegmentosService, type MiembroSegmento } from '../SegmentosService';
import type { Segment } from '../types';
import {
  bandaSalud,
  conteosDesdeDesglose,
  enUso,
  haceCuanto,
  instanteActualizado,
  leerConteos,
  leerUsos,
  piezasDeUso,
  type ConteosSegmento,
  type UsoSegmento,
} from '../segmentosListaLogica';

interface SegmentoDetallePageProps {
  segmentId: string;
}

const TONO_SALUD: Record<ReturnType<typeof bandaSalud>, TonoBadge> = { verde: 'exito', amarilla: 'advertencia', roja: 'peligro', sinDato: 'neutro' };

export function SegmentoDetallePage({ segmentId }: SegmentoDetallePageProps) {
  const t = useTranslations('crm.segmentos.miembros');
  const tl = useTranslations('crm.segmentos.lista');
  const tc = useTranslations('crm.segmentos.constructor');
  const router = useRouter();
  const entero = useFormatoEntero();
  const locale = useLocaleIntl();

  const [segmento, setSegmento] = useState<Segment | null>(null);
  const [estadoSegmento, setEstadoSegmento] = useState<'cargando' | 'listo' | 'noEncontrado' | 'error'>('cargando');
  const [miembros, setMiembros] = useState<MiembroSegmento[]>([]);
  const [estadoMiembros, setEstadoMiembros] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [conteos, setConteos] = useState<ConteosSegmento | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [recalculando, setRecalculando] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [usos, setUsos] = useState<UsoSegmento | undefined>(undefined);

  const cargar = useCallback(async () => {
    setEstadoSegmento('cargando');
    setEstadoMiembros('cargando');
    let s: Segment | null;
    try {
      s = await SegmentosService.getSegmentById(segmentId);
    } catch {
      setEstadoSegmento('error');
      return;
    }
    if (!s) {
      setEstadoSegmento('noEncontrado');
      return;
    }
    setSegmento(s);
    setAhora(Date.now());
    setConteos(leerConteos(s.counts_json));
    setEstadoSegmento('listo');
    SegmentosService.getUsos([s.id])
      .then((raw) => setUsos(leerUsos(raw).get(segmentId)))
      .catch(() => setUsos(undefined));

    if (s.is_dynamic && s.filter_json) {
      SegmentosService.previewFilter(s.filter_json as Parameters<typeof SegmentosService.previewFilter>[0])
        .then((c: ConteoSegmento) => setConteos(conteosDesdeDesglose(c.coinciden, c.base, c.desglose)))
        .catch(() => undefined);
    }
    try {
      setMiembros(await SegmentosService.getMiembros(s));
      setEstadoMiembros('listo');
    } catch {
      setEstadoMiembros('error');
    }
  }, [segmentId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const recalcular = async () => {
    setRecalculando(true);
    try {
      const n = await SegmentosService.recalculateSegment(segmentId);
      toast({ title: tl('ok.recalculado'), description: tl('ok.clientes', { n, valor: entero(n) }) });
      void cargar();
    } catch {
      toast({ title: tl('errores.recalcular'), variant: 'destructive' });
    } finally {
      setRecalculando(false);
    }
  };

  const duplicar = async () => {
    const copia = await SegmentosService.duplicateSegment(segmentId);
    if (copia) {
      toast({ title: tl('ok.duplicado') });
      router.push(`/app/crm/segmentos/${copia.id}`);
    } else toast({ title: tl('errores.duplicar'), variant: 'destructive' });
  };

  const eliminar = async () => {
    const r = await SegmentosService.deleteSegment(segmentId);
    setBorrar(false);
    if (r === 'ok') {
      toast({ title: tl('ok.eliminado') });
      router.push('/app/crm/segmentos');
    } else toast({ title: r === 'enCurso' ? tl('errores.enCurso') : tl('errores.eliminar'), variant: 'destructive' });
  };

  const migas = [
    { etiqueta: tc('migas.crm'), href: '/app/crm' },
    { etiqueta: tc('migas.segmentos'), href: '/app/crm/segmentos' },
    { etiqueta: segmento?.name ?? t('cargando') },
  ];

  if (estadoSegmento === 'noEncontrado' || estadoSegmento === 'error') {
    return (
      <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
        <PageHeader variante="form" volverA="/app/crm/segmentos" titulo={tc('migas.segmentos')} migas={migas.slice(0, 2)} />
        <EmptyState
          variante={estadoSegmento === 'error' ? 'error' : 'empty'}
          titulo={estadoSegmento === 'error' ? t('error.titulo') : t('noEncontrado.titulo')}
          descripcion={estadoSegmento === 'error' ? t('error.descripcion') : t('noEncontrado.descripcion')}
          onReintentar={estadoSegmento === 'error' ? () => void cargar() : undefined}
          accion={estadoSegmento === 'noEncontrado' ? { etiqueta: t('noEncontrado.volver'), href: '/app/crm/segmentos' } : undefined}
        />
      </div>
    );
  }

  const cargando = estadoSegmento === 'cargando';
  const instante = segmento ? instanteActualizado(segmento) : null;
  const subtitulo = segmento
    ? [
        segmento.is_dynamic ? tc('datos.dinamico') : tc('datos.estatico'),
        tl('ok.clientes', { n: segmento.customer_count || 0, valor: entero(segmento.customer_count || 0) }),
        instante
          ? t(segmento.is_dynamic ? 'subtitulo.recalculado' : 'subtitulo.importado', { cuando: haceCuanto(instante, locale, ahora).toLocaleLowerCase(locale) })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  const acciones = segmento ? (
    <>
      {segmento.is_dynamic && (
        <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => router.push(`/app/crm/segmentos/${segmentId}/editar`)}>
          <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('editarReglas')}
        </button>
      )}
      <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => router.push(`/app/crm/campanas/nuevo?segment=${segmentId}`)}>
        <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('usarEnCampana')}
      </button>
      <RowActionsMenu
        orientacion="horizontal"
        titulo={segmento.name}
        acciones={[
          { id: 'recalcular', etiqueta: tl('menu.recalcular'), icono: Play, onSelect: () => void recalcular(), oculta: !segmento.is_dynamic, deshabilitada: recalculando },
          { id: 'duplicar', etiqueta: tl('menu.duplicar'), icono: Copy, onSelect: () => void duplicar() },
          { id: 'eliminar', etiqueta: tl('menu.eliminar'), icono: Trash2, destructiva: true, separadorAntes: true, onSelect: () => setBorrar(true) },
        ]}
      />
    </>
  ) : undefined;

  const total = segmento?.customer_count ?? 0;
  const sinDesglose = t('kpi.sinDesglose');
  const cifra = (n: number | undefined) => (n === undefined ? '—' : entero(n));

  const siNo = (si: boolean, estado: string) => (
    <StatusBadge estado={estado} etiqueta={si ? t('si') : t('no')} tono={si ? 'exito' : 'neutro'} tamano="sm" />
  );
  const correoBadge = (m: MiembroSegmento) =>
    m.email && m.email_bounced ? <StatusBadge estado="rebotado" etiqueta={t('correo.rebotado')} tono="peligro" tamano="sm" /> : siNo(!!m.email && m.can_email, 'correo');
  const whatsappBadge = (m: MiembroSegmento) => siNo(!!m.phone && m.can_whatsapp, 'whatsapp');
  const saludBadge = (m: MiembroSegmento) => {
    const banda = bandaSalud(m.health_score);
    return <StatusBadge estado={`salud-${banda}`} etiqueta={t(`salud.${banda}`)} tono={TONO_SALUD[banda]} tamano="sm" />;
  };
  const telefono = (m: MiembroSegmento) =>
    m.phone ? (
      <div className="min-w-0">
        <p className={cn('truncate tabular-nums text-fg', (m.do_not_call || !m.can_voice) && 'font-medium')}>{m.phone}</p>
        {(m.do_not_call || !m.can_voice) && <p className="text-xs text-fg-secondary">{t('telefono.rne')}</p>}
      </div>
    ) : (
      <span className="text-fg-muted">—</span>
    );
  const cliente = (m: MiembroSegmento) => {
    const titulo = m.company_name || m.full_name || t('sinNombre');
    const contacto = m.company_name ? m.full_name : null;
    return (
      <div className="flex min-w-0 items-center gap-3">
        <AvatarIniciales nombre={titulo} tamano="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{titulo}</p>
          {contacto && <p className="truncate text-xs text-fg-secondary">{contacto}</p>}
        </div>
      </div>
    );
  };

  const columnas: ColumnaTabla<MiembroSegmento>[] = [
    { id: 'cliente', encabezado: t('columnas.cliente'), celda: cliente, ancho: '26%' },
    { id: 'ciudad', encabezado: t('columnas.ciudad'), celda: (m) => <span className="text-fg-secondary">{m.city ?? '—'}</span>, ocultarDebajo: 'xl' },
    { id: 'telefono', encabezado: t('columnas.telefono'), celda: telefono },
    { id: 'correo', encabezado: t('columnas.correo'), celda: correoBadge, ocultarDebajo: 'md' },
    { id: 'whatsapp', encabezado: t('columnas.whatsapp'), celda: whatsappBadge, ocultarDebajo: 'md' },
    { id: 'salud', encabezado: t('columnas.salud'), celda: saludBadge, ocultarDebajo: 'lg' },
    { id: 'entro', encabezado: t('columnas.entro'), celda: (m) => <span className="text-fg-secondary">{haceCuanto(m.entro_en, locale, ahora) || '—'}</span>, ocultarDebajo: 'lg' },
  ];

  const estadoTabla: EstadoTabla = cargando || estadoMiembros === 'cargando' ? 'cargando' : estadoMiembros === 'error' ? 'error' : miembros.length === 0 ? 'vacio' : 'listo';

  return (
    <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        variante="form"
        volverA="/app/crm/segmentos"
        titulo={segmento?.name ?? t('cargando')}
        subtitulo={subtitulo}
        cargando={cargando}
        migas={migas}
        acciones={acciones}
        movil={{ accionesEnFila: true }}
      />

      <KpiStrip columnas={4} etiqueta={t('kpi.etiqueta')}>
        <StatCard cargando={cargando} etiqueta={t('kpi.clientes')} valor={entero(conteos?.total ?? total)} />
        <StatCard
          cargando={cargando}
          etiqueta={t('kpi.telefono')}
          valor={cifra(conteos?.voice_contactable)}
          detalle={conteos ? (conteos.rne_excluded > 0 ? t('kpi.rne', { n: conteos.rne_excluded, valor: entero(conteos.rne_excluded) }) : undefined) : sinDesglose}
          tono={conteos && conteos.rne_excluded > 0 ? 'advertencia' : undefined}
          iconoDetalle={conteos && conteos.rne_excluded > 0 ? AlertTriangle : undefined}
        />
        <StatCard cargando={cargando} etiqueta={t('kpi.correo')} valor={cifra(conteos?.email_contactable)} detalle={conteos ? undefined : sinDesglose} />
        <StatCard cargando={cargando} etiqueta={t('kpi.whatsapp')} valor={cifra(conteos?.whatsapp_contactable)} detalle={conteos ? t('kpi.plantillas') : sinDesglose} />
      </KpiStrip>

      <DataTable<MiembroSegmento>
        etiqueta={t('tabla')}
        columnas={columnas}
        filas={miembros}
        obtenerId={(m) => m.id}
        estado={estadoTabla}
        etiquetaFila={(m) => m.company_name || m.full_name || t('sinNombre')}
        onFilaClick={(m) => router.push(`/app/crm/clientes/${m.id}`)}
        filasEsqueleto={6}
        onReintentar={() => void cargar()}
        vacio={{ icono: Users, titulo: t('vacio.titulo'), descripcion: segmento?.is_dynamic ? t('vacio.dinamico') : t('vacio.estatico') }}
        error={{ titulo: t('error.miembros'), descripcion: t('error.descripcion') }}
        tarjetaMovil={(m) => (
          <div className="space-y-2 p-4">
            {cliente(m)}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {telefono(m)}
              {correoBadge(m)}
              {whatsappBadge(m)}
              {saludBadge(m)}
            </div>
          </div>
        )}
      />
      {miembros.length >= 50 && <p className="text-xs text-fg-secondary">{t('primeros', { n: 50 })}</p>}

      <ConfirmDialog
        abierto={borrar}
        onAbiertoChange={setBorrar}
        titulo={tl('eliminar.titulo')}
        descripcion={
          enUso(usos)
            ? `${tl('eliminar.descripcion', { nombre: segmento?.name ?? '' })} ${tl('eliminar.enUso', { usos: piezasDeUso(usos).map((p) => tl(`uso.${p.clave}`, { n: p.n })).join(', ') })}`
            : tl('eliminar.descripcion', { nombre: segmento?.name ?? '' })
        }
        textoConfirmar={tl('menu.eliminar')}
        tono="peligro"
        varianteConfirmar="destructivo"
        onConfirmar={() => void eliminar()}
      />
    </div>
  );
}
