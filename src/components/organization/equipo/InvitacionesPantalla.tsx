'use client';

/**
 * Organización › Equipo › Invitaciones (Figma 08, secciones 5 y 10).
 *
 * - Misma cabecera que Miembros («Invitar miembro» + pestañas).
 * - Un buscador y los filtros del kit (estado, rol); avisos con los toasts del
 *   kit en vez de cajas que no se ocultaban.
 * - Reenviar pide confirmación y dice lo que hace (código nuevo, 30 días desde
 *   hoy, el enlace anterior deja de servir: P2-7). Revocar, por el servidor
 *   (`/api/organizacion/invitaciones/revocar`), con confirmación.
 * - Una invitación vencida se ve como «Vencida», no ocupa cupo y se puede
 *   reenviar (P1-5).
 * - Cupo lleno: aviso con «Comprar usuarios» y «Cambiar de plan», sin borrar la
 *   tabla.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Ban, Mail, MailPlus, RefreshCw, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import {
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
  accionesInvitacion,
  diasParaVencer,
  estadoInvitacion,
  filtrarInvitaciones,
  ordenarInvitaciones,
  type EstadoInvitacion,
  type FiltrosInvitacion,
  type InvitacionListado,
} from '@/lib/organizacion/invitaciones';
import { PantallaOrganizacion } from '../acceso/PantallaOrganizacion';
import { AvisoCupo, ChipCupo } from '../acceso/Cupo';
import { DialogoCompra } from '../acceso/DialogoCompra';
import { useCupoPlan } from '../acceso/useCupoPlan';
import { DialogoInvitar, type SedeInvitacion } from './DialogoInvitar';
import type { OpcionSimple } from './DialogosMiembro';
import { PestanasEquipo } from './PestanasEquipo';

const TODOS = '__todos__';

interface Invitacion extends InvitacionListado {
  branch_id: number | null;
  job_position_id: string | null;
  created_at: string | null;
}

const TONO: Record<EstadoInvitacion, 'advertencia' | 'exito' | 'neutro' | 'peligro'> = {
  pendiente: 'advertencia',
  aceptada: 'exito',
  revocada: 'neutro',
  vencida: 'peligro',
};

function ListadoInvitaciones({ organizationId, puedeComprar }: { organizationId: number; puedeComprar: boolean }) {
  const t = useTranslations('org.acceso.invitaciones');
  const tr = useTranslations('org.acceso.roles');
  const { formatDate } = useFormatDate();
  const cupo = useCupoPlan();
  const params = useSearchParams();
  const router = useRouter();

  const [filas, setFilas] = useState<Invitacion[]>([]);
  const [roles, setRoles] = useState<OpcionSimple[]>([]);
  const [sedes, setSedes] = useState<SedeInvitacion[]>([]);
  const [nombresSede, setNombresSede] = useState<Map<number, string>>(new Map());
  const [cargos, setCargos] = useState<OpcionSimple[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const [filtros, setFiltros] = useState<FiltrosInvitacion>({ texto: '', estado: 'todas', rolId: null });
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(20);

  const [invitar, setInvitar] = useState(false);
  const [comprar, setComprar] = useState(false);
  const [confirmar, setConfirmar] = useState<{ tipo: 'reenviar' | 'revocar'; fila: Invitacion } | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const nombreRol = useCallback((id: number | null) => (id !== null && tr.has(String(id)) ? tr(String(id)) : t('sinRol')), [tr, t]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const [inv, rolesRes, sedesRes, cargosRes] = await Promise.all([
        supabase
          .from('invitations')
          .select('id, email, role_id, branch_id, job_position_id, created_at, expires_at, status')
          .eq('organization_id', organizationId),
        supabase.from('roles').select('id, name').neq('id', 1).order('id'),
        supabase.from('branches').select('id, name, is_main, is_active').eq('organization_id', organizationId).order('name'),
        supabase.from('job_positions').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name'),
      ]);
      if (inv.error) throw inv.error;
      setFilas((inv.data ?? []) as Invitacion[]);
      setRoles(((rolesRes.data ?? []) as { id: number; name: string }[]).map((r) => ({ id: String(r.id), nombre: tr.has(String(r.id)) ? tr(String(r.id)) : r.name })));
      const todas = (sedesRes.data ?? []) as { id: number; name: string; is_main: boolean | null; is_active: boolean | null }[];
      setNombresSede(new Map(todas.map((s) => [s.id, s.name])));
      setSedes(todas.filter((s) => s.is_active !== false).map((s) => ({ id: String(s.id), nombre: s.name, principal: !!s.is_main })));
      setCargos(((cargosRes.data ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, nombre: c.name })));
      setAhora(Date.now());
    } catch (e) {
      console.warn('[invitaciones] carga', e instanceof Error ? e.message : e);
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [organizationId, tr]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // «Invitar miembro» desde Miembros, la guía de Información o el estado vacío llega con ?invitar=1.
  useEffect(() => {
    if (params?.get('invitar.titulo') !== '1') return;
    setInvitar(true);
    router.replace('/app/organizacion/invitaciones', { scroll: false });
  }, [params, router]);

  const cambiarFiltros = (cambio: Partial<FiltrosInvitacion>) => {
    setFiltros((f) => ({ ...f, ...cambio }));
    setPagina(1);
  };
  const visibles = useMemo(() => ordenarInvitaciones(filtrarInvitaciones(filas, filtros, ahora), ahora), [filas, filtros, ahora]);
  const rango = calcularRango(pagina, tamano, visibles.length);
  const filasPagina = visibles.slice(rango.desde > 0 ? rango.desde - 1 : 0, rango.hasta);

  const despuesDeCambio = () => {
    void cargar();
    void cupo.recargar();
  };

  const ejecutar = async () => {
    const c = confirmar;
    if (!c) return;
    setTrabajando(true);
    try {
      const res =
        c.tipo === 'reenviar'
          ? await fetch('/api/auth/invite', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-organization-id': String(organizationId) },
              body: JSON.stringify({ invitationId: c.fila.id, organizationId, origin: window.location.origin }),
            })
          : await fetch('/api/organizacion/invitaciones/revocar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ invitationId: c.fila.id }),
            });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean };
      if (!res.ok || !json.success) {
        toast.error(t(c.tipo === 'reenviar' ? 'toasts.errorReenviar' : 'toasts.errorRevocar'), {
          description: res.status === 429 ? t('toasts.demasiadas') : res.status === 404 ? t('toasts.yaNoPendiente') : undefined,
        });
      } else {
        toast.success(t(c.tipo === 'reenviar' ? 'toasts.reenviada' : 'toasts.revocada', { email: c.fila.email }));
      }
      despuesDeCambio();
    } catch {
      toast.error(t('toasts.errorRed'));
    } finally {
      setTrabajando(false);
      setConfirmar(null);
    }
  };

  const acciones = (f: Invitacion): AccionFila[] => {
    const a = accionesInvitacion(estadoInvitacion(f, ahora));
    return [
      { id: 'reenviar', etiqueta: t('acciones.reenviar'), icono: RefreshCw, onSelect: () => setConfirmar({ tipo: 'reenviar', fila: f }), oculta: !a.reenviar },
      { id: 'revocar', etiqueta: t('acciones.revocar'), icono: Ban, destructiva: true, onSelect: () => setConfirmar({ tipo: 'revocar', fila: f }), oculta: !a.revocar },
    ];
  };

  const estadoBadge = (f: Invitacion) => {
    const e = estadoInvitacion(f, ahora);
    return <StatusBadge estado={e} tono={TONO[e]} etiqueta={t(`estados.${e}`)} tamano="sm" />;
  };
  const vence = (f: Invitacion) => {
    const e = estadoInvitacion(f, ahora);
    if (e === 'aceptada' || e === 'revocada') return <span className="text-fg-muted">—</span>;
    if (!f.expires_at) return <span className="text-fg-secondary">{t('sinVencimiento')}</span>;
    const dias = diasParaVencer(f, ahora);
    return (
      <span className={e === 'vencida' ? 'text-danger-text' : dias !== null && dias <= 2 ? 'text-warning-text' : 'text-fg-secondary'}>
        {e === 'vencida' ? t('vencio', { fecha: formatDate(f.expires_at) }) : formatDate(f.expires_at)}
      </span>
    );
  };

  const columnas: ColumnaTabla<Invitacion>[] = [
    {
      id: 'correo',
      encabezado: t('tabla.correo'),
      celda: (f) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{f.email}</p>
          <p className="truncate text-xs text-fg-secondary">{t('enviadaEl', { fecha: formatDate(f.created_at) })}</p>
        </div>
      ),
    },
    { id: 'rol', encabezado: t('tabla.rol'), celda: (f) => nombreRol(f.role_id), ancho: 170 },
    { id: 'sede', encabezado: t('tabla.sede'), celda: (f) => (f.branch_id ? nombresSede.get(f.branch_id) ?? '—' : '—'), ocultarDebajo: 'md' },
    { id: 'cargo', encabezado: t('tabla.cargo'), celda: (f) => (f.job_position_id ? cargos.find((c) => c.id === f.job_position_id)?.nombre ?? '—' : '—'), ocultarDebajo: 'xl' },
    { id: 'vence', encabezado: t('tabla.vence'), celda: vence, ocultarDebajo: 'lg', ancho: 150 },
    { id: 'estado', encabezado: t('tabla.estado'), celda: estadoBadge, ancho: 120 },
  ];

  const chips = [
    filtros.estado !== 'todas' && { clave: 'estado', etiqueta: `${t('filtros.estado')}: ${t(`estados.${filtros.estado}`)}` },
    filtros.rolId !== null && { clave: 'rol', etiqueta: `${t('filtros.rol')}: ${nombreRol(filtros.rolId)}` },
  ].filter(Boolean) as { clave: string; etiqueta: string }[];
  const limpiar = () => cambiarFiltros({ estado: 'todas', rolId: null });

  const estadoTabla: EstadoTabla = error ? 'error' : cargando ? 'cargando' : visibles.length === 0 ? (filas.length > 0 ? 'sinResultados' : 'vacio') : 'listo';
  const abrirCompra = puedeComprar ? () => setComprar(true) : undefined;

  return (
    <div role="tabpanel" id={idPanel('equipo', 'invitaciones')} aria-labelledby={idPestana('equipo', 'invitaciones')} className="flex flex-col gap-4">
      {cupo.usuarios?.lleno && (
        <AvisoCupo
          titulo={t('cupo.titulo', { maximo: cupo.usuarios.maximo ?? 0 })}
          descripcion={t('cupo.descripcion')}
          onComprar={abrirCompra}
          textoComprar={t('cupo.comprar')}
        />
      )}
      <ListToolbar
        busqueda={<SearchInput value={filtros.texto} onChange={(v) => cambiarFiltros({ texto: v })} onValueChange={(v) => cambiarFiltros({ texto: v })} placeholder={t('busqueda.placeholder')} etiqueta={t('busqueda.etiqueta')} />}
        filtros={
          <div className="flex items-center gap-2">
            <FilterPanel conteo={chips.length} onLimpiar={limpiar} textoVerResultados={t('filtros.ver', { n: visibles.length })}>
              <FiltroSelect
                etiqueta={t('filtros.estado')}
                valor={filtros.estado}
                onValor={(v) => cambiarFiltros({ estado: v as FiltrosInvitacion['estado'] })}
                opciones={[{ v: 'todas', e: t('filtros.todas') }, ...(['pendiente', 'vencida', 'aceptada', 'revocada'] as const).map((e) => ({ v: e, e: t(`estados.${e}`) }))]}
              />
              <FiltroSelect etiqueta={t('filtros.rol')} valor={filtros.rolId === null ? TODOS : String(filtros.rolId)} onValor={(v) => cambiarFiltros({ rolId: v === TODOS ? null : Number(v) })} opciones={[{ v: TODOS, e: t('filtros.todos') }, ...roles.map((r) => ({ v: r.id, e: r.nombre }))]} />
            </FilterPanel>
            <ChipCupo cupo={cupo.usuarios} tipo="usuarios" onComprar={abrirCompra} />
          </div>
        }
        chips={chips.length > 0 ? <FilterChips chips={chips} onQuitar={(c) => cambiarFiltros(c === 'estado' ? { estado: 'todas' } : { rolId: null })} onLimpiarTodo={limpiar} /> : undefined}
      />
      <DataTable<Invitacion>
        etiqueta={t('tabla.etiqueta')}
        columnas={columnas}
        filas={filasPagina}
        obtenerId={(f) => String(f.id)}
        estado={estadoTabla}
        etiquetaFila={(f) => f.email}
        acciones={acciones}
        tarjetaMovil={(f) => (
          <ListCard
            icono={Mail}
            titulo={f.email}
            subtitulo={`${nombreRol(f.role_id)}${f.branch_id && nombresSede.get(f.branch_id) ? ` · ${nombresSede.get(f.branch_id)}` : ''}`}
            meta={t('enviadaEl', { fecha: formatDate(f.created_at) })}
            estado={estadoBadge(f)}
            acciones={acciones(f)}
          />
        )}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: MailPlus, accion: { etiqueta: t('invitar.titulo'), onClick: () => setInvitar(true), icono: UserPlus } }}
        sinResultados={{ descripcion: t('vacio.sinResultados') }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={() => cambiarFiltros({ texto: '', estado: 'todas', rolId: null })}
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

      <ConfirmDialog
        open={confirmar !== null}
        onOpenChange={(o) => !o && !trabajando && setConfirmar(null)}
        title={confirmar?.tipo === 'revocar' ? t('confirmar.revocarTitulo', { email: confirmar.fila.email }) : t('confirmar.reenviarTitulo', { email: confirmar?.fila.email ?? '' })}
        description={confirmar?.tipo === 'revocar' ? t('confirmar.revocarDescripcion') : t('confirmar.reenviarDescripcion')}
        confirmLabel={confirmar?.tipo === 'revocar' ? t('confirmar.revocar') : t('confirmar.reenviar')}
        cancelLabel={t('confirmar.cancelar')}
        variant={confirmar?.tipo === 'revocar' ? 'destructive' : 'default'}
        loading={trabajando}
        onConfirm={ejecutar}
      />
      <DialogoInvitar
        abierto={invitar}
        onAbiertoChange={setInvitar}
        organizationId={organizationId}
        roles={roles}
        sedes={sedes}
        cargos={cargos}
        cupo={cupo.usuarios}
        onInvitada={despuesDeCambio}
        onComprar={abrirCompra}
      />
      <DialogoCompra
        abierto={comprar}
        onAbiertoChange={setComprar}
        tipo="usuarios"
        organizationId={organizationId}
        estadoPlan={cupo.estado}
        maximo={cupo.usuarios?.maximo ?? null}
      />
    </div>
  );
}

export function InvitacionesPantalla() {
  const t = useTranslations('org.acceso.invitaciones');
  const router = useRouter();
  return (
    <PantallaOrganizacion
      titulo={t('titulo')}
      subtitulo={t('subtitulo')}
      icono={MailPlus}
      permiso="miembros"
      acciones={
        <button type="button" className={clasesBoton()} onClick={() => router.push('/app/organizacion/invitaciones?invitar=1')}>
          <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('invitar.titulo')}
        </button>
      }
      movil={{
        accion: (
          <button type="button" aria-label={t('invitar.titulo')} onClick={() => router.push('/app/organizacion/invitaciones?invitar=1')} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover">
            <UserPlus aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        ),
      }}
      debajo={<PestanasEquipo activa="invitaciones" />}
    >
      {({ organizationId, acceso }) => <ListadoInvitaciones organizationId={organizationId} puedeComprar={acceso.puede.facturacion} />}
    </PantallaOrganizacion>
  );
}
