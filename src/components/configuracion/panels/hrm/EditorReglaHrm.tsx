'use client';

/**
 * «Editar regla» de Aprobaciones (diseño 10.RH.2, pantallazo
 * 95-hrm-config-17): nombre, tipo, condiciones (se cumplen todas), cadena de
 * aprobadores en orden y casos especiales. Se guarda con la barra del diálogo
 * («1 cambio sin guardar · Guardar»), que llama a `fn_hr_regla_guardar`.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { CampoNumero, RowActionsMenu, clasesBoton, type AccionFila } from '@/components/kit';
import { MultiSelect } from '@/components/kit/MultiSelect';
import type { DatosAprobaciones, PasoRegla, Regla, TipoAprobador } from '@/lib/hrm/configuracion/tipos';
import {
  CAMPOS_LISTA,
  CAMPOS_NUMERO,
  condicionesA,
  condicionesDe,
  esCampoLista,
  mover,
  type CampoCondicion,
  type Condicion,
} from '@/lib/hrm/configuracion/reglasVista';
import { contarCambios, useDentroDelDialogo, useRegistrarCambios } from '../../dialogo/cambiosSinGuardar';
import { SelectorHrm, VolverA, pedirHrm } from './comun';
import { TIPOS_SOLICITUD_UI, URL_APROBACIONES } from './AprobacionesPanel';

const APROBADORES: readonly TipoAprobador[] = ['jefe_directo', 'jefe_area', 'rrhh', 'cargo', 'persona'];

interface Borrador {
  id: string | null;
  nombre: string;
  tipo: string;
  condiciones: Condicion[];
  pasos: PasoRegla[];
  siEsQuienPide: 'siguiente_paso' | 'rrhh';
  siNoHay: 'rrhh' | 'siguiente_paso';
}

export function EditorReglaHrm({
  datos,
  regla,
  onCerrar,
  onGuardada,
}: {
  datos: DatosAprobaciones;
  regla: Partial<Regla>;
  onCerrar: () => void;
  onGuardada: () => Promise<void>;
}) {
  const t = useTranslations('hrmConfig.aprobaciones.editor');
  const ta = useTranslations('hrmConfig.aprobaciones');
  const { toast } = useToast();
  const inicial = useMemo<Borrador>(
    () => ({
      id: regla.id ?? null,
      nombre: regla.nombre ?? '',
      tipo: regla.tipo ?? 'ausencia',
      condiciones: condicionesDe(regla.condiciones),
      pasos: regla.pasos?.length ? regla.pasos.map((p) => ({ ...p })) : [{ tipo: 'jefe_directo' }],
      siEsQuienPide: regla.siEsQuienPide ?? 'siguiente_paso',
      siNoHay: regla.siNoHay ?? 'rrhh',
    }),
    [regla],
  );
  const [b, setB] = useState<Borrador>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = datos.puedeEditar;
  // Dentro del diálogo, «Guardar regla» lo pinta su barra; fuera, el propio editor.
  const enDialogo = useDentroDelDialogo();
  // Una regla nueva cuenta como cambio aunque aún no se haya tocado nada.
  const cambios = contarCambios(b, inicial) + (inicial.id ? 0 : 1);

  const guardar = async () => {
    if (b.nombre.trim().length < 2) {
      setError(t('errores.nombre'));
      return;
    }
    if (b.pasos.some((p) => (p.tipo === 'cargo' && !p.cargo) || (p.tipo === 'persona' && !p.persona))) {
      setError(t('errores.paso'));
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await pedirHrm(URL_APROBACIONES, {
        metodo: 'POST',
        cuerpo: {
          accion: 'guardar',
          regla: {
            id: b.id,
            tipo: b.tipo,
            nombre: b.nombre.trim(),
            condiciones: condicionesA(b.condiciones),
            pasos: b.pasos,
            siEsQuienPide: b.siEsQuienPide,
            siNoHay: b.siNoHay,
            activa: regla.activa !== false,
          },
        },
      });
      toast({ title: t('guardada') });
      await onGuardada();
    } catch {
      toast({ title: t('errores.guardar'), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  useRegistrarCambios({ cambios: editable ? cambios : 0, guardando, guardar, descartar: onCerrar });

  const camposUsados = new Set(b.condiciones.map((c) => (esCampoLista(c.campo) ? c.campo : `${c.campo}`)));
  const agregarCondicion = (campo: CampoCondicion) =>
    setB((x) => ({ ...x, condiciones: [...x.condiciones, esCampoLista(campo) ? { campo, valores: [] } : { campo, op: 'gt', valor: null }] }));
  const cambiarCondicion = (i: number, c: Condicion) => setB((x) => ({ ...x, condiciones: x.condiciones.map((y, j) => (j === i ? c : y)) }));
  const opcionesLista = (campo: string) => (campo === 'sede' ? datos.sedes : campo === 'area' ? datos.areas : datos.cargos).map((o) => ({ valor: o.id, etiqueta: o.nombre }));

  const descripcionPaso = (p: PasoRegla) => {
    if (p.tipo === 'rrhh') return t('paso.rrhhAyuda', { n: datos.rrhh });
    if (p.tipo === 'cargo') return t('paso.cargoAyuda');
    if (p.tipo === 'persona') return t('paso.personaAyuda');
    return t(`paso.${p.tipo}Ayuda`);
  };

  const accionesAgregar: AccionFila[] = APROBADORES.map((tipo) => ({
    id: tipo,
    etiqueta: ta(`aprobador.${tipo}`),
    icono: Plus,
    onSelect: () => setB((x) => ({ ...x, pasos: [...x.pasos, { tipo }] })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <VolverA texto={ta('subvista.reglas')} onClick={onCerrar} />
      <h3 className="text-lg font-semibold text-fg">{t(b.id ? 'tituloEditar' : 'tituloNueva', { tipo: ta(`tipo.${b.tipo}`) })}</h3>

      <fieldset disabled={!editable} className="contents">
        <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
            {t('nombre')}
            <Input value={b.nombre} maxLength={80} onChange={(e) => setB((x) => ({ ...x, nombre: e.target.value }))} placeholder={t('nombreEjemplo')} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
            {t('tipo')}
            <SelectorHrm
              valor={b.tipo}
              onValor={(v) => setB((x) => ({ ...x, tipo: v }))}
              etiqueta={t('tipo')}
              opciones={TIPOS_SOLICITUD_UI.map((x) => ({ valor: x, etiqueta: ta(`tipo.${x}`) }))}
              deshabilitado={Boolean(b.id) || !editable}
            />
          </label>
        </div>

        <section className="flex flex-col gap-2" aria-labelledby="hrm-regla-condiciones">
          <div>
            <h4 id="hrm-regla-condiciones" className="text-base font-medium text-fg">
              {t('condiciones')}
            </h4>
            <p className="text-sm text-fg-muted">{t('condicionesAyuda')}</p>
          </div>
          {b.condiciones.length === 0 && <p className="text-sm text-fg-secondary">{t('sinCondiciones')}</p>}
          {b.condiciones.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2" data-condicion={c.campo}>
              <span className="w-32 text-sm text-fg">{ta(`condicion.campo.${c.campo}`)}</span>
              {esCampoLista(c.campo) ? (
                <>
                  <span className="w-36 text-sm text-fg-secondary">{ta('condicion.op.cualquiera')}</span>
                  <MultiSelect
                    className="min-w-[14rem] flex-1"
                    opciones={opcionesLista(c.campo)}
                    valores={(c as Extract<Condicion, { valores: string[] }>).valores}
                    onValoresChange={(v) => cambiarCondicion(i, { campo: c.campo as (typeof CAMPOS_LISTA)[number], valores: v })}
                    placeholder={t('elegir')}
                    deshabilitado={!editable}
                  />
                </>
              ) : (
                <>
                  <SelectorHrm
                    valor={(c as Extract<Condicion, { op: 'gt' | 'lt' }>).op}
                    onValor={(v) => cambiarCondicion(i, { ...(c as Extract<Condicion, { op: 'gt' | 'lt' }>), op: v as 'gt' | 'lt' })}
                    etiqueta={t('operador')}
                    opciones={(['gt', 'lt'] as const).map((op) => ({ valor: op, etiqueta: ta(`condicion.op.${op}`) }))}
                    className="w-36"
                    deshabilitado={!editable}
                  />
                  <CampoNumero
                    className="w-40"
                    valor={(c as Extract<Condicion, { op: 'gt' | 'lt' }>).valor}
                    onValorChange={(v) => cambiarCondicion(i, { ...(c as Extract<Condicion, { op: 'gt' | 'lt' }>), valor: v })}
                    aria-label={ta(`condicion.campo.${c.campo}`)}
                    sufijo={c.campo === 'aumento' ? '%' : undefined}
                    minimo={0}
                    tamano="sm"
                    disabled={!editable}
                  />
                </>
              )}
              {editable && (
                <button
                  type="button"
                  aria-label={t('quitarCondicion')}
                  onClick={() => setB((x) => ({ ...x, condiciones: x.condiciones.filter((_, j) => j !== i) }))}
                  className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <RowActionsMenu
              etiquetaBoton={t('agregarCondicion')}
              iconoBoton={Plus}
              acciones={[...CAMPOS_LISTA, ...CAMPOS_NUMERO]
                .filter((campo) => !esCampoLista(campo) || !camposUsados.has(campo))
                .map((campo) => ({ id: campo, etiqueta: ta(`condicion.campo.${campo}`), icono: Plus, onSelect: () => agregarCondicion(campo) }))}
              className="self-start"
            />
          )}
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="hrm-regla-cadena">
          <div>
            <h4 id="hrm-regla-cadena" className="text-base font-medium text-fg">
              {t('cadena')}
            </h4>
            <p className="text-sm text-fg-muted">{t('cadenaAyuda')}</p>
          </div>
          {b.pasos.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3" data-paso={p.tipo}>
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-medium text-brand-deep">{i + 1}</span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-sm font-medium text-fg">{ta(`aprobador.${p.tipo}`)}</p>
                <p className="text-[13px] text-fg-muted">{descripcionPaso(p)}</p>
              </div>
              {p.tipo === 'cargo' && (
                <SelectorHrm
                  valor={p.cargo ?? null}
                  onValor={(v) => setB((x) => ({ ...x, pasos: x.pasos.map((y, j) => (j === i ? { ...y, cargo: v } : y)) }))}
                  etiqueta={ta('aprobador.cargo')}
                  marcador={t('elegirCargo')}
                  opciones={datos.cargos.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
                  className="w-56"
                  deshabilitado={!editable}
                />
              )}
              {p.tipo === 'persona' && (
                <SelectorHrm
                  valor={p.persona ?? null}
                  onValor={(v) => setB((x) => ({ ...x, pasos: x.pasos.map((y, j) => (j === i ? { ...y, persona: v } : y)) }))}
                  etiqueta={ta('aprobador.persona')}
                  marcador={t('elegirPersona')}
                  opciones={datos.personas.map((c) => ({ valor: c.id, etiqueta: c.cargo ? `${c.nombre} · ${c.cargo}` : c.nombre }))}
                  className="w-56"
                  deshabilitado={!editable}
                />
              )}
              {editable && (
                <span className="flex items-center">
                  <button type="button" aria-label={t('subirPaso')} disabled={i === 0} onClick={() => setB((x) => ({ ...x, pasos: reordenarPasos(x.pasos, i, i - 1) }))} className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover disabled:opacity-40">
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </button>
                  <button type="button" aria-label={t('bajarPaso')} disabled={i === b.pasos.length - 1} onClick={() => setB((x) => ({ ...x, pasos: reordenarPasos(x.pasos, i, i + 1) }))} className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover disabled:opacity-40">
                    <ArrowDown aria-hidden="true" className="size-4" />
                  </button>
                  <button type="button" aria-label={t('quitarPaso')} disabled={b.pasos.length === 1} onClick={() => setB((x) => ({ ...x, pasos: x.pasos.filter((_, j) => j !== i) }))} className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover disabled:opacity-40">
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </span>
              )}
            </div>
          ))}
          {editable && b.pasos.length < 10 && (
            <div className="flex flex-wrap items-center gap-3">
              <RowActionsMenu etiquetaBoton={t('agregarAprobador')} iconoBoton={Plus} acciones={accionesAgregar} />
              <span className="text-[13px] text-fg-muted">{t('agregarAprobadorAyuda')}</span>
            </div>
          )}
        </section>

        <section className="flex flex-col" aria-labelledby="hrm-regla-casos">
          <h4 id="hrm-regla-casos" className="pb-2 text-base font-medium text-fg">
            {t('casos')}
          </h4>
          <div className="divide-y divide-line border-t border-line">
            <div className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1 basis-60">
                <p className="text-sm font-medium text-fg">{t('siEsQuienPide')}</p>
                <p className="text-[13px] text-fg-muted">{t('siEsQuienPideAyuda')}</p>
              </div>
              <SelectorHrm
                valor={b.siEsQuienPide}
                onValor={(v) => setB((x) => ({ ...x, siEsQuienPide: v as Borrador['siEsQuienPide'] }))}
                etiqueta={t('siEsQuienPide')}
                opciones={[
                  { valor: 'siguiente_paso', etiqueta: t('pasaSiguiente') },
                  { valor: 'rrhh', etiqueta: t('vaRrhh') },
                ]}
                className="w-56"
                deshabilitado={!editable}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1 basis-60">
                <p className="text-sm font-medium text-fg">{t('siNoHay')}</p>
                <p className="text-[13px] text-fg-muted">{t('siNoHayAyuda')}</p>
              </div>
              <SelectorHrm
                valor={b.siNoHay}
                onValor={(v) => setB((x) => ({ ...x, siNoHay: v as Borrador['siNoHay'] }))}
                etiqueta={t('siNoHay')}
                opciones={[
                  { valor: 'rrhh', etiqueta: t('vaRrhh') },
                  { valor: 'siguiente_paso', etiqueta: t('pasaSiguiente') },
                ]}
                className="w-56"
                deshabilitado={!editable}
              />
            </div>
          </div>
        </section>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      {editable && !enDialogo && (
        <div className="flex justify-end gap-2">
          <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={onCerrar}>
            {t('cancelar')}
          </button>
          <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} disabled={guardando} onClick={() => void guardar()}>
            {t('guardar')}
          </button>
        </div>
      )}
    </div>
  );
}

function reordenarPasos(pasos: readonly PasoRegla[], de: number, a: number): PasoRegla[] {
  const ids = pasos.map((_, i) => String(i));
  return mover(ids, String(de), a).map((i) => pasos[Number(i)]);
}
