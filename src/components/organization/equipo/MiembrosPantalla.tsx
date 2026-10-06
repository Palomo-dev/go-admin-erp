'use client';

/**
 * Organización › Equipo › Miembros (Figma 08, secciones 5 y 10).
 *
 * - Botón primario «Invitar miembro» en la cabecera y pestañas
 *   «Miembros (n) · Invitaciones (n)»; sin título duplicado dentro de la tarjeta.
 * - Un buscador (nombre, correo o cargo) + filtros del kit + chip de cupo
 *   «8/10 usuarios · Comprar usuarios».
 * - DataTable del kit: tarjetas en móvil, selección múltiple con BulkActionBar,
 *   estados vacío / sin resultados / error sin jerga técnica.
 * - Rol y cargo son etiquetas: se cambian desde «⋯» en un diálogo que dice qué
 *   va a pasar. Quitar de una sede, desactivar y quitar del equipo, con
 *   confirmación. Un error de una acción sale en un aviso: ya no borra la tabla
 *   (P1-6).
 *
 * Escrituras por RPC con las guardas en la base (`miembrosService`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Gauge,
  MapPin,
  MapPinOff,
  ShieldCheck,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import {
  AvatarIniciales,
  BulkActionBar,
  DataTable,
  FilterChips,
  FilterPanel,
  ListCard,
  ListToolbar,
  Pagination,
  SearchInput,
  StatusBadge,
  calcularRango,
  clasesBoton,
  idPanel,
  idPestana,
  type AccionFila,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FiltroSelect } from '@/components/membresias/operacion/FiltroSelect';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import {
  cambiarCargoMiembro,
  cambiarEstadoMiembro,
  cambiarRolMiembro,
  quitarSedeMiembro,
  retirarMiembro,
} from '@/lib/services/miembrosService';
import {
  FILTROS_MIEMBRO_VACIOS,
  agruparMiembros,
  alcanceSedes,
  contarFiltrosActivos,
  filtrarMiembros,
  puedeQuitarSede,
  separarSeleccion,
  type FilaPerfilMiembro,
  type FiltrosMiembro,
  type Miembro,
} from '@/lib/organizacion/miembros';
import BranchAssignmentModal from '../BranchAssignmentModal';
import { MemberQuotasSheet } from '../quotas/MemberQuotasSheet';
import { PantallaOrganizacion } from '../acceso/PantallaOrganizacion';
import { ChipCupo } from '../acceso/Cupo';
import { DialogoCompra } from '../acceso/DialogoCompra';
import { useCupoPlan } from '../acceso/useCupoPlan';
import { DialogoCargo, DialogoQuitarSede, DialogoRol, type OpcionSimple } from './DialogosMiembro';
import { PestanasEquipo } from './PestanasEquipo';

const TODOS = '__todos__';

type Confirmacion =
  | { tipo: 'estado'; miembros: Miembro[]; activar: boolean }
  | { tipo: 'retirar'; miembros: Miembro[] };

function mensajeDe(e: unknown): string | null {
  return e instanceof Error && e.message ? e.message : null;
}

function ListadoMiembros({ organizationId, puedeComprar }: { organizationId: number; puedeComprar: boolean }) {
  const t = useTranslations('org.acceso.miembros');
  const tr = useTranslations('org.acceso.roles');
  const { formatDate } = useFormatDate();
  const cupo = useCupoPlan();

  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [roles, setRoles] = useState<OpcionSimple[]>([]);
  const [sedes, setSedes] = useState<OpcionSimple[]>([]);
  const [cargos, setCargos] = useState<OpcionSimple[]>([]);
  const [yo, setYo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const [filtros, setFiltros] = useState<FiltrosMiembro>(FILTROS_MIEMBRO_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(20);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [trabajando, setTrabajando] = useState(false);

  const [rolDe, setRolDe] = useState<Miembro | null>(null);
  const [cargoDe, setCargoDe] = useState<Miembro | null>(null);
  const [sedeDe, setSedeDe] = useState<Miembro | null>(null);
  const [asignarDe, setAsignarDe] = useState<Miembro | null>(null);
  const [cuotasDe, setCuotasDe] = useState<{ userId: string; name: string } | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [comprar, setComprar] = useState(false);

  const nombreRol = useCallback(
    (id: number | null, nombre: string | null) => (id !== null && tr.has(String(id)) ? tr(String(id)) : nombre ?? t('sinRol')),
    [tr, t],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const [perfiles, membresias, rolesRes, sedesRes, cargosRes, sesion] = await Promise.all([
        supabase.rpc('get_profiles_by_organization', { org_id: organizationId }),
        supabase.from('organization_members').select('id, user_id').eq('organization_id', organizationId),
        supabase.from('roles').select('id, name').neq('id', 1).order('id'),
        supabase.from('branches').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name'),
        supabase.from('job_positions').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name'),
        supabase.auth.getUser(),
      ]);
      if (perfiles.error) throw perfiles.error;
      const usuarios = new Map<string, string>(
        ((membresias.data ?? []) as { id: number; user_id: string }[]).map((m) => [String(m.id), m.user_id]),
      );
      setMiembros(agruparMiembros((perfiles.data ?? []) as FilaPerfilMiembro[], usuarios));
      setRoles(((rolesRes.data ?? []) as { id: number; name: string }[]).map((r) => ({ id: String(r.id), nombre: nombreRol(r.id, r.name) })));
      setSedes(((sedesRes.data ?? []) as { id: number; name: string }[]).map((s) => ({ id: String(s.id), nombre: s.name })));
      setCargos(((cargosRes.data ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, nombre: c.name })));
      setYo(sesion.data.user?.id ?? null);
    } catch (e) {
      console.warn('[miembros] carga', mensajeDe(e));
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [organizationId, nombreRol]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Cualquier cambio de filtro vuelve a la página 1 (P1-7).
  const cambiarFiltros = (cambio: Partial<FiltrosMiembro>) => {
    setFiltros((f) => ({ ...f, ...cambio }));
    setPagina(1);
  };

  const visibles = useMemo(() => filtrarMiembros(miembros, filtros), [miembros, filtros]);
  const rango = calcularRango(pagina, tamano, visibles.length);
  const filasPagina = visibles.slice(rango.desde > 0 ? rango.desde - 1 : 0, rango.hasta);

  const actualizarLocal = (ids: readonly string[], cambio: Partial<Miembro>) =>
    setMiembros((lista) => lista.map((m) => (ids.includes(m.id) ? { ...m, ...cambio } : m)));

  const esYo = (m: Miembro) => yo !== null && m.userId === yo;
  const bloqueo = (m: Miembro): string | undefined =>
    esYo(m) ? t('motivos.tuMismo') : m.esSuperAdmin ? t('motivos.superAdmin') : undefined;

  const acciones = (m: Miembro): AccionFila[] => {
    const motivo = bloqueo(m);
    const alcance = alcanceSedes(m);
    const quitarSedePosible = !alcance.todas && m.sedes.some((s) => puedeQuitarSede(m, s.id));
    return [
      { id: 'rol', etiqueta: t('acciones.cambiarRol'), icono: ShieldCheck, onSelect: () => setRolDe(m), deshabilitada: !!motivo, motivo },
      { id: 'cargo', etiqueta: t('acciones.editarCargo'), icono: Briefcase, onSelect: () => setCargoDe(m), deshabilitada: !!motivo, motivo },
      {
        id: 'sedes',
        etiqueta: t('acciones.asignarSedes'),
        icono: MapPin,
        onSelect: () => setAsignarDe(m),
        deshabilitada: !!motivo,
        motivo,
        separadorAntes: true,
      },
      {
        id: 'quitarSede',
        etiqueta: t('acciones.quitarSede'),
        icono: MapPinOff,
        onSelect: () => setSedeDe(m),
        oculta: alcance.todas,
        deshabilitada: !!motivo || !quitarSedePosible,
        motivo: motivo ?? (quitarSedePosible ? undefined : t('motivos.unicaSede')),
      },
      {
        id: 'cuotas',
        etiqueta: t('acciones.verCuotas'),
        icono: Gauge,
        onSelect: () => m.userId && setCuotasDe({ userId: m.userId, name: m.nombre || m.email }),
        oculta: !m.userId,
      },
      m.activo
        ? { id: 'desactivar', etiqueta: t('acciones.desactivar'), icono: UserX, onSelect: () => setConfirmacion({ tipo: 'estado', miembros: [m], activar: false }), deshabilitada: !!motivo, motivo, separadorAntes: true }
        : { id: 'activar', etiqueta: t('acciones.activar'), icono: UserCheck, onSelect: () => setConfirmacion({ tipo: 'estado', miembros: [m], activar: true }), deshabilitada: !!motivo, motivo, separadorAntes: true },
      {
        id: 'retirar',
        etiqueta: t('acciones.quitarDelEquipo'),
        icono: UserMinus,
        destructiva: true,
        onSelect: () => setConfirmacion({ tipo: 'retirar', miembros: [m] }),
        deshabilitada: !!motivo,
        motivo,
      },
    ];
  };

  // ── Acciones ───────────────────────────────────────────────────────────────
  const cambiarRol = async (rolId: number) => {
    const m = rolDe;
    if (!m) return;
    try {
      await cambiarRolMiembro(m.id, rolId);
      actualizarLocal([m.id], { rolId, rolNombre: roles.find((r) => r.id === String(rolId))?.nombre ?? null });
      toast.success(t('toasts.rolCambiado', { nombre: m.nombre || m.email }));
      setRolDe(null);
    } catch (e) {
      toast.error(t('toasts.errorTitulo'), { description: mensajeDe(e) ?? t('toasts.errorRol') });
    }
  };

  const cambiarCargo = async (cargoId: string | null) => {
    const m = cargoDe;
    if (!m) return;
    try {
      await cambiarCargoMiembro(m.id, cargoId);
      actualizarLocal([m.id], { cargoId, cargoNombre: cargos.find((c) => c.id === cargoId)?.nombre ?? null });
      toast.success(t('toasts.cargoCambiado', { nombre: m.nombre || m.email }));
      setCargoDe(null);
    } catch (e) {
      const noDisponible = e instanceof Error && 'codigo' in e && (e as { codigo?: string }).codigo === 'NO_DISPONIBLE';
      toast.error(t('toasts.errorTitulo'), { description: noDisponible ? t('toasts.cargoNoDisponible') : mensajeDe(e) ?? t('toasts.errorCargo') });
    }
  };

  const quitarSede = async (sedeId: number) => {
    const m = sedeDe;
    if (!m) return;
    try {
      await quitarSedeMiembro(m.id, sedeId, m.sedes.length);
      actualizarLocal([m.id], { sedes: m.sedes.filter((s) => s.id !== sedeId) });
      toast.success(t('toasts.sedeQuitada', { nombre: m.nombre || m.email }));
      setSedeDe(null);
    } catch (e) {
      toast.error(t('toasts.errorTitulo'), { description: mensajeDe(e) ?? t('toasts.errorSede') });
    }
  };

  const ejecutarConfirmacion = async () => {
    const c = confirmacion;
    if (!c) return;
    setTrabajando(true);
    const hechos: string[] = [];
    const fallos: string[] = [];
    for (const m of c.miembros) {
      try {
        if (c.tipo === 'estado') await cambiarEstadoMiembro(m.id, c.activar);
        else await retirarMiembro(m.id);
        hechos.push(m.id);
      } catch (e) {
        fallos.push(`${m.nombre || m.email}: ${mensajeDe(e) ?? t('toasts.errorGenerico')}`);
      }
    }
    const ok = hechos.length;
    if (c.tipo === 'estado') actualizarLocal(hechos, { activo: c.activar });
    else setMiembros((lista) => lista.filter((m) => !hechos.includes(m.id)));
    setSeleccion(new Set());
    setTrabajando(false);
    setConfirmacion(null);
    if (ok > 0) {
      const clave = c.tipo === 'retirar' ? 'retirados' : c.activar ? 'activados' : 'desactivados';
      toast.success(t(`toasts.${clave}`, { n: ok }));
      void cupo.recargar();
    }
    if (fallos.length > 0) toast.error(t('toasts.algunosFallaron', { n: fallos.length }), { description: fallos.slice(0, 3).join(' · ') });
  };

  // ── Selección masiva ───────────────────────────────────────────────────────
  const masiva = (accion: 'activar' | 'desactivar' | 'retirar') => {
    const { aplicables, omitidos } = separarSeleccion(miembros, seleccion, yo);
    if (omitidos.length > 0) toast.info(t('toasts.omitidos', { n: omitidos.length }));
    if (aplicables.length === 0) return;
    setConfirmacion(accion === 'retirar' ? { tipo: 'retirar', miembros: aplicables } : { tipo: 'estado', miembros: aplicables, activar: accion === 'activar' });
  };

  // ── Filtros (chips) ────────────────────────────────────────────────────────
  const chips = [
    filtros.rolId !== null && { clave: 'rol', etiqueta: `${t('filtros.rol')}: ${roles.find((r) => r.id === String(filtros.rolId))?.nombre ?? ''}` },
    filtros.sedeId !== null && { clave: 'sede', etiqueta: `${t('filtros.sede')}: ${sedes.find((s) => s.id === String(filtros.sedeId))?.nombre ?? ''}` },
    filtros.estado !== 'todos' && { clave: 'estado', etiqueta: `${t('filtros.estado')}: ${t(`estados.${filtros.estado}`)}` },
  ].filter(Boolean) as { clave: string; etiqueta: string }[];
  const quitarChip = (clave: string) =>
    cambiarFiltros(clave === 'rol' ? { rolId: null } : clave === 'sede' ? { sedeId: null } : { estado: 'todos' });
  const limpiar = () => cambiarFiltros({ ...FILTROS_MIEMBRO_VACIOS, texto: filtros.texto });

  // ── Celdas ─────────────────────────────────────────────────────────────────
  const etiquetasSedes = (m: Miembro) => {
    const a = alcanceSedes(m);
    if (a.todas) return <StatusBadge estado="info" tono="marca" etiqueta={t('todasLasSedes')} tamano="sm" />;
    return (
      <div className="flex flex-wrap gap-1">
        {a.sedes.slice(0, 2).map((s) => (
          <StatusBadge key={s.id} estado="neutro" tono="neutro" etiqueta={s.nombre} tamano="sm" />
        ))}
        {a.sedes.length > 2 && <StatusBadge estado="neutro" tono="neutro" etiqueta={`+${a.sedes.length - 2}`} tamano="sm" />}
      </div>
    );
  };
  const etiquetaRol = (m: Miembro) => (
    <StatusBadge estado="rol" tono={m.esSuperAdmin ? 'marca' : 'neutro'} etiqueta={nombreRol(m.rolId, m.rolNombre)} tamano="sm" />
  );
  const etiquetaCargo = (m: Miembro) =>
    m.cargoNombre ? <StatusBadge estado="cargo" tono="neutro" apariencia="contorno" etiqueta={m.cargoNombre} tamano="sm" /> : <span className="text-[13px] text-fg-muted">{t('sinCargo')}</span>;
  const estado = (m: Miembro) => (
    <StatusBadge estado={m.activo ? 'activo' : 'inactivo'} etiqueta={m.activo ? t('estados.activo') : t('estados.inactivo')} tamano="sm" />
  );

  const columnas: ColumnaTabla<Miembro>[] = [
    {
      id: 'miembro',
      encabezado: t('tabla.miembro'),
      celda: (m) => (
        <div className="flex min-w-0 items-center gap-3">
          <AvatarIniciales nombre={m.nombre || m.email} src={m.avatarUrl} tamano="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">
              {m.nombre || t('sinNombre')}
              {esYo(m) && <span className="ml-1.5 text-xs font-normal text-fg-secondary">{t('tu')}</span>}
            </p>
            <p className="truncate text-xs text-fg-secondary">{m.email}</p>
          </div>
        </div>
      ),
    },
    { id: 'sedes', encabezado: t('tabla.sedes'), celda: etiquetasSedes, ocultarDebajo: 'md' },
    { id: 'rol', encabezado: t('tabla.rol'), celda: etiquetaRol, ancho: 170 },
    { id: 'cargo', encabezado: t('tabla.cargo'), celda: etiquetaCargo, ocultarDebajo: 'lg' },
    { id: 'alta', encabezado: t('tabla.alta'), celda: (m) => <span className="text-fg-secondary">{formatDate(m.creadoEn)}</span>, ocultarDebajo: 'xl', ancho: 120 },
    { id: 'estado', encabezado: t('tabla.estado'), celda: estado, ancho: 110 },
  ];

  const estadoTabla: EstadoTabla = error ? 'error' : cargando ? 'cargando' : visibles.length === 0 ? (miembros.length > 0 ? 'sinResultados' : 'vacio') : 'listo';

  return (
    <div role="tabpanel" id={idPanel('equipo', 'miembros')} aria-labelledby={idPestana('equipo', 'miembros')} className="flex flex-col gap-4">
      <ListToolbar
        busqueda={
          <div className="flex min-w-0 items-center gap-2">
            <SearchInput value={filtros.texto} onChange={(v) => cambiarFiltros({ texto: v })} onValueChange={(v) => cambiarFiltros({ texto: v })} placeholder={t('busqueda.placeholder')} etiqueta={t('busqueda.etiqueta')} className="min-w-0 flex-1" />
          </div>
        }
        filtros={
          <div className="flex items-center gap-2">
            <FilterPanel conteo={contarFiltrosActivos(filtros)} onLimpiar={limpiar} textoVerResultados={t('filtros.ver', { n: visibles.length })}>
              <FiltroSelect etiqueta={t('filtros.rol')} valor={filtros.rolId === null ? TODOS : String(filtros.rolId)} onValor={(v) => cambiarFiltros({ rolId: v === TODOS ? null : Number(v) })} opciones={[{ v: TODOS, e: t('filtros.todos') }, ...roles.map((r) => ({ v: r.id, e: r.nombre }))]} />
              <FiltroSelect etiqueta={t('filtros.sede')} valor={filtros.sedeId === null ? TODOS : String(filtros.sedeId)} onValor={(v) => cambiarFiltros({ sedeId: v === TODOS ? null : Number(v) })} opciones={[{ v: TODOS, e: t('filtros.todas') }, ...sedes.map((s) => ({ v: s.id, e: s.nombre }))]} />
              <FiltroSelect
                etiqueta={t('filtros.estado')}
                valor={filtros.estado}
                onValor={(v) => cambiarFiltros({ estado: v as FiltrosMiembro['estado'] })}
                opciones={[
                  { v: 'todos', e: t('filtros.todos') },
                  { v: 'activo', e: t('estados.activo') },
                  { v: 'inactivo', e: t('estados.inactivo') },
                ]}
              />
            </FilterPanel>
            <ChipCupo cupo={cupo.usuarios} tipo="usuarios" onComprar={puedeComprar ? () => setComprar(true) : undefined} />
          </div>
        }
        chips={chips.length > 0 ? <FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiar} /> : undefined}
      />

      <DataTable<Miembro>
        etiqueta={t('tabla.etiqueta')}
        columnas={columnas}
        filas={filasPagina}
        obtenerId={(m) => m.id}
        estado={estadoTabla}
        etiquetaFila={(m) => m.nombre || m.email}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        acciones={acciones}
        tonoFila={(m) => (m.activo ? undefined : 'advertencia')}
        tarjetaMovil={(m, ctx) => (
          <ListCard
            avatar={{ nombre: m.nombre || m.email, src: m.avatarUrl }}
            titulo={m.nombre || m.email}
            subtitulo={m.email}
            etiquetas={
              <>
                {etiquetaRol(m)}
                {etiquetasSedes(m)}
              </>
            }
            meta={m.cargoNombre ?? undefined}
            estado={estado(m)}
            acciones={acciones(m)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={() => ctx.alternar(true)}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Users,
          accion: { etiqueta: t('invitar'), href: '/app/organizacion/invitaciones?invitar=1', icono: UserPlus },
        }}
        sinResultados={{ descripcion: t('vacio.sinResultados') }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={() => cambiarFiltros(FILTROS_MIEMBRO_VACIOS)}
        termino={filtros.texto}
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

      {seleccion.size > 0 && (
        <BulkActionBar
          seleccionados={seleccion.size}
          sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
          acciones={[
            { id: 'activar', etiqueta: t('masivas.activar'), icono: UserCheck, onClick: () => masiva('activar'), cargando: trabajando },
            { id: 'desactivar', etiqueta: t('masivas.desactivar'), icono: UserX, onClick: () => masiva('desactivar'), cargando: trabajando },
          ]}
          accionesSecundarias={[{ id: 'retirar', etiqueta: t('masivas.quitar'), icono: UserMinus, destructiva: true, onSelect: () => masiva('retirar') }]}
          onLimpiar={() => setSeleccion(new Set())}
        />
      )}

      <DialogoRol miembro={rolDe} roles={roles} nombreRol={nombreRol} onCerrar={() => setRolDe(null)} onConfirmar={cambiarRol} />
      <DialogoCargo miembro={cargoDe} cargos={cargos} onCerrar={() => setCargoDe(null)} onConfirmar={cambiarCargo} />
      <DialogoQuitarSede miembro={sedeDe} onCerrar={() => setSedeDe(null)} onConfirmar={quitarSede} />

      <ConfirmDialog
        open={confirmacion !== null}
        onOpenChange={(o) => !o && !trabajando && setConfirmacion(null)}
        title={
          confirmacion?.tipo === 'retirar'
            ? t('confirmar.retirarTitulo', { n: confirmacion.miembros.length, nombre: confirmacion.miembros[0]?.nombre || confirmacion.miembros[0]?.email || '' })
            : confirmacion?.activar
              ? t('confirmar.activarTitulo', { n: confirmacion?.miembros.length ?? 0, nombre: confirmacion?.miembros[0]?.nombre || '' })
              : t('confirmar.desactivarTitulo', { n: confirmacion?.miembros.length ?? 0, nombre: confirmacion?.miembros[0]?.nombre || '' })
        }
        description={
          confirmacion?.tipo === 'retirar'
            ? t('confirmar.retirarDescripcion')
            : confirmacion?.activar
              ? t('confirmar.activarDescripcion')
              : t('confirmar.desactivarDescripcion')
        }
        confirmLabel={confirmacion?.tipo === 'retirar' ? t('confirmar.retirar') : confirmacion?.activar ? t('confirmar.activar') : t('confirmar.desactivar')}
        cancelLabel={t('confirmar.cancelar')}
        variant={confirmacion?.tipo === 'retirar' || confirmacion?.activar === false ? 'destructive' : 'default'}
        loading={trabajando}
        onConfirm={ejecutarConfirmacion}
      />

      <MemberQuotasSheet open={cuotasDe !== null} onOpenChange={(o) => !o && setCuotasDe(null)} member={cuotasDe} />
      {asignarDe && (
        <BranchAssignmentModal
          isOpen
          onClose={() => {
            setAsignarDe(null);
            void cargar();
          }}
          memberId={asignarDe.id}
          memberName={asignarDe.nombre || asignarDe.email}
          organizationId={organizationId}
        />
      )}
      <DialogoCompra
        abierto={comprar}
        onAbiertoChange={setComprar}
        tipo="usuarios"
        organizationId={organizationId}
        estadoPlan={cupo.estado}
        maximo={cupo.usuarios?.maximo ?? null}
        resumenActual={cupo.usuarios && cupo.usuarios.maximo !== null ? t('cupoActual', { usados: cupo.usuarios.usados, maximo: cupo.usuarios.maximo }) : undefined}
      />
    </div>
  );
}

export function MiembrosPantalla() {
  const t = useTranslations('org.acceso.miembros');
  return (
    <PantallaOrganizacion
      titulo={t('titulo')}
      subtitulo={t('subtitulo')}
      icono={Users}
      permiso="miembros"
      acciones={
        <Link href="/app/organizacion/invitaciones?invitar=1" className={clasesBoton()}>
          <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('invitar')}
        </Link>
      }
      movil={{
        accion: (
          <Link href="/app/organizacion/invitaciones?invitar=1" aria-label={t('invitar')} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover">
            <UserPlus aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </Link>
        ),
      }}
      debajo={<PestanasEquipo activa="miembros" />}
    >
      {({ organizationId, acceso }) => <ListadoMiembros organizationId={organizationId} puedeComprar={acceso.puede.facturacion} />}
    </PantallaOrganizacion>
  );
}
