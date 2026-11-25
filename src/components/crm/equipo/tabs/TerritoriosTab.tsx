'use client';

/**
 * Territorios (Figma CRM 1411:838455; vacío 1413:17; cargando 1413:726):
 * tarjetas con reglas legibles, el equipo que lo atiende y «N clientes · N
 * oportunidades» (`/api/crm/territories/counts`, el mismo motor que la
 * asignación automática), y la nota de los clientes sin territorio. Un cliente
 * que cae en dos territorios toma el primero: se avisa al guardar.
 * Escrituras por `/api/crm/territories/**` (solo admin, en el servidor).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { claveError, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { CabeceraEquipo } from '../CabeceraEquipo';
import { useRecursoCrm } from '../useRecursoCrm';
import { useConteosTerritorios } from '../useConteosTerritorios';
import { resumenReglas, type PestanaEquipo } from '../equipoPantallaLogica';
import { DeleteConfirmDialog, TerritoryDialog } from '../dialogs';
import type { Territory, VistaEquipos } from '../types';

const FORM_VACIO = { name: '', criteria: '{\n  "rules": []\n}', is_active: true };

export function TerritoriosTab({ onPestana }: { onPestana: (p: PestanaEquipo) => void }) {
  const t = useTranslations('crm.equipo.pantalla');
  const tp = useTranslations('crm.equipo.pantalla.territorio');
  const te = useTranslations('crm.accionesRapidas.errores');
  const entero = useFormatoEntero();
  const territorios = useRecursoCrm<Territory[]>('/api/crm/territories');
  const vista = useRecursoCrm<VistaEquipos>('/api/crm/teams/overview');
  const [revisionConteo, setRevisionConteo] = useState(0);
  const conteos = useConteosTerritorios(revisionConteo);
  const [dialogo, setDialogo] = useState<{ editando: Territory | null } | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [errorCriterios, setErrorCriterios] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<Territory | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [avisarSolapes, setAvisarSolapes] = useState(false);

  const gestionar = vista.datos?.puedeGestionar ?? false;
  const lista = useMemo(() => [...(territorios.datos ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'es')), [territorios.datos]);

  // «Se avisa al guardar»: cuando llegan los conteos nuevos, si hay clientes en dos territorios.
  useEffect(() => {
    if (!avisarSolapes || conteos.estado !== 'listo' || !conteos.datos) return;
    setAvisarSolapes(false);
    const solapados = Math.max(0, ...conteos.datos.territorios.map((c) => c.solapados));
    if (solapados > 0) toast({ title: tp('solapesTitulo'), description: tp('solapesDescripcion', { n: entero(solapados) }) });
  }, [avisarSolapes, conteos.estado, conteos.datos, tp, entero]);

  const recargar = () => {
    territorios.recargar();
    setRevisionConteo((n) => n + 1);
  };

  const abrir = (editando: Territory | null) => {
    setForm(editando ? { name: editando.name, criteria: JSON.stringify(editando.criteria ?? {}, null, 2), is_active: editando.is_active } : FORM_VACIO);
    setErrorCriterios(null);
    setDialogo({ editando });
  };

  const guardar = async () => {
    if (!form.name.trim()) {
      toast({ title: t('equipo.nombreObligatorio'), variant: 'destructive' });
      return;
    }
    let criteria: Record<string, unknown>;
    try {
      const v = JSON.parse(form.criteria || '{}') as unknown;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('no es objeto');
      criteria = v as Record<string, unknown>;
    } catch {
      setErrorCriterios(tp('jsonInvalido'));
      return;
    }
    const editando = dialogo?.editando ?? null;
    setGuardando(true);
    try {
      const cuerpo = { name: form.name.trim(), criteria, is_active: form.is_active };
      if (editando) await pedirCrm(`/api/crm/territories/${editando.id}`, { method: 'PATCH', cuerpo });
      else await pedirCrm('/api/crm/territories', { method: 'POST', cuerpo });
      toast({ title: editando ? tp('actualizado') : tp('creado') });
      setDialogo(null);
      setAvisarSolapes(true);
      recargar();
    } catch (e) {
      toast({ title: te(claveError(e)), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!aEliminar) return;
    try {
      await pedirCrm(`/api/crm/territories/${aEliminar.id}`, { method: 'DELETE', cuerpo: {} });
      toast({ title: tp('eliminado') });
      setDialogo(null);
      recargar();
    } catch (e) {
      toast({ title: te(claveError(e)), variant: 'destructive' });
    } finally {
      setAEliminar(null);
    }
  };

  const reglas = (criteria: Territory['criteria']) =>
    resumenReglas(
      criteria,
      (k) => (tp.has(`campos.${k.replace('.', '_')}`) ? tp(`campos.${k.replace('.', '_')}`) : k),
      (op) => (tp.has(`operadores.${op}`) ? tp(`operadores.${op}`) : op),
      { y: tp('conjuncionY'), o: tp('conjuncionO') },
    );

  const nuevo = gestionar && (
    <button type="button" className={clasesBoton()} onClick={() => abrir(null)}>
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {tp('nuevo')}
    </button>
  );
  const nota =
    conteos.datos && lista.length > 0 ? (
      <p className="px-3 py-3 text-[13px] leading-[18px] text-fg-secondary">
        {tp('sinTerritorio', { n: entero(conteos.datos.sinTerritorio) })}
        {conteos.datos.parcial && ` ${tp('parcial')}`}
      </p>
    ) : null;

  return (
    <>
      <CabeceraEquipo
        pestana="territorios"
        onPestana={onPestana}
        icono={MapPin}
        subtitulo={t('subtitulos.territorios')}
        acciones={territorios.estado !== 'sinPermiso' && nuevo}
        movil={{ menu: gestionar ? [{ id: 'nuevo', etiqueta: tp('nuevo'), icono: Plus, onSelect: () => abrir(null) }] : [] }}
      />

      {territorios.estado === 'sinPermiso' ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('sinPermiso.volver'), href: '/app/crm' }} />
        </div>
      ) : territorios.estado === 'error' && !territorios.datos ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={recargar} />
        </div>
      ) : !territorios.datos ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
            ))}
          </div>
          {nota}
        </>
      ) : lista.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface py-12">
          <EmptyState
            icono={MapPin}
            titulo={tp('vacioTitulo')}
            descripcion={tp('vacioDescripcion')}
            accion={gestionar ? { etiqueta: tp('crear'), icono: Plus, onClick: () => abrir(null) } : undefined}
          />
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {lista.map((terr) => {
              const conteo = conteos.datos?.territorios.find((c) => c.id === terr.id);
              const equipos = (vista.datos?.equipos ?? []).filter((e) => e.territorio_id === terr.id);
              const texto = reglas(terr.criteria);
              return (
                <li key={terr.id} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-center gap-2">
                    <MapPin aria-hidden="true" className="size-4 shrink-0 text-brand" strokeWidth={1.5} />
                    <h2 className="min-w-0 flex-1 truncate text-base font-semibold leading-[22px] text-fg">{terr.name}</h2>
                    {!terr.is_active && <StatusBadge estado="inactive" etiqueta={t('estado.inactivo')} tono="neutro" />}
                    {gestionar && (
                      <button
                        type="button"
                        onClick={() => abrir(terr)}
                        aria-label={tp('editar', { nombre: terr.name })}
                        className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs font-semibold leading-4 text-fg-secondary">{tp('reglas')}</p>
                  <p className="text-[13px] leading-[18px] text-fg">{texto ?? tp('sinReglas')}</p>
                  <p className="text-xs font-semibold leading-4 text-fg-secondary">{tp('equipo')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {equipos.length === 0 ? (
                      <span className="text-[13px] leading-[18px] text-fg-muted">{tp('sinEquipo')}</span>
                    ) : (
                      equipos.map((e) => <StatusBadge key={e.id} estado="brand" etiqueta={e.nombre} tono="marca" />)
                    )}
                  </div>
                  <p className="text-xs leading-4 text-fg-secondary">
                    {conteos.estado === 'cargando' && !conteo ? (
                      <span aria-hidden="true" className="inline-block h-4 w-40 animate-pulse rounded bg-subtle align-middle" />
                    ) : conteo ? (
                      tp('conteo', { clientes: conteo.clientes, valorClientes: entero(conteo.clientes), oportunidades: conteo.oportunidades, valorOportunidades: entero(conteo.oportunidades) })
                    ) : (
                      '—'
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          {nota}
          {conteos.estado === 'error' && <p className="px-3 text-[13px] text-warning-text">{tp('errorConteo')}</p>}
        </>
      )}

      <TerritoryDialog
        open={!!dialogo}
        onOpenChange={(v) => !v && setDialogo(null)}
        editing={dialogo?.editando ?? null}
        form={form}
        onFormChange={setForm}
        onSave={() => void guardar()}
        saving={guardando}
        criteriaError={errorCriterios}
        onEliminar={dialogo?.editando ? () => setAEliminar(dialogo.editando) : undefined}
      />
      <DeleteConfirmDialog
        open={!!aEliminar}
        onOpenChange={(v) => !v && setAEliminar(null)}
        title={tp('eliminarTitulo')}
        description={tp('eliminarDescripcion', { nombre: aEliminar?.name ?? '' })}
        onConfirm={() => void eliminar()}
      />
    </>
  );
}
