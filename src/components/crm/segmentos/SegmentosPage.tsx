'use client';

/**
 * /app/crm/segmentos — Figma CRM 1384:17 «Listado — listo», 1388:632 «vacío»,
 * 1388:1079 «cargando» y 1388:1532 «error».
 *
 * Cabecera con «Importar lista», «Nuevo segmento» y «⋯»; búsqueda y chips
 * Todos / Dinámicos / Estáticos; tabla Segmento · Tipo · Clientes ·
 * Contactables · Actualizado · Usado en · «⋯». En celular, una tarjeta por
 * segmento. Datos reales: `segments`, `counts_json` (contactables) y
 * `crm_segment_usages` (campañas, campañas de voz y secuencias).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Copy, Download, Mail, MessageSquare, Pencil, Phone, Play, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
  ChipsOpcion,
  ConfirmDialog,
  DataTable,
  PageHeader,
  RowActionsMenu,
  SearchInput,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { cn } from '@/utils/Utils';
import { SegmentosService } from './SegmentosService';
import type { Segment } from './types';
import { ImportarListaDialog } from './ImportarListaDialog';
import {
  contactables,
  enUso,
  filtrarSegmentos,
  haceCuanto,
  instanteActualizado,
  leerConteos,
  leerUsos,
  piezasDeUso,
  reglasDeResumen,
  type CanalContacto,
  type TipoFiltroSegmento,
  type UsoSegmento,
} from './segmentosListaLogica';

const ICONO_CANAL: Record<CanalContacto, typeof Phone> = { telefono: Phone, correo: Mail, whatsapp: MessageSquare };

export function SegmentosPage() {
  const t = useTranslations('crm.segmentos.lista');
  const tc = useTranslations('crm.segmentos.constructor');
  const router = useRouter();
  const locale = useLocaleIntl();
  const entero = useFormatoEntero();
  const { formatDate } = useFormatDate();

  const [segmentos, setSegmentos] = useState<Segment[]>([]);
  const [usos, setUsos] = useState<Map<string, UsoSegmento>>(new Map());
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'sinPermiso'>('cargando');
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<TipoFiltroSegmento>('todos');
  const [importar, setImportar] = useState(false);
  const [borrar, setBorrar] = useState<Segment | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const lista = await SegmentosService.listarSegmentos();
      setSegmentos(lista);
      setAhora(Date.now());
      setEstado('listo');
      // «Usado en» no bloquea la tabla: si falla, la columna queda en «—».
      SegmentosService.getUsos(lista.map((s) => s.id))
        .then((raw) => setUsos(leerUsos(raw)))
        .catch(() => setUsos(new Map()));
    } catch (e) {
      setEstado((e as { code?: string } | null)?.code === '42501' ? 'sinPermiso' : 'error');
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => filtrarSegmentos(segmentos, busqueda, tipo), [segmentos, busqueda, tipo]);
  const hayFiltro = busqueda.trim() !== '' || tipo !== 'todos';
  const estadoTabla: EstadoTabla =
    estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : estado === 'sinPermiso' ? 'sinPermiso' : segmentos.length === 0 ? 'vacio' : visibles.length === 0 ? 'sinResultados' : 'listo';

  const recalcular = async (s: Segment) => {
    try {
      const n = await SegmentosService.recalculateSegment(s.id);
      toast({ title: t('ok.recalculado'), description: t('ok.clientes', { n, valor: entero(n) }) });
      void cargar();
    } catch {
      toast({ title: t('errores.recalcular'), variant: 'destructive' });
    }
  };

  const duplicar = async (s: Segment) => {
    const copia = await SegmentosService.duplicateSegment(s.id);
    if (copia) {
      toast({ title: t('ok.duplicado') });
      void cargar();
    } else toast({ title: t('errores.duplicar'), variant: 'destructive' });
  };

  const eliminar = async () => {
    if (!borrar) return;
    const r = await SegmentosService.deleteSegment(borrar.id);
    setBorrar(null);
    if (r === 'ok') {
      toast({ title: t('ok.eliminado') });
      void cargar();
    } else toast({ title: r === 'enCurso' ? t('errores.enCurso') : t('errores.eliminar'), variant: 'destructive' });
  };

  const acciones = (s: Segment): AccionFila[] => {
    return [
      { id: 'abrir', etiqueta: t('menu.verMiembros'), icono: Users, onSelect: () => router.push(`/app/crm/segmentos/${s.id}`) },
      { id: 'editar', etiqueta: t('menu.editarReglas'), icono: Pencil, onSelect: () => router.push(`/app/crm/segmentos/${s.id}/editar`), oculta: !s.is_dynamic },
      { id: 'recalcular', etiqueta: t('menu.recalcular'), icono: Play, onSelect: () => void recalcular(s), oculta: !s.is_dynamic },
      { id: 'duplicar', etiqueta: t('menu.duplicar'), icono: Copy, onSelect: () => void duplicar(s) },
      {
        id: 'eliminar',
        etiqueta: t('menu.eliminar'),
        icono: Trash2,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => setBorrar(s),
      },
    ];
  };

  const resumen = (s: Segment): string => {
    if (s.description?.trim()) return s.description.replace(/<[^>]*>/g, '').trim();
    const { piezas, gruposExtra } = reglasDeResumen(s.filter_json);
    if (piezas.length === 0) return s.is_dynamic ? t('resumen.todos') : t('resumen.estatico');
    const texto = piezas
      .map((p) => {
        const campo = tc.has(`campos.${p.campo}`) ? tc(`campos.${p.campo}`) : p.campo;
        if (p.campo === 'tags' && p.operador === 'contains') return t('resumen.etiqueta', { valor: p.valor });
        if (p.operador === 'equals') return `${campo} = ${p.valor}`;
        if (p.operador === 'not_equals') return `${campo} ≠ ${p.valor}`;
        const tipoOp = p.campo === 'tags' ? 'array' : ['created_at', 'last_contact_at'].includes(p.campo) ? 'date' : p.campo === 'health_score' ? 'number' : 'text';
        const op = tc.has(`operadores.${tipoOp}.${p.operador}`) ? tc(`operadores.${tipoOp}.${p.operador}`).toLocaleLowerCase(locale) : p.operador;
        return p.valor ? `${campo} ${op} ${p.valor}` : `${campo} ${op}`;
      })
      .join(' · ');
    return gruposExtra > 0 ? `${texto} ${t('resumen.gruposExtra', { n: gruposExtra })}` : texto;
  };

  const tipoBadge = (s: Segment) => (
    <StatusBadge estado={s.is_dynamic ? 'dinamico' : 'estatico'} etiqueta={s.is_dynamic ? tc('datos.dinamico') : tc('datos.estatico')} tono={s.is_dynamic ? 'marca' : 'neutro'} tamano="sm" />
  );

  const contactablesCelda = (s: Segment) => {
    const c = contactables(leerConteos(s.counts_json));
    const etiquetaContactables = c ? t('contactables.aria', { tel: entero(c.telefono), correo: entero(c.correo), wa: entero(c.whatsapp) }) : t('contactables.sinDato');
    return (
      <span
        className="inline-flex items-center gap-1.5"
        role="img"
        title={etiquetaContactables}
        aria-label={etiquetaContactables}
      >
        {(Object.keys(ICONO_CANAL) as CanalContacto[]).map((canal) => {
          const Icono = ICONO_CANAL[canal];
          const activo = !!c && c[canal] > 0;
          return (
            <Icono
              key={canal}
              aria-hidden="true"
              className={cn('size-4', activo ? 'text-fg-secondary' : 'text-fg-muted opacity-40')}
              strokeWidth={1.5}
            />
          );
        })}
      </span>
    );
  };

  const actualizado = (s: Segment) => {
    const instante = instanteActualizado(s);
    if (!instante) return <span className="text-fg-muted">{t('nunca')}</span>;
    return <span className="text-fg-secondary">{s.is_dynamic ? haceCuanto(instante, locale, ahora) : formatDate(instante)}</span>;
  };

  const usadoEn = (s: Segment) => {
    if (!usos.has(s.id)) return <span className="text-fg-muted">—</span>;
    const piezas = piezasDeUso(usos.get(s.id));
    if (piezas.length === 0) return <StatusBadge estado="sinUso" etiqueta={t('uso.sinUso')} tono="neutro" tamano="sm" />;
    return <span className="text-fg-secondary">{piezas.map((p) => t(`uso.${p.clave}`, { n: p.n })).join(' · ')}</span>;
  };

  const nombre = (s: Segment) => (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-fg">{s.name}</p>
      <p className="truncate text-xs text-fg-secondary">{resumen(s)}</p>
    </div>
  );

  const columnas: ColumnaTabla<Segment>[] = [
    { id: 'segmento', encabezado: t('columnas.segmento'), celda: nombre, ancho: '28%' },
    { id: 'tipo', encabezado: t('columnas.tipo'), celda: tipoBadge, ancho: 122 },
    { id: 'clientes', encabezado: t('columnas.clientes'), celda: (s) => <span className="tabular-nums text-fg">{entero(s.customer_count || 0)}</span>, ancho: 112 },
    { id: 'contactables', encabezado: t('columnas.contactables'), celda: contactablesCelda, ocultarDebajo: 'xl' },
    { id: 'actualizado', encabezado: t('columnas.actualizado'), celda: actualizado, ancho: 152, ocultarDebajo: 'md' },
    { id: 'usado', encabezado: t('columnas.usadoEn'), celda: usadoEn, ancho: 172, ocultarDebajo: 'lg' },
  ];

  return (
    <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={Users}
        migas={[{ etiqueta: tc('migas.crm'), href: '/app/crm' }, { etiqueta: t('titulo') }]}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setImportar(true)}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('importar')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => router.push('/app/crm/segmentos/nuevo')}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevo')}
            </button>
            <RowActionsMenu
              orientacion="horizontal"
              titulo={t('titulo')}
              acciones={[{ id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: () => void cargar() }]}
            />
          </>
        }
        movil={{
          accion: (
            <button type="button" aria-label={t('nuevo')} className={clasesBoton({ variante: 'primario', tamano: 'sm' })} onClick={() => router.push('/app/crm/segmentos/nuevo')}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          ),
        }}
      />

      {estadoTabla !== 'vacio' && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscar')} etiqueta={t('buscar')} className="lg:flex-1" />
          <ChipsOpcion<TipoFiltroSegmento>
            etiqueta={t('filtroTipo')}
            valor={tipo}
            onValorChange={setTipo}
            opciones={[
              { valor: 'todos', etiqueta: t('chips.todos') },
              { valor: 'dinamicos', etiqueta: t('chips.dinamicos') },
              { valor: 'estaticos', etiqueta: t('chips.estaticos') },
            ]}
          />
        </div>
      )}

      <DataTable<Segment>
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(s) => s.id}
        estado={estadoTabla}
        etiquetaFila={(s) => s.name}
        onFilaClick={(s) => router.push(`/app/crm/segmentos/${s.id}`)}
        acciones={acciones}
        filasEsqueleto={6}
        termino={busqueda}
        onLimpiarFiltros={hayFiltro ? () => { setBusqueda(''); setTipo('todos'); } : undefined}
        onReintentar={() => void cargar()}
        vacio={{
          icono: Users,
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          accion: { etiqueta: t('nuevo'), icono: Plus, onClick: () => router.push('/app/crm/segmentos/nuevo') },
        }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        tarjetaMovil={(s) => (
          <div className="space-y-2 p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">{nombre(s)}</div>
              {tipoBadge(s)}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="tabular-nums text-fg">{t('ok.clientes', { n: s.customer_count || 0, valor: entero(s.customer_count || 0) })}</span>
              {contactablesCelda(s)}
              {actualizado(s)}
            </div>
            <div className="text-xs">{usadoEn(s)}</div>
          </div>
        )}
      />

      <ImportarListaDialog abierto={importar} onAbiertoChange={setImportar} onImportado={(id) => router.push(`/app/crm/segmentos/${id}`)} />

      <ConfirmDialog
        abierto={borrar !== null}
        onAbiertoChange={(a) => !a && setBorrar(null)}
        titulo={t('eliminar.titulo')}
        descripcion={
          borrar && enUso(usos.get(borrar.id))
            ? `${t('eliminar.descripcion', { nombre: borrar.name })} ${t('eliminar.enUso', { usos: piezasDeUso(usos.get(borrar.id)).map((p) => t(`uso.${p.clave}`, { n: p.n })).join(', ') })}`
            : t('eliminar.descripcion', { nombre: borrar?.name ?? '' })
        }
        textoConfirmar={t('menu.eliminar')}
        tono="peligro"
        varianteConfirmar="destructivo"
        onConfirmar={() => void eliminar()}
      />
    </div>
  );
}
