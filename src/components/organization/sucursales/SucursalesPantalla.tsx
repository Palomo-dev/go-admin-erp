'use client';

/**
 * Organización › Sedes › Sucursales (Figma 08, secciones 6 y 10).
 *
 * - StatCards con iconos y cifras coherentes con el cupo: el cupo cuenta solo
 *   las sucursales ACTIVAS, igual que Plan (P1-8).
 * - «⋯» de la cabecera solo con acciones de página (Exportar, Importar,
 *   Comprar sucursales). Las acciones de una sucursal van en el «⋯» de su fila.
 * - Tabla sin la columna de imagen vacía; el nombre manda; estados
 *   consistentes («Activa / Inactiva») y columna «Sitio web» (Publicado /
 *   Heredado del principal / Sin sitio), leída de `website_site_states`.
 * - Tope del plan: banner con salida, sin borrar la tabla.
 * - El formulario tiene un único «Guardar».
 * - Crear una sucursal ya NO asigna al creador a ella: un admin sin filas en
 *   `member_branches` ve todas, y esa fila le recortaba el alcance a la nueva
 *   (P2-11).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CheckCircle2,
  Download,
  FileUp,
  Globe,
  GlobeLock,
  List,
  Map as MapaIcono,
  MapPin,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
  UserCog,
  UserRoundX,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { branchService } from '@/lib/services/branchService';
import type { Branch, BranchFormData } from '@/types/branch';
import { BranchForm, type BranchFormRef } from '@/components/branches/BranchForm';
import { AssignManagerModal } from '@/components/branches/AssignManagerModal';
import AssignMembersModal from '@/components/branches/AssignMembersModal';
import {
  DataTable,
  FilterChips,
  FilterPanel,
  KpiStrip,
  ListCard,
  ListToolbar,
  Pagination,
  PanelAdaptable,
  RowActionsMenu,
  SearchInput,
  StatCard,
  StatusBadge,
  ViewToggle,
  calcularRango,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FiltroSelect } from '@/components/membresias/operacion/FiltroSelect';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { BRANCHES_UPDATED_EVENT } from '@/lib/context/BranchContext';
import {
  estadoSitioSede,
  filtrarSucursales,
  ordenarSucursales,
  resumenSucursales,
  sucursalesACsv,
  urlPublicaSede,
  type EstadoSitioFila,
  type EstadoSitioSede,
  type FiltroEstadoSede,
} from '@/lib/organizacion/sucursales';
import { PantallaOrganizacion } from '../acceso/PantallaOrganizacion';
import { useAccesoOrganizacion } from '../acceso/useAccesoOrganizacion';
import { AvisoCupo, ChipCupo } from '../acceso/Cupo';
import { DialogoCompra } from '../acceso/DialogoCompra';
import { useCupoPlan } from '../acceso/useCupoPlan';
import { DetalleSucursal } from './DetalleSucursal';
import { DialogoImportarSucursales } from './DialogoImportarSucursales';
import { nombreGerente, type SucursalFila } from './tipos';

const MapaSucursales = dynamic(() => import('@/components/maps/BranchesMap'), {
  ssr: false,
  loading: () => <Skeleton className="h-[500px] w-full rounded-xl" />,
});

type Vista = 'lista' | 'mapa';
type Confirmacion = { tipo: 'eliminar' | 'publicar' | 'despublicar'; sede: SucursalFila };

const TONO_SITIO: Record<EstadoSitioSede, 'exito' | 'informacion' | 'neutro'> = {
  publicado: 'exito',
  heredado: 'informacion',
  sinSitio: 'neutro',
};

type AccionCabecera = 'nueva' | 'exportar' | 'importar' | 'comprar';
interface PedidoCabecera {
  accion: AccionCabecera;
  id: number;
}

function ListadoSucursales({ organizationId, puedeComprar, pedido }: { organizationId: number; puedeComprar: boolean; pedido: PedidoCabecera | null }) {
  const t = useTranslations('org.acceso.sucursales');
  const entero = useFormatoEntero();
  const { formatDate } = useFormatDate();
  const cupo = useCupoPlan();
  const router = useRouter();

  const [sedes, setSedes] = useState<SucursalFila[]>([]);
  const [sitios, setSitios] = useState<EstadoSitioFila[]>([]);
  const [equipo, setEquipo] = useState<Map<number, number>>(new Map());
  const [org, setOrg] = useState<{ subdominio: string | null; dominio: string | null }>({ subdominio: null, dominio: null });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<FiltroEstadoSede>('todas');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(20);
  const [vista, setVista] = useState<Vista>('lista');

  const [formulario, setFormulario] = useState<{ sede: SucursalFila | null; codigo: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const formRef = useRef<BranchFormRef>(null);
  const [detalle, setDetalle] = useState<SucursalFila | null>(null);
  const [gerenteDe, setGerenteDe] = useState<SucursalFila | null>(null);
  const [miembrosDe, setMiembrosDe] = useState<SucursalFila | null>(null);
  const [confirmar, setConfirmar] = useState<Confirmacion | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [comprar, setComprar] = useState(false);
  const [importar, setImportar] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const [lista, sitiosRes, orgRes] = await Promise.all([
        branchService.getBranchesWithManagers(organizationId),
        supabase.from('website_site_states').select('branch_id, published_revision_id').eq('organization_id', organizationId),
        supabase.from('organizations').select('subdomain, custom_domain').eq('id', organizationId).maybeSingle(),
      ]);
      const filas = lista.filter((s): s is SucursalFila => typeof s.id === 'number');
      setSedes(filas);
      setSitios((sitiosRes.data ?? []) as EstadoSitioFila[]);
      setOrg({ subdominio: orgRes.data?.subdomain ?? null, dominio: orgRes.data?.custom_domain ?? null });
      const ids = filas.map((s) => s.id);
      if (ids.length > 0) {
        const { data: asignaciones } = await supabase.from('member_branches').select('branch_id').in('branch_id', ids);
        const conteo = new Map<number, number>();
        for (const a of (asignaciones ?? []) as { branch_id: number }[]) conteo.set(a.branch_id, (conteo.get(a.branch_id) ?? 0) + 1);
        setEquipo(conteo);
      } else setEquipo(new Map());
    } catch (e) {
      console.warn('[sucursales] carga', e instanceof Error ? e.message : e);
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const avisarCambio = () => {
    window.dispatchEvent(new CustomEvent(BRANCHES_UPDATED_EVENT));
    void cupo.recargar();
  };

  const resumen = useMemo(() => resumenSucursales(sedes, sitios, cupo.sucursales?.maximo ?? null), [sedes, sitios, cupo.sucursales?.maximo]);
  const cupoLleno = cupo.sucursales?.lleno ?? false;

  const visibles = useMemo(() => ordenarSucursales(filtrarSucursales(sedes, texto, estado)), [sedes, texto, estado]);
  const rango = calcularRango(pagina, tamano, visibles.length);
  const filasPagina = visibles.slice(rango.desde > 0 ? rango.desde - 1 : 0, rango.hasta);

  const nueva = useCallback(async () => {
    if (cupoLleno) return;
    let codigo = '';
    try {
      codigo = await branchService.generateBranchCode(organizationId);
    } catch {
      codigo = '';
    }
    setFormulario({ sede: null, codigo });
  }, [cupoLleno, organizationId]);

  // «Crear sucursal» del selector del header (OrgSwitcher) llega con ?crear=1.
  const abiertoDesdeHeader = useRef(false);
  useEffect(() => {
    if (cargando || abiertoDesdeHeader.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('crear') !== '1') return;
    abiertoDesdeHeader.current = true;
    params.delete('crear');
    const resto = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (resto ? `?${resto}` : ''));
    void nueva();
  }, [cargando, nueva]);

  // Pedido de la cabecera de la página («Nueva sucursal», «Exportar», «Comprar sucursales»).
  const ultimoPedido = useRef(0);
  useEffect(() => {
    if (!pedido || pedido.id === ultimoPedido.current) return;
    ultimoPedido.current = pedido.id;
    if (pedido.accion === 'nueva') void nueva();
    if (pedido.accion === 'exportar') exportar();
    if (pedido.accion === 'importar') setImportar(true);
    if (pedido.accion === 'comprar') setComprar(true);
    // Solo reacciona a un pedido nuevo (id distinto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);

  const exportar = () => {
    const csv = sucursalesACsv(
      [t('csv.nombre'), t('csv.codigo'), t('csv.ciudad'), t('csv.direccion'), t('csv.telefono'), t('csv.gerente'), t('csv.estado'), t('csv.sitio')],
      visibles.map((s) => [
        s.name,
        s.branch_code,
        s.city,
        s.address,
        s.phone,
        nombreGerente(s),
        s.is_active === false ? t('estados.inactiva') : t('estados.activa'),
        t(`sitio.${estadoSitioSede(s, sitios)}`),
      ]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t('csv.archivo')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('toasts.exportadas', { n: visibles.length }));
  };

  const guardar = async (datos: BranchFormData) => {
    if (!formulario) return;
    setGuardando(true);
    try {
      const guardada = formulario.sede
        ? await branchService.updateBranch(formulario.sede.id, datos as Partial<Branch>, organizationId)
        : await branchService.createBranch({ ...datos, organization_id: organizationId } as Branch);
      const url = guardada.is_web_published ? urlPublicaSede(guardada, org) : null;
      toast.success(formulario.sede ? t('toasts.actualizada', { nombre: guardada.name }) : t('toasts.creada', { nombre: guardada.name }), {
        description: url ? t('toasts.urlPublica', { url }) : undefined,
      });
      setFormulario(null);
      await cargar();
      avisarCambio();
    } catch (e) {
      toast.error(t('toasts.errorGuardar'), { description: e instanceof Error ? e.message : undefined });
    } finally {
      setGuardando(false);
    }
  };

  const ejecutar = async () => {
    const c = confirmar;
    if (!c) return;
    setTrabajando(true);
    try {
      if (c.tipo === 'eliminar') {
        await branchService.deleteBranch(c.sede.id);
        toast.success(t('toasts.eliminada', { nombre: c.sede.name }));
      } else {
        await branchService.setWebPublished(c.sede.id, c.tipo === 'publicar', organizationId);
        toast.success(t(c.tipo === 'publicar' ? 'toasts.publicada' : 'toasts.despublicada', { nombre: c.sede.name }));
      }
      setConfirmar(null);
      setDetalle(null);
      await cargar();
      avisarCambio();
    } catch (e) {
      toast.error(t(c.tipo === 'eliminar' ? 'toasts.errorEliminar' : 'toasts.errorPublicar'), { description: e instanceof Error ? e.message : undefined });
    } finally {
      setTrabajando(false);
    }
  };

  const acciones = (s: SucursalFila): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => setFormulario({ sede: s, codigo: s.branch_code }) },
    { id: 'miembros', etiqueta: t('acciones.asignarMiembros'), icono: Users, onSelect: () => setMiembrosDe(s) },
    { id: 'gerente', etiqueta: s.manager_id ? t('acciones.cambiarGerente') : t('acciones.asignarGerente'), icono: UserCog, onSelect: () => setGerenteDe(s) },
    s.is_web_published
      ? { id: 'despublicar', etiqueta: t('acciones.despublicar'), icono: GlobeLock, onSelect: () => setConfirmar({ tipo: 'despublicar', sede: s }), separadorAntes: true }
      : { id: 'publicar', etiqueta: t('acciones.publicar'), icono: Globe, onSelect: () => setConfirmar({ tipo: 'publicar', sede: s }), separadorAntes: true },
    { id: 'carta', etiqueta: t('acciones.carta'), icono: UtensilsCrossed, onSelect: () => router.push('/app/sitio-web/carta') },
    {
      id: 'eliminar',
      etiqueta: t('acciones.eliminar'),
      icono: Trash2,
      destructiva: true,
      onSelect: () => setConfirmar({ tipo: 'eliminar', sede: s }),
      deshabilitada: !!s.is_main,
      motivo: s.is_main ? t('motivos.principal') : undefined,
    },
  ];

  const sitioBadge = (s: SucursalFila) => {
    const e = estadoSitioSede(s, sitios);
    return <StatusBadge estado={e} tono={TONO_SITIO[e]} etiqueta={t(`sitio.${e}`)} tamano="sm" />;
  };
  const estadoBadge = (s: SucursalFila) => (
    <StatusBadge estado={s.is_active === false ? 'inactiva' : 'activa'} etiqueta={s.is_active === false ? t('estados.inactiva') : t('estados.activa')} tamano="sm" />
  );
  const gerente = (s: SucursalFila) => {
    const n = nombreGerente(s);
    return n ? <span className="text-fg">{n}</span> : <span className="text-warning-text">{t('sinResponsable')}</span>;
  };

  const columnas: ColumnaTabla<SucursalFila>[] = [
    {
      id: 'sucursal',
      encabezado: t('tabla.sucursal'),
      celda: (s) => (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-fg">{s.name}</span>
            {s.is_main && <StatusBadge estado="principal" tono="marca" etiqueta={t('principal')} tamano="sm" />}
          </div>
          <p className="truncate text-xs text-fg-secondary">{[s.branch_code, s.address].filter(Boolean).join(' · ')}</p>
        </div>
      ),
    },
    { id: 'ciudad', encabezado: t('tabla.ciudad'), celda: (s) => s.city || <span className="text-fg-muted">—</span>, ocultarDebajo: 'md', ancho: 140 },
    { id: 'gerente', encabezado: t('tabla.gerente'), celda: gerente, ocultarDebajo: 'lg', ancho: 180 },
    { id: 'equipo', encabezado: t('tabla.equipo'), celda: (s) => entero(equipo.get(s.id) ?? 0), variante: 'importe', ocultarDebajo: 'xl', ancho: 90 },
    { id: 'sitio', encabezado: t('tabla.sitio'), celda: sitioBadge, ocultarDebajo: 'md', ancho: 190 },
    { id: 'creada', encabezado: t('tabla.creada'), celda: (s) => <span className="text-fg-secondary">{formatDate(s.created_at)}</span>, ocultarDebajo: 'xl', ancho: 120 },
    { id: 'estado', encabezado: t('tabla.estado'), celda: estadoBadge, ancho: 110 },
  ];

  const estadoTabla: EstadoTabla = error ? 'error' : cargando ? 'cargando' : visibles.length === 0 ? (sedes.length > 0 ? 'sinResultados' : 'vacio') : 'listo';
  const chips = estado !== 'todas' ? [{ clave: 'estado', etiqueta: `${t('filtros.estado')}: ${t(`estados.${estado === 'activa' ? 'activa' : 'inactiva'}`)}` }] : [];
  const abrirCompra = puedeComprar ? () => setComprar(true) : undefined;
  const maximo = cupo.sucursales?.maximo ?? null;

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <KpiStrip etiqueta={t('kpi.etiqueta')} columnas={4}>
        <StatCard etiqueta={t('kpi.activas')} valor={entero(resumen.activas)} icono={Building2} detalle={t('kpi.inactivas', { n: resumen.inactivas })} cargando={cargando} />
        <StatCard
          etiqueta={t('kpi.cupo')}
          valor={maximo === null ? entero(resumen.activas) : t('kpi.cupoValor', { usados: entero(resumen.cupo.usados), maximo: entero(maximo) })}
          icono={MapPin}
          detalle={maximo === null ? t('kpi.sinTope') : t('kpi.quedan', { n: resumen.cupo.restantes ?? 0 })}
          tono={resumen.cupo.nivel === 'peligro' ? 'peligro' : resumen.cupo.nivel === 'advertencia' ? 'advertencia' : 'neutro'}
          cargando={cargando || cupo.cargando}
        />
        <StatCard
          etiqueta={t('kpi.sinGerente')}
          valor={entero(resumen.sinGerente)}
          icono={UserRoundX}
          detalle={resumen.sinGerente > 0 ? t('kpi.sinGerenteDetalle') : t('kpi.todasConGerente')}
          tono={resumen.sinGerente > 0 ? 'advertencia' : 'exito'}
          cargando={cargando}
        />
        <StatCard etiqueta={t('kpi.conSitio')} valor={entero(resumen.conSitio)} icono={CheckCircle2} detalle={t('kpi.conSitioDetalle', { total: resumen.total })} cargando={cargando} />
      </KpiStrip>

      {cupoLleno && (
        <AvisoCupo
          titulo={t('cupo.titulo', { maximo: maximo ?? 0 })}
          descripcion={t('cupo.descripcion')}
          onComprar={abrirCompra}
          textoComprar={t('cupo.comprar')}
        />
      )}

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <ListToolbar
            busqueda={
              <SearchInput
                value={texto}
                onChange={(v) => {
                  setTexto(v);
                  setPagina(1);
                }}
                onValueChange={(v) => {
                  setTexto(v);
                  setPagina(1);
                }}
                placeholder={t('busqueda.placeholder')}
                etiqueta={t('busqueda.etiqueta')}
              />
            }
            filtros={
              <div className="flex items-center gap-2">
                <FilterPanel conteo={chips.length} onLimpiar={() => setEstado('todas')} textoVerResultados={t('filtros.ver', { n: visibles.length })}>
                  <FiltroSelect
                    etiqueta={t('filtros.estado')}
                    valor={estado}
                    onValor={(v) => {
                      setEstado(v as FiltroEstadoSede);
                      setPagina(1);
                    }}
                    opciones={[
                      { v: 'todas', e: t('filtros.todas') },
                      { v: 'activa', e: t('estados.activa') },
                      { v: 'inactiva', e: t('estados.inactiva') },
                    ]}
                  />
                </FilterPanel>
                <ChipCupo cupo={cupo.sucursales} tipo="sucursales" onComprar={abrirCompra} />
              </div>
            }
            chips={chips.length > 0 ? <FilterChips chips={chips} onQuitar={() => setEstado('todas')} onLimpiarTodo={() => setEstado('todas')} /> : undefined}
          />
        </div>
        <ViewToggle<Vista>
          valor={vista}
          onValorChange={setVista}
          etiqueta={t('vista.etiqueta')}
          opciones={[
            { valor: 'lista', etiqueta: t('vista.lista'), icono: List },
            { valor: 'mapa', etiqueta: t('vista.mapa'), icono: MapaIcono },
          ]}
        />
      </div>

      {vista === 'mapa' ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface p-2">
          <MapaSucursales branches={visibles} onBranchSelect={(b) => setDetalle(sedes.find((s) => s.id === b.id) ?? null)} height="500px" className="w-full" />
        </div>
      ) : (
        <DataTable<SucursalFila>
          etiqueta={t('tabla.etiqueta')}
          columnas={columnas}
          filas={filasPagina}
          obtenerId={(s) => String(s.id)}
          estado={estadoTabla}
          etiquetaFila={(s) => s.name}
          onFilaClick={setDetalle}
          acciones={acciones}
          tarjetaMovil={(s) => (
            <ListCard
              icono={Building2}
              titulo={s.name}
              insignia={s.is_main ? <StatusBadge estado="principal" tono="marca" etiqueta={t('principal')} tamano="sm" /> : undefined}
              subtitulo={[s.city, s.address].filter(Boolean).join(' · ') || undefined}
              etiquetas={sitioBadge(s)}
              meta={nombreGerente(s) ?? t('sinResponsable')}
              estado={estadoBadge(s)}
              onClick={() => setDetalle(s)}
              acciones={acciones(s)}
            />
          )}
          vacio={{
            titulo: t('vacio.titulo'),
            descripcion: t('vacio.descripcion'),
            icono: Building2,
            accion: cupoLleno ? undefined : { etiqueta: t('nueva'), onClick: () => void nueva(), icono: Plus },
          }}
          sinResultados={{ descripcion: t('vacio.sinResultados') }}
          error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
          onReintentar={() => void cargar()}
          onLimpiarFiltros={() => {
            setTexto('');
            setEstado('todas');
          }}
          termino={texto}
          pie={
            <Pagination
              pagina={rango.pagina}
              tamano={tamano}
              total={visibles.length}
              onPaginaChange={setPagina}
              onTamanoChange={(n) => {
                setTamano(n);
                setPagina(1);
              }}
              sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
              cargando={cargando}
            />
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-fg-secondary" aria-label={t('leyenda.etiqueta')}>
        <span>{t('leyenda.sitio')}</span>
        {(['publicado', 'heredado', 'sinSitio'] as const).map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5">
            <StatusBadge estado={e} tono={TONO_SITIO[e]} etiqueta={t(`sitio.${e}`)} tamano="sm" />
            {t(`leyenda.${e}`)}
          </span>
        ))}
      </div>

      <PanelAdaptable
        abierto={formulario !== null}
        onAbiertoChange={(a) => !a && !guardando && setFormulario(null)}
        titulo={formulario?.sede ? t('formulario.editar', { nombre: formulario.sede.name }) : t('formulario.nueva')}
        descripcion={formulario?.sede ? t('formulario.editarDescripcion') : t('formulario.nuevaDescripcion')}
        icono={Building2}
        ancho={1120}
        ocupado={guardando}
        pie={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setFormulario(null)} disabled={guardando}>
              {t('formulario.cancelar')}
            </button>
            <button type="button" className={clasesBoton()} onClick={() => void formRef.current?.submitForm()} disabled={guardando} aria-busy={guardando || undefined}>
              {guardando ? t('formulario.guardando') : t('formulario.guardar')}
            </button>
          </>
        }
      >
        {formulario && (
          <BranchForm
            ref={formRef}
            initialData={formulario.sede ?? { organization_id: organizationId, branch_code: formulario.codigo }}
            onSubmit={guardar}
            isLoading={guardando}
            hideSubmitButton
            noFormWrapper
            ocultarCabecera
          />
        )}
      </PanelAdaptable>

      <DetalleSucursal
        sede={detalle}
        estadoSitio={detalle ? estadoSitioSede(detalle, sitios) : 'sinSitio'}
        urlPublica={detalle && detalle.is_web_published ? urlPublicaSede(detalle, org) : null}
        acciones={detalle ? acciones(detalle) : []}
        onCerrar={() => setDetalle(null)}
        onEditar={() => detalle && setFormulario({ sede: detalle, codigo: detalle.branch_code })}
      />

      {gerenteDe && (
        <AssignManagerModal
          branch={gerenteDe}
          organizationId={organizationId}
          isOpen
          onClose={() => setGerenteDe(null)}
          onSuccess={async () => {
            toast.success(t('toasts.gerente', { nombre: gerenteDe.name }));
            setGerenteDe(null);
            await cargar();
            avisarCambio();
          }}
        />
      )}
      {miembrosDe && (
        <AssignMembersModal
          isOpen
          onClose={() => setMiembrosDe(null)}
          branchId={miembrosDe.id}
          branchName={miembrosDe.name}
          organizationId={organizationId}
          onSuccess={async () => {
            await cargar();
            avisarCambio();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmar !== null}
        onOpenChange={(o) => !o && !trabajando && setConfirmar(null)}
        title={confirmar ? t(`confirmar.${confirmar.tipo}Titulo`, { nombre: confirmar.sede.name }) : ''}
        description={confirmar ? t(`confirmar.${confirmar.tipo}Descripcion`) : ''}
        confirmLabel={confirmar ? t(`confirmar.${confirmar.tipo}`) : ''}
        cancelLabel={t('confirmar.cancelar')}
        variant={confirmar?.tipo === 'eliminar' || confirmar?.tipo === 'despublicar' ? 'destructive' : 'default'}
        loading={trabajando}
        onConfirm={ejecutar}
      />
      <DialogoImportarSucursales
        abierto={importar}
        onAbiertoChange={setImportar}
        organizationId={organizationId}
        existentes={sedes}
        restantes={cupo.sucursales?.restantes ?? null}
        onImportadas={() => {
          void cargar();
          avisarCambio();
        }}
      />
      <DialogoCompra
        abierto={comprar}
        onAbiertoChange={setComprar}
        tipo="sucursales"
        organizationId={organizationId}
        estadoPlan={cupo.estado}
        maximo={maximo}
      />
    </div>
  );
}

function AccionesCabecera({ onPedir }: { onPedir: (accion: AccionCabecera) => void }) {
  const t = useTranslations('org.acceso.sucursales');
  const cupo = useCupoPlan();
  // Comprar solo con permiso de facturación (lo vuelve a exigir el servidor).
  const acceso = useAccesoOrganizacion();
  const lleno = cupo.sucursales?.lleno ?? false;
  return (
    <>
      <RowActionsMenu
        orientacion="horizontal"
        tamano="md"
        acciones={[
          { id: 'exportar', etiqueta: t('cabecera.exportar'), icono: Download, onSelect: () => onPedir('exportar') },
          {
            id: 'importar',
            etiqueta: t('cabecera.importar'),
            icono: FileUp,
            onSelect: () => onPedir('importar'),
            deshabilitada: lleno,
            motivo: lleno ? t('cupo.botonDeshabilitado') : undefined,
          },
          { id: 'comprar', etiqueta: t('cabecera.comprar'), icono: ShoppingCart, onSelect: () => onPedir('comprar'), oculta: !acceso.puede.facturacion },
        ]}
      />
      <button type="button" className={clasesBoton()} onClick={() => onPedir('nueva')} disabled={lleno} title={lleno ? t('cupo.botonDeshabilitado') : undefined}>
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('nueva')}
      </button>
    </>
  );
}

export function SucursalesPantalla() {
  const t = useTranslations('org.acceso.sucursales');
  const cupo = useCupoPlan();
  const s = cupo.sucursales;
  const [pedido, setPedido] = useState<PedidoCabecera | null>(null);
  const pedir = (accion: AccionCabecera) => setPedido((p) => ({ accion, id: (p?.id ?? 0) + 1 }));
  return (
    <PantallaOrganizacion
      titulo={t('titulo')}
      subtitulo={s ? (s.maximo === null ? t('subtituloSinTope', { n: s.usados }) : t('subtitulo', { usados: s.usados, maximo: s.maximo })) : undefined}
      icono={MapPin}
      permiso="organizacion"
      acciones={<AccionesCabecera onPedir={pedir} />}
      movil={{
        accion: (
          <button type="button" aria-label={t('nueva')} onClick={() => pedir('nueva')} disabled={s?.lleno} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover disabled:opacity-50">
            <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        ),
      }}
    >
      {({ organizationId, acceso }) => <ListadoSucursales organizationId={organizationId} puedeComprar={acceso.puede.facturacion} pedido={pedido} />}
    </PantallaOrganizacion>
  );
}
