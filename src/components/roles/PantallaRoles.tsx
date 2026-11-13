'use client';

/**
 * Organización › Equipo › Roles y permisos (`/app/roles`; Figma «13. Equipo ›
 * Roles y permisos», archivo EAvjINVRnlzFM70GVoWXgl, sección 1883:75201).
 * Vista en la URL (`?vista=roles|cargos|comparar`).
 *
 * Desde el 2026-11-13 (Figma sección 91, «Roles dentro de Organización») lleva
 * las pestañas de Equipo (`PestanasEquipo`): Miembros · Invitaciones · Roles y
 * permisos · Cargos. Roles y Cargos cambian de vista aquí mismo; «Comparar» ya
 * no es pestaña: se llega con el botón «Comparar roles» (o «Comparar con otro
 * rol» de una fila) y se vuelve con la pestaña Roles y permisos.
 *
 * Sustituye a las cinco pestañas anteriores (Roles, Asignación, Permisos,
 * Cargos, Analíticas). La página tenía la guarda en ningún sitio (problema 5):
 * ahora el servidor responde 403 sin roles.view y se pinta «sin permiso»; lo
 * que se puede hacer llega en `capacidades`.
 */
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { GitCompareArrows, Info, Plus, Shield, TriangleAlert, UserSearch } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { idPanel, idPestana } from '@/components/kit/TabBar';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import { useOpcionUrl } from '@/components/kit/useParametroUrl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { clienteRoles } from '@/lib/services/roles/clienteRoles';
import type { RolResumen } from '@/lib/roles/tipos';
import { ListaRoles } from './ListaRoles';
import { ListaCargos } from './ListaCargos';
import { CompararRoles } from './CompararRoles';
import { DialogoNuevoRol } from './DialogoNuevoRol';
import { DialogoEliminarRol } from './DialogoEliminarRol';
import { DialogoAsignarRol } from './DialogoAsignarRol';
import { HojaQuePuedeHacer } from './HojaQuePuedeHacer';
import { SelectorPersona } from './SelectorPersona';
import { useCargaRoles } from './useCargaRoles';
import { ID_PESTANAS_EQUIPO, PestanasEquipo } from '@/components/organization/equipo/PestanasEquipo';

const VISTAS = ['roles', 'cargos', 'comparar'] as const;
type Vista = (typeof VISTAS)[number];

