'use client';

/**
 * Empleados (Figma 20.2, `docs/design/figma/95-hrm-02-*`), con las piezas del
 * kit (auditoría HRM-Figma 2026-11-15): PageHeader, un solo buscador con
 * «Filtros» y chips debajo, DataTable con tarjetas en el celular, menú «⋯» de
 * fila, BulkActionBar flotante e invitación masiva con ConfirmDialog.
 *
 * Lectura: `GET /api/hrm/empleados` (alcance y número de documento los decide
 * el servidor). Sin filtro de sede: el selector del header es el único
 * (PATRONES §9 y §12.4); la sede se ve como columna.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Briefcase, Download, History, Plus, Send, Upload, UserRound, Users } from 'lucide-react';
import {
  BulkActionBar,
  ChipsOpcion,
  ConfirmDialog,
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { ESTADOS_EMPLEADO, TIPOS_CONTRATO, TONO_ESTADO_EMPLEADO, formatearNumeroDocumento, type EstadoEmpleado } from '@/lib/hrm/personas/catalogo';
import {
  FILTROS_INICIALES,
  alertaPrincipal,
  conteoFiltros,
  filtrarEmpleados,
  resumenEmpleados,
  type EmpleadoFila,
  type FiltrosEmpleados,
} from '@/lib/hrm/personas/logica';
import { invitarAlPortal, useCarga, type ListaEmpleados as RespuestaLista } from '../apiPersonas';
import { useTextoAlerta } from '../textosPersonas';
import { RegistrarCambioDialogo } from '../cambio/RegistrarCambioDialogo';
import { NavPestanasHrm } from '../../navegacion/NavPestanasHrm';

const RUTA = '/app/hrm/empleados';
const FECHA_CORTA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export function ListaEmpleados() {
  const t = useTranslations('hrmPersonas.lista');
  const tc = useTranslations('hrmPersonas.comun');
  const router = useRouter();
  const textoAlerta = useTextoAlerta();
  const { carga, recargar } = useCarga<RespuestaLista>('/api/hrm/empleados');

  const [filtros, setFiltros] = useState<FiltrosEmpleados>(FILTROS_INICIALES);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(10);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [invitar, setInvitar] = useState<EmpleadoFila[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cambio, setCambio] = useState<EmpleadoFila[] | null>(null);

  const datos = carga.estado === 'listo' ? carga.datos : null;
  const todas = useMemo(() => datos?.empleados ?? [], [datos]);
  const filas = useMemo(() => filtrarEmpleados(todas, filtros), [todas, filtros]);
  const visibles = useMemo(() => filas.slice((pagina - 1) * tamano, pagina * tamano), [filas, pagina, tamano]);
  const resumen = useMemo(() => resumenEmpleados(todas), [todas]);
  const cambiarFiltros = (f: Partial<FiltrosEmpleados>) => {
    setFiltros((x) => ({ ...x, ...f }));
    setPagina(1);
  };

  const abrir = (e: EmpleadoFila) => router.push(`${RUTA}/${e.persona_id}`);
  const invitables = (lista: EmpleadoFila[]) => lista.filter((e) => !e.tiene_usuario && !e.invitacion_pendiente && e.estado !== 'retirado');

  const accionesDe = (e: EmpleadoFila): AccionFila[] => [
    { id: 'ver', etiqueta: t('acciones.verFicha'), icono: UserRound, onSelect: () => abrir(e) },
    {
      id: 'cambio',
      etiqueta: t('acciones.registrarCambio'),
      descripcion: t('acciones.registrarCambioDetalle'),
      icono: History,
      onSelect: () => setCambio([e]),
      oculta: e.estado === 'retirado',
    },
    { id: 'documento', etiqueta: t('acciones.subirDocumento'), icono: Upload, onSelect: () => router.push(`${RUTA}/${e.persona_id}?pestana=documentos&subir=1`) },
    {
      id: 'invitar',
      etiqueta: t('acciones.invitar'),
      descripcion: t('acciones.invitarDetalle'),
      icono: Send,
      onSelect: () => setInvitar([e]),
      oculta: invitables([e]).length === 0,
    },
  ];

  const enviarInvitaciones = async () => {
    if (!invitar) return;
    const destino = invitables(invitar).filter((e) => e.tiene_correo);
    setEnviando(true);
    try {
      const r = await invitarAlPortal(destino.map((e) => e.persona_id));
      toast.success(t('invitar.enviadas', { n: r.enviadas }));
      setInvitar(null);
      setSeleccion(new Set());
      void recargar();
    } catch {
      toast.error(t('invitar.error'));
    } finally {
      setEnviando(false);
    }
  };

  const exportar = (lista: EmpleadoFila[]) => {
    // Sin número de documento: exportar datos sensibles exige su propio permiso y registro.
    const csv = aCsv([
      [t('columnas.empleado'), t('columnas.cargo'), t('columnas.area'), t('columnas.sede'), t('columnas.contrato'), t('columnas.ingreso'), t('columnas.estado')],
      ...lista.map((e) => [
        e.nombre ?? '',
        e.cargo ?? '',
        e.area ?? '',
        e.sede ?? '',
        e.tipo_contrato ? tc(`contratos.${e.tipo_contrato}`) : '',
        formatPlainDate(e.ingreso),
        tc(`estados.${e.estado}`),
      ]),
    ]);
    descargarCsv(t('archivo'), csv);
  };

  const badge = (e: EmpleadoFila) => <StatusBadge estado={e.estado} tono={TONO_ESTADO_EMPLEADO[e.estado]} etiqueta={tc(`estados.${e.estado}`)} />;
  const alerta = (e: EmpleadoFila) => {
    const a = alertaPrincipal(e.alertas);
    if (!a) return null;
    return <StatusBadge estado={a.tipo} tono={a.nivel === 'peligro' ? 'peligro' : 'advertencia'} etiqueta={textoAlerta(a, true)} />;
  };
  const contrato = (e: EmpleadoFila) => (
    <div className="min-w-0">
      <p className="truncate text-fg">{e.tipo_contrato ? tc(`contratos.${e.tipo_contrato}`) : '—'}</p>
      {e.estado === 'por_ingresar' && e.ingreso ? (
        <p className="truncate text-xs text-fg-secondary">{t('ingresaEl', { fecha: formatPlainDate(e.ingreso, FECHA_CORTA) })}</p>
      ) : e.fin_contrato ? (
        <p className="truncate text-xs text-fg-secondary">{t('hasta', { fecha: formatPlainDate(e.fin_contrato, FECHA_CORTA) })}</p>
      ) : null}
    </div>
  );

  const columnas: ColumnaTabla<EmpleadoFila>[] = [
    {
      id: 'empleado',
      encabezado: t('columnas.empleado'),
      celda: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{e.nombre}</p>
          {e.doc_numero ? (
            <p className="truncate text-xs text-fg-secondary">{`${e.doc_tipo ?? ''} ${formatearNumeroDocumento(e.doc_numero)}`.trim()}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'cargo',
      encabezado: t('columnas.cargoArea'),
      celda: (e) => (
        <div className="min-w-0">
          <p className="truncate text-fg">{e.cargo ?? t('sinCargo')}</p>
          {e.area ? <p className="truncate text-xs text-fg-secondary">{e.area}</p> : null}
        </div>
      ),
    },
    { id: 'sede', encabezado: t('columnas.sede'), ocultarDebajo: 'lg', celda: (e) => <span className="truncate">{e.sede ?? '—'}</span> },
    { id: 'contrato', encabezado: t('columnas.contrato'), ocultarDebajo: 'xl', celda: contrato },
    { id: 'estado', encabezado: t('columnas.estado'), celda: badge },
    { id: 'alertas', encabezado: t('columnas.alertas'), ocultarDebajo: 'lg', celda: (e) => alerta(e) ?? null },
  ];

  const chips: ChipFiltro[] = [
    ...(conteoFiltros({ ...FILTROS_INICIALES, estados: filtros.estados }) > 0
      ? [{ clave: 'estados', etiqueta: filtros.estados.map((s) => tc(`estados.${s}`)).join(', ') || t('filtros.todosEstados') }]
      : []),
    ...filtros.contratos.map((c) => ({ clave: `contrato:${c}`, etiqueta: tc(`contratos.${c}`) })),
    ...(filtros.area ? [{ clave: 'area', etiqueta: todas.find((e) => e.area_id === filtros.area)?.area ?? t('filtros.area') }] : []),
    ...(filtros.cargo ? [{ clave: 'cargo', etiqueta: todas.find((e) => e.cargo_id === filtros.cargo)?.cargo ?? t('filtros.cargo') }] : []),
  ];
  const quitarChip = (clave: string) => {
    if (clave === 'estados') cambiarFiltros({ estados: FILTROS_INICIALES.estados });
    else if (clave === 'area') cambiarFiltros({ area: null });
    else if (clave === 'cargo') cambiarFiltros({ cargo: null });
    else if (clave.startsWith('contrato:')) cambiarFiltros({ contratos: filtros.contratos.filter((c) => `contrato:${c}` !== clave) });
  };
  const limpiar = () => cambiarFiltros({ ...FILTROS_INICIALES, texto: filtros.texto });

  const areas = useMemo(
    () => Array.from(new Map(todas.filter((e) => e.area_id).map((e) => [e.area_id as string, e.area ?? ''])).entries()).sort((a, b) => a[1].localeCompare(b[1], 'es')),
    [todas]
  );
  const cargos = useMemo(
    () => Array.from(new Map(todas.filter((e) => e.cargo_id).map((e) => [e.cargo_id as string, e.cargo ?? ''])).entries()).sort((a, b) => a[1].localeCompare(b[1], 'es')),
    [todas]
  );

  const estadoTabla =
    carga.estado === 'sinPermiso'
      ? 'sinPermiso'
      : carga.estado === 'cargando'
        ? 'cargando'
        : carga.estado === 'error' || carga.estado === 'noExiste'
          ? 'error'
          : filas.length === 0
            ? todas.length === 0
              ? 'vacio'
              : 'sinResultados'
            : 'listo';

  const subtitulo = datos
    ? [
        t('resumen.activos', { n: resumen.activos }),
        resumen.prueba ? t('resumen.prueba', { n: resumen.prueba }) : null,
        resumen.porIngresar ? t('resumen.porIngresar', { n: resumen.porIngresar }) : null,
      ]
        .filter(Boolean)
        .join(' · ') + `. ${t('resumen.sinUsuario')}`
    : t('subtituloBase');

  // «⋯» de la cabecera (Figma 95-hrm-02-01): lo que no es Importar ni Nuevo.
  const menuCabecera: AccionFila[] = [
    { id: 'exportar', etiqueta: t('acciones.exportar'), icono: Download, onSelect: () => exportar(filas), oculta: filas.length === 0 },
  ];

  const seleccionadas = todas.filter((e) => seleccion.has(e.persona_id));
  const sinCorreo = invitar ? invitables(invitar).filter((e) => !e.tiene_correo) : [];
  const conCorreo = invitar ? invitables(invitar).filter((e) => e.tiene_correo) : [];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={carga.estado === 'sinPermiso' ? undefined : subtitulo}
        icono={Briefcase}
        migas={[{ etiqueta: tc('migas.rrhh'), href: RUTA }, { etiqueta: t('titulo') }]}
        cargando={carga.estado === 'cargando'}
        acciones={
          carga.estado === 'sinPermiso' ? undefined : (
            <>
              <button type="button" onClick={() => router.push(`${RUTA}/importar`)} className={clasesBoton({ variante: 'secundario' })}>
                <Upload aria-hidden className="size-4" strokeWidth={1.5} />
                {t('acciones.importar')}
              </button>
              <button type="button" onClick={() => router.push(`${RUTA}/nuevo`)} className={clasesBoton({ variante: 'primario' })}>
                <Plus aria-hidden className="size-4" strokeWidth={1.5} />
                {t('acciones.nuevo')}
              </button>
              <RowActionsMenu acciones={menuCabecera} orientacion="horizontal" tamano="md" />
            </>
          )
        }
        debajo={<NavPestanasHrm incrustada />}
        movil={{
          subtitulo: datos ? t('resumen.activos', { n: resumen.activos }) : undefined,
          accion:
            carga.estado === 'sinPermiso' ? undefined : (
              <button
                type="button"
                onClick={() => router.push(`${RUTA}/nuevo`)}
                aria-label={t('acciones.nuevo')}
                className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Plus aria-hidden className="size-5" strokeWidth={1.5} />
              </button>
            ),
        }}
      />

      {carga.estado !== 'sinPermiso' && (todas.length > 0 || carga.estado === 'cargando') && (
        <ListToolbar
          busqueda={
            <SearchInput
              value={filtros.texto}
              onChange={(v) => cambiarFiltros({ texto: v })}
              cargando={carga.estado === 'cargando'}
              placeholder={t('buscar')}
              etiqueta={t('buscar')}
            />
          }
          filtros={
            <FilterPanel conteo={conteoFiltros(filtros)} onLimpiar={limpiar} textoVerResultados={t('filtros.verN', { n: filas.length })}>
              <FormField etiqueta={t('filtros.estado')}>
                {(c) => (
                  <ChipsOpcion<EstadoEmpleado>
                    multiple
                    aria-labelledby={c.idEtiqueta}
                    valor={filtros.estados}
                    onValorChange={(v) => cambiarFiltros({ estados: v })}
                    opciones={ESTADOS_EMPLEADO.filter((s) => s !== 'suspendido').map((s) => ({ valor: s, etiqueta: tc(`estados.${s}`) }))}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('filtros.contrato')}>
                {(c) => (
                  <ChipsOpcion<string>
                    multiple
                    aria-labelledby={c.idEtiqueta}
                    valor={filtros.contratos}
                    onValorChange={(v) => cambiarFiltros({ contratos: v })}
                    opciones={TIPOS_CONTRATO.slice(0, 4).map((s) => ({ valor: s, etiqueta: tc(`contratos.${s}`) }))}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('filtros.area')}>
                {(c) => (
                  <Select value={filtros.area ?? 'todas'} onValueChange={(v) => cambiarFiltros({ area: v === 'todas' ? null : v })}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">{t('filtros.todas')}</SelectItem>
                      {areas.map(([id, nombre]) => (
                        <SelectItem key={id} value={id}>
                          {nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('filtros.cargo')}>
                {(c) => (
                  <Select value={filtros.cargo ?? 'todos'} onValueChange={(v) => cambiarFiltros({ cargo: v === 'todos' ? null : v })}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
                      {cargos.map(([id, nombre]) => (
                        <SelectItem key={id} value={id}>
                          {nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </FilterPanel>
          }
          chips={chips.length > 0 ? <FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiar} /> : undefined}
        />
      )}

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(e) => e.persona_id}
        estado={estadoTabla}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        onFilaClick={abrir}
        etiquetaFila={(e) => t('etiquetaFila', { nombre: e.nombre ?? '' })}
        acciones={accionesDe}
        tarjetaMovil={(e, ctx) => (
          <ListCard
            avatar={{ nombre: e.nombre ?? '?' }}
            titulo={e.nombre ?? ''}
            subtitulo={[e.cargo, e.sede].filter(Boolean).join(' · ')}
            estado={
              <span className="flex flex-wrap items-center gap-2">
                {badge(e)}
                {alerta(e)}
              </span>
            }
            onClick={() => abrir(e)}
            acciones={accionesDe(e)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Users,
          accion: { etiqueta: t('acciones.nuevo'), onClick: () => router.push(`${RUTA}/nuevo`), icono: Plus },
          accionSecundaria: { etiqueta: t('acciones.importar'), onClick: () => router.push(`${RUTA}/importar`), icono: Upload },
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        sinPermiso={{
          titulo: t('sinPermiso.titulo'),
          descripcion: t('sinPermiso.descripcion'),
          accion: { etiqueta: t('sinPermiso.accion'), href: '/app/inicio' },
        }}
        onReintentar={() => void recargar()}
        onLimpiarFiltros={limpiar}
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

      {seleccion.size > 0 && (
        <BulkActionBar
          seleccionados={seleccion.size}
          total={filas.length}
          onSeleccionarTodos={() => setSeleccion(new Set(filas.map((e) => e.persona_id)))}
          sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.otros') }}
          acciones={[
            { id: 'cambio', etiqueta: t('acciones.registrarCambio'), icono: History, onClick: () => setCambio(seleccionadas.filter((e) => e.estado !== 'retirado')) },
            {
              id: 'invitar',
              etiqueta: t('acciones.invitarCorto'),
              icono: Send,
              onClick: () => setInvitar(seleccionadas),
              deshabilitada: invitables(seleccionadas).length === 0,
              motivo: t('invitar.nadie'),
            },
            { id: 'exportar', etiqueta: t('acciones.exportar'), icono: Download, onClick: () => exportar(seleccionadas) },
          ]}
          onLimpiar={() => setSeleccion(new Set())}
        />
      )}

      <ConfirmDialog
        abierto={invitar !== null}
        onAbiertoChange={(a) => !a && setInvitar(null)}
        titulo={t('invitar.titulo', { n: invitar ? invitables(invitar).length : 0 })}
        descripcion={
          <>
            {t('invitar.descripcion')}
            {sinCorreo.length > 0 ? ` ${t('invitar.sinCorreo', { nombres: sinCorreo.map((e) => e.nombre).join(', '), n: sinCorreo.length })}` : ''}
          </>
        }
        textoConfirmar={t('invitar.confirmar', { n: conCorreo.length })}
        tono="marca"
        icono={Send}
        cargando={enviando}
        onConfirmar={enviarInvitaciones}
      />

      {cambio && cambio.length > 0 && (
        <RegistrarCambioDialogo
          abierto
          onAbiertoChange={(a) => !a && setCambio(null)}
          empleados={cambio.map((e) => ({ vinculoId: e.vinculo_id, personaId: e.persona_id, nombre: e.nombre ?? '', cargo: e.cargo, sede: e.sede }))}
          onRegistrado={() => {
            setCambio(null);
            setSeleccion(new Set());
            void recargar();
          }}
        />
      )}
    </div>
  );
}
