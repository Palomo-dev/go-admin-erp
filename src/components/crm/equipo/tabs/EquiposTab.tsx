'use client';

/**
 * Equipos y miembros (Figma CRM 1411:837770): lista de equipos activos a la
 * izquierda y, del elegido, la tabla Miembro · Rol · Territorio · Cuota del
 * mes · Estado · ⋯. Avance = oportunidades ganadas del mes
 * (`/api/crm/teams/overview`). «Editar cuota» abre MemberDialog; un miembro
 * inactivo deja de recibir leads automáticos. Escrituras por `/api/crm/teams/**`.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, ChevronRight, MapPin, Pencil, Plus, PowerOff, Power, RefreshCw, Trash2, UserMinus, UserRound, Users } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { EmptyState } from '@/components/kit/EmptyState';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { Skeleton } from '@/components/ui/skeleton';
import { clasesBoton } from '@/components/kit/botonClases';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { claveError, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { cn } from '@/utils/Utils';
import { CabeceraEquipo } from '../CabeceraEquipo';
import { ProgresoCuota } from '../ProgresoCuota';
import { useRecursoCrm } from '../useRecursoCrm';
import { montoCompacto, type PestanaEquipo } from '../equipoPantallaLogica';
import { DeleteConfirmDialog, MemberDialog, TeamDialog } from '../dialogs';
import type { EquipoVista, MiembroVista, OrgMember, VistaEquipos } from '../types';

const FORM_EQUIPO = { name: '', description: '', is_active: true, territory_id: '' };
const FORM_MIEMBRO = { user_id: '', sales_role_id: '', quota_amount: '', quota_currency: '', territory_id: '' };

/** «septiembre» del mes `YYYY-MM` (día calendario: sin zona horaria). */
export function nombreMes(mes: string, locale: string): string {
  const [y, m] = mes.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1));
}

