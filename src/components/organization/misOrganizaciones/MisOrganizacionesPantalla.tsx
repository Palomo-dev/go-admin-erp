'use client';

/**
 * Organización › Marca › Mis organizaciones (Figma 08, sección 8).
 *
 * Todas las organizaciones donde la persona es miembro activo — no solo las
 * que creó — con SU rol en cada una (auditoría 2026-10, P1-4). Antes la lista
 * filtraba por `owner_user_id`, pintaba en todas el rol de la organización
 * actual y desactivaba/reactivaba desde el navegador decidiendo por
 * `role_id !== 2` (P0-9). Ahora:
 * - la lista sale de `GET /api/me/organizaciones` (la misma del selector del
 *   header);
 * - «Desactivar» solo se ofrece si el servidor dice que la administra
 *   (`puedeAdministrar`) y lo hace `POST /api/organizacion/desactivar`, que
 *   vuelve a comprobarlo y no deja hacerlo con una suscripción cobrando;
 * - reactivar desde aquí ya no existe.
 */
import { useState } from 'react';
import { ArrowRightLeft, Building2, Plus, PowerOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DataTable, ListCard, StatusBadge, AvatarIniciales, clasesBoton, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import CreateOrganizationDialog from '../CreateOrganizationDialog';
import { cambiarOrganizacionActiva, limpiarOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { useOrganizacionesUsuario, type OrganizacionUsuario } from '@/components/shell/header/useOrganizacionesUsuario';
import { PantallaOrganizacion } from '../acceso/PantallaOrganizacion';

const TONO = { activa: 'exito', prueba: 'informacion', suspendida: 'peligro' } as const;

function Listado({ actualId, onCrear }: { actualId: number; onCrear: () => void }) {
  const t = useTranslations('org.acceso.misOrgs');
  const { organizaciones, error, recargar } = useOrganizacionesUsuario();
  const [desactivar, setDesactivar] = useState<OrganizacionUsuario | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cambiar = (o: OrganizacionUsuario) => {
    if (o.id === actualId) return;
    void cambiarOrganizacionActiva({ id: o.id, name: o.nombre, logo_url: o.logoUrl ?? undefined });
  };

  const ejecutarDesactivar = async () => {
    const o = desactivar;
    if (!o) return;
    setTrabajando(true);
    try {
      const res = await fetch('/api/organizacion/desactivar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: o.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) {
        const clave = json.code === 'SUSCRIPCION_VIVA' ? 'suscripcionViva' : json.code === 'ESTADO_NO_PERMITIDO' ? 'estado' : res.status === 403 ? 'sinPermiso' : 'generico';
        toast.error(t('toasts.errorDesactivar'), { description: t(`errores.${clave}`) });
        return;
      }
      toast.success(t('toasts.desactivada', { nombre: o.nombre }));
      setDesactivar(null);
      const restantes = (organizaciones ?? []).filter((x) => x.id !== o.id);
      if (o.id === actualId) {
        if (restantes.length === 0) {
          limpiarOrganizacionActiva();
          window.location.href = '/auth/select-organization';
          return;
        }
        await cambiarOrganizacionActiva({ id: restantes[0].id, name: restantes[0].nombre }, { reload: true });
        return;
      }
      await recargar();
    } catch {
      toast.error(t('toasts.errorDesactivar'), { description: t('errores.generico') });
    } finally {
      setTrabajando(false);
    }
  };

  const acciones = (o: OrganizacionUsuario): AccionFila[] => [
    { id: 'cambiar', etiqueta: t('acciones.cambiar'), icono: ArrowRightLeft, onSelect: () => cambiar(o), oculta: o.id === actualId },
    {
      id: 'desactivar',
      etiqueta: t('acciones.desactivar'),
      icono: PowerOff,
      destructiva: true,
      onSelect: () => setDesactivar(o),
      oculta: !o.puedeAdministrar,
      deshabilitada: o.estado === 'suspendida',
      motivo: o.estado === 'suspendida' ? t('motivos.suspendida') : undefined,
    },
  ];

  const insignias = (o: OrganizacionUsuario) => (
    <span className="inline-flex flex-wrap gap-1">
      {o.id === actualId && <StatusBadge estado="actual" tono="marca" etiqueta={t('actual')} tamano="sm" />}
      {o.esPropietario && <StatusBadge estado="propietario" tono="neutro" apariencia="contorno" etiqueta={t('propietario')} tamano="sm" />}
    </span>
  );
  const estado = (o: OrganizacionUsuario) => <StatusBadge estado={o.estado} tono={TONO[o.estado]} etiqueta={t(`estados.${o.estado}`)} tamano="sm" />;

  const columnas: ColumnaTabla<OrganizacionUsuario>[] = [
    {
      id: 'organizacion',
      encabezado: t('tabla.organizacion'),
      celda: (o) => (
        <div className="flex min-w-0 items-center gap-3">
          <AvatarIniciales nombre={o.nombre} src={o.logoUrl} tamano="sm" />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-fg">{o.nombre}</span>
              {insignias(o)}
            </div>
            {o.subdominio && <p className="truncate text-xs text-fg-secondary">{o.subdominio}</p>}
          </div>
        </div>
      ),
    },
    { id: 'rol', encabezado: t('tabla.rol'), celda: (o) => o.rol ?? '—', ancho: 200 },
    { id: 'plan', encabezado: t('tabla.plan'), celda: (o) => o.plan ?? t('sinPlan'), ocultarDebajo: 'md', ancho: 160 },
    { id: 'estado', encabezado: t('tabla.estado'), celda: estado, ancho: 130 },
  ];

  return (
    <>
      <DataTable<OrganizacionUsuario>
        etiqueta={t('tabla.etiqueta')}
        columnas={columnas}
        filas={organizaciones ?? []}
        obtenerId={(o) => String(o.id)}
        estado={error ? 'error' : organizaciones === null ? 'cargando' : 'listo'}
        etiquetaFila={(o) => o.nombre}
        onFilaClick={cambiar}
        acciones={acciones}
        tarjetaMovil={(o) => (
          <ListCard
            avatar={{ nombre: o.nombre, src: o.logoUrl }}
            titulo={o.nombre}
            insignia={insignias(o)}
            subtitulo={[o.rol, o.plan].filter(Boolean).join(' · ') || undefined}
            estado={estado(o)}
            onClick={() => cambiar(o)}
            acciones={acciones(o)}
          />
        )}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: Building2, accion: { etiqueta: t('nueva'), onClick: onCrear, icono: Plus } }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        onReintentar={() => void recargar()}
      />
      <ConfirmDialog
        open={desactivar !== null}
        onOpenChange={(o) => !o && !trabajando && setDesactivar(null)}
        title={t('confirmar.titulo', { nombre: desactivar?.nombre ?? '' })}
        description={t('confirmar.descripcion')}
        confirmLabel={t('confirmar.desactivar')}
        cancelLabel={t('confirmar.cancelar')}
        variant="destructive"
        loading={trabajando}
        onConfirm={ejecutarDesactivar}
      />
    </>
  );
}

export function MisOrganizacionesPantalla() {
  const t = useTranslations('org.acceso.misOrgs');
  const { recargar } = useOrganizacionesUsuario();
  const [crear, setCrear] = useState(false);
  return (
    <PantallaOrganizacion
      titulo={t('titulo')}
      subtitulo={t('subtitulo')}
      icono={Building2}
      permiso="miembro"
      acciones={
        <button type="button" className={clasesBoton()} onClick={() => setCrear(true)}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('nueva')}
        </button>
      }
      movil={{
        accion: (
          <button type="button" aria-label={t('nueva')} onClick={() => setCrear(true)} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover">
            <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        ),
      }}
    >
      {({ organizationId }) => (
        <>
          <Listado actualId={organizationId} onCrear={() => setCrear(true)} />
          <CreateOrganizationDialog
            isOpen={crear}
            onClose={() => setCrear(false)}
            onSuccess={(data) => {
              setCrear(false);
              void recargar();
              if (data?.id) void cambiarOrganizacionActiva({ id: data.id, name: data.name, logo_url: data.logo_url ?? undefined });
            }}
          />
        </>
      )}
    </PantallaOrganizacion>
  );
}
