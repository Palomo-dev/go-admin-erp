'use client';

/**
 * Configuración › Recursos humanos › Festivos (diseño 10.RH.1, pantallazos
 * 95-hrm-config-10…15).
 *
 * Los festivos de ley los carga GO Admin para cada año (Ley 51 de 1983: varios
 * se trasladan al lunes) y no se editan. Los días propios son descanso que da
 * la empresa: se pagan como día ordinario, sin recargo festivo, y quedan
 * marcados para que el Contador los revise (decisión del dueño, 2026-11-15).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarPlus, CalendarX, Info, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { AvisoTonal, CampoFecha, ChipsOpcion, ConfirmDialog, Dialogo, EmptyState, FilaDato, ListaDatos, RowActionsMenu, clasesBoton } from '@/components/kit';
import { MultiSelect } from '@/components/kit/MultiSelect';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import type { DatosFestivos, Festivo, NuevoDiaPropio } from '@/lib/hrm/configuracion/tipos';
import { GrupoAjustes } from '../../layout/EnlacesAjuste';
import { CargandoHrm, ErrorCargaHrm, ErrorHrm, PieHrm, SelectorHrm, SinPermisoHrm, pedirHrm, useCargaHrm, useFormatoHrm } from './comun';

type Filtro = 'todos' | 'ley' | 'propios';
const HORAS_MEDIO_DIA = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

export function FestivosPanel() {
  const t = useTranslations('hrmConfig.festivos');
  const [anio, setAnio] = useState<number | null>(null);
  // Sin año, el servidor usa el de «hoy» en la zona de la organización.
  const { carga, recargar } = useCargaHrm<DatosFestivos>(`/api/hrm/configuracion/festivos${anio ? `?anio=${anio}` : ''}`);
  if (carga.estado === 'cargando') return <CargandoHrm filas={10} />;
  if (carga.estado === 'sinPermiso') return <SinPermisoHrm permiso={t('permiso')} />;
  if (carga.estado === 'error') return <ErrorCargaHrm titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void recargar()} />;
  return <FestivosCargados datos={carga.datos} onAnio={setAnio} recargar={recargar} />;
}

function FestivosCargados({ datos, onAnio, recargar }: { datos: DatosFestivos; onAnio: (a: number) => void; recargar: () => Promise<void> }) {
  const t = useTranslations('hrmConfig.festivos');
  const f = useFormatoHrm();
  const { toast } = useToast();
  const locale = useLocaleIntl();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [agregando, setAgregando] = useState(false);
  const [quitando, setQuitando] = useState<Festivo | null>(null);
  const anioHoy = Number(datos.hoy.slice(0, 4));
  const deLey = datos.festivos.filter((x) => x.origen === 'plataforma');
  const propios = datos.festivos.filter((x) => x.origen === 'organizacion');
  const nombreSedes = (ids: number[] | null) => {
    if (!ids || ids.length === 0) return t('todasSedes');
    const nombres = ids.map((id) => datos.sedes.find((s) => s.id === String(id))?.nombre).filter(Boolean) as string[];
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(nombres);
  };

  const quitar = async () => {
    if (!quitando) return;
    try {
      await pedirHrm(`/api/hrm/configuracion/festivos/${quitando.id}`, { metodo: 'DELETE' });
      toast({ title: t('quitado') });
      await recargar();
    } catch {
      toast({ title: t('errorQuitar'), variant: 'destructive' });
    } finally {
      setQuitando(null);
    }
  };

  const fila = (x: Festivo) => {
    const segunda =
      x.origen === 'plataforma'
        ? x.fecha_original !== x.fecha
          ? t('trasladada', { fecha: f.diaLargo(x.fecha_original) })
          : undefined
        : x.medio_dia && x.medio_dia_desde
          ? t('medioDiaDesde', { hora: f.horaTexto(x.medio_dia_desde) })
          : t('diaCompleto');
    return (
      <FilaDato
        key={x.id}
        className="py-3"
        etiqueta={
          <span className="text-fg">
            <span className="inline-block w-24 font-medium capitalize">{f.diaSemana(x.fecha)}</span>
            {x.nombre}
          </span>
        }
        descripcion={segunda ? <span className="pl-24">{segunda}</span> : undefined}
        valor={<span className="hidden text-fg-secondary sm:inline">{nombreSedes(x.sedes)}</span>}
        accesorio={
          <>
            <Badge tono={x.origen === 'plataforma' ? 'neutro' : 'marca'} apariencia="contorno" tamano="sm" className="shrink-0">
              {x.origen === 'plataforma' ? t('deLey') : t('propio')}
            </Badge>
            {x.origen === 'organizacion' && datos.puedeEditar ? (
              <RowActionsMenu titulo={x.nombre} acciones={[{ id: 'quitar', etiqueta: t('quitar'), icono: Trash2, destructiva: true, onSelect: () => setQuitando(x) }]} />
            ) : (
              <span className="w-8 shrink-0" aria-hidden="true" />
            )}
          </>
        }
      />
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <SelectorHrm
          valor={String(datos.anio)}
          onValor={(v) => onAnio(Number(v))}
          etiqueta={t('anio')}
          opciones={[anioHoy - 1, anioHoy, anioHoy + 1].map((a) => ({ valor: String(a), etiqueta: t('anioN', { anio: a }) }))}
          className="w-32"
        />
        <ChipsOpcion
          opciones={[
            { valor: 'todos', etiqueta: t('filtro.todos', { n: datos.festivos.length }) },
            { valor: 'ley', etiqueta: t('filtro.ley', { n: deLey.length }) },
            { valor: 'propios', etiqueta: t('filtro.propios', { n: propios.length }) },
          ]}
          valor={filtro}
          onValorChange={(v) => setFiltro(v as Filtro)}
          etiqueta={t('filtro.etiqueta')}
          className="flex-1"
        />
        {datos.puedeEditar && (
          <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} onClick={() => setAgregando(true)}>
            <Plus aria-hidden="true" className="size-4" />
            {t('agregar')}
          </button>
        )}
      </div>
      <AvisoTonal tono="informacion" icono={Info} titulo={t('aviso.titulo')} descripcion={t('aviso.descripcion')} />

      {filtro !== 'propios' &&
        (deLey.length === 0 ? (
          <EmptyState icono={CalendarX} titulo={t('sinLey.titulo', { anio: datos.anio })} descripcion={t('sinLey.descripcion')} compacto />
        ) : (
          <GrupoAjustes id="hrm-festivos-ley" titulo={t('ley.titulo', { anio: datos.anio })} descripcion={t('ley.descripcion', { n: deLey.length, siguiente: datos.anio + 1 })} sinFilas>
            <ListaDatos divisores className="border-t border-line">
              {deLey.map(fila)}
            </ListaDatos>
          </GrupoAjustes>
        ))}
      {filtro !== 'ley' && (
        <GrupoAjustes id="hrm-festivos-propios" titulo={t('propios.titulo', { anio: datos.anio })} descripcion={t('propios.descripcion')} sinFilas>
          {propios.length === 0 ? (
            <EmptyState icono={CalendarPlus} titulo={t('propios.vacio')} compacto />
          ) : (
            <ListaDatos divisores className="border-t border-line">
              {propios.map(fila)}
            </ListaDatos>
          )}
        </GrupoAjustes>
      )}
      <PieHrm etiqueta={datos.puedeEditar ? t('pie.guardado') : t('pie.soloLectura')} />

      {agregando && (
        <DialogoDiaPropio
          datos={datos}
          onCerrar={() => setAgregando(false)}
          onGuardado={async () => {
            setAgregando(false);
            toast({ title: t('agregado') });
            await recargar();
          }}
        />
      )}
      <ConfirmDialog
        abierto={quitando !== null}
        onAbiertoChange={(a) => !a && setQuitando(null)}
        titulo={t('confirmarQuitar.titulo')}
        descripcion={t('confirmarQuitar.descripcion', { nombre: quitando?.nombre ?? '', fecha: quitando ? f.dia(quitando.fecha) : '' })}
        textoConfirmar={t('quitar')}
        tono="peligro"
        onConfirmar={quitar}
      />
    </div>
  );
}

function DialogoDiaPropio({ datos, onCerrar, onGuardado }: { datos: DatosFestivos; onCerrar: () => void; onGuardado: () => Promise<void> }) {
  const t = useTranslations('hrmConfig.festivos.dialogo');
  const f = useFormatoHrm();
  const { toast } = useToast();
  const [dia, setDia] = useState<NuevoDiaPropio>({ fecha: '', nombre: '', medioDia: false, desde: '13:00', sedes: [] });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const valido = Boolean(dia.fecha) && dia.nombre.trim().length >= 2;

  const guardar = async () => {
    if (!valido) {
      setError(t('errores.incompleto'));
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await pedirHrm('/api/hrm/configuracion/festivos', { metodo: 'POST', cuerpo: { ...dia, desde: dia.medioDia ? dia.desde : null } });
      await onGuardado();
    } catch (e) {
      if (e instanceof ErrorHrm && e.codigo === 'fecha_repetida') setError(t('errores.repetida'));
      else toast({ title: t('errores.guardar'), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      ancho={520}
      primario={{ etiqueta: t('agregar'), onClick: () => void guardar(), cargando: guardando }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span id="hrm-dia-fecha" className="text-sm font-medium text-fg">
            {t('fecha')}
          </span>
          <CampoFecha valor={dia.fecha} onValorChange={(d) => setDia((x) => ({ ...x, fecha: d }))} hoy={datos.hoy} aria-labelledby="hrm-dia-fecha" required />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
          {t('nombre')}
          <Input value={dia.nombre} maxLength={80} onChange={(e) => setDia((x) => ({ ...x, nombre: e.target.value }))} placeholder={t('nombreEjemplo')} />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">{t('duracion')}</span>
          <div className="flex flex-wrap items-center gap-2">
            <ChipsOpcion
              opciones={[
                { valor: 'completo', etiqueta: t('diaCompleto') },
                { valor: 'medio', etiqueta: t('medioDia') },
              ]}
              valor={dia.medioDia ? 'medio' : 'completo'}
              onValorChange={(v) => setDia((x) => ({ ...x, medioDia: v === 'medio' }))}
              etiqueta={t('duracion')}
            />
            {dia.medioDia && (
              <SelectorHrm
                valor={dia.desde}
                onValor={(v) => setDia((x) => ({ ...x, desde: v }))}
                etiqueta={t('desdeHora')}
                opciones={HORAS_MEDIO_DIA.map((h) => ({ valor: h, etiqueta: t('desdeLa', { hora: f.horaTexto(h) }) }))}
                className="w-44"
              />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span id="hrm-dia-sedes" className="text-sm font-medium text-fg">
            {t('sedes')}
          </span>
          <MultiSelect
            aria-labelledby="hrm-dia-sedes"
            opciones={datos.sedes.map((s) => ({ valor: s.id, etiqueta: s.nombre }))}
            valores={dia.sedes.map(String)}
            onValoresChange={(v) => setDia((x) => ({ ...x, sedes: v.map(Number) }))}
            placeholder={t('todasSedes')}
          />
        </div>
        <AvisoTonal tono="neutro" icono={Info} titulo={t('aviso')} compacto />
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
