'use client';

/**
 * Turnos › Rotaciones (Figma 20.8.8): una rotación propone, no publica. Genera
 * la semana como borrador y los cruces y topes se revisan igual que en la
 * programación antes de publicar (ADR-002 §2, `fn_hr_rotacion_aplicar`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Info, Pause, Pencil, Play, Plus, RefreshCcw, Repeat } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  Dialogo,
  EmptyState,
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addPlainDays } from '@/lib/utils/dateCore';
import { diasDeSemana, lunesDe, type RotacionTurno } from '@/lib/hrm/turnos/programacion';
import { DialogoAplicarRotacion } from './DialogosTurno';
import { enviar, pedir, useCarga, useMensajeErrorTurnos } from './apiTurnos';
import { useFormatoHora } from './formatoHora';

interface RespuestaRotaciones {
  rotaciones: RotacionTurno[];
  plantillas: Array<{ id: string; nombre: string }>;
  puede_gestionar: boolean;
}

export interface CabeceraRotaciones {
  subtitulo: string | undefined;
  puedeCrear: boolean;
  crear: () => void;
}

const DESCANSO = '__descanso__';

export function RotacionesTurno({ onCabecera, selector, hoy }: { onCabecera: (c: CabeceraRotaciones) => void; selector: React.ReactNode; hoy: string }) {
  const t = useTranslations('hrmTurnos.rotaciones');
  const f = useFormatoHora();
  const mensaje = useMensajeErrorTurnos();
  const { carga, recargar } = useCarga<RespuestaRotaciones>('/api/hrm/turnos/rotaciones');
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<'todas' | 'activas' | 'pausadas'>('todas');
  const [editar, setEditar] = useState<{ rotacion: RotacionTurno | null } | null>(null);
  const [generar, setGenerar] = useState<RotacionTurno | null>(null);
  const [personas, setPersonas] = useState<Array<{ id: string; nombre: string; cargo: string | null }>>([]);
  const puede = !!datos?.puede_gestionar;
  const siguiente = addPlainDays(lunesDe(hoy), 7);

  const nombrePlantilla = (id: string | null) => (id ? (datos?.plantillas.find((p) => p.id === id)?.nombre ?? '—') : t('descanso'));
  const resumenPatron = (r: RotacionTurno) => {
    const pasos: string[] = [];
    for (const p of r.patron) {
      const n = nombrePlantilla(p);
      if (pasos[pasos.length - 1] !== n) pasos.push(n);
    }
    return pasos.join(' → ');
  };
  const filas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return (datos?.rotaciones ?? []).filter(
      (r) => (!q || r.nombre.toLowerCase().includes(q)) && (estado === 'todas' || (estado === 'activas') === r.activa)
    );
  }, [datos, texto, estado]);

  useEffect(() => {
    onCabecera({ subtitulo: datos ? t('subtitulo', { n: datos.rotaciones.length }) : undefined, puedeCrear: puede, crear: () => setEditar({ rotacion: null }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, puede]);

  const abrirGenerar = async (r: RotacionTurno) => {
    try {
      const semana = await pedir<{ personas: Array<{ id: string; nombre: string; cargo: string | null }> }>(
        `/api/hrm/turnos?desde=${siguiente}&hasta=${addPlainDays(siguiente, 6)}`
      );
      setPersonas(semana.personas);
      setGenerar(r);
    } catch (e) {
      toast.error(mensaje(e));
    }
  };
  const pausar = async (r: RotacionTurno) => {
    try {
      await enviar(`/api/hrm/turnos/rotaciones/${r.id}`, 'PUT', { activa: !r.activa });
      toast.success(r.activa ? t('pausada') : t('reanudada'));
      await recargar();
    } catch (e) {
      toast.error(mensaje(e));
    }
  };
  const acciones = (r: RotacionTurno): AccionFila[] =>
    puede
      ? [
          { id: 'editar', etiqueta: t('menu.editar'), icono: Pencil, onSelect: () => setEditar({ rotacion: r }) },
          { id: 'generar', etiqueta: t('menu.generar'), icono: RefreshCcw, oculta: !r.activa, onSelect: () => void abrirGenerar(r) },
          { id: 'pausar', etiqueta: r.activa ? t('menu.pausar') : t('menu.reanudar'), icono: r.activa ? Pause : Play, onSelect: () => void pausar(r) },
        ]
      : [];
  const semanas = (r: RotacionTurno) => (r.ciclo_dias % 7 === 0 ? t('semanas', { n: r.ciclo_dias / 7 }) : t('dias', { n: r.ciclo_dias }));
  const proxima = (r: RotacionTurno) => {
    if (!r.ultima_generada || !r.activa) return '—';
    const l = lunesDe(r.ultima_generada);
    return t('borrador', { rango: f.rango(l, addPlainDays(l, 6)) });
  };
  const insignia = (r: RotacionTurno) => (
    <Badge tono={r.activa ? 'exito' : 'neutro'} apariencia="contorno" tamano="sm">
      {r.activa ? t('activa') : t('pausadaEstado')}
    </Badge>
  );
  const columnas: ColumnaTabla<RotacionTurno>[] = [
    {
      id: 'rotacion',
      encabezado: t('columnas.rotacion'),
      celda: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{r.nombre}</p>
          <p className="truncate text-xs text-fg-secondary">{r.descripcion || resumenPatron(r)}</p>
        </div>
      ),
    },
    { id: 'ciclo', encabezado: t('columnas.ciclo'), celda: semanas },
    { id: 'personas', encabezado: t('columnas.personas'), celda: (r) => t('personas', { n: r.personas }) },
    { id: 'empezo', encabezado: t('columnas.empezo'), ocultarDebajo: 'lg', celda: (r) => (r.empezo ? f.fecha(r.empezo) : '—') },
    { id: 'proxima', encabezado: t('columnas.proxima'), ocultarDebajo: 'lg', celda: proxima },
    { id: 'estado', encabezado: t('columnas.estado'), celda: insignia },
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
                    { valor: 'pausadas', etiqueta: t('pausadas') },
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
        obtenerId={(r) => r.id}
        estado={
          carga.estado === 'cargando'
            ? 'cargando'
            : carga.estado === 'error' || carga.estado === 'noExiste'
              ? 'error'
              : filas.length === 0
                ? (datos?.rotaciones.length ?? 0) === 0
                  ? 'vacio'
                  : 'sinResultados'
                : 'listo'
        }
        acciones={acciones}
        etiquetaFila={(r) => r.nombre}
        tarjetaMovil={(r) => (
          <ListCard icono={Repeat} titulo={r.nombre} subtitulo={resumenPatron(r)} meta={`${semanas(r)} · ${t('personas', { n: r.personas })}`} estado={insignia(r)} acciones={acciones(r)} />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Repeat,
          accion: puede ? { etiqueta: t('nueva'), onClick: () => setEditar({ rotacion: null }), icono: Plus } : undefined,
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
      <AvisoTonal tono="informacion" icono={Info} titulo={t('aviso.titulo')} descripcion={t('aviso.descripcion')} />
      <DialogoRotacion
        abierto={editar !== null}
        onAbiertoChange={(v) => !v && setEditar(null)}
        rotacion={editar?.rotacion ?? null}
        plantillas={datos?.plantillas ?? []}
        onGuardada={() => void recargar()}
      />
      <DialogoAplicarRotacion
        abierto={generar !== null}
        onAbiertoChange={(v) => !v && setGenerar(null)}
        rotaciones={(datos?.rotaciones ?? []).map((r) => ({ id: r.id, nombre: r.nombre, activa: r.activa }))}
        rotacionInicial={generar?.id ?? null}
        personas={personas}
        desde={siguiente}
        hasta={diasDeSemana(siguiente)[6]}
        onAplicada={() => void recargar()}
      />
    </div>
  );
}

function DialogoRotacion({
  abierto,
  onAbiertoChange,
  rotacion,
  plantillas,
  onGuardada,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  rotacion: RotacionTurno | null;
  plantillas: Array<{ id: string; nombre: string }>;
  onGuardada: () => void;
}) {
  const t = useTranslations('hrmTurnos.rotaciones.dialogo');
  const td = useTranslations('hrmTurnos.plantillas.dias');
  const mensaje = useMensajeErrorTurnos();
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [semanas, setSemanas] = useState(1);
  const [patron, setPatron] = useState<Array<string | null>>(Array(7).fill(null));
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const p = rotacion?.patron ?? Array(7).fill(null);
    setNombre(rotacion?.nombre ?? '');
    setDescripcion(rotacion?.descripcion ?? '');
    setSemanas(Math.max(1, Math.ceil(p.length / 7)));
    setPatron(p.length % 7 === 0 ? p : [...p, ...Array(7 - (p.length % 7)).fill(null)]);
    setError(null);
  }, [abierto, rotacion]);

  const cambiarSemanas = (n: number) => {
    setSemanas(n);
    setPatron((p) => (p.length >= n * 7 ? p.slice(0, n * 7) : [...p, ...Array(n * 7 - p.length).fill(null)]));
  };
  const guardar = async () => {
    if (!nombre.trim()) {
      setError(t('nombreRequerido'));
      return;
    }
    setEnviando(true);
    try {
      const cuerpo = { nombre, descripcion, patron };
      if (rotacion) await enviar(`/api/hrm/turnos/rotaciones/${rotacion.id}`, 'PUT', cuerpo);
      else await enviar('/api/hrm/turnos/rotaciones', 'POST', cuerpo);
      toast.success(rotacion ? t('guardada') : t('creada'));
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
      titulo={rotacion ? t('tituloEditar') : t('tituloNueva')}
      descripcion={t('descripcion')}
      ancho={672}
      primario={{ etiqueta: rotacion ? t('guardar') : t('crear'), onClick: () => void guardar(), cargando: enviando }}
      textoCancelar={t('cancelar')}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('nombre')} obligatorio error={error}>
          {(c) => <Input id={c.id} value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} aria-invalid={!!error} />}
        </FormField>
        <FormField etiqueta={t('descripcionCampo')}>
          {(c) => <Input id={c.id} value={descripcion} maxLength={300} onChange={(e) => setDescripcion(e.target.value)} placeholder={t('descripcionAyuda')} />}
        </FormField>
        <FormField etiqueta={t('ciclo')}>
          {(c) => (
            <SegmentedControl
              aria-labelledby={c.idEtiqueta}
              valor={String(semanas) as '1' | '2' | '3' | '4'}
              onValorChange={(v) => cambiarSemanas(Number(v))}
              opciones={(['1', '2', '3', '4'] as const).map((n) => ({ valor: n, etiqueta: t('semanas', { n: Number(n) }) }))}
            />
          )}
        </FormField>
        {Array.from({ length: semanas }, (_, s) => (
          <fieldset key={s} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-fg">{t('semana', { n: s + 1 })}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const i = s * 7 + d - 1;
                return (
                  <FormField key={d} etiqueta={td(`d${d}`)}>
                    {(c) => (
                      <Select value={patron[i] ?? DESCANSO} onValueChange={(v) => setPatron((p) => p.map((x, j) => (j === i ? (v === DESCANSO ? null : v) : x)))}>
                        <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={DESCANSO}>{t('descanso')}</SelectItem>
                          {plantillas.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </Dialogo>
  );
}
