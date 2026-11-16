'use client';

/**
 * Asistencia › Hojas de tiempo del período (Figma 20.10.3 y 20.10.4): una fila
 * por persona con sus horas (nunca pesos). Una hoja se aprueba cuando no tiene
 * ajustes ni novedades por aprobar; aprobarla la deja «lista para nómina».
 * Selección con `BulkActionBar` flotante al pie (patrón 1).
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarCheck, CircleCheck, ClockArrowUp, House } from 'lucide-react';
import {
  BulkActionBar,
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  ListCard,
  ListToolbar,
  Pagination,
  SearchInput,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorPersonas, pedir, type Carga } from '../personas/apiPersonas';
import { CeldaPersona, InsigniaEstado, rutaHoja, rutaHoras } from './comunAsistencia';
import {
  areasDe,
  coincidePersona,
  duracionOGuion,
  hojaAprobable,
  textoDuracion,
  type EstadoHojaPeriodo,
  type FilaHoja,
  type RespuestaHojas,
} from './asistenciaLogica';

const TONO: Record<EstadoHojaPeriodo, 'advertencia' | 'exito' | 'neutro'> = {
  por_aprobar: 'advertencia',
  aprobada: 'exito',
  sin_marcas: 'neutro',
};

export function VistaHojas({
  carga,
  recargar,
  desde,
  hasta,
}: {
  carga: Carga<RespuestaHojas>;
  recargar: () => Promise<void>;
  desde: string;
  hasta: string;
}) {
  const t = useTranslations('hrmAsistencia');
  const router = useRouter();
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<EstadoHojaPeriodo | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [aprobando, setAprobando] = useState(false);

  const todas = useMemo(() => (datos ? [...datos.filas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) : []), [datos]);
  const areas = useMemo(() => areasDe(todas), [todas]);
  const filtradas = useMemo(
    () => todas.filter((f) => coincidePersona(f, texto) && (!estado || f.estado === estado) && (!area || f.area === area)),
    [todas, texto, estado, area]
  );
  const filas = filtradas.slice((pagina - 1) * tamano, pagina * tamano);
  const limpiar = () => {
    setEstado(null);
    setArea(null);
    setPagina(1);
  };
  const chips: ChipFiltro[] = [
    ...(estado
      ? [
          {
            clave: 'estado',
            etiqueta: t('filtros.chipEstado', {
              valor: t(`hojas.estados.${estado}`),
            }),
          },
        ]
      : []),
    ...(area ? [{ clave: 'area', etiqueta: t('filtros.chipEquipo', { valor: area }) }] : []),
  ];

  const aprobar = async (vinculos: string[]) => {
    if (vinculos.length === 0) return;
    setAprobando(true);
    try {
      const r = await pedir<{
        listas: number;
        pendientes: Array<{ employment_id: string; motivo: string }>;
      }>('/api/hrm/asistencia/lista-nomina', {
        metodo: 'POST',
        cuerpo: { desde, hasta, vinculos },
      });
      const sinPasar = new Set(r.pendientes.map((p) => p.employment_id)).size;
      if (sinPasar === 0)
        toast.success(t('hojas.aprobadas', { n: vinculos.length }), {
          description: t('hojas.aprobadasDesc'),
        });
      else
        toast.warning(
          t('hojas.aprobadasParcial', {
            n: vinculos.length - sinPasar,
            total: vinculos.length,
          }),
          {
            description: t(`hojas.motivos.${r.pendientes[0]?.motivo ?? 'sin_clasificar'}`),
          }
        );
      setSeleccion(new Set());
      void recargar();
    } catch (e) {
      const codigo = e instanceof ErrorPersonas ? e.codigo : 'error_hrm';
      toast.error(
        codigo === 'parametro_no_configurado' ? t('errores.parametro') : codigo === 'sin_permiso' ? t('errores.sinPermiso') : t('errores.guardar')
      );
    } finally {
      setAprobando(false);
    }
  };

  const puedeAprobar = !!datos?.puede_gestionar;
  const accionesDe = (f: FilaHoja): AccionFila[] => [
    {
      id: 'hoja',
      etiqueta: t('acciones.verHoja'),
      icono: CalendarCheck,
      onSelect: () => router.push(rutaHoja(f.employment_id, desde, hasta)),
    },
    {
      id: 'horas',
      etiqueta: t('acciones.verHoras'),
      icono: ClockArrowUp,
      onSelect: () => router.push(rutaHoras(f.employment_id, desde, hasta)),
    },
    {
      id: 'aprobar',
      etiqueta: t('acciones.aprobarHoja'),
      icono: CircleCheck,
      onSelect: () => void aprobar([f.employment_id]),
      oculta: !puedeAprobar || f.estado !== 'por_aprobar',
      deshabilitada: !hojaAprobable(f),
      motivo: f.pendientes > 0 ? t('hojas.motivoPendientes', { n: f.pendientes }) : undefined,
    },
  ];

  const seleccionadas = todas.filter((f) => seleccion.has(f.employment_id));
  const aprobables = seleccionadas.filter(hojaAprobable);

  const num = (v: string) => <span className="whitespace-nowrap tabular-nums">{v}</span>;
  const columnas: ColumnaTabla<FilaHoja>[] = [
    {
      id: 'persona',
      encabezado: t('hojas.columnas.persona'),
      celda: (f) => <CeldaPersona p={{ nombre: f.nombre, cargo: f.cargo, area: null }} sinAvatar />,
    },
    {
      id: 'programadas',
      encabezado: t('hojas.columnas.programadas'),
      variante: 'importe',
      ocultarDebajo: 'lg',
      celda: (f) => num(duracionOGuion(f.programadas)),
    },
    {
      id: 'trabajadas',
      encabezado: t('hojas.columnas.trabajadas'),
      variante: 'importe',
      celda: (f) => num(duracionOGuion(f.trabajadas)),
    },
    {
      id: 'extras',
      encabezado: t('hojas.columnas.extras'),
      variante: 'importe',
      celda: (f) => num(duracionOGuion(f.extra)),
    },
    {
      id: 'nocturnas',
      encabezado: t('hojas.columnas.nocturnas'),
      variante: 'importe',
      ocultarDebajo: 'md',
      celda: (f) => num(duracionOGuion(f.nocturnas)),
    },
    {
      id: 'domFest',
      encabezado: t('hojas.columnas.domFest'),
      variante: 'importe',
      ocultarDebajo: 'md',
      celda: (f) => num(duracionOGuion(f.dom_fest)),
    },
    {
      id: 'ajustes',
      encabezado: t('hojas.columnas.ajustes'),
      variante: 'importe',
      ocultarDebajo: 'lg',
      celda: (f) => num(String(f.pendientes)),
    },
    {
      id: 'estado',
      encabezado: t('hojas.columnas.estado'),
      celda: (f) => <InsigniaEstado tono={TONO[f.estado]}>{t(`hojas.estados.${f.estado}`)}</InsigniaEstado>,
    },
  ];

  return (
    <>
      {carga.estado !== 'sinPermiso' && (carga.estado !== 'listo' || todas.length > 0) && (
        <ListToolbar
          busqueda={
            <SearchInput
              value={texto}
              onChange={(v) => {
                setTexto(v);
                setPagina(1);
              }}
              placeholder={t('hojas.buscar')}
              etiqueta={t('hojas.buscar')}
            />
          }
          filtros={
            <FilterPanel
              conteo={chips.length}
              onLimpiar={limpiar}
              textoVerResultados={t('filtros.verHojas', {
                n: filtradas.length,
              })}
            >
              <FormField etiqueta={t('filtros.estado')}>
                {(c) => (
                  <Select
                    value={estado ?? '__todos'}
                    onValueChange={(v) => {
                      setEstado(v === '__todos' ? null : (v as EstadoHojaPeriodo));
                      setPagina(1);
                    }}
                  >
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todos">{t('filtros.todos')}</SelectItem>
                      {(['por_aprobar', 'aprobada', 'sin_marcas'] as const).map((e) => (
                        <SelectItem key={e} value={e}>
                          {t(`hojas.estados.${e}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('filtros.equipo')}>
                {(c) => (
                  <Select
                    value={area ?? '__todos'}
                    onValueChange={(v) => {
                      setArea(v === '__todos' ? null : v);
                      setPagina(1);
                    }}
                  >
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todos">{t('filtros.todos')}</SelectItem>
                      {areas.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </FilterPanel>
          }
          chips={
            chips.length > 0 ? (
              <FilterChips chips={chips} onQuitar={(c) => (c === 'estado' ? setEstado(null) : setArea(null))} onLimpiarTodo={limpiar} />
            ) : undefined
          }
        />
      )}

      <DataTable
        etiqueta={t('hojas.tabla')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.employment_id}
        estado={
          carga.estado === 'cargando'
            ? 'cargando'
            : carga.estado === 'sinPermiso'
              ? 'sinPermiso'
              : carga.estado !== 'listo'
                ? 'error'
                : todas.length === 0
                  ? 'vacio'
                  : filtradas.length === 0
                    ? 'sinResultados'
                    : 'listo'
        }
        seleccion={puedeAprobar ? seleccion : undefined}
        onSeleccionChange={puedeAprobar ? setSeleccion : undefined}
        onFilaClick={(f) => router.push(rutaHoja(f.employment_id, desde, hasta))}
        etiquetaFila={(f) => f.nombre}
        acciones={accionesDe}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            avatar={{ nombre: f.nombre }}
            titulo={f.nombre}
            subtitulo={t('hojas.movilResumen', {
              trabajadas: textoDuracion(f.trabajadas),
              programadas: textoDuracion(f.programadas),
              n: f.pendientes,
            })}
            meta={
              [
                f.extra > 0 ? t('hojas.movilExtras', { horas: textoDuracion(f.extra) }) : null,
                f.nocturnas > 0
                  ? t('hojas.movilNocturnas', {
                      horas: textoDuracion(f.nocturnas),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || undefined
            }
            estado={<InsigniaEstado tono={TONO[f.estado]}>{t(`hojas.estados.${f.estado}`)}</InsigniaEstado>}
            onClick={() => router.push(rutaHoja(f.employment_id, desde, hasta))}
            acciones={accionesDe(f)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={puedeAprobar ? () => ctx.alternar(true) : undefined}
          />
        )}
        vacio={{
          titulo: t('hojas.vacio.titulo'),
          descripcion: t('hojas.vacio.descripcion'),
          icono: CalendarCheck,
        }}
        sinResultados={{
          titulo: t('hojas.sinResultados.titulo'),
          descripcion: t('hojas.sinResultados.descripcion'),
          icono: CalendarCheck,
        }}
        error={{
          titulo: t('hojas.error.titulo'),
          descripcion: t('hoy.error.descripcion'),
          icono: CalendarCheck,
        }}
        sinPermiso={{
          titulo: t('hoy.sinPermiso.titulo'),
          descripcion: t('hoy.sinPermiso.descripcion'),
          accion: {
            etiqueta: t('comun.irAlInicio'),
            href: '/app/inicio',
            icono: House,
          },
        }}
        onLimpiarFiltros={() => {
          limpiar();
          setTexto('');
        }}
        onReintentar={() => void recargar()}
        termino={texto}
        pie={
          <Pagination
            pagina={pagina}
            tamano={tamano}
            total={filtradas.length}
            onPaginaChange={setPagina}
            onTamanoChange={(n) => {
              setTamano(n);
              setPagina(1);
            }}
            opcionesTamano={[10, 25, 50, 100]}
            sustantivo={{
              singular: t('hojas.sustantivo.singular'),
              plural: t('hojas.sustantivo.plural'),
            }}
            cargando={carga.estado === 'cargando'}
          />
        }
      />

      {puedeAprobar && seleccion.size > 0 && (
        <BulkActionBar
          seleccionados={seleccion.size}
          total={filtradas.length}
          onSeleccionarTodos={() => setSeleccion(new Set(filtradas.map((f) => f.employment_id)))}
          sustantivo={{
            singular: t('hojas.sustantivo.singular'),
            plural: t('hojas.sustantivo.plural'),
            genero: 'femenino',
          }}
          acciones={[
            {
              id: 'aprobar',
              etiqueta: t('acciones.aprobar'),
              icono: CircleCheck,
              onClick: () => void aprobar(aprobables.map((f) => f.employment_id)),
              cargando: aprobando,
              deshabilitada: aprobables.length === 0,
              motivo: aprobables.length === 0 ? t('hojas.motivoNingunaAprobable') : undefined,
            },
          ]}
          onLimpiar={() => setSeleccion(new Set())}
        />
      )}
    </>
  );
}
