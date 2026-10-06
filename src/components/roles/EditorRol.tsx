'use client';

/**
 * Editor de un rol (Figma «13. Equipo › Roles y permisos», «Editar rol:
 * matriz, módulo y revisión», «Revisar cambios antes de guardar» y móvil).
 *
 *  - Rol del sistema: solo lectura con candado y «Duplicar como rol propio»
 *    (antes se ofrecía «Gestionar permisos» y guardar cambiaba a todas las
 *    organizaciones: problema 1).
 *  - Rol propio: datos + matriz; «Revisar y guardar» abre el resumen y guarda
 *    con la versión leída. Si otra persona guardó antes, conflicto.
 *  - Personas con este rol, «¿Qué puede hacer?» de cada una y asignar.
 *  - Lo que se puede hacer lo dice `capacidades` (servidor).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Copy, Lock, MoreHorizontal, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { FormSection } from '@/components/kit/FormSection';
import { FormField } from '@/components/kit/FormField';
import { EmptyState } from '@/components/kit/EmptyState';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { Dialogo } from '@/components/kit/Dialogo';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { clienteRoles, ErrorPeticionRoles } from '@/lib/services/roles/clienteRoles';
import { contarSensibles, type Conflicto } from '@/lib/roles/cambios';
import type { ConflictoRol, DetalleRol, RolResumen } from '@/lib/roles/tipos';
import { MatrizPermisos } from './MatrizPermisos';
import { AvisoCambiosMovil, BarraGuardarMovil, PanelCambios } from './PanelCambios';
import { DialogoRevisarCambios } from './DialogoRevisarCambios';
import { DialogoConflicto } from './DialogoConflicto';
import { DialogoEliminarRol } from './DialogoEliminarRol';
import { DialogoAsignarRol } from './DialogoAsignarRol';
import { DialogoNuevoRol } from './DialogoNuevoRol';
import { HojaQuePuedeHacer } from './HojaQuePuedeHacer';
import { useCargaRoles } from './useCargaRoles';
import { useAvisoSalida, useEdicionPermisos } from './useEdicionPermisos';
import { useEtiquetasRoles } from './useEtiquetasRoles';

const LISTA = '/app/roles';

export function EditorRol({ id }: { id: number }) {
  const tr = useTranslations('roles');
  const { organization } = useOrganization();
  const { estado, datos, recargar } = useCargaRoles(() => clienteRoles.detalle(id), `${organization?.id ?? 0}-${id}`);

  if (estado === 'cargando') {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6" aria-busy="true" aria-label={tr('estados.cargando')}>
        <div className="h-10 w-72 animate-pulse rounded-lg bg-subtle" />
        <div className="h-40 animate-pulse rounded-xl bg-subtle" />
        <div className="h-96 animate-pulse rounded-xl bg-subtle" />
      </div>
    );
  }
  if (estado === 'sinPermiso' || estado === 'noEncontrado' || estado === 'error' || !datos) {
    const variante = estado === 'sinPermiso' ? 'forbidden' : 'error';
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          variante={variante}
          titulo={estado === 'sinPermiso' ? tr('estados.sinPermisoTitulo') : estado === 'noEncontrado' ? tr('errores.no_encontrado') : tr('estados.errorTitulo')}
          descripcion={estado === 'sinPermiso' ? tr('estados.sinPermisoDesc') : tr('estados.errorDesc')}
          onReintentar={estado === 'error' ? () => void recargar() : undefined}
          accion={{ etiqueta: tr('estados.volver'), href: LISTA }}
        />
      </div>
    );
  }
  return <Editor datos={datos} onRecargar={() => recargar(true)} />;
}

function Editor({ datos, onRecargar }: { datos: DetalleRol; onRecargar: () => Promise<void> }) {
  const t = useTranslations('roles.editor');
  const tr = useTranslations('roles');
  const router = useRouter();
  const { formatDateTime } = useFormatDate();
  const { mensajeError } = useEtiquetasRoles();
  const { rol, catalogo, capacidades: caps, modeloListo, miembros } = datos;
  const ed = useEdicionPermisos(catalogo);
  const { reiniciar } = ed;

  const [version, setVersion] = useState<number | null>(rol.version);
  const [nombreBase, setNombreBase] = useState(rol.nombre);
  const [descBase, setDescBase] = useState(rol.descripcion ?? '');
  const [nombre, setNombre] = useState(rol.nombre);
  const [descripcion, setDescripcion] = useState(rol.descripcion ?? '');
  const [revisando, setRevisando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [conflicto, setConflicto] = useState<{ c: Conflicto; actual: ConflictoRol['actual'] } | null>(null);
  const [salir, setSalir] = useState(false);
  const [eliminar, setEliminar] = useState<{ roles: RolResumen[] } | null>(null);
  const [asignar, setAsignar] = useState(false);
  const [duplicar, setDuplicar] = useState(false);
  const [persona, setPersona] = useState<number | null>(null);

  // Al (re)cargar el rol, lo guardado pasa a ser la base.
  useEffect(() => {
    reiniciar(rol.permisoIds);
    setVersion(rol.version);
    setNombreBase(rol.nombre);
    setDescBase(rol.descripcion ?? '');
    setNombre(rol.nombre);
    setDescripcion(rol.descripcion ?? '');
  }, [rol, reiniciar]);

  const editable = !rol.sistema && caps.editar && modeloListo;
  const motivoNoEditable = rol.sistema ? undefined : !caps.editar ? tr('errores.sin_permiso') : !modeloListo ? tr('errores.migracion_pendiente') : undefined;
  const otrosCambios = (nombre.trim() !== nombreBase ? 1 : 0) + (descripcion.trim() !== descBase ? 1 : 0);
  const total = ed.cambios.total + otrosCambios;
  const personas = useMemo(() => miembros.map((m) => ({ id: m.id, nombre: m.nombre })), [miembros]);
  const sensibles = contarSensibles(ed.seleccion, catalogo);
  useAvisoSalida(total > 0);

  const descartarTodo = useCallback(() => {
    ed.descartar();
    setNombre(nombreBase);
    setDescripcion(descBase);
  }, [ed, nombreBase, descBase]);

  const guardar = async () => {
    if (version === null) return;
    setGuardando(true);
    try {
      await clienteRoles.guardar(rol.id, {
        version,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        permisoIds: [...ed.seleccion],
      });
      setRevisando(false);
      toast.success(t('guardado', { rol: nombre.trim() }));
      await onRecargar();
    } catch (err) {
      if (err instanceof ErrorPeticionRoles && err.codigo === 'conflicto' && err.cuerpo.actual) {
        const actual = err.cuerpo.actual as ConflictoRol['actual'];
        setRevisando(false);
        setConflicto({ c: ed.conflictoCon(actual.permisoIds), actual });
      } else {
        toast.error(mensajeError(err instanceof ErrorPeticionRoles ? err.codigo : 'error_interno'));
      }
    } finally {
      setGuardando(false);
    }
  };

  /** Pasa a la versión guardada por la otra persona; `pantalla` = lo que queda en la matriz. */
  const adoptarVersion = (pantalla: Iterable<number>, abrirRevision: boolean) => {
    if (!conflicto) return;
    const { actual } = conflicto;
    ed.adoptar(actual.permisoIds, pantalla);
    setVersion(actual.version);
    setNombreBase(actual.nombre);
    setDescBase(actual.descripcion ?? '');
    setConflicto(null);
    if (abrirRevision) setRevisando(true);
    else toast.info(tr('conflicto.aplicado'));
  };

  const abrirEliminar = async () => {
    try {
      const r = await clienteRoles.listar();
      setEliminar({ roles: r.roles });
    } catch (err) {
      toast.error(mensajeError(err instanceof ErrorPeticionRoles ? err.codigo : 'error_interno'));
    }
  };

  const volver = () => (total > 0 ? setSalir(true) : router.push(LISTA));
  const titulo = editable ? t('titulo', { rol: rol.nombre }) : t('tituloVer', { rol: rol.nombre });
  const subtitulo = rol.sistema ? t('subtituloSistema', { personas: rol.personas }) : t('subtituloPropio', { personas: rol.personas });

  const accionesCabecera = [
    {
      id: 'asignar',
      etiqueta: t('asignar'),
      icono: UserPlus,
      onSelect: () => setAsignar(true),
      deshabilitada: !caps.asignar || !modeloListo,
      motivo: !caps.asignar ? tr('acciones.motivoSinPermiso') : !modeloListo ? tr('acciones.motivoMigracion') : undefined,
    },
    {
      id: 'eliminar',
      etiqueta: t('eliminar'),
      icono: Trash2,
      destructiva: true,
      onSelect: () => void abrirEliminar(),
      deshabilitada: rol.sistema || !caps.eliminar || !modeloListo,
      motivo: rol.sistema ? tr('acciones.motivoSistema') : !caps.eliminar ? tr('acciones.motivoSinPermiso') : !modeloListo ? tr('acciones.motivoMigracion') : undefined,
    },
  ];

  const puedeDuplicar = rol.duplicable && caps.crear && modeloListo;

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 lg:pb-6">
      <PageHeader
        variante="form"
        titulo={titulo}
        subtitulo={subtitulo}
        volverA={LISTA}
        onVolver={volver}
        migas={[{ etiqueta: tr('migaOrganizacion'), href: '/app/organizacion' }, { etiqueta: tr('titulo'), href: LISTA }, { etiqueta: rol.nombre }]}
        badge={
          rol.sistema ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-xs text-fg-secondary">
              <Lock aria-hidden="true" className="size-3" />
              {tr('tipo.sistema')}
            </span>
          ) : undefined
        }
        acciones={
          <>
            {rol.sistema ? (
              <button
                type="button"
                onClick={() => setDuplicar(true)}
                disabled={!puedeDuplicar}
                title={!puedeDuplicar ? (rol.esAdmin ? tr('acciones.motivoAdmin') : tr('acciones.motivoSinPermiso')) : undefined}
                className={clasesBoton({ variante: 'primario' })}
              >
                <Copy aria-hidden="true" className="size-4" />
                {t('duplicar')}
              </button>
            ) : (
              <>
                {total > 0 && (
                  <button type="button" onClick={descartarTodo} className={clasesBoton({ variante: 'secundario' })}>
                    {t('descartar')}
                  </button>
                )}
                <button type="button" onClick={() => setRevisando(true)} disabled={!editable || total === 0} className={clasesBoton({ variante: 'primario' })}>
                  <ShieldCheck aria-hidden="true" className="size-4" />
                  {total > 0 ? t('revisarGuardarN', { n: total }) : t('revisarGuardar')}
                </button>
              </>
            )}
            <RowActionsMenu acciones={accionesCabecera} orientacion="horizontal" tamano="md" titulo={rol.nombre} />
          </>
        }
        movil={{
          accion: <RowActionsMenu acciones={accionesCabecera} orientacion="horizontal" tamano="md" titulo={rol.nombre} />,
        }}
      />

      {rol.sistema && (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-subtle p-4 text-sm text-fg-secondary sm:flex-row sm:items-center">
          <Lock aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
          <p className="flex-1">{t('bloqueado')}</p>
          <button type="button" onClick={() => setDuplicar(true)} disabled={!puedeDuplicar} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'lg:hidden' })}>
            <Copy aria-hidden="true" className="size-4" />
            {t('duplicar')}
          </button>
        </div>
      )}
      {!rol.sistema && motivoNoEditable && <p className="rounded-xl border border-line-info bg-info-subtle p-3 text-sm text-info-text">{motivoNoEditable}</p>}

      <AvisoCambiosMovil cambios={ed.cambios} otrosCambios={otrosCambios} personas={personas} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {!rol.sistema && (
            <FormSection titulo={t('datos')} columnas={2}>
              <FormField etiqueta={t('nombre')} obligatorio>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} disabled={!editable} />
              </FormField>
              <FormField etiqueta={t('basadoEn')}>
                <Input value={rol.basadoEnNombre ?? t('basadoEnNinguno')} disabled readOnly />
              </FormField>
              <div className="sm:col-span-2">
                <FormField etiqueta={t('descripcion')}>
                  <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={240} disabled={!editable} />
                </FormField>
              </div>
            </FormSection>
          )}
          <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-fg">{t('permisos')}</h2>
              <span className="text-xs text-fg-secondary">{t('permisosResumen', { n: ed.seleccion.size, total: catalogo.length, sensibles })}</span>
            </div>
            <MatrizPermisos catalogo={catalogo} seleccion={ed.seleccion} original={ed.base} onCambiar={editable ? ed.setSeleccion : undefined} />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          {!rol.sistema && (
            <div className="hidden lg:block">
              <PanelCambios
                cambios={ed.cambios}
                otrosCambios={otrosCambios}
                personas={personas}
                onDeshacer={ed.deshacer}
                onRevisar={() => setRevisando(true)}
                onDescartar={descartarTodo}
                deshabilitado={!editable}
                motivo={motivoNoEditable}
              />
            </div>
          )}
          <section aria-label={t('personasConRol')} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg">{t('personasConRol')}</h2>
              {caps.asignar && modeloListo && (
                <button type="button" onClick={() => setAsignar(true)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                  <UserPlus aria-hidden="true" className="size-4" />
                  {t('asignar')}
                </button>
              )}
            </div>
            {miembros.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('nadieTieneRol')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {miembros.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={!caps.verPersonas && !m.esSesion}
                      onClick={() => setPersona(m.id)}
                      aria-label={t('verQuePuede', { persona: m.nombre })}
                      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-hover disabled:hover:bg-transparent"
                    >
                      <AvatarIniciales nombre={m.nombre} tamano="sm" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm text-fg">{m.nombre}</span>
                        {m.cargoNombre && <span className="truncate text-xs text-fg-muted">{m.cargoNombre}</span>}
                      </span>
                      <MoreHorizontal aria-hidden="true" className="ml-auto size-4 text-fg-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {!rol.sistema && rol.version !== null && (
            <section className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 text-sm">
              <h2 className="text-sm font-semibold text-fg">{t('ultimaRevision')}</h2>
              <p className="text-fg-secondary">
                {t('version', { n: rol.version })}
                {rol.actualizado ? ` · ${formatDateTime(rol.actualizado)}` : ''}
              </p>
            </section>
          )}
        </aside>
      </div>

      {!rol.sistema && <BarraGuardarMovil total={total} onRevisar={() => setRevisando(true)} onDescartar={descartarTodo} deshabilitado={!editable} />}

      <DialogoRevisarCambios
        abierto={revisando}
        onAbiertoChange={setRevisando}
        nombre={nombre.trim() || rol.nombre}
        cambios={ed.cambios}
        otrosCambios={otrosCambios}
        personas={personas}
        guardando={guardando}
        onGuardar={() => void guardar()}
      />
      <DialogoConflicto
        tipo="rol"
        conflicto={conflicto?.c ?? null}
        onAbiertoChange={(v) => !v && setConflicto(null)}
        onAplicarMios={() => conflicto && adoptarVersion(conflicto.c.rebasado, true)}
        onRevisar={() => conflicto && adoptarVersion(conflicto.c.rebasado, false)}
        onDescartarMios={() => conflicto && adoptarVersion(conflicto.actual.permisoIds, false)}
      />
      <Dialogo
        abierto={salir}
        onAbiertoChange={setSalir}
        titulo={t('salirTitulo')}
        descripcion={t('salirDesc', { n: total })}
        textoCancelar={t('seguirEditando')}
        primario={{ etiqueta: t('salir'), destructiva: true, onClick: () => router.push(LISTA) }}
        ancho={440}
      />
      {eliminar && (
        <DialogoEliminarRol
          rol={rol}
          roles={eliminar.roles}
          onAbiertoChange={(v) => !v && setEliminar(null)}
          onEliminado={(mensaje) => {
            toast.success(mensaje);
            router.push(LISTA);
          }}
        />
      )}
      <DialogoAsignarRol
        rol={asignar ? rol : null}
        onAbiertoChange={(v) => !v && setAsignar(false)}
        onAsignado={(mensaje) => {
          setAsignar(false);
          toast.success(mensaje);
          void onRecargar();
        }}
      />
      <DialogoNuevoRol
        abierto={duplicar}
        onAbiertoChange={setDuplicar}
        roles={[rol]}
        modo="duplicar"
        plantillaInicial={rol}
        onCreado={(nuevo, nombreNuevo) => {
          setDuplicar(false);
          toast.success(tr('nuevo.creado', { rol: nombreNuevo }));
          router.push(`${LISTA}/${nuevo}`);
        }}
      />
      <HojaQuePuedeHacer memberId={persona} onAbiertoChange={(v) => !v && setPersona(null)} />
    </div>
  );
}
