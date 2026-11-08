'use client';

/**
 * Centros de costo (Figma «Escritorio / Centros de costo — árbol» 2327:125607,
 * «Aplicar plantilla de centros» 2327:126295 y «Nueva distribución»
 * 2327:126356). Árbol por código, sucursal y estado, y las distribuciones que
 * reparten un gasto entre varios centros.
 *
 * Acciones que ya existían y se conservan: crear, editar (el código no cambia),
 * agregar hijo, elegir padre, activar y desactivar, aplicar plantilla con vista
 * previa (base, sector, por sucursal) y crear distribución. Nuevas: sucursal del
 * centro, buscar y filtrar, editar una distribución (la RPC ya lo admitía).
 * No hay borrado: un centro se desactiva (la base niega borrar uno con
 * movimientos, `fn_cost_centers_bloquear_borrado`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Building2, GitFork, ListTree, Pencil, Plus, Power, PowerOff, Shuffle, Trash2 } from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  DataTable,
  Dialogo,
  EmptyState,
  FilterPanel,
  FormField,
  ListToolbar,
  PageHeader,
  RowActionsMenu,
  SearchInput,
  SegmentedControl,
  StatusBadge,
  TarjetaSeleccionable,
  TreeCard,
  TreeCell,
  TreeSelect,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
  type OpcionArbol,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { cn } from '@/lib/utils';
import {
  descendientesYPropio,
  errorGuardarCentro,
  errorRpcDistribucion,
  filasCentros,
  hayFiltros,
  porcentajeDe,
  resumenDistribucion,
  sumaDistribucion,
  validarDistribucion,
  type FilaCentro,
  type FiltroEstadoCentro,
  type LineaDistribucionForm,
} from '@/lib/finanzas/centros/centrosVista';
import {
  CostCenterService,
  type AlcancePlantilla,
  type CostCenter,
  type DistribucionCentro,
  type ResultadoPlantilla,
} from './CostCenterService';

const NS = 'finanzasContabilidadR3.centros';
const ALCANCES: AlcancePlantilla[] = ['base', 'sector', 'sucursal'];
const CAMPO = 'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

type Estado = 'cargando' | 'listo' | 'error';

interface FormCentro {
  code: string;
  name: string;
  parent_id: string;
  branch_id: string;
  is_active: boolean;
}

const FORM_VACIO: FormCentro = { code: '', name: '', parent_id: '', branch_id: '', is_active: true };
const LINEAS_INICIALES: LineaDistribucionForm[] = [
  { centroId: '', porcentaje: '60' },
  { centroId: '', porcentaje: '40' },
];

export function CentroCostosPage() {
  const t = useTranslations(NS);
  const locale = useLocale();
  const sucursales = useBranchOpcional()?.branches;
  const branches = useMemo(() => (sucursales ?? []).filter((b) => b.id != null), [sucursales]);
  const nombreSucursal = useCallback(
    (id: number | null | undefined) => (id ? branches.find((b) => b.id === id)?.name ?? null : null),
    [branches],
  );
  const formatoPorcentaje = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }), [locale]);
  const pct = useCallback((n: number) => `${formatoPorcentaje.format(n)} %`, [formatoPorcentaje]);

  const [centros, setCentros] = useState<CostCenter[]>([]);
  const [estado, setEstado] = useState<Estado>('cargando');
  const [distribuciones, setDistribuciones] = useState<DistribucionCentro[]>([]);
  const [estadoDist, setEstadoDist] = useState<Estado>('cargando');

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoCentro>('todos');
  const [filtroSucursal, setFiltroSucursal] = useState<number | null>(null);
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<CostCenter | null>(null);
  const [form, setForm] = useState<FormCentro>(FORM_VACIO);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [porDesactivar, setPorDesactivar] = useState<CostCenter | null>(null);

  const [plantillaAbierta, setPlantillaAbierta] = useState(false);
  const [alcance, setAlcance] = useState<AlcancePlantilla>('base');
  const [vistaPrevia, setVistaPrevia] = useState<ResultadoPlantilla | null>(null);
  const [aplicando, setAplicando] = useState(false);

  const [distAbierta, setDistAbierta] = useState(false);
  const [distEditando, setDistEditando] = useState<DistribucionCentro | null>(null);
  const [nombreDist, setNombreDist] = useState('');
  const [lineasDist, setLineasDist] = useState<LineaDistribucionForm[]>(LINEAS_INICIALES);
  const [errorDist, setErrorDist] = useState<string | null>(null);
  const [guardandoDist, setGuardandoDist] = useState(false);

  const cargarCentros = useCallback(async () => {
    setEstado('cargando');
    try {
      setCentros(await CostCenterService.getAll());
      setEstado('listo');
    } catch (error) {
      console.error('No se pudieron cargar los centros de costo:', error);
      setEstado('error');
    }
  }, []);

  const cargarDistribuciones = useCallback(async () => {
    setEstadoDist('cargando');
    try {
      setDistribuciones(await CostCenterService.distribuciones());
      setEstadoDist('listo');
    } catch (error) {
      console.error('No se pudieron cargar las distribuciones:', error);
      setEstadoDist('error');
    }
  }, []);

  const cargar = useCallback(async () => {
    await Promise.all([cargarCentros(), cargarDistribuciones()]);
  }, [cargarCentros, cargarDistribuciones]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtros = { busqueda, estado: filtroEstado, sucursal: filtroSucursal };
  const filas = useMemo(
    () => filasCentros(centros, { busqueda, estado: filtroEstado, sucursal: filtroSucursal, cerrados }),
    [centros, busqueda, filtroEstado, filtroSucursal, cerrados],
  );
  const conteoFiltros = (filtroEstado !== 'todos' ? 1 : 0) + (filtroSucursal !== null ? 1 : 0);
  const centrosActivos = useMemo(() => centros.filter((c) => c.is_active).sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true })), [centros]);

  const alternar = (id: string) =>
    setCerrados((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  // ── Centro: crear, editar, hijo, estado ────────────────────────────────
  const abrirCentro = (centro?: CostCenter, padre?: CostCenter) => {
    setEditando(centro ?? null);
    setErrorForm(null);
    setForm(
      centro
        ? { code: centro.code, name: centro.name, parent_id: centro.parent_id ?? '', branch_id: centro.branch_id ? String(centro.branch_id) : '', is_active: centro.is_active }
        : { ...FORM_VACIO, parent_id: padre?.id ?? '', branch_id: padre?.branch_id ? String(padre.branch_id) : '' },
    );
    setFormAbierto(true);
  };

  const guardarCentro = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setErrorForm(t('errores.codigoNombre'));
      return;
    }
    setGuardando(true);
    try {
      const datos = {
        code: form.code.trim(),
        name: form.name.trim(),
        parent_id: form.parent_id || null,
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        is_active: form.is_active,
      };
      if (editando) {
        await CostCenterService.update(editando.id, datos);
        toast.success(t('exito.actualizado'));
      } else {
        await CostCenterService.create(datos);
        toast.success(t('exito.creado'));
      }
      setFormAbierto(false);
      await cargarCentros();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? '');
      setErrorForm(t(`errores.${errorGuardarCentro(mensaje)}`));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (centro: CostCenter, activo: boolean) => {
    try {
      await CostCenterService.desactivar(centro.id, activo);
      toast.success(activo ? t('exito.activado') : t('exito.desactivado'));
      await cargarCentros();
    } catch {
      toast.error(t('errores.estado'));
    }
  };

  // ── Plantilla ──────────────────────────────────────────────────────────
  const previsualizar = async (siguiente: AlcancePlantilla) => {
    setAlcance(siguiente);
    setVistaPrevia(null);
    setAplicando(true);
    try {
      setVistaPrevia(await CostCenterService.sembrar(siguiente, false));
    } catch (error) {
      console.error(error);
      toast.error(t('errores.plantillaVista'));
    } finally {
      setAplicando(false);
    }
  };

  const abrirPlantilla = () => {
    setPlantillaAbierta(true);
    void previsualizar('base');
  };

  const aplicarPlantilla = async () => {
    setAplicando(true);
    try {
      const r = await CostCenterService.sembrar(alcance, true);
      toast.success(r.creados > 0 ? t('plantilla.creados', { n: r.creados, existian: r.ya_existian }) : t('plantilla.yaAplicada'));
      setPlantillaAbierta(false);
      await cargarCentros();
    } catch (error) {
      console.error(error);
      toast.error(t('errores.plantillaAplicar'));
    } finally {
      setAplicando(false);
    }
  };

  // ── Distribuciones ─────────────────────────────────────────────────────
  const abrirDistribucion = (dist?: DistribucionCentro) => {
    setDistEditando(dist ?? null);
    setNombreDist(dist?.nombre ?? '');
    setLineasDist(
      dist ? dist.lineas.map((l) => ({ centroId: l.cost_center_id, porcentaje: String(l.porcentaje) })) : LINEAS_INICIALES.map((l) => ({ ...l })),
    );
    setErrorDist(null);
    setDistAbierta(true);
  };

  const guardarDistribucion = async () => {
    const invalida = validarDistribucion(nombreDist, lineasDist);
    if (invalida) {
      setErrorDist(t(`distribucion.errores.${invalida}`));
      return;
    }
    setGuardandoDist(true);
    try {
      await CostCenterService.guardarDistribucion(
        nombreDist.trim(),
        lineasDist.map((l) => ({ cost_center_id: l.centroId, porcentaje: porcentajeDe(l.porcentaje) })),
        distEditando?.id ?? null,
      );
      toast.success(t('distribucion.guardada'));
      setDistAbierta(false);
      await cargarDistribuciones();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : '';
      setErrorDist(t(`distribucion.errores.${errorRpcDistribucion(mensaje)}`));
    } finally {
      setGuardandoDist(false);
    }
  };

  // ── Tabla del árbol ────────────────────────────────────────────────────
  const accionesDe = (c: CostCenter): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => abrirCentro(c) },
    { id: 'hijo', etiqueta: t('acciones.agregarHijo'), icono: GitFork, onSelect: () => abrirCentro(undefined, c) },
    c.is_active
      ? { id: 'desactivar', etiqueta: t('acciones.desactivar'), icono: PowerOff, separadorAntes: true, onSelect: () => setPorDesactivar(c) }
      : { id: 'activar', etiqueta: t('acciones.activar'), icono: Power, separadorAntes: true, onSelect: () => void cambiarEstado(c, true) },
  ];

  const sucursalDe = (c: CostCenter) => c.sucursal ?? nombreSucursal(c.branch_id) ?? t('todas');

  const columnas: ColumnaTabla<FilaCentro<CostCenter>>[] = [
    {
      id: 'centro',
      encabezado: t('columnas.centro'),
      celda: (f) => (
        <TreeCell
          titulo={`${f.centro.code} · ${f.centro.name}`}
          nivel={f.nivel}
          tieneHijos={f.tieneHijos}
          abierto={f.abierto}
          onAlternar={() => alternar(f.centro.id)}
          contexto={f.contexto}
          icono={Building2}
        />
      ),
    },
    { id: 'sucursal', encabezado: t('columnas.sucursal'), ocultarDebajo: 'md', celda: (f) => <span className="text-fg-secondary">{sucursalDe(f.centro)}</span> },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      ancho: 120,
      celda: (f) => <StatusBadge estado={f.centro.is_active ? 'activo' : 'inactivo'} etiqueta={f.centro.is_active ? t('activo') : t('inactivo')} />,
    },
    {
      id: 'hijo',
      encabezado: '',
      alinear: 'derecha',
      ancho: 90,
      celda: (f) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            abrirCentro(undefined, f.centro);
          }}
          className="text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label={t('acciones.agregarHijoDe', { nombre: f.centro.name })}
        >
          {t('hijo')}
        </button>
      ),
    },
  ];

  const opcionesPadre: OpcionArbol[] = useMemo(() => {
    const indice = new Map(centros.map((c, i) => [c.id, i + 1]));
    return centros.map((c, i) => ({
      id: i + 1,
      parentId: c.parent_id ? indice.get(c.parent_id) ?? null : null,
      etiqueta: `${c.code} · ${c.name}`,
    }));
  }, [centros]);
  const idNumerico = (uuid: string) => (uuid ? centros.findIndex((c) => c.id === uuid) + 1 || null : null);
  const deshabilitadasPadre = useMemo(() => {
    const mapa = new Map<number, string>();
    if (!editando) return mapa;
    for (const id of descendientesYPropio(centros, editando.id)) {
      const n = centros.findIndex((c) => c.id === id) + 1;
      if (n > 0) mapa.set(n, t('formulario.padreCiclo'));
    }
    return mapa;
  }, [centros, editando, t]);

  const suma = sumaDistribucion(lineasDist);
  const sumaOk = Math.abs(suma - 100) <= 0.001;
  const vacio = estado === 'listo' && centros.length === 0;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={ListTree}
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.contabilidad'), href: '/app/finanzas/contabilidad' },
          { etiqueta: t('titulo') },
        ]}
        movil={{
          menu: [
            { id: 'nuevo', etiqueta: t('nuevo'), icono: Plus, onSelect: () => abrirCentro() },
            { id: 'plantilla', etiqueta: t('aplicarPlantilla'), icono: GitFork, onSelect: abrirPlantilla },
            { id: 'distribucion', etiqueta: t('distribucion.nueva'), icono: Shuffle, onSelect: () => abrirDistribucion() },
          ],
        }}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={abrirPlantilla}>
              {t('aplicarPlantilla')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => abrirCentro()}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevo')}
            </button>
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[{ id: 'distribucion', etiqueta: t('distribucion.nueva'), icono: Shuffle, onSelect: () => abrirDistribucion() }]}
            />
          </>
        }
      />

      {vacio ? (
        <EmptyState
          titulo={t('vacio.titulo')}
          descripcion={t('vacio.descripcion')}
          icono={ListTree}
          accion={{ etiqueta: t('aplicarPlantilla'), onClick: abrirPlantilla }}
          accionSecundaria={{ etiqueta: t('nuevo'), onClick: () => abrirCentro() }}
        />
      ) : (
        <>
          <ListToolbar
            busqueda={<SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={t('buscar')} />}
            filtros={
              <FilterPanel
                conteo={conteoFiltros}
                onLimpiar={() => {
                  setFiltroEstado('todos');
                  setFiltroSucursal(null);
                }}
                titulo={t('filtros.titulo')}
              >
                <FormField etiqueta={t('filtros.estado')}>
                  <SegmentedControl
                    opciones={[
                      { valor: 'todos', etiqueta: t('filtros.todos') },
                      { valor: 'activos', etiqueta: t('filtros.activos') },
                      { valor: 'inactivos', etiqueta: t('filtros.inactivos') },
                    ]}
                    valor={filtroEstado}
                    onValorChange={setFiltroEstado}
                    anchoCompleto
                  />
                </FormField>
                <FormField etiqueta={t('filtros.sucursal')}>
                  <select
                    className={CAMPO}
                    value={filtroSucursal === null ? '' : String(filtroSucursal)}
                    onChange={(e) => setFiltroSucursal(e.target.value === '' ? null : Number(e.target.value))}
                  >
                    <option value="">{t('filtros.todasSucursales')}</option>
                    <option value="0">{t('filtros.sinSucursal')}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </FormField>
              </FilterPanel>
            }
          />

          <DataTable
            etiqueta={t('titulo')}
            columnas={columnas}
            filas={filas}
            obtenerId={(f) => f.centro.id}
            estado={estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : filas.length === 0 && hayFiltros(filtros) ? 'sinResultados' : 'listo'}
            termino={busqueda}
            onReintentar={() => void cargarCentros()}
            onLimpiarFiltros={() => {
              setBusqueda('');
              setFiltroEstado('todos');
              setFiltroSucursal(null);
            }}
            acciones={(f) => accionesDe(f.centro)}
            etiquetaFila={(f) => `${f.centro.code} · ${f.centro.name}`}
            tarjetaMovil={(f) => (
              <TreeCard
                nivel={f.nivel}
                tieneHijos={f.tieneHijos}
                abierto={f.abierto}
                onAlternar={() => alternar(f.centro.id)}
                titulo={`${f.centro.code} · ${f.centro.name}`}
                subtitulo={sucursalDe(f.centro)}
                estado={<StatusBadge estado={f.centro.is_active ? 'activo' : 'inactivo'} etiqueta={f.centro.is_active ? t('activo') : t('inactivo')} />}
                acciones={accionesDe(f.centro)}
              />
            )}
          />
        </>
      )}

      <section className="space-y-3" aria-labelledby="titulo-distribuciones">
        <div className="flex items-center justify-between gap-3">
          <h2 id="titulo-distribuciones" className="text-lg font-semibold text-fg">{t('distribucion.titulo')}</h2>
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => abrirDistribucion()}>
            {t('distribucion.nueva')}
          </button>
        </div>
        <DataTable
          etiqueta={t('distribucion.titulo')}
          columnas={[
            { id: 'nombre', encabezado: t('distribucion.nombre'), celda: (d) => <span className="font-medium text-fg">{d.nombre}</span> },
            { id: 'reparto', encabezado: t('distribucion.reparto'), celda: (d) => <span className="text-fg-secondary">{resumenDistribucion(d.lineas, centros, pct)}</span> },
            {
              id: 'suma',
              encabezado: t('distribucion.suma'),
              alinear: 'derecha',
              ancho: 100,
              celda: (d) => <span className="tabular-nums text-fg">{pct(d.lineas.reduce((s, l) => s + l.porcentaje, 0))}</span>,
            },
          ]}
          filas={distribuciones}
          obtenerId={(d) => d.id}
          estado={estadoDist === 'cargando' ? 'cargando' : estadoDist === 'error' ? 'error' : 'listo'}
          onReintentar={() => void cargarDistribuciones()}
          vacio={{ titulo: t('distribucion.vacioTitulo'), descripcion: t('distribucion.vacioDescripcion'), compacto: true }}
          acciones={(d) => [{ id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => abrirDistribucion(d) }]}
          etiquetaFila={(d) => d.nombre}
        />
      </section>

      {/* Nuevo / editar centro */}
      <Dialogo
        abierto={formAbierto}
        onAbiertoChange={setFormAbierto}
        titulo={editando ? t('formulario.tituloEditar') : t('formulario.tituloNuevo')}
        descripcion={t('formulario.descripcion')}
        icono={ListTree}
        ancho={520}
        primario={{ etiqueta: t('formulario.guardar'), onClick: () => void guardarCentro(), cargando: guardando }}
      >
        <div className="space-y-4">
          {errorForm && <AvisoTonal tono="peligro" rol="alert" titulo={errorForm} compacto />}
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <FormField etiqueta={t('formulario.codigo')} obligatorio ayuda={editando ? t('formulario.codigoFijo') : undefined}>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editando} className="font-mono" />
            </FormField>
            <FormField etiqueta={t('formulario.nombre')} obligatorio>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
          </div>
          <FormField etiqueta={t('formulario.padre')}>
            {(campo) => (
              <TreeSelect
                id={campo.id}
                aria-labelledby={campo.idEtiqueta}
                opciones={opcionesPadre}
                valor={idNumerico(form.parent_id)}
                onValorChange={(n) => setForm({ ...form, parent_id: n ? centros[n - 1]?.id ?? '' : '' })}
                opcionRaiz={{ etiqueta: t('formulario.sinPadre') }}
                deshabilitadas={deshabilitadasPadre}
                buscador
                placeholderBusqueda={t('buscar')}
                placeholder={t('formulario.sinPadre')}
              />
            )}
          </FormField>
          <FormField etiqueta={t('formulario.sucursal')} ayuda={t('formulario.sucursalAyuda')}>
            <select className={CAMPO} value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
              <option value="">{t('todas')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </FormField>
          <label className="flex items-center gap-3 text-sm text-fg">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            {t('formulario.activo')}
          </label>
        </div>
      </Dialogo>

      {/* Desactivar */}
      <ConfirmDialog
        abierto={porDesactivar !== null}
        onAbiertoChange={(a) => { if (!a) setPorDesactivar(null); }}
        titulo={t('desactivar.titulo')}
        descripcion={porDesactivar ? t('desactivar.descripcion', { nombre: `${porDesactivar.code} · ${porDesactivar.name}` }) : ''}
        textoConfirmar={t('acciones.desactivar')}
        tono="advertencia"
        icono={PowerOff}
        onConfirmar={() => {
          const c = porDesactivar;
          setPorDesactivar(null);
          if (c) void cambiarEstado(c, false);
        }}
      />

      {/* Aplicar plantilla */}
      <Dialogo
        abierto={plantillaAbierta}
        onAbiertoChange={setPlantillaAbierta}
        titulo={t('plantilla.titulo')}
        descripcion={t('plantilla.descripcion')}
        ancho={560}
        primario={{
          etiqueta: t('plantilla.aplicar'),
          onClick: () => void aplicarPlantilla(),
          cargando: aplicando,
          deshabilitada: !vistaPrevia || vistaPrevia.previstos === 0,
          motivo: vistaPrevia && vistaPrevia.previstos === 0 ? t('plantilla.nadaQueCrear') : undefined,
        }}
      >
        <div className="space-y-4">
          <div className="grid gap-2" role="radiogroup" aria-label={t('plantilla.alcance')}>
            {ALCANCES.map((a) => (
              <TarjetaSeleccionable
                key={a}
                titulo={t(`plantilla.alcances.${a}.titulo`)}
                descripcion={t(`plantilla.alcances.${a}.detalle`)}
                seleccionada={alcance === a}
                onSeleccionar={() => void previsualizar(a)}
                orientacion="horizontal"
                rol="radio"
              />
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-fg">{t('plantilla.vistaPrevia')}</p>
            {vistaPrevia ? (
              <>
                <p className="text-sm text-fg-secondary">{t('plantilla.seCrearan', { n: vistaPrevia.previstos, existen: vistaPrevia.ya_existian })}</p>
                <ul className="max-h-56 divide-y divide-line overflow-auto rounded-lg border border-line text-sm">
                  {vistaPrevia.centros.map((l) => (
                    <li key={`${l.code}-${l.branch_id ?? ''}`} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0">
                        <span className="font-mono text-fg">{l.code}</span> <span className="text-fg">{l.name}</span>
                        <span className="block text-xs text-fg-muted">{nombreSucursal(l.branch_id) ?? t('todas')}</span>
                      </span>
                      <StatusBadge
                        estado={l.accion === 'existia' ? 'inactivo' : 'activo'}
                        etiqueta={l.accion === 'existia' ? t('plantilla.yaExiste') : t('plantilla.seCreara')}
                        tono={l.accion === 'existia' ? 'neutro' : 'informacion'}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-fg-muted">{aplicando ? t('plantilla.calculando') : t('errores.plantillaVista')}</p>
            )}
          </div>
        </div>
      </Dialogo>

      {/* Nueva / editar distribución */}
      <Dialogo
        abierto={distAbierta}
        onAbiertoChange={setDistAbierta}
        titulo={distEditando ? t('distribucion.tituloEditar') : t('distribucion.nueva')}
        descripcion={t('distribucion.descripcion')}
        icono={Shuffle}
        ancho={560}
        primario={{
          etiqueta: t('distribucion.guardar'),
          onClick: () => void guardarDistribucion(),
          cargando: guardandoDist,
          deshabilitada: !sumaOk,
          motivo: !sumaOk ? t('distribucion.errores.suma') : undefined,
        }}
      >
        <div className="space-y-4">
          {errorDist && <AvisoTonal tono="peligro" rol="alert" titulo={errorDist} compacto />}
          <FormField etiqueta={t('distribucion.nombre')} obligatorio>
            <Input value={nombreDist} onChange={(e) => setNombreDist(e.target.value)} placeholder={t('distribucion.nombreEjemplo')} />
          </FormField>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_6rem_2.5rem] gap-2 text-xs font-medium text-fg-secondary">
              <span>{t('distribucion.centro')}</span>
              <span>{t('distribucion.porcentaje')}</span>
              <span className="sr-only">{t('distribucion.quitar')}</span>
            </div>
            {lineasDist.map((linea, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_2.5rem] items-center gap-2">
                <select
                  aria-label={t('distribucion.centroLinea', { n: i + 1 })}
                  className={CAMPO}
                  value={linea.centroId}
                  onChange={(e) => setLineasDist(lineasDist.map((l, j) => (j === i ? { ...l, centroId: e.target.value } : l)))}
                >
                  <option value="">{t('distribucion.elegirCentro')}</option>
                  {centrosActivos.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                  ))}
                </select>
                <Input
                  inputMode="decimal"
                  aria-label={t('distribucion.porcentajeLinea', { n: i + 1 })}
                  value={linea.porcentaje}
                  onChange={(e) => setLineasDist(lineasDist.map((l, j) => (j === i ? { ...l, porcentaje: e.target.value } : l)))}
                  className="text-right tabular-nums"
                />
                <button
                  type="button"
                  disabled={lineasDist.length <= 2}
                  onClick={() => setLineasDist(lineasDist.filter((_, j) => j !== i))}
                  aria-label={t('distribucion.quitarLinea', { n: i + 1 })}
                  className="flex size-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
              onClick={() => setLineasDist([...lineasDist, { centroId: '', porcentaje: '' }])}
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('distribucion.agregarLinea')}
            </button>
            <span role="status" className={cn('text-sm font-semibold tabular-nums', sumaOk ? 'text-success-text' : 'text-danger-text')}>
              {t('distribucion.sumaTotal', { valor: pct(suma) })}
            </span>
          </div>
        </div>
      </Dialogo>
    </div>
  );
}
