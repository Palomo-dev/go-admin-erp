'use client';

/**
 * Ausencias › Permisos (Figma 20.14.6 y 20.14.8, `96-hrm-f2-14-06-*` y `14-08-*`):
 * calamidad doméstica, licencias remuneradas y no remuneradas del CST y los tipos
 * propios. Menú de la fila: aprobar, ver detalle y rechazar (por el motor de
 * aprobaciones; nadie aprueba lo propio).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CircleCheck, CircleX, DoorOpen, Eye, Home, Plus } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  FilterChips,
  FilterPanel,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  clasesBoton,
  useParametrosUrl,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { NavPestanasHrm } from '../navegacion/NavPestanasHrm';
import {
  FILTROS_VACIOS,
  conteoFiltros,
  esMes,
  filtrarAusencias,
  horasEntre,
  mesDeDia,
  primerDia,
  ultimoDia,
  type EstadoVisible,
  type FilaAusencia,
  type FiltrosAusencias,
  type Seccion,
} from './ausenciasLogica';
import { DialogoAprobarAusencia } from './DialogoAprobarAusencia';
import { DialogoRegistrarPermiso } from './DialogoRegistrarPermiso';
import { BarraSecciones, CeldaPersona, EstadoAusencia, useFechas, useListaAusencias } from './piezasAusencias';

const ESTADOS_FILTRO: readonly EstadoVisible[] = ['por_aprobar', 'por_aprobar_rrhh', 'aprobada', 'en_curso', 'terminada', 'rechazada', 'cancelada'];

export function PermisosVista({ seccion, onSeccion }: { seccion: Seccion; onSeccion: (s: Seccion) => void }) {
  const t = useTranslations('hrmAusencias.permisos');
  const ta = useTranslations('hrmAusencias');
  const tc = useTranslations('hrmPersonas.comun');
  const f = useFechas();
  const { getToday } = useFormatDate();
  const { leer } = useParametrosUrl();
  const mesUrl = leer('mes');
  const mes = esMes(mesUrl) ? mesUrl : mesDeDia(getToday());
  const { carga, recargar } = useListaAusencias('permisos', primerDia(mes), ultimoDia(mes));
  const [filtros, setFiltros] = useState<FiltrosAusencias>(FILTROS_VACIOS);
  const [registrar, setRegistrar] = useState(false);
  const [abierta, setAbierta] = useState<{ fila: FilaAusencia; enfoque: 'aprobar' | 'rechazar' } | null>(null);

  const datos = carga.estado === 'listo' ? carga.datos : null;
  const hoy = datos?.hoy ?? getToday();
  const todas = useMemo(() => datos?.filas ?? [], [datos]);
  const filas = useMemo(() => filtrarAusencias(todas, filtros, hoy, (x) => x.tipo_nombre ?? ''), [todas, filtros, hoy]);
  const permisos = datos?.permisos;
  const sinPermiso = carga.estado === 'sinPermiso';
  const porAprobar = todas.filter((x) => x.estado === 'requested').length;
  const cambiar = (p: Partial<FiltrosAusencias>) => setFiltros((x) => ({ ...x, ...p }));
  const limpiar = () => setFiltros((x) => ({ ...FILTROS_VACIOS, texto: x.texto }));

  const accionesDe = (x: FilaAusencia): AccionFila[] => {
    const decide = !!x.aprobacion?.puede_decidir;
    return [
      { id: 'aprobar', etiqueta: t('menu.aprobar'), icono: CircleCheck, onSelect: () => setAbierta({ fila: x, enfoque: 'aprobar' }), oculta: !decide },
      { id: 'ver', etiqueta: t('menu.ver'), icono: Eye, onSelect: () => setAbierta({ fila: x, enfoque: 'aprobar' }) },
      {
        id: 'rechazar',
        etiqueta: t('menu.rechazar'),
        icono: CircleX,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => setAbierta({ fila: x, enfoque: 'rechazar' }),
        oculta: !decide,
      },
    ];
  };

  const cuando = (x: FilaAusencia) => {
    const dia = x.desde === x.hasta ? f.diaSemana(x.desde) : f.rangoCorto(x.desde, x.hasta);
    const detalle = x.horas
      ? t('horas', { inicio: x.horas.inicio, fin: x.horas.fin, n: f.dias(horasEntre(x.horas.inicio, x.horas.fin)) })
      : x.medio_dia_inicio
        ? t('mediaJornada')
        : x.desde === x.hasta
          ? t('diaCompleto')
          : t('nDias', { n: f.dias(x.dias_calendario) });
    return { dia: dia.charAt(0).toUpperCase() + dia.slice(1), detalle };
  };
  const remunerado = (x: FilaAusencia) => (x.remunerado ? t('si') : x.se_repone ? t('noSeRepone') : t('no'));

  const columnas: ColumnaTabla<FilaAusencia>[] = [
    { id: 'persona', encabezado: t('columnas.persona'), celda: (x) => <CeldaPersona fila={x} /> },
    {
      id: 'permiso',
      encabezado: t('columnas.permiso'),
      celda: (x) => (
        <div className="min-w-0">
          <p className="truncate text-fg">{x.clase === 'justificada' ? ta('tipos.justificada') : x.tipo_nombre ?? '—'}</p>
          {x.motivo ? <p className="truncate text-xs text-fg-secondary">{x.motivo}</p> : x.sensible ? <p className="text-xs text-fg-secondary">{t('detalleSalud')}</p> : null}
        </div>
      ),
    },
    {
      id: 'cuando',
      encabezado: t('columnas.cuando'),
      ocultarDebajo: 'md',
      celda: (x) => {
        const c = cuando(x);
        return (
          <div>
            <p className="text-fg">{c.dia}</p>
            <p className="text-xs text-fg-secondary">{c.detalle}</p>
          </div>
        );
      },
    },
    { id: 'remunerado', encabezado: t('columnas.remunerado'), ocultarDebajo: 'lg', celda: (x) => <span>{remunerado(x)}</span> },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (x) => <EstadoAusencia fila={x} hoy={hoy} /> },
  ];

  const chips: ChipFiltro[] = filtros.estados.length ? [{ clave: 'estados', etiqueta: filtros.estados.map((e) => ta(`estados.${e}`)).join(', ') }] : [];
  const subtitulo = [f.mesAnio(mes), datos && porAprobar ? t('nPorAprobar', { n: porAprobar }) : null].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={DoorOpen}
        migas={[{ etiqueta: tc('migas.rrhh'), href: '/app/hrm/empleados' }, { etiqueta: ta('titulo') }]}
        cargando={carga.estado === 'cargando'}
        acciones={
          !sinPermiso && permisos?.registrar ? (
            <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={() => setRegistrar(true)}>
              <Plus aria-hidden className="size-4" strokeWidth={1.5} />
              {t('registrar')}
            </button>
          ) : undefined
        }
        debajo={sinPermiso ? undefined : <NavPestanasHrm incrustada />}
        movil={{ subtitulo }}
      />

      {sinPermiso ? (
        <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('irInicio'), href: '/app/inicio', icono: Home }} />
      ) : (
        <>
          <BarraSecciones valor={seccion} onValor={onSeccion} />
          {(todas.length > 0 || carga.estado === 'cargando' || filtros.texto || conteoFiltros(filtros) > 0) && carga.estado !== 'error' ? (
            <ListToolbar
              busqueda={<SearchInput value={filtros.texto} onChange={(v) => cambiar({ texto: v })} placeholder={t('buscar')} etiqueta={t('buscar')} />}
              filtros={
                <FilterPanel conteo={conteoFiltros(filtros)} onLimpiar={limpiar} textoVerResultados={t('verN', { n: filas.length })}>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-medium text-fg">{t('filtroEstado')}</legend>
                    {ESTADOS_FILTRO.map((e) => (
                      <label key={e} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
                        <Checkbox checked={filtros.estados.includes(e)} onCheckedChange={(v) => cambiar({ estados: v === true ? [...filtros.estados, e] : filtros.estados.filter((x) => x !== e) })} />
                        {ta(`estados.${e}`)}
                      </label>
                    ))}
                  </fieldset>
                </FilterPanel>
              }
              chips={chips.length ? <FilterChips chips={chips} onQuitar={() => cambiar({ estados: [] })} onLimpiarTodo={limpiar} /> : undefined}
            />
          ) : null}
          <DataTable
            etiqueta={t('titulo')}
            columnas={columnas}
            filas={filas}
            obtenerId={(x) => x.id}
            estado={carga.estado === 'cargando' ? 'cargando' : carga.estado !== 'listo' ? 'error' : filas.length === 0 ? (todas.length === 0 ? 'vacio' : 'sinResultados') : 'listo'}
            onFilaClick={(x) => setAbierta({ fila: x, enfoque: 'aprobar' })}
            etiquetaFila={(x) => x.nombre ?? '—'}
            acciones={accionesDe}
            tarjetaMovil={(x) => {
              const c = cuando(x);
              return (
                <ListCard
                  avatar={{ nombre: x.nombre ?? '?' }}
                  titulo={x.nombre ?? '—'}
                  subtitulo={`${x.tipo_nombre ?? ta('tipos.justificada')} · ${c.dia}`}
                  meta={`${c.detalle} · ${remunerado(x)}`}
                  estado={<EstadoAusencia fila={x} hoy={hoy} />}
                  onClick={() => setAbierta({ fila: x, enfoque: 'aprobar' })}
                  acciones={accionesDe(x)}
                />
              );
            }}
            vacio={{
              titulo: t('vacio.titulo'),
              descripcion: t('vacio.descripcion'),
              icono: DoorOpen,
              accion: permisos?.registrar ? { etiqueta: t('registrar'), icono: Plus, onClick: () => setRegistrar(true) } : undefined,
            }}
            sinResultados={{ descripcion: t('sinResultados') }}
            onLimpiarFiltros={() => setFiltros(FILTROS_VACIOS)}
            termino={filtros.texto}
            error={{ titulo: t('error') }}
            onReintentar={() => void recargar()}
          />
        </>
      )}

      <DialogoAprobarAusencia
        fila={abierta?.fila ?? null}
        enfoque={abierta?.enfoque}
        festivos={datos?.festivos ?? []}
        onCerrar={() => setAbierta(null)}
        onResuelta={() => void recargar()}
      />
      <DialogoRegistrarPermiso abierto={registrar} onAbiertoChange={setRegistrar} hoy={hoy} tipos={datos?.tipos ?? []} onHecho={() => void recargar()} />
    </div>
  );
}
