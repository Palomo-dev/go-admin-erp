'use client';

/**
 * Turnos › Plantillas (Figma 20.8.7 y 20.8.9): las plantillas que se usan al
 * programar y en las rotaciones. La plantilla guarda horas, no recargos: las
 * nocturnas se calculan con el parámetro vigente (Ley 2466 de 2025: desde las
 * 7 p. m.) y se recalculan si el parámetro cambia.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Copy, LayoutTemplate, Pencil, Plus, Power, Users } from 'lucide-react';
import {
  DataTable,
  Dialogo,
  EmptyState,
  FilaDato,
  FilterPanel,
  FormField,
  ListCard,
  ListToolbar,
  SearchInput,
  SegmentedControl,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calcularPlantilla, partesHoras, rangosDias, type PlantillaTurno } from '@/lib/hrm/turnos/programacion';
import { SelectorHora } from './DialogosTurno';
import { enviar, useCarga, useMensajeErrorTurnos } from './apiTurnos';
import { useFormatoHora } from './formatoHora';

interface RespuestaPlantillas {
  plantillas: PlantillaTurno[];
  nocturno: { inicio: number | null; fin: number | null };
  puede_gestionar: boolean;
}

export interface CabeceraPlantillas {
  subtitulo: string | undefined;
  puedeCrear: boolean;
  crear: () => void;
}

const DESCANSOS = [0, 15, 30, 45, 60, 90, 120, 180];

function useDuracion() {
  const t = useTranslations('hrmTurnos.plantillas');
  return (minutos: number) => {
    const { h, m } = partesHoras(minutos);
    return m ? t('hMin', { h, m }) : t('h', { h });
  };
}

function useDias() {
  const t = useTranslations('hrmTurnos.plantillas.dias');
  return (dias: number[]) => {
    if (dias.length === 0 || dias.length === 7) return t('rango', { desde: t('d1'), hasta: t('d7') });
    return rangosDias(dias)
      .map(([a, b]) => (a === b ? t(`d${a}`) : b === a + 1 ? t('par', { a: t(`d${a}`), b: t(`d${b}`) }) : t('rango', { desde: t(`d${a}`), hasta: t(`d${b}`) })))
      .join(', ');
  };
}

export function PlantillasTurno({ onCabecera, selector, onVerUso }: { onCabecera: (c: CabeceraPlantillas) => void; selector: React.ReactNode; onVerUso: (id: string) => void }) {
  const t = useTranslations('hrmTurnos.plantillas');
  const f = useFormatoHora();
  const duracion = useDuracion();
  const textoDias = useDias();
  const mensaje = useMensajeErrorTurnos();
  const { carga, recargar } = useCarga<RespuestaPlantillas>('/api/hrm/turnos/plantillas');
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<'todas' | 'activas' | 'inactivas'>('todas');
  const [editar, setEditar] = useState<{ plantilla: PlantillaTurno | null; duplicar?: boolean } | null>(null);

  const filas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return (datos?.plantillas ?? []).filter(
      (p) => (!q || p.nombre.toLowerCase().includes(q)) && (estado === 'todas' || (estado === 'activas') === p.activa)
    );
  }, [datos, texto, estado]);
  const puede = !!datos?.puede_gestionar;

  useEffect(() => {
    onCabecera({
      subtitulo: datos ? t('subtitulo', { n: datos.plantillas.length }) : undefined,
      puedeCrear: puede,
      crear: () => setEditar({ plantilla: null }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, puede]);

  const calculo = (p: PlantillaTurno) => calcularPlantilla(p.hora_inicio, p.hora_fin, p.descanso_min, p.descanso_pagado, datos?.nocturno ?? { inicio: null, fin: null });
  const nocturnas = (p: PlantillaTurno) => {
    const c = calculo(p);
    if (c.nocturnas === 0) return '—';
    if (c.diurnas === 0) return duracion(c.nocturnas);
    return t('nocturnasDesde', { duracion: duracion(c.nocturnas), hora: f.pared(`${String(datos?.nocturno.inicio ?? 19).padStart(2, '0')}:00`) });
  };
  const descanso = (p: PlantillaTurno) =>
    p.descanso_min === 0 ? t('sinDescanso') : t(p.descanso_pagado ? 'descansoPagado' : 'descansoNoPagado', { min: p.descanso_min });
  const horario = (p: PlantillaTurno) => {
    const base = `${f.pared(p.hora_inicio)} – ${f.pared(p.hora_fin)}`;
    return p.hora_fin <= p.hora_inicio ? `${base} · ${t('cruzaMedianoche')}` : base;
  };

  const cambiarEstado = async (p: PlantillaTurno) => {
    try {
      await enviar(`/api/hrm/turnos/plantillas/${p.id}`, 'PUT', { activa: !p.activa });
      toast.success(p.activa ? t('desactivada') : t('activada'));
      await recargar();
    } catch (e) {
      toast.error(mensaje(e));
    }
  };
  const acciones = (p: PlantillaTurno): AccionFila[] =>
    puede
      ? [
          { id: 'editar', etiqueta: t('menu.editar'), icono: Pencil, onSelect: () => setEditar({ plantilla: p }) },
          { id: 'duplicar', etiqueta: t('menu.duplicar'), icono: Copy, onSelect: () => setEditar({ plantilla: p, duplicar: true }) },
          { id: 'uso', etiqueta: t('menu.verUso'), icono: Users, onSelect: () => onVerUso(p.id) },
          {
            id: 'estado',
            etiqueta: p.activa ? t('menu.desactivar') : t('menu.activar'),
            icono: Power,
            separadorAntes: true,
            onSelect: () => void cambiarEstado(p),
          },
        ]
      : [{ id: 'uso', etiqueta: t('menu.verUso'), icono: Users, onSelect: () => onVerUso(p.id) }];

  const columnas: ColumnaTabla<PlantillaTurno>[] = [
    {
      id: 'plantilla',
      encabezado: t('columnas.plantilla'),
      celda: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{p.nombre}</p>
          <p className="truncate text-xs text-fg-secondary">{horario(p)}</p>
        </div>
      ),
    },
    { id: 'horas', encabezado: t('columnas.horas'), celda: (p) => duracion(calculo(p).duracion) },
    { id: 'nocturnas', encabezado: t('columnas.nocturnas'), ocultarDebajo: 'xl', celda: nocturnas },
    { id: 'descanso', encabezado: t('columnas.descanso'), ocultarDebajo: 'lg', celda: descanso },
    { id: 'dias', encabezado: t('columnas.dias'), ocultarDebajo: 'lg', celda: (p) => textoDias(p.dias) },
    { id: 'uso', encabezado: t('columnas.uso'), celda: (p) => t('personas', { n: p.en_uso }) },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (p) => (
        <Badge tono={p.activa ? 'exito' : 'neutro'} apariencia="contorno" tamano="sm">
          {p.activa ? t('activa') : t('inactiva')}
        </Badge>
      ),
    },
  ];

  if (carga.estado === 'sinPermiso') {
    return <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('irInicio'), href: '/app/inicio' }} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {selector}
      <ListToolbar
        busqueda={<SearchInput value={texto} onChange={setTexto} placeholder={t('buscar')} etiqueta={t('buscar')} debounceMs={150} />}
        filtros={
          <FilterPanel conteo={estado === 'todas' ? 0 : 1} onLimpiar={() => setEstado('todas')} textoVerResultados={t('ver', { n: filas.length })}>
            <FormField etiqueta={t('columnas.estado')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={estado}
                  onValorChange={setEstado}
                  opciones={[
                    { valor: 'todas', etiqueta: t('todas') },
                    { valor: 'activas', etiqueta: t('activas') },
                    { valor: 'inactivas', etiqueta: t('inactivas') },
                  ]}
                />
              )}
            </FormField>
          </FilterPanel>
        }
      />
      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(p) => p.id}
        estado={
          carga.estado === 'cargando'
            ? 'cargando'
            : carga.estado === 'error' || carga.estado === 'noExiste'
              ? 'error'
              : filas.length === 0
                ? (datos?.plantillas.length ?? 0) === 0
                  ? 'vacio'
                  : 'sinResultados'
                : 'listo'
        }
        acciones={acciones}
        etiquetaFila={(p) => p.nombre}
        onFilaClick={puede ? (p) => setEditar({ plantilla: p }) : undefined}
        tarjetaMovil={(p) => (
          <ListCard
            icono={LayoutTemplate}
            titulo={p.nombre}
            subtitulo={`${horario(p)} · ${duracion(calculo(p).duracion)}`}
            meta={p.en_uso ? `${t('personas', { n: p.en_uso })} · ${textoDias(p.dias)}` : t('sinUso')}
            estado={
              <Badge tono={p.activa ? 'exito' : 'neutro'} apariencia="contorno" tamano="sm">
                {p.activa ? t('activa') : t('inactiva')}
              </Badge>
            }
            acciones={acciones(p)}
            onClick={puede ? () => setEditar({ plantilla: p }) : undefined}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: LayoutTemplate,
          accion: puede ? { etiqueta: t('nueva'), onClick: () => setEditar({ plantilla: null }), icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        onReintentar={() => void recargar()}
        onLimpiarFiltros={() => {
          setTexto('');
          setEstado('todas');
        }}
        termino={texto}
      />
      <p className="text-xs text-fg-secondary">{t('nota', { hora: f.pared(`${String(datos?.nocturno.inicio ?? 19).padStart(2, '0')}:00`) })}</p>
      {puede && (
        <button type="button" className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface text-sm font-medium text-fg lg:hidden" onClick={() => setEditar({ plantilla: null })}>
          <Plus aria-hidden className="size-4" strokeWidth={1.5} />
          {t('nueva')}
        </button>
      )}
      <DialogoPlantilla
        abierto={editar !== null}
        onAbiertoChange={(v) => !v && setEditar(null)}
        plantilla={editar?.plantilla ?? null}
        duplicar={!!editar?.duplicar}
        nocturno={datos?.nocturno ?? { inicio: null, fin: null }}
        onGuardada={() => void recargar()}
      />
    </div>
  );
}

function DialogoPlantilla({
  abierto,
  onAbiertoChange,
  plantilla,
  duplicar,
  nocturno,
  onGuardada,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  plantilla: PlantillaTurno | null;
  duplicar: boolean;
  nocturno: { inicio: number | null; fin: number | null };
  onGuardada: () => void;
}) {
  const t = useTranslations('hrmTurnos.plantillas.dialogo');
  const tp = useTranslations('hrmTurnos.plantillas');
  const td = useTranslations('hrmTurnos.plantillas.dias');
  const f = useFormatoHora();
  const duracion = useDuracion();
  const mensaje = useMensajeErrorTurnos();
  const [nombre, setNombre] = useState('');
  const [inicio, setInicio] = useState('14:00');
  const [fin, setFin] = useState('21:00');
  const [descanso, setDescanso] = useState(30);
  const [pagado, setPagado] = useState(false);
  const [dias, setDias] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const nueva = !plantilla || duplicar;

  useEffect(() => {
    if (!abierto) return;
    setNombre(plantilla ? (duplicar ? t('copiaDe', { nombre: plantilla.nombre }) : plantilla.nombre) : '');
    setInicio(plantilla?.hora_inicio ?? '14:00');
    setFin(plantilla?.hora_fin ?? '21:00');
    setDescanso(plantilla?.descanso_min ?? 30);
    setPagado(plantilla?.descanso_pagado ?? false);
    setDias(plantilla?.dias ?? []);
    setError(null);
  }, [abierto, plantilla, duplicar, t]);

  const c = calcularPlantilla(inicio, fin, descanso, pagado, nocturno);
  const guardar = async () => {
    if (!nombre.trim()) {
      setError(t('nombreRequerido'));
      return;
    }
    setEnviando(true);
    try {
      const cuerpo = { nombre, hora_inicio: inicio, hora_fin: fin, descanso_min: descanso, descanso_pagado: pagado, dias };
      if (nueva) await enviar('/api/hrm/turnos/plantillas', 'POST', cuerpo);
      else await enviar(`/api/hrm/turnos/plantillas/${plantilla!.id}`, 'PUT', cuerpo);
      toast.success(nueva ? t('creada') : t('guardada'));
      onAbiertoChange(false);
      onGuardada();
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={nueva ? t('tituloNueva') : t('tituloEditar')}
      descripcion={t('descripcion')}
      ancho={520}
      primario={{ etiqueta: nueva ? t('crear') : t('guardar'), onClick: () => void guardar(), cargando: enviando }}
      textoCancelar={t('cancelar')}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('nombre')} obligatorio error={error}>
          {(cp) => <Input id={cp.id} value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} aria-invalid={!!error} />}
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <SelectorHora etiqueta={t('empieza')} valor={inicio} onCambio={setInicio} />
          <SelectorHora etiqueta={t('termina')} valor={fin} onCambio={setFin} />
        </div>
        <FormField etiqueta={t('descanso')}>
          {(cp) => (
            <Select value={`${descanso}|${pagado ? 1 : 0}`} onValueChange={(v) => {
              const [m, p] = v.split('|');
              setDescanso(Number(m));
              setPagado(p === '1');
            }}>
              <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0|0">{tp('sinDescanso')}</SelectItem>
                {DESCANSOS.filter((m) => m > 0).flatMap((m) => [
                  <SelectItem key={`${m}0`} value={`${m}|0`}>
                    {tp('descansoNoPagado', { min: m })}
                  </SelectItem>,
                  <SelectItem key={`${m}1`} value={`${m}|1`}>
                    {tp('descansoPagado', { min: m })}
                  </SelectItem>,
                ])}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <label className="flex items-center gap-3 text-sm text-fg">
          <Checkbox checked={c.cruzaMedianoche} disabled aria-describedby="cruza-ayuda" />
          {t('cruza')}
          <span id="cruza-ayuda" className="sr-only">
            {t('cruzaAyuda')}
          </span>
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">{t('dias')}</legend>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm text-fg">
                <Checkbox
                  checked={dias.length === 0 || dias.includes(d)}
                  onCheckedChange={(v) =>
                    setDias((x) => {
                      const base = x.length === 0 ? [1, 2, 3, 4, 5, 6, 7] : x;
                      const n = v === true ? Array.from(new Set([...base, d])) : base.filter((y) => y !== d);
                      return n.length === 7 ? [] : n.sort((a, b) => a - b);
                    })
                  }
                />
                {td(`d${d}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1 rounded-lg bg-subtle p-3">
          <FilaDato etiqueta={t('duracion')} valor={<span className="text-base font-semibold">{duracion(c.duracion)}</span>} />
          <FilaDato
            etiqueta={t('nocturnas')}
            valor={c.nocturnas ? t('nocturnasDesde', { duracion: duracion(c.nocturnas), hora: f.pared(`${String(nocturno.inicio ?? 19).padStart(2, '0')}:00`) }) : '—'}
          />
          <FilaDato etiqueta={t('diurnas')} valor={duracion(c.diurnas)} />
        </div>
        <p className="text-xs text-fg-secondary">{t('nota')}</p>
      </div>
    </Dialogo>
  );
}