export function PantallaRoles() {
  const t = useTranslations('roles');
  const router = useRouter();
  const { organization } = useOrganization();
  const clave = String(organization?.id ?? 0);
  const [vista, setVista] = useOpcionUrl<Vista>('vista', VISTAS, 'roles');
  const { estado, datos, recargar } = useCargaRoles(() => clienteRoles.listar(), clave);

  const [nuevo, setNuevo] = useState<{ modo: 'nuevo' | 'duplicar'; plantilla: RolResumen | null } | null>(null);
  const [eliminar, setEliminar] = useState<RolResumen | null>(null);
  const [asignar, setAsignar] = useState<RolResumen | null>(null);
  const [comparar, setComparar] = useState<number[]>([]);
  const [eligiendoPersona, setEligiendoPersona] = useState(false);
  const [persona, setPersona] = useState<number | null>(null);

  const caps = datos?.capacidades;
  const modeloListo = datos?.modeloListo ?? true;
  const puedeCrear = Boolean(caps?.crear && modeloListo);
  const abrirNuevo = () => setNuevo({ modo: 'nuevo', plantilla: null });
  // Comparar es una vista de Roles: su pestaña es «Roles y permisos».
  const pestana = vista === 'cargos' ? 'cargos' : 'roles';

  const compararCon = (r: RolResumen) => {
    const otro = datos?.roles.find((x) => x.id !== r.id && x.sistema !== r.sistema) ?? datos?.roles.find((x) => x.id !== r.id);
    setComparar(otro ? [r.id, otro.id] : [r.id]);
    setVista('comparar');
  };

  const cabecera = (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={datos ? t('subtitulo', { roles: datos.roles.length, personas: datos.totalPersonas }) : undefined}
      cargando={estado === 'cargando'}
      icono={Shield}
      migas={[{ etiqueta: t('migaOrganizacion'), href: '/app/organizacion' }, { etiqueta: t('migaEquipo') }, { etiqueta: t('titulo') }]}
      acciones={
        datos && estado === 'listo' ? (
          <>
            {caps?.verPersonas && (
              <button type="button" onClick={() => setEligiendoPersona(true)} className={clasesBoton({ variante: 'secundario' })}>
                <UserSearch aria-hidden="true" className="size-4" />
                {t('quePuede.abrir')}
              </button>
            )}
            <button type="button" onClick={() => setVista('comparar')} className={clasesBoton({ variante: 'secundario' })}>
              <GitCompareArrows aria-hidden="true" className="size-4" />
              {t('compararRoles')}
            </button>
            <button
              type="button"
              onClick={abrirNuevo}
              disabled={!puedeCrear}
              title={!puedeCrear ? (!caps?.crear ? t('acciones.motivoSinPermiso') : t('acciones.motivoMigracion')) : undefined}
              className={clasesBoton({ variante: 'primario' })}
            >
              <Plus aria-hidden="true" className="size-4" />
              {t('nuevoRol')}
            </button>
          </>
        ) : undefined
      }
      movil={{
        subtitulo: datos ? t('subtitulo', { roles: datos.roles.length, personas: datos.totalPersonas }) : undefined,
        accion: puedeCrear ? (
          <button type="button" onClick={abrirNuevo} aria-label={t('nuevoRol')} className="inline-flex size-10 items-center justify-center rounded-lg text-fg">
            <Plus aria-hidden="true" className="size-5" />
          </button>
        ) : undefined,
      }}
      debajo={
        <PestanasEquipo
          activa={pestana}
          roles={datos?.roles.length}
          onCambiar={(p) => {
            if (p !== 'roles' && p !== 'cargos') return false;
            setVista(p);
            return true;
          }}
        />
      }
    />
  );

  let cuerpo: ReactNode;
  if (estado === 'cargando') {
    cuerpo = (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label={t('estados.cargando')}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-subtle" />
        ))}
      </div>
    );
  } else if (estado === 'sinPermiso') {
    cuerpo = <EmptyState variante="forbidden" titulo={t('estados.sinPermisoTitulo')} descripcion={t('estados.sinPermisoDesc')} />;
  } else if (estado !== 'listo' || !datos) {
    cuerpo = <EmptyState variante="error" titulo={t('estados.errorTitulo')} descripcion={t('estados.errorDesc')} onReintentar={() => void recargar()} />;
  } else {
    cuerpo = (
      <div id={idPanel(ID_PESTANAS_EQUIPO, pestana)} role="tabpanel" aria-labelledby={idPestana(ID_PESTANAS_EQUIPO, pestana)} className="flex flex-col gap-3">
        {vista === 'roles' && (
          <>
            <p className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle p-3 text-sm text-info-text">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="hidden lg:inline">{t('regla')}</span>
                <span className="lg:hidden">{t('reglaMovil')}</span>
              </span>
            </p>
            <ListaRoles
              datos={datos}
              onAbrir={(r) => router.push(`/app/roles/${r.id}`)}
              onNuevo={abrirNuevo}
              onDuplicar={(r) => setNuevo({ modo: 'duplicar', plantilla: r })}
              onComparar={compararCon}
              onAsignar={setAsignar}
              onEliminar={setEliminar}
            />
          </>
        )}
        {vista === 'cargos' && <ListaCargos clave={clave} />}
        {vista === 'comparar' && (
          <CompararRoles
            datos={datos}
            elegidos={comparar.length ? comparar : datos.roles.slice(0, 2).map((r) => r.id)}
            onElegidosChange={setComparar}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {cabecera}
      {datos && !datos.modeloListo && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-sm text-warning-text">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('migracionPendiente')}
        </p>
      )}
      {cuerpo}

      {datos && (
        <>
          <DialogoNuevoRol
            abierto={nuevo !== null}
            onAbiertoChange={(v) => !v && setNuevo(null)}
            roles={datos.roles}
            modo={nuevo?.modo}
            plantillaInicial={nuevo?.plantilla ?? null}
            onCreado={(id, nombre) => {
              setNuevo(null);
              toast.success(t('nuevo.creado', { rol: nombre }));
              router.push(`/app/roles/${id}`);
            }}
          />
          <DialogoEliminarRol
            rol={eliminar}
            roles={datos.roles}
            onAbiertoChange={(v) => !v && setEliminar(null)}
            onEliminado={(mensaje) => {
              setEliminar(null);
              toast.success(mensaje);
              void recargar(true);
            }}
          />
          <DialogoAsignarRol
            rol={asignar}
            onAbiertoChange={(v) => !v && setAsignar(null)}
            onAsignado={(mensaje) => {
              setAsignar(null);
              toast.success(mensaje);
              void recargar(true);
            }}
          />
          <SelectorPersona
            abierto={eligiendoPersona}
            onAbiertoChange={setEligiendoPersona}
            onElegir={(id) => {
              setEligiendoPersona(false);
              setPersona(id);
            }}
          />
          <HojaQuePuedeHacer memberId={persona} onAbiertoChange={(v) => !v && setPersona(null)} />
        </>
      )}
    </div>
  );
}
