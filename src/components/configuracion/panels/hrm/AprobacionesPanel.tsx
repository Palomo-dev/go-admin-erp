'use client';

/**
 * Configuración › Recursos humanos › Aprobaciones (diseño 10.RH.2, Figma
 * `2506:23426`; pantallazos 95-hrm-config-16…24).
 *
 * - Reglas: cada tipo de solicitud tiene las suyas; se revisan en orden y
 *   gana la primera que se cumple. El orden se cambia con «Subir / Bajar» del
 *   menú «⋯» (filas `FilaDato` del kit, sin arrastre propio).
 * - Delegaciones y reemplazos.
 * - «Probar una regla»: no crea nada ni avisa a nadie.
 *
 * Decisiones del dueño (2026-11-15): sin reglas, la solicitud va al jefe
 * directo y, si no hay, a RR. HH.; nadie aprueba lo suyo; un paso sin persona
 * va a RR. HH. Todo lo resuelve la base (`fn_hr_aprobacion_plan`).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pause, Pencil, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { ChipsOpcion, ConfirmDialog, EmptyState, FilaDato, ListaDatos, RowActionsMenu, clasesBoton, type AccionFila } from '@/components/kit';
import type { DatosAprobaciones, PasoRegla, Regla } from '@/lib/hrm/configuracion/tipos';
import { condicionesDe, esCampoLista, mover, reglasDelTipo, type Condicion } from '@/lib/hrm/configuracion/reglasVista';
import { CargandoHrm, ErrorCargaHrm, PieHrm, SinPermisoHrm, pedirHrm, useCargaHrm, useFormatoHrm } from './comun';
import { EditorReglaHrm } from './EditorReglaHrm';
import { DelegacionesHrm } from './DelegacionesHrm';
import { ProbarReglaHrm } from './ProbarReglaHrm';

export const URL_APROBACIONES = '/api/hrm/configuracion/aprobaciones';
/** Tipos que se muestran abiertos; el resto va a «Otros tipos de solicitud». */
const TIPOS_PRINCIPALES = ['ausencia', 'horas_extra', 'cambio_salario', 'prestamo'] as const;
export const TIPOS_SOLICITUD_UI = [
  'ausencia',
  'horas_extra',
  'cambio_salario',
  'prestamo',
  'novedad_nomina',
  'vacante',
  'oferta',
  'liquidacion',
  'cambio_cargo',
  'cambio_sede',
  'cambio_area',
  'cambio_jefe',
  'cambio_jornada',
  'cambio_contrato',
] as const;

type Subvista = 'reglas' | 'delegaciones' | 'probar';

export function AprobacionesPanel() {
  const t = useTranslations('hrmConfig.aprobaciones');
  const { carga, recargar } = useCargaHrm<DatosAprobaciones>(URL_APROBACIONES);
  if (carga.estado === 'cargando') return <CargandoHrm filas={8} />;
  if (carga.estado === 'sinPermiso') return <SinPermisoHrm permiso={t('permiso')} />;
  if (carga.estado === 'error') return <ErrorCargaHrm titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void recargar()} />;
  return <AprobacionesCargadas datos={carga.datos} recargar={recargar} />;
}

/** «Jefe directo → RR. HH. → Gerencia». */
export function useCadena(datos: DatosAprobaciones) {
  const t = useTranslations('hrmConfig.aprobaciones.aprobador');
  return (pasos: readonly PasoRegla[]) =>
    pasos
      .map((p) => {
        if (p.tipo === 'cargo') return datos.cargos.find((c) => c.id === p.cargo)?.nombre ?? t('cargo');
        if (p.tipo === 'persona') return datos.personas.find((x) => x.id === p.persona)?.nombre ?? t('persona');
        return t(p.tipo);
      })
      .join(' → ');
}

function useResumenCondiciones(datos: DatosAprobaciones) {
  const t = useTranslations('hrmConfig.aprobaciones.condicion');
  const f = useFormatoHrm();
  return (condiciones: Record<string, unknown>) => {
    const filas = condicionesDe(condiciones);
    if (filas.length === 0) return null;
    return filas
      .map((c: Condicion) => {
        if (esCampoLista(c.campo)) {
          const valores = (c as Extract<Condicion, { valores: string[] }>).valores;
          const lista = c.campo === 'sede' ? datos.sedes : c.campo === 'area' ? datos.areas : datos.cargos;
          const nombres = valores.map((v) => lista.find((o) => o.id === v)?.nombre ?? v).join(', ');
          return t('resumenLista', { campo: t(`campo.${c.campo}`), valores: nombres });
        }
        const n = c as Extract<Condicion, { op: 'gt' | 'lt' }>;
        const valor = n.valor === null ? '' : c.campo === 'monto' ? f.dinero(n.valor) : c.campo === 'aumento' ? `${f.numero(n.valor)} %` : f.numero(n.valor);
        return t('resumenNumero', { campo: t(`campo.${c.campo}`), op: t(`op.${n.op}`), valor });
      })
      .join(' · ');
  };
}

