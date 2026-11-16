'use client';

/**
 * Inicio › Mi asistencia (Figma 20.9.12–20.9.18): el historial propio del
 * empleado. Turno, entrada, descanso, salida, horas, cómo marcó y estado de
 * cada día. Lo lee `GET /api/hrm/marcacion/mia` (solo lo propio).
 *
 * Decisión 3: en el computador se marca sin ubicación; la marca vale si llega
 * por el QR de la sede y, si no, queda para que el jefe la revise.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlarmClockCheck, Info } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  EmptyState,
  FilterChips,
  FilterPanel,
  FormField,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  SegmentedControl,
  useEsEscritorio,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays, DEFAULT_TIMEZONE } from '@/lib/utils/dateCore';
import { diasDeSemana, lunesDe, partesHoras } from '@/lib/hrm/turnos/programacion';
import { useCarga } from '@/components/hrm/estructura/comun';
import { useFormatoHora } from '@/components/hrm/turnos/formatoHora';
import { TurnoCard, useTurnoInicio } from './TurnoInicio';

interface DiaAsistencia {
  fecha: string;
  festivo: boolean;
  sede: string | null;
  turno: { plantilla: string | null; inicio: string | null; fin: string | null; dia_descanso: boolean } | null;
  entrada: string | null;
  salida: string | null;
  descanso_inicio: string | null;
  descanso_fin: string | null;
  metodo: 'app' | 'qr' | 'manual' | null;
  modo: 'presencial' | 'remoto' | null;
  minutos: number | null;
  tarde_min: number | null;
  revisar: boolean;
}

interface RespuestaAsistencia {
  vinculo: { id: string; sede: string | null } | null;
  zona?: string;
  marca?: boolean;
  dias: DiaAsistencia[];
}

type Estado = 'enTurno' | 'aTiempo' | 'tarde' | 'sinSalida' | 'libre' | 'porRevisar' | 'sinMarcar';
const ESTADOS: readonly Estado[] = ['enTurno', 'aTiempo', 'tarde', 'sinSalida', 'libre', 'porRevisar', 'sinMarcar'];

function estadoDe(d: DiaAsistencia, hoy: string): Estado {
  if (d.turno?.dia_descanso && !d.entrada) return 'libre';
  if (d.revisar) return 'porRevisar';
  if (d.entrada && !d.salida) return d.fecha === hoy ? 'enTurno' : 'sinSalida';
  if (!d.entrada) return d.turno ? 'sinMarcar' : 'libre';
  if ((d.tarde_min ?? 0) > 0) return 'tarde';
  return 'aTiempo';
}

const TONO: Record<Estado, 'exito' | 'advertencia' | 'peligro' | 'neutro' | 'informacion'> = {
  enTurno: 'informacion',
  aTiempo: 'exito',
  tarde: 'advertencia',
  sinSalida: 'peligro',
  libre: 'neutro',
  porRevisar: 'informacion',
  sinMarcar: 'advertencia',
};

export function MiAsistencia() {
  const t = useTranslations('hrmMarcacion.miAsistencia');
  const f = useFormatoHora();
  const escritorio = useEsEscritorio();
  const { getToday } = useFormatDate();
  const { organization } = useOrganization();
  const turno = useTurnoInicio(organization?.id);
  const hoy = getToday();
  const lunes = lunesDe(hoy);
  const desde = addPlainDays(lunes, -7);
  const { carga, recargar } = useCarga<RespuestaAsistencia>(`/api/hrm/marcacion/mia?desde=${desde}&hasta=${hoy}`);
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const zona = datos?.zona ?? DEFAULT_TIMEZONE;
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<Estado | 'todos'>('todos');

  const filas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return (datos?.dias ?? []).filter((d) => (estado === 'todos' || estadoDe(d, hoy) === estado) && (!q || f.diaCorto(d.fecha).toLowerCase().includes(q)));
  }, [datos, estado, texto, hoy, f]);

  const insignia = (d: DiaAsistencia) => {
    const e = estadoDe(d, hoy);
    return (
      <Badge tono={TONO[e]} apariencia={e === 'libre' ? 'suave' : 'contorno'} tamano="sm">
        {e === 'tarde' ? t('estado.tardeMin', { min: d.tarde_min ?? 0 }) : t(`estado.${e}`)}
      </Badge>
    );
  };
  const horas = (m: number | null) => {
    if (m === null) return '—';
    const { h, m: mi } = partesHoras(m);
    return t('horas', { h, m: String(mi).padStart(2, '0') });
  };
  const como = (d: DiaAsistencia) => (!d.metodo ? '—' : d.metodo === 'manual' ? t('como.manual') : d.metodo === 'qr' ? t('como.qr') : d.modo === 'remoto' ? t('como.remoto') : t('como.ubicacion'));
  const turnoTexto = (d: DiaAsistencia) =>
    !d.turno ? t('sinTurno') : d.turno.dia_descanso ? t('descanso') : `${d.turno.plantilla ?? t('turno')} ${f.hora(d.turno.inicio, zona)} – ${f.hora(d.turno.fin, zona)}`;
  const dia = (d: DiaAsistencia) => (d.festivo ? `${f.diaCorto(d.fecha)} · ${t('festivo')}` : f.diaCorto(d.fecha));
  const descanso = (d: DiaAsistencia) => (d.descanso_inicio ? `${f.hora(d.descanso_inicio, zona)} – ${d.descanso_fin ? f.hora(d.descanso_fin, zona) : '…'}` : '—');

  const columnas: ColumnaTabla<DiaAsistencia>[] = [
    {
      id: 'dia',
      encabezado: t('columnas.dia'),
      ordenable: true,
      celda: (d) => (
        <div className="min-w-0">
          <p className="truncate text-fg">{dia(d)}</p>
          <p className="truncate text-xs text-fg-secondary">{d.turno?.dia_descanso && !d.entrada ? '—' : (d.sede ?? '—')}</p>
        </div>
      ),
    },
    { id: 'turno', encabezado: t('columnas.turno'), celda: turnoTexto },
    { id: 'entrada', encabezado: t('columnas.entrada'), celda: (d) => (d.entrada ? f.hora(d.entrada, zona) : '—') },
    { id: 'descanso', encabezado: t('columnas.descanso'), ocultarDebajo: 'xl', celda: descanso },
    { id: 'salida', encabezado: t('columnas.salida'), celda: (d) => (d.salida ? f.hora(d.salida, zona) : '—') },
    { id: 'horas', encabezado: t('columnas.horas'), variante: 'importe', celda: (d) => <span className="font-medium">{horas(d.minutos)}</span> },
    { id: 'como', encabezado: t('columnas.como'), ocultarDebajo: 'lg', celda: como },
    { id: 'estado', encabezado: t('columnas.estado'), celda: insignia },
  ];

  const noMarca = datos?.marca === false || (datos && !datos.vinculo);
  const subtitulo = datos
    ? [t('semana', { rango: f.rango(lunes, diasDeSemana(lunes)[6]) }), datos.vinculo?.sede, noMarca ? null : t('horaSede')].filter(Boolean).join(' · ')
    : undefined;
  const estadoTabla =
    carga.estado === 'cargando'
      ? 'cargando'
      : carga.estado === 'error' || carga.estado === 'noExiste'
        ? 'error'
        : filas.length === 0
          ? (datos?.dias.length ?? 0) === 0
            ? 'vacio'
            : 'sinResultados'
          : 'listo';

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={AlarmClockCheck}
        migas={[{ etiqueta: t('inicio'), href: '/app/inicio' }, { etiqueta: t('titulo') }]}
        cargando={carga.estado === 'cargando'}
      />
      {carga.estado === 'sinPermiso' || noMarca ? (
        <EmptyState variante="forbidden" titulo={t('noMarca.titulo')} descripcion={t('noMarca.descripcion')} accion={{ etiqueta: t('irInicio'), href: '/app/inicio' }} />
      ) : (
        <>
          {turno && <TurnoCard turno={turno} compacta />}
          {escritorio && <AvisoTonal tono="informacion" icono={Info} titulo={t('computador.titulo')} descripcion={t('computador.descripcion')} />}
          <h2 className="text-base font-semibold text-fg">{t('marcaciones')}</h2>
          <ListToolbar
            busqueda={<SearchInput value={texto} onChange={setTexto} placeholder={t('buscar')} etiqueta={t('buscar')} debounceMs={150} />}
            filtros={
              <FilterPanel conteo={estado === 'todos' ? 0 : 1} onLimpiar={() => setEstado('todos')} textoVerResultados={t('ver', { n: filas.length })}>
                <FormField etiqueta={t('columnas.estado')}>
                  {(c) => (
                    <SegmentedControl
                      aria-labelledby={c.idEtiqueta}
                      anchoCompleto
                      valor={estado === 'todos' || estado === 'tarde' || estado === 'sinSalida' ? estado : 'todos'}
                      onValorChange={(v) => setEstado(v)}
                      opciones={[
                        { valor: 'todos', etiqueta: t('todos') },
                        { valor: 'tarde', etiqueta: t('estado.tarde') },
                        { valor: 'sinSalida', etiqueta: t('estado.sinSalida') },
                      ]}
                    />
                  )}
                </FormField>
              </FilterPanel>
            }
            chips={
              estado !== 'todos' ? (
                <FilterChips chips={[{ clave: 'estado', etiqueta: t(`estado.${estado}`) }]} onQuitar={() => setEstado('todos')} onLimpiarTodo={() => setEstado('todos')} />
              ) : undefined
            }
          />
          <DataTable
            etiqueta={t('marcaciones')}
            columnas={columnas}
            filas={filas}
            obtenerId={(d) => d.fecha}
            estado={estadoTabla}
            tarjetaMovil={(d) => (
              <ListCard
                icono={AlarmClockCheck}
                titulo={[dia(d), d.entrada ? `${f.hora(d.entrada, zona)}${d.salida ? ` – ${f.hora(d.salida, zona)}` : ''}` : null].filter(Boolean).join(' · ')}
                subtitulo={
                  d.turno?.dia_descanso && !d.entrada
                    ? t('diaLibre')
                    : !d.salida && d.entrada && d.fecha !== hoy
                      ? t('sinSalidaAjuste')
                      : [horas(d.minutos), como(d).toLowerCase()].join(' · ')
                }
                estado={insignia(d)}
              />
            )}
            vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: AlarmClockCheck }}
            sinResultados={{ descripcion: t('sinResultados') }}
            error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
            onReintentar={() => void recargar()}
            onLimpiarFiltros={() => {
              setTexto('');
              setEstado('todos');
            }}
            termino={texto}
          />
        </>
      )}
    </div>
  );
}

export { ESTADOS as ESTADOS_ASISTENCIA, estadoDe as estadoAsistencia };
