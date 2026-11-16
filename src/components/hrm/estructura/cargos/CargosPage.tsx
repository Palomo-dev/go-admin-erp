'use client';

/**
 * Recursos humanos › Cargos (Figma 20.1, `95-hrm-01-03`, `01-13`, `01-14`): el
 * perfil de cada puesto con nivel, personas, plazas y documentos. La escala de
 * la sede elegida en el header solo aparece con el permiso de salario (la
 * columna no existe sin él) y esa lectura queda en el registro de accesos.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Copy, Eye, IdCard, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  SearchInput,
  clasesBoton,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import {
  FILTROS_CARGOS,
  NIVELES_CARGO,
  conteoFiltrosCargos,
  estadoPlaza,
  filtrarCargos,
  motivoNoEliminarCargo,
  type FiltrosCargos,
} from '@/lib/hrm/estructura/logica';
import type { CargoFila, RespuestaCargos } from '@/lib/hrm/estructura/tipos';
import { NavPestanasHrm } from '@/components/hrm/navegacion/NavPestanasHrm';
import { RUTA_CARGOS, RUTA_HRM, pedir, useCarga, useFormatoMoneda, useMensajeError, useNivel } from '../comun';

const TODOS = '__todos__';

export function CargosPage() {
  const t = useTranslations('hrmEstructura.cargos');
  const tc = useTranslations('hrmEstructura.comun');
  const router = useRouter();
  const nivel = useNivel();
  const moneda = useFormatoMoneda();
  const sucursal = useBranchOpcional();
  const sede = sucursal?.branchFilter ?? null;
  const nombreSede = sede ? sucursal?.branches.find((b) => b.id === sede)?.name ?? null : null;
  const { carga, recargar } = useCarga<RespuestaCargos>(`/api/hrm/estructura/cargos${sede ? `?sede=${sede}` : ''}`);
  const datos = carga.estado === 'listo' ? carga.datos : null;

  const [filtros, setFiltros] = useState<FiltrosCargos>(FILTROS_CARGOS);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(20);
  const [direccion, setDireccion] = useState<'asc' | 'desc'>('asc');
  const [eliminar, setEliminar] = useState<CargoFila | null>(null);
  const mensajeError = useMensajeError();
  const todos = useMemo(() => datos?.cargos ?? [], [datos]);
  const filas = useMemo(() => filtrarCargos(todos, filtros, direccion), [todos, filtros, direccion]);
  const visibles = useMemo(() => filas.slice((pagina - 1) * tamano, pagina * tamano), [filas, pagina, tamano]);
  const cambiar = (f: Partial<FiltrosCargos>) => {
    setFiltros((x) => ({ ...x, ...f }));
    setPagina(1);
  };
  const limpiar = () => cambiar({ area: null, nivel: null, vacantes: false, sinPersonas: false });

  const abrir = (c: CargoFila) => router.push(`${RUTA_CARGOS}/${c.id}`);
  const accionesDe = (c: CargoFila): AccionFila[] => {
    const motivo = motivoNoEliminarCargo(c);
    return [
      { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => abrir(c) },
      { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => router.push(`${RUTA_CARGOS}/${c.id}/editar`), oculta: !datos?.permisos.editar },
      { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => router.push(`${RUTA_CARGOS}/nuevo?desde=${encodeURIComponent(c.id)}`), oculta: !datos?.permisos.crear },
      { id: 'empleados', etiqueta: t('acciones.empleados'), icono: Users, onSelect: () => router.push(`${RUTA_HRM}?cargo=${encodeURIComponent(c.id)}`) },
      {
        id: 'eliminar',
        etiqueta: t('acciones.eliminar'),
        descripcion: t('acciones.eliminarDetalle'),
        icono: Trash2,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => setEliminar(c),
        deshabilitada: motivo !== null,
        motivo: motivo ? t(`acciones.noEliminar.${motivo}`) : undefined,
        oculta: !datos?.permisos.editar,
      },
    ];
  };
  const confirmarEliminar = async () => {
    if (!eliminar) return;
    try {
      await pedir(`/api/hrm/estructura/cargos/${eliminar.id}`, { metodo: 'DELETE', cuerpo: {} });
      toast.success(t('eliminado', { nombre: eliminar.nombre }));
      void recargar();
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setEliminar(null);
    }
  };

  const plazas = (c: CargoFila) => {
    if (c.plazas === null) return <span className="text-fg-muted">—</span>;
    const e = estadoPlaza(c.plazas, c.personas);
    const clase = e.tipo === 'vacantes' ? 'text-warning-text' : e.tipo === 'sobre' ? 'text-danger-text' : 'text-fg';
    return <span className={clase}>{t('plazasDe', { ocupadas: c.personas, aprobadas: c.plazas })}</span>;
  };
  const escala = (c: CargoFila) =>
    c.escala ? <span className="tabular-nums">{`${moneda(c.escala.minimo)} – ${moneda(c.escala.maximo)}`}</span> : <span className="text-fg-muted">{t('sinEscala')}</span>;

  const columnas: ColumnaTabla<CargoFila>[] = [
    {
      id: 'cargo',
      encabezado: t('columnas.cargo'),
      ordenable: true,
      campoOrden: 'nombre',
      celda: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{c.nombre}</p>
          {c.reporta_a && <p className="truncate text-xs text-fg-secondary">{t('reportaA', { cargo: c.reporta_a.nombre })}</p>}
        </div>
      ),
    },
    { id: 'area', encabezado: t('columnas.area'), ocultarDebajo: 'md', celda: (c) => c.area ?? '—' },
    { id: 'nivel', encabezado: t('columnas.nivel'), ocultarDebajo: 'lg', celda: (c) => nivel(c.nivel) },
    ...(datos?.permisos.salario
      ? [
          {
            id: 'escala',
            encabezado: nombreSede ? t('columnas.escalaSede', { sede: nombreSede }) : t('columnas.escala'),
            ocultarDebajo: 'lg' as const,
            alinear: 'derecha' as const,
            celda: escala,
          },
        ]
      : []),
    { id: 'personas', encabezado: t('columnas.personas'), alinear: 'derecha', celda: (c) => c.personas },
    { id: 'plazas', encabezado: t('columnas.plazas'), ocultarDebajo: 'md', celda: plazas },
    { id: 'documentos', encabezado: t('columnas.documentos'), ocultarDebajo: 'xl', celda: (c) => t('documentos', { n: c.documentos }) },
  ];

  const chips: ChipFiltro[] = [
    ...(filtros.area ? [{ clave: 'area', etiqueta: t('filtros.chipArea', { area: datos?.areas.find((a) => a.id === filtros.area)?.nombre ?? '' }) }] : []),
    ...(filtros.nivel !== null ? [{ clave: 'nivel', etiqueta: t('filtros.chipNivel', { nivel: nivel(filtros.nivel) }) }] : []),
    ...(filtros.vacantes ? [{ clave: 'vacantes', etiqueta: t('filtros.vacantes') }] : []),
    ...(filtros.sinPersonas ? [{ clave: 'sinPersonas', etiqueta: t('filtros.sinPersonas') }] : []),
  ];

  const estado =
    carga.estado === 'sinPermiso'
      ? 'sinPermiso'
      : carga.estado === 'cargando'
        ? 'cargando'
        : carga.estado === 'error' || carga.estado === 'noExiste'
          ? 'error'
          : filas.length === 0
            ? todos.length === 0
              ? 'vacio'
              : 'sinResultados'
            : 'listo';
  const nuevo = () => router.push(`${RUTA_CARGOS}/nuevo`);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={carga.estado === 'sinPermiso' ? undefined : t('subtitulo')}
        icono={IdCard}
        migas={[{ etiqueta: tc('rrhh'), href: RUTA_HRM }, { etiqueta: t('titulo') }]}
        debajo={<NavPestanasHrm incrustada />}
        cargando={carga.estado === 'cargando'}
        acciones={
          datos?.permisos.crear ? (
            <button type="button" onClick={nuevo} className={clasesBoton({ variante: 'primario' })}>
              <Plus aria-hidden className="size-4" strokeWidth={1.5} />
              {t('nuevo')}
            </button>
          ) : undefined
        }
        movil={{
          subtitulo: datos ? t('conteo', { n: todos.length }) : undefined,
          accion: datos?.permisos.crear ? (
            <button
              type="button"
              onClick={nuevo}
              aria-label={t('nuevo')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
        }}
      />

      {carga.estado !== 'sinPermiso' && carga.estado !== 'error' && (todos.length > 0 || carga.estado === 'cargando') && (
        <ListToolbar
          busqueda={<SearchInput value={filtros.texto} onChange={(v) => cambiar({ texto: v })} placeholder={t('buscar')} etiqueta={t('buscar')} cargando={carga.estado === 'cargando'} />}
          filtros={
            <FilterPanel conteo={conteoFiltrosCargos(filtros)} onLimpiar={limpiar} textoVerResultados={t('filtros.verN', { n: filas.length })}>
              <FormField etiqueta={t('filtros.area')}>
                {(c) => (
                  <Select value={filtros.area ?? TODOS} onValueChange={(v) => cambiar({ area: v === TODOS ? null : v })}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>{t('filtros.todas')}</SelectItem>
                      {(datos?.areas ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('filtros.nivel')}>
                {(c) => (
                  <Select value={filtros.nivel === null ? TODOS : String(filtros.nivel)} onValueChange={(v) => cambiar({ nivel: v === TODOS ? null : Number(v) })}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>{t('filtros.todos')}</SelectItem>
                      {NIVELES_CARGO.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {nivel(n)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <label className="flex items-center gap-3 text-sm text-fg">
                <Checkbox checked={filtros.vacantes} onCheckedChange={(v) => cambiar({ vacantes: v === true })} />
                {t('filtros.vacantes')}
              </label>
              <label className="flex items-center gap-3 text-sm text-fg">
                <Checkbox checked={filtros.sinPersonas} onCheckedChange={(v) => cambiar({ sinPersonas: v === true })} />
                {t('filtros.sinPersonas')}
              </label>
            </FilterPanel>
          }
          chips={chips.length ? <FilterChips chips={chips} onQuitar={(clave) => cambiar({ [clave]: clave === 'vacantes' || clave === 'sinPersonas' ? false : null } as Partial<FiltrosCargos>)} onLimpiarTodo={limpiar} /> : undefined}
        />
      )}

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(c) => c.id}
        estado={estado}
        orden={{ campo: 'nombre', direccion }}
        onOrdenar={() => setDireccion((d) => (d === 'asc' ? 'desc' : 'asc'))}
        onFilaClick={abrir}
        etiquetaFila={(c) => c.nombre}
        acciones={accionesDe}
        tarjetaMovil={(c) => (
          <ListCard
            icono={IdCard}
            titulo={c.nombre}
            subtitulo={[c.area, nivel(c.nivel)].filter(Boolean).join(' · ')}
            meta={
              datos?.permisos.salario && c.escala ? `${moneda(c.escala.minimo)} – ${moneda(c.escala.maximo)}` : t('personasN', { n: c.personas })
            }
            valor={c.plazas !== null ? plazas(c) : undefined}
            onClick={() => abrir(c)}
            acciones={accionesDe(c)}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: IdCard,
          accion: datos?.permisos.crear ? { etiqueta: t('nuevo'), onClick: nuevo, icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion'), accion: { etiqueta: tc('volverInicio'), href: '/app/inicio' } }}
        onReintentar={() => void recargar()}
        onLimpiarFiltros={() => cambiar({ ...FILTROS_CARGOS })}
        termino={filtros.texto}
        pie={
          filas.length > 0 ? (
            <Pagination
              pagina={pagina}
              tamano={tamano}
              total={filas.length}
              onPaginaChange={setPagina}
              onTamanoChange={(n) => {
                setTamano(n);
                setPagina(1);
              }}
              sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.otros') }}
            />
          ) : undefined
        }
      />

      <ConfirmDialog
        abierto={eliminar !== null}
        onAbiertoChange={(v) => !v && setEliminar(null)}
        titulo={t('confirmarEliminar', { nombre: eliminar?.nombre ?? '' })}
        descripcion={t('confirmarEliminarDetalle')}
        textoConfirmar={t('acciones.eliminar')}
        tono="peligro"
        icono={Trash2}
        onConfirmar={confirmarEliminar}
      />
    </div>
  );
}