export function EquiposTab({ onPestana }: { onPestana: (p: PestanaEquipo) => void }) {
  const t = useTranslations('crm.equipo.pantalla');
  const te = useTranslations('crm.accionesRapidas.errores');
  const locale = useLocaleIntl();
  const moneda = useMonedaOrganizacion();
  const { estado, datos, recargar } = useRecursoCrm<VistaEquipos>('/api/crm/teams/overview');
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [dialogoEquipo, setDialogoEquipo] = useState<{ editando: EquipoVista | null } | null>(null);
  const [formEquipo, setFormEquipo] = useState(FORM_EQUIPO);
  const [dialogoMiembro, setDialogoMiembro] = useState<{ editando: MiembroVista | null } | null>(null);
  const [formMiembro, setFormMiembro] = useState(FORM_MIEMBRO);
  const [aQuitar, setAQuitar] = useState<MiembroVista | null>(null);
  const [aDesactivar, setADesactivar] = useState<EquipoVista | null>(null);
  const [guardando, setGuardando] = useState(false);

  const equipos = useMemo(() => datos?.equipos ?? [], [datos]);
  const elegido = equipos.find((e) => e.id === elegidoId) ?? equipos[0] ?? null;
  const gestionar = datos?.puedeGestionar ?? false;
  const mes = datos ? nombreMes(datos.mes, locale) : '';

  useEffect(() => {
    if (!dialogoMiembro || dialogoMiembro.editando || orgMembers.length > 0) return;
    pedirCrm<OrgMember[]>('/api/crm/teams/org-members')
      .then(({ data }) => setOrgMembers(data ?? []))
      .catch(() => setOrgMembers([]));
  }, [dialogoMiembro, orgMembers.length]);

  const conError = async (fn: () => Promise<void>) => {
    setGuardando(true);
    try {
      await fn();
      recargar();
    } catch (e) {
      toast({ title: te(claveError(e)), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const abrirEquipo = (editando: EquipoVista | null) => {
    setFormEquipo(
      editando ? { name: editando.nombre, description: editando.descripcion ?? '', is_active: true, territory_id: editando.territorio_id ?? '' } : FORM_EQUIPO,
    );
    setDialogoEquipo({ editando });
  };
  const guardarEquipo = () => {
    if (!formEquipo.name.trim()) {
      toast({ title: t('equipo.nombreObligatorio'), variant: 'destructive' });
      return;
    }
    const editando = dialogoEquipo?.editando ?? null;
    const cuerpo = { name: formEquipo.name.trim(), description: formEquipo.description.trim() || null, is_active: formEquipo.is_active, territory_id: formEquipo.territory_id || null };
    void conError(async () => {
      if (editando) await pedirCrm(`/api/crm/teams/${editando.id}`, { method: 'PATCH', cuerpo });
      else {
        const { data } = await pedirCrm<{ id: string }>('/api/crm/teams', { method: 'POST', cuerpo });
        if (data?.id) setElegidoId(data.id);
      }
      toast({ title: editando ? t('equipo.actualizado') : t('equipo.creado') });
      setDialogoEquipo(null);
    });
  };

  const abrirMiembro = (editando: MiembroVista | null) => {
    setFormMiembro(
      editando
        ? {
            user_id: editando.user_id,
            sales_role_id: editando.rol_id ?? '',
            quota_amount: editando.cuota === null ? '' : String(editando.cuota),
            quota_currency: editando.moneda ?? (moneda.resuelta ? moneda.code : ''),
            territory_id: editando.territorio_id ?? '',
          }
        : { ...FORM_MIEMBRO, quota_currency: moneda.resuelta ? moneda.code : '' },
    );
    setDialogoMiembro({ editando });
  };
  const guardarMiembro = () => {
    if (!elegido) return;
    const editando = dialogoMiembro?.editando ?? null;
    if (!editando && !formMiembro.user_id) {
      toast({ title: t('miembro.eligeMiembro'), variant: 'destructive' });
      return;
    }
    const cuota = formMiembro.quota_amount.trim() === '' ? null : Number(formMiembro.quota_amount);
    if (cuota !== null && (!Number.isFinite(cuota) || cuota < 0)) {
      toast({ title: t('miembro.cuotaInvalida'), variant: 'destructive' });
      return;
    }
    const cuerpo = {
      sales_role_id: formMiembro.sales_role_id || null,
      territory_id: formMiembro.territory_id || null,
      quota_amount: cuota,
      // Sin moneda elegida, el trigger pone la moneda base.
      ...(formMiembro.quota_currency ? { quota_currency: formMiembro.quota_currency } : {}),
    };
    void conError(async () => {
      if (editando) await pedirCrm(`/api/crm/teams/${elegido.id}/members/${editando.id}`, { method: 'PATCH', cuerpo });
      else await pedirCrm(`/api/crm/teams/${elegido.id}/members`, { method: 'POST', cuerpo: { ...cuerpo, user_id: formMiembro.user_id, is_active: true } });
      toast({ title: editando ? t('miembro.actualizado') : t('miembro.agregado') });
      setDialogoMiembro(null);
    });
  };
  const cambiarActivo = (m: MiembroVista) =>
    elegido &&
    void conError(async () => {
      await pedirCrm(`/api/crm/teams/${elegido.id}/members/${m.id}`, { method: 'PATCH', cuerpo: { is_active: !m.activo } });
      toast({ title: m.activo ? t('miembro.desactivado') : t('miembro.activado') });
    });
  const quitar = () =>
    elegido &&
    aQuitar &&
    void conError(async () => {
      await pedirCrm(`/api/crm/teams/${elegido.id}/members/${aQuitar.id}`, { method: 'DELETE', cuerpo: {} });
      toast({ title: t('miembro.quitado') });
      setAQuitar(null);
    });
  const desactivarEquipo = () =>
    aDesactivar &&
    void conError(async () => {
      await pedirCrm(`/api/crm/teams/${aDesactivar.id}`, { method: 'PATCH', cuerpo: { is_active: false } });
      toast({ title: t('equipo.desactivado') });
      setADesactivar(null);
      setElegidoId(null);
    });

  const fmt = (valor: number, codigo: string | null) => montoCompacto(valor, moneda.paraDocumento(codigo));
  const subtituloEquipo = (e: EquipoVista) =>
    t('equipo.resumen', { n: e.miembros.filter((m) => m.activo).length, territorio: e.territorio ?? t('equipo.sinTerritorio') });

  const acciones = estado !== 'sinPermiso' && (
    <>
      {gestionar && (
        <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => abrirEquipo(null)}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('acciones.nuevoEquipo')}
        </button>
      )}
      {gestionar && (
        <button type="button" className={clasesBoton()} onClick={() => abrirMiembro(null)} disabled={!elegido}>
          <UserRound aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('acciones.agregarMiembro')}
        </button>
      )}
      <RowActionsMenu
        orientacion="horizontal"
        tamano="md"
        titulo={t('titulo')}
        acciones={[
          { id: 'desempeno', etiqueta: t('acciones.desempeno'), icono: BarChart3, onSelect: () => onPestana('desempeno') },
          { id: 'recargar', etiqueta: t('acciones.recargar'), icono: RefreshCw, onSelect: recargar },
          ...(gestionar && elegido
            ? [
                { id: 'editar', etiqueta: t('acciones.editarEquipo'), icono: Pencil, onSelect: () => abrirEquipo(elegido), separadorAntes: true },
                { id: 'desactivar', etiqueta: t('acciones.desactivarEquipo'), icono: PowerOff, onSelect: () => setADesactivar(elegido), destructiva: true },
              ]
            : []),
        ]}
      />
    </>
  );

  return (
    <>
      <CabeceraEquipo
        pestana="equipos"
        onPestana={onPestana}
        icono={Users}
        subtitulo={t('subtitulos.equipos')}
        cargando={estado === 'cargando' && !!datos}
        acciones={acciones}
        movil={{
          menu: [
            ...(gestionar ? [{ id: 'nuevo', etiqueta: t('acciones.nuevoEquipo'), icono: Plus, onSelect: () => abrirEquipo(null) }] : []),
            ...(gestionar && elegido ? [{ id: 'miembro', etiqueta: t('acciones.agregarMiembro'), icono: UserRound, onSelect: () => abrirMiembro(null) }] : []),
            { id: 'desempeno', etiqueta: t('acciones.desempeno'), icono: BarChart3, onSelect: () => onPestana('desempeno') },
          ],
        }}
      />

      {estado === 'sinPermiso' ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('sinPermiso.volver'), href: '/app/crm' }} />
        </div>
      ) : estado === 'error' && !datos ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={recargar} />
        </div>
      ) : !datos ? (
        <CargandoEquipos />
      ) : equipos.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            icono={Users}
            titulo={t('equipo.vacioTitulo')}
            descripcion={t('equipo.vacioDescripcion')}
            accion={gestionar ? { etiqueta: t('acciones.nuevoEquipo'), icono: Plus, onClick: () => abrirEquipo(null) } : undefined}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <nav aria-label={t('equipo.lista')} className="flex w-full shrink-0 flex-col gap-2 lg:w-[300px]">
            {equipos.map((e) => {
              const activo = e.id === elegido?.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-current={activo || undefined}
                  onClick={() => setElegidoId(e.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-[10px] border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    activo ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
                  )}
                >
                  <Users aria-hidden="true" className={cn('size-4 shrink-0', activo ? 'text-brand' : 'text-fg-secondary')} strokeWidth={1.5} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 font-medium">
                    <span className="truncate text-sm leading-5 text-fg">{e.nombre}</span>
                    <span className="truncate text-xs leading-4 text-fg-secondary">{subtituloEquipo(e)}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
                </button>
              );
            })}
          </nav>

          {elegido && (
            <section aria-labelledby="equipo-miembros-titulo" className="min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface">
              <header className="flex flex-col gap-1 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:gap-2">
                <h2 id="equipo-miembros-titulo" className="min-w-0 flex-1 truncate text-base font-semibold leading-[22px] text-fg">
                  {elegido.nombre}
                </h2>
                <p className="text-[13px] leading-[18px] text-fg-secondary">
                  {t('equipo.cuotaEquipo', { monto: formatMoneda(elegido.cuota, moneda.paraDocumento(elegido.moneda)), mes })}
                </p>
              </header>
              {elegido.miembros.length === 0 ? (
                <EmptyState
                  compacto
                  icono={UserRound}
                  titulo={t('miembro.vacioTitulo')}
                  descripcion={t('miembro.vacioDescripcion')}
                  accion={gestionar ? { etiqueta: t('acciones.agregarMiembro'), icono: UserRound, onClick: () => abrirMiembro(null) } : undefined}
                />
              ) : (
                <>
                  {/* Escritorio: tabla de Figma. */}
                  <div className="hidden md:block">
                    <div role="row" className="flex items-start gap-3 border-b border-line bg-subtle px-4 py-2.5 text-xs font-semibold leading-4 text-fg-secondary">
                      <span role="columnheader" className="min-w-0 flex-1">{t('columnas.miembro')}</span>
                      <span role="columnheader" className="w-[130px] shrink-0">{t('columnas.rol')}</span>
                      <span role="columnheader" className="w-[120px] shrink-0">{t('columnas.territorio')}</span>
                      <span role="columnheader" className="w-[220px] shrink-0">{t('columnas.cuotaMes', { mes })}</span>
                      <span role="columnheader" className="w-20 shrink-0">{t('columnas.estado')}</span>
                      <span role="columnheader" className="w-8 shrink-0"><span className="sr-only">{t('columnas.acciones')}</span></span>
                    </div>
                    <ul>
                      {elegido.miembros.map((m) => (
                        <li key={m.id} className={cn('flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0', !m.activo && 'opacity-60')}>
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <AvatarIniciales nombre={m.nombre} />
                            <span className="truncate text-sm font-medium leading-5 text-fg">{m.nombre}</span>
                          </span>
                          <span className="w-[130px] shrink-0 truncate text-[13px] leading-[18px] text-fg-secondary">{m.rol ?? '—'}</span>
                          <span className="w-[120px] shrink-0 truncate text-[13px] leading-[18px] text-fg-secondary">{m.territorio ?? '—'}</span>
                          <ProgresoCuota
                            className="w-[220px] shrink-0"
                            etiqueta={m.cuota === null ? t('miembro.sinCuota') : t('miembro.avance', { ganado: fmt(m.ganado, m.moneda), cuota: fmt(m.cuota, m.moneda) })}
                            pct={m.pct}
                            aria={t('miembro.avanceAria', { nombre: m.nombre })}
                          />
                          <span className="w-20 shrink-0">
                            <StatusBadge estado={m.activo ? 'active' : 'inactive'} etiqueta={m.activo ? t('estado.activo') : t('estado.inactivo')} tono={m.activo ? 'exito' : 'neutro'} />
                          </span>
                          <span className="w-8 shrink-0">
                            {gestionar && <MenuMiembro m={m} onEditar={() => abrirMiembro(m)} onActivo={() => cambiarActivo(m)} onQuitar={() => setAQuitar(m)} />}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {/* Móvil: una tarjeta por miembro. */}
                  <ul className="divide-y divide-line md:hidden">
                    {elegido.miembros.map((m) => (
                      <li key={m.id} className={cn('flex flex-col gap-3 px-4 py-3', !m.activo && 'opacity-60')}>
                        <div className="flex items-center gap-2">
                          <AvatarIniciales nombre={m.nombre} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium leading-5 text-fg">{m.nombre}</span>
                            <span className="flex items-center gap-1 truncate text-xs leading-4 text-fg-secondary">
                              {m.rol ?? '—'}
                              {m.territorio && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <MapPin aria-hidden="true" className="size-3" strokeWidth={1.5} />
                                  {m.territorio}
                                </>
                              )}
                            </span>
                          </span>
                          <StatusBadge estado={m.activo ? 'active' : 'inactive'} etiqueta={m.activo ? t('estado.activo') : t('estado.inactivo')} tono={m.activo ? 'exito' : 'neutro'} />
                          {gestionar && <MenuMiembro m={m} onEditar={() => abrirMiembro(m)} onActivo={() => cambiarActivo(m)} onQuitar={() => setAQuitar(m)} />}
                        </div>
                        <ProgresoCuota
                          etiqueta={m.cuota === null ? t('miembro.sinCuota') : t('miembro.avance', { ganado: fmt(m.ganado, m.moneda), cuota: fmt(m.cuota, m.moneda) })}
                          pct={m.pct}
                          aria={t('miembro.avanceAria', { nombre: m.nombre })}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>
      )}

      <TeamDialog
        open={!!dialogoEquipo}
        onOpenChange={(v) => !v && setDialogoEquipo(null)}
        editing={dialogoEquipo?.editando ?? null}
        territories={datos?.territorios ?? []}
        form={formEquipo}
        onFormChange={setFormEquipo}
        onSave={guardarEquipo}
        saving={guardando}
      />
      <MemberDialog
        open={!!dialogoMiembro}
        onOpenChange={(v) => !v && setDialogoMiembro(null)}
        roles={datos?.roles ?? []}
        territories={datos?.territorios ?? []}
        orgMembers={orgMembers.filter((o) => !elegido?.miembros.some((m) => m.user_id === o.id))}
        form={formMiembro}
        onFormChange={setFormMiembro}
        onAdd={guardarMiembro}
        saving={guardando}
        editando={dialogoMiembro?.editando ? { nombre: dialogoMiembro.editando.nombre } : null}
      />
      <DeleteConfirmDialog
        open={!!aQuitar}
        onOpenChange={(v) => !v && setAQuitar(null)}
        title={t('miembro.quitarTitulo')}
        description={t('miembro.quitarDescripcion', { nombre: aQuitar?.nombre ?? '', equipo: elegido?.nombre ?? '' })}
        onConfirm={quitar}
        confirmLabel={t('miembro.quitar')}
      />
      <DeleteConfirmDialog
        open={!!aDesactivar}
        onOpenChange={(v) => !v && setADesactivar(null)}
        title={t('equipo.desactivarTitulo')}
        description={t('equipo.desactivarDescripcion', { nombre: aDesactivar?.nombre ?? '' })}
        onConfirm={desactivarEquipo}
        confirmLabel={t('acciones.desactivarEquipo')}
      />
    </>
  );
}

function MenuMiembro({ m, onEditar, onActivo, onQuitar }: { m: MiembroVista; onEditar: () => void; onActivo: () => void; onQuitar: () => void }) {
  const t = useTranslations('crm.equipo.pantalla');
  return (
    <RowActionsMenu
      orientacion="horizontal"
      titulo={m.nombre}
      acciones={[
        { id: 'editar', etiqueta: t('miembro.editarCuota'), icono: Pencil, onSelect: onEditar },
        { id: 'activo', etiqueta: m.activo ? t('miembro.desactivar') : t('miembro.activar'), icono: m.activo ? UserMinus : Power, onSelect: onActivo },
        { id: 'quitar', etiqueta: t('miembro.quitar'), icono: Trash2, onSelect: onQuitar, destructiva: true },
      ]}
    />
  );
}

function CargandoEquipos() {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start" aria-busy="true">
      <div className="flex w-full flex-col gap-2 lg:w-[300px]">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-[10px]" />
        ))}
      </div>
      <Skeleton className="h-[361px] min-w-0 flex-1 rounded-xl" />
    </div>
  );
}
