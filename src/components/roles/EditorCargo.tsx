'use client';

/**
 * Editor de los permisos que SUMA un cargo (Figma «13. Equipo › Roles y
 * permisos», «Editar cargo: lo que suma al rol»). La misma matriz que el rol
 * (regla 7); lo que ya da el rol de referencia aparece como «Ya lo da el rol».
 * Guarda con `fn_cargo_guardar_permisos` y conflicto por `updated_at`.
 * El nombre, el departamento y la descripción del cargo se cambian en RR. HH.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Briefcase, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { FormSection } from '@/components/kit/FormSection';
import { FormField } from '@/components/kit/FormField';
import { EmptyState } from '@/components/kit/EmptyState';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { Dialogo } from '@/components/kit/Dialogo';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { clienteRoles, ErrorPeticionRoles } from '@/lib/services/roles/clienteRoles';
import type { Conflicto } from '@/lib/roles/cambios';
import type { ConflictoCargo, DetalleCargo } from '@/lib/roles/tipos';
import { MatrizPermisos } from './MatrizPermisos';
import { AvisoCambiosMovil, BarraGuardarMovil, PanelCambios } from './PanelCambios';
import { DialogoRevisarCambios } from './DialogoRevisarCambios';
import { DialogoConflicto } from './DialogoConflicto';
import { HojaQuePuedeHacer } from './HojaQuePuedeHacer';
import { TarjetaRolCargo } from './TarjetaRolCargo';
import { useCargaRoles } from './useCargaRoles';
import { useAvisoSalida, useEdicionPermisos } from './useEdicionPermisos';
import { useEtiquetasRoles } from './useEtiquetasRoles';

const LISTA = '/app/roles?vista=cargos';
const SIN_REFERENCIA = 'ninguno';

export function EditorCargo({ id }: { id: string }) {
  const tr = useTranslations('roles');
  const { organization } = useOrganization();
  const { estado, datos, recargar } = useCargaRoles(() => clienteRoles.cargo(id), `${organization?.id ?? 0}-${id}`);
  if (estado === 'cargando') {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6" aria-busy="true" aria-label={tr('estados.cargando')}>
        <div className="h-10 w-72 animate-pulse rounded-lg bg-subtle" />
        <div className="h-96 animate-pulse rounded-xl bg-subtle" />
      </div>
    );
  }
  if (estado !== 'listo' || !datos) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          variante={estado === 'sinPermiso' ? 'forbidden' : 'error'}
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

function Editor({ datos, onRecargar }: { datos: DetalleCargo; onRecargar: () => Promise<void> }) {
  const t = useTranslations('roles.cargos');
  const te = useTranslations('roles.editor');
  const tr = useTranslations('roles');
  const router = useRouter();
  const { mensajeError } = useEtiquetasRoles();
  const { cargo, catalogo, capacidades: caps, modeloListo, miembros, roles } = datos;
  const ed = useEdicionPermisos(catalogo);
  const { reiniciar } = ed;
  const [actualizado, setActualizado] = useState<string | null>(cargo.actualizado);
  const [referencia, setReferencia] = useState<string>(datos.rolReferencia ? String(datos.rolReferencia.id) : SIN_REFERENCIA);
  const [revisando, setRevisando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [conflicto, setConflicto] = useState<{ c: Conflicto; actual: ConflictoCargo['actual'] } | null>(null);
  const [salir, setSalir] = useState(false);
  const [persona, setPersona] = useState<number | null>(null);

  useEffect(() => {
    reiniciar(cargo.permisoIds);
    setActualizado(cargo.actualizado);
  }, [cargo, reiniciar]);

  const rolRef = roles.find((r) => String(r.id) === referencia) ?? null;
  const delRol = useMemo(() => new Set(rolRef?.permisoIds ?? []), [rolRef]);
  // Lo que el rol ya da y el cargo no suma: bloqueado. Si el cargo también lo
  // tenía, sigue editable para poder quitar la redundancia.
  const bloqueados = useMemo(() => new Set([...delRol].filter((pid) => !ed.base.has(pid))), [delRol, ed.base]);
  const suma = [...ed.seleccion].filter((pid) => !delRol.has(pid)).length;
  const totalEfectivo = new Set([...delRol, ...ed.seleccion]).size;

  const editable = caps.editarCargos && modeloListo;
  const motivo = !caps.editarCargos ? tr('errores.sin_permiso') : !modeloListo ? tr('errores.migracion_pendiente') : undefined;
  const personas = useMemo(() => miembros.map((m) => ({ id: m.id, nombre: m.nombre })), [miembros]);
  useAvisoSalida(ed.sucio);

  const guardar = async () => {
    setGuardando(true);
    try {
      await clienteRoles.guardarCargo(cargo.id, { actualizado, permisoIds: [...ed.seleccion] });
      setRevisando(false);
      toast.success(t('guardado', { cargo: cargo.nombre }));
      await onRecargar();
    } catch (err) {
      if (err instanceof ErrorPeticionRoles && err.codigo === 'conflicto' && err.cuerpo.actual) {
        const actual = err.cuerpo.actual as ConflictoCargo['actual'];
        setRevisando(false);
        setConflicto({ c: ed.conflictoCon(actual.permisoIds), actual });
      } else {
        toast.error(mensajeError(err instanceof ErrorPeticionRoles ? err.codigo : 'error_interno'));
      }
    } finally {
      setGuardando(false);
    }
  };

  const adoptar = useCallback(
    (pantalla: Iterable<number>, abrirRevision: boolean) => {
      if (!conflicto) return;
      ed.adoptar(conflicto.actual.permisoIds, pantalla);
      setActualizado(conflicto.actual.actualizado);
      setConflicto(null);
      if (abrirRevision) setRevisando(true);
      else toast.info(tr('conflicto.aplicado'));
    },
    [conflicto, ed, tr],
  );

  const volver = () => (ed.sucio ? setSalir(true) : router.push(LISTA));

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 lg:pb-6">
      <PageHeader
        variante="form"
        titulo={t('editorTitulo', { cargo: cargo.nombre })}
        subtitulo={t('editorSubtitulo', { personas: cargo.personas })}
        volverA={LISTA}
        onVolver={volver}
        migas={[{ etiqueta: tr('migaOrganizacion'), href: '/app/organizacion' }, { etiqueta: tr('titulo'), href: '/app/roles' }, { etiqueta: t('titulo'), href: LISTA }, { etiqueta: cargo.nombre }]}
        acciones={
          <>
            {ed.sucio && (
              <button type="button" onClick={ed.descartar} className={clasesBoton({ variante: 'secundario' })}>
                {te('descartar')}
              </button>
            )}
            <button type="button" onClick={() => setRevisando(true)} disabled={!editable || !ed.sucio} className={clasesBoton({ variante: 'primario' })}>
              <ShieldCheck aria-hidden="true" className="size-4" />
              {ed.sucio ? te('revisarGuardarN', { n: ed.cambios.total }) : te('revisarGuardar')}
            </button>
          </>
        }
      />
      {motivo && <p className="rounded-xl border border-line-info bg-info-subtle p-3 text-sm text-info-text">{motivo}</p>}
      <AvisoCambiosMovil cambios={ed.cambios} personas={personas} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <FormSection titulo={t('datos')} descripcion={t('datosAyuda')} columnas={2}>
            <FormField etiqueta={tr('cargos.columnas.cargo')}>
              <Input value={cargo.nombre} disabled readOnly />
            </FormField>
            <FormField etiqueta={tr('cargos.columnas.departamento')}>
              <Input value={cargo.departamento ?? '—'} disabled readOnly />
            </FormField>
            <div className="sm:col-span-2">
              <FormField etiqueta={te('descripcion')}>
                <Input value={cargo.descripcion ?? ''} disabled readOnly />
              </FormField>
            </div>
          </FormSection>
          <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="text-base font-semibold text-fg">{te('permisos')}</h2>
              <FormField etiqueta={t('rolReferencia')} ayuda={t('rolReferenciaAyuda')}>
                {(c) => (
                  <Select value={referencia} onValueChange={setReferencia}>
                    <SelectTrigger id={c.id} aria-describedby={c['aria-describedby']} className="sm:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_REFERENCIA}>{t('sinRolReferencia')}</SelectItem>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </div>
            <MatrizPermisos catalogo={catalogo} seleccion={ed.seleccion} original={ed.base} bloqueados={bloqueados} onCambiar={editable ? ed.setSeleccion : undefined} />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <TarjetaRolCargo
            orientacion="vertical"
            rol={{ nombre: rolRef?.nombre ?? t('sinRolReferencia'), total: delRol.size }}
            cargo={{ nombre: cargo.nombre, suma }}
            resultado={{ nombre: cargo.nombre, total: totalEfectivo }}
          />
          <div className="hidden lg:block">
            <PanelCambios
              cambios={ed.cambios}
              personas={personas}
              onDeshacer={ed.deshacer}
              onRevisar={() => setRevisando(true)}
              onDescartar={ed.descartar}
              deshabilitado={!editable}
              motivo={motivo}
            />
          </div>
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4" aria-label={t('verPersonas')}>
            <h2 className="text-sm font-semibold text-fg">{t('verPersonas')}</h2>
            {miembros.length === 0 ? (
              <p className="text-sm text-fg-secondary">{tr('personas', { n: 0 })}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {miembros.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={!caps.verPersonas && !m.esSesion}
                      onClick={() => setPersona(m.id)}
                      aria-label={te('verQuePuede', { persona: m.nombre })}
                      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-hover"
                    >
                      <AvatarIniciales nombre={m.nombre} tamano="sm" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm text-fg">{m.nombre}</span>
                        <span className="truncate text-xs text-fg-muted">{m.rolNombre}</span>
                      </span>
                      <Briefcase aria-hidden="true" className="ml-auto size-4 text-fg-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <BarraGuardarMovil total={ed.cambios.total} onRevisar={() => setRevisando(true)} onDescartar={ed.descartar} deshabilitado={!editable} />

      <DialogoRevisarCambios
        abierto={revisando}
        onAbiertoChange={setRevisando}
        nombre={cargo.nombre}
        cambios={ed.cambios}
        personas={personas}
        guardando={guardando}
        onGuardar={() => void guardar()}
      />
      <DialogoConflicto
        tipo="cargo"
        conflicto={conflicto?.c ?? null}
        onAbiertoChange={(v) => !v && setConflicto(null)}
        onAplicarMios={() => conflicto && adoptar(conflicto.c.rebasado, true)}
        onRevisar={() => conflicto && adoptar(conflicto.c.rebasado, false)}
        onDescartarMios={() => conflicto && adoptar(conflicto.actual.permisoIds, false)}
      />
      <Dialogo
        abierto={salir}
        onAbiertoChange={setSalir}
        titulo={te('salirTitulo')}
        descripcion={te('salirDesc', { n: ed.cambios.total })}
        textoCancelar={te('seguirEditando')}
        primario={{ etiqueta: te('salir'), destructiva: true, onClick: () => router.push(LISTA) }}
        ancho={440}
      />
      <HojaQuePuedeHacer memberId={persona} onAbiertoChange={(v) => !v && setPersona(null)} />
    </div>
  );
}