function AprobacionesCargadas({ datos, recargar }: { datos: DatosAprobaciones; recargar: () => Promise<void> }) {
  const t = useTranslations('hrmConfig.aprobaciones');
  const [subvista, setSubvista] = useState<Subvista>('reglas');
  const [editando, setEditando] = useState<Partial<Regla> | null>(null);

  if (editando) {
    return (
      <EditorReglaHrm
        datos={datos}
        regla={editando}
        onCerrar={() => setEditando(null)}
        onGuardada={async () => {
          setEditando(null);
          await recargar();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ChipsOpcion
        opciones={[
          { valor: 'reglas', etiqueta: t('subvista.reglas') },
          { valor: 'delegaciones', etiqueta: t('subvista.delegaciones') },
          { valor: 'probar', etiqueta: t('subvista.probar') },
        ]}
        valor={subvista}
        onValorChange={(v) => setSubvista(v as Subvista)}
        etiqueta={t('subvista.etiqueta')}
      />
      {subvista === 'reglas' && <ListaReglas datos={datos} recargar={recargar} onEditar={setEditando} />}
      {subvista === 'delegaciones' && <DelegacionesHrm datos={datos} recargar={recargar} />}
      {subvista === 'probar' && (
        <ProbarReglaHrm
          datos={datos}
          onVerRegla={(id) => {
            const r = datos.reglas.find((x) => x.id === id);
            if (r) setEditando(r);
          }}
        />
      )}
    </div>
  );
}

function ListaReglas({ datos, recargar, onEditar }: { datos: DatosAprobaciones; recargar: () => Promise<void>; onEditar: (r: Partial<Regla>) => void }) {
  const t = useTranslations('hrmConfig.aprobaciones');
  const { toast } = useToast();
  const cadena = useCadena(datos);
  const resumen = useResumenCondiciones(datos);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [quitando, setQuitando] = useState<Regla | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const editable = datos.puedeEditar;

  const accion = async (cuerpo: Record<string, unknown>, ok?: string) => {
    setOcupado(true);
    try {
      await pedirHrm(URL_APROBACIONES, { metodo: 'POST', cuerpo });
      if (ok) toast({ title: ok });
      await recargar();
    } catch {
      toast({ title: t('errorGuardar'), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };
  const reordenar = (tipo: string, id: string, destino: number) => {
    const ids = reglasDelTipo(datos.reglas, tipo).map((r) => r.id);
    const nuevos = mover(ids, id, destino);
    if (nuevos.join() !== ids.join()) void accion({ accion: 'reordenar', tipo, ids: nuevos });
  };

  if (datos.reglas.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">{t('reglas.ayuda')}</p>
        <EmptyState
          icono={Sparkles}
          titulo={t('reglas.vacio.titulo')}
          descripcion={t('reglas.vacio.descripcion', { rrhh: datos.rrhh })}
          accion={editable ? { etiqueta: t('reglas.vacio.recomendadas'), onClick: () => void accion({ accion: 'recomendadas' }, t('reglas.recomendadasListas')) } : undefined}
          accionSecundaria={editable ? { etiqueta: t('reglas.agregar'), onClick: () => onEditar({ tipo: 'ausencia', pasos: [{ tipo: 'jefe_directo' }] }) } : undefined}
        />
      </div>
    );
  }

  const filaRegla = (r: Regla, i: number, total: number) => {
    const acciones: AccionFila[] = [
      { id: 'editar', etiqueta: t('reglas.editar'), icono: Pencil, onSelect: () => onEditar(r) },
      r.activa
        ? { id: 'pausar', etiqueta: t('reglas.desactivar'), icono: Pause, onSelect: () => void accion({ accion: 'activar', id: r.id, activa: false }) }
        : { id: 'activar', etiqueta: t('reglas.activar'), icono: Play, onSelect: () => void accion({ accion: 'activar', id: r.id, activa: true }) },
      ...(i > 0 ? [{ id: 'subir', etiqueta: t('reglas.subir'), icono: ArrowUp, onSelect: () => reordenar(r.tipo, r.id, i - 1) }] : []),
      ...(i < total - 1 ? [{ id: 'bajar', etiqueta: t('reglas.bajar'), icono: ArrowDown, onSelect: () => reordenar(r.tipo, r.id, i + 1) }] : []),
      { id: 'quitar', etiqueta: t('reglas.quitar'), icono: Trash2, destructiva: true, onSelect: () => setQuitando(r) },
    ];
    return (
      <FilaDato
        key={r.id}
        className="py-3"
        etiqueta={
          <span className="font-medium text-fg">
            <span className="mr-2 inline-flex size-6 items-center justify-center rounded-md bg-subtle text-xs text-fg-secondary">{i + 1}</span>
            {r.nombre}
          </span>
        }
        descripcion={<span className="pl-8">{resumen(r.condiciones) ?? t('reglas.todasLasDemas')}</span>}
        valor={<span className="hidden text-fg-secondary md:inline">{cadena(r.pasos)}</span>}
        accesorio={
          <>
            <Badge tono={r.activa ? 'exito' : 'neutro'} apariencia="contorno" tamano="sm" className="shrink-0">
              {r.activa ? t('reglas.activa') : t('reglas.inactiva')}
            </Badge>
            {editable ? <RowActionsMenu titulo={r.nombre} acciones={acciones} orientacion="horizontal" /> : <span className="w-8" aria-hidden="true" />}
          </>
        }
      />
    );
  };

  const bloqueTipo = (tipo: string) => {
    const reglas = reglasDelTipo(datos.reglas, tipo);
    return (
      <section key={tipo} aria-labelledby={`hrm-tipo-${tipo}`} className="flex flex-col">
        <div className="flex items-center gap-2 pb-2">
          <h3 id={`hrm-tipo-${tipo}`} className="text-base font-medium text-fg">
            {t(`tipo.${tipo}`)}
          </h3>
          <Badge tono="neutro" apariencia="contorno" tamano="sm">
            {t('reglas.n', { n: reglas.length })}
          </Badge>
          {editable && (
            <button type="button" className={`${clasesBoton({ variante: 'fantasma', tamano: 'sm' })} ml-auto`} onClick={() => onEditar({ tipo, pasos: [{ tipo: 'jefe_directo' }] })}>
              <Plus aria-hidden="true" className="size-4" />
              {t('reglas.agregar')}
            </button>
          )}
        </div>
        {reglas.length === 0 ? (
          <p className="border-t border-line py-3 text-sm text-fg-muted">{t('reglas.sinReglasTipo')}</p>
        ) : (
          <ListaDatos divisores className="border-t border-line">
            {reglas.map((r, i) => filaRegla(r, i, reglas.length))}
          </ListaDatos>
        )}
      </section>
    );
  };

  const otros = TIPOS_SOLICITUD_UI.filter((x) => !(TIPOS_PRINCIPALES as readonly string[]).includes(x));

  return (
    <div className="flex flex-col gap-7" aria-busy={ocupado}>
      <p className="text-sm text-fg-muted">{t('reglas.ayuda')}</p>
      {TIPOS_PRINCIPALES.map(bloqueTipo)}
      <section aria-labelledby="hrm-otros-tipos" className="flex flex-col">
        <h3 id="hrm-otros-tipos" className="pb-2 text-base font-medium text-fg">
          {t('reglas.otrosTipos')}
        </h3>
        <div className="divide-y divide-line border-t border-line">
          {otros.map((tipo) => {
            const reglas = reglasDelTipo(datos.reglas, tipo);
            const abierto = abiertos.has(tipo);
            return (
              <div key={tipo}>
                <button
                  type="button"
                  aria-expanded={abierto}
                  onClick={() =>
                    setAbiertos((s) => {
                      const n = new Set(s);
                      if (n.has(tipo)) n.delete(tipo);
                      else n.add(tipo);
                      return n;
                    })
                  }
                  className="flex w-full items-center gap-3 py-3 text-left hover:bg-hover"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-fg">{t(`tipo.${tipo}`)}</span>
                    <span className="block text-[13px] text-fg-muted">
                      {reglas.length === 0 ? t('reglas.porDefectoTipo') : `${t('reglas.n', { n: reglas.length })} · ${cadena(reglas[0].pasos)}`}
                    </span>
                  </span>
                  {abierto ? <ChevronDown aria-hidden="true" className="size-4 text-fg-muted" /> : <ChevronRight aria-hidden="true" className="size-4 text-fg-muted" />}
                </button>
                {abierto && <div className="pb-3 pl-4">{bloqueTipo(tipo)}</div>}
              </div>
            );
          })}
        </div>
      </section>
      <PieHrm etiqueta={editable ? t('pie.guardado') : t('pie.soloLectura')} />
      <ConfirmDialog
        abierto={quitando !== null}
        onAbiertoChange={(a) => !a && setQuitando(null)}
        titulo={t('reglas.confirmarQuitar.titulo')}
        descripcion={t('reglas.confirmarQuitar.descripcion', { nombre: quitando?.nombre ?? '' })}
        textoConfirmar={t('reglas.quitar')}
        tono="peligro"
        onConfirmar={async () => {
          if (quitando) await accion({ accion: 'quitar', id: quitando.id });
          setQuitando(null);
        }}
      />
    </div>
  );
}
