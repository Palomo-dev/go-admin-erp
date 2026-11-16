'use client';

/**
 * «Delegaciones y reemplazos» de Aprobaciones (diseño 10.RH.2, pantallazos
 * 95-hrm-config-18 y 22). Mientras dura la delegación, lo que le llegue a la
 * persona ausente le llega a su reemplazo; lo ya aprobado no cambia.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info, StopCircle, UserRoundCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { AvisoTonal, CampoFecha, ConfirmDialog, EmptyState, FilaDato, ListaDatos, RowActionsMenu, clasesBoton, type TonoBadge } from '@/components/kit';
import type { DatosAprobaciones, Delegacion } from '@/lib/hrm/configuracion/tipos';
import { estadoDelegacion, type EstadoDelegacion } from '@/lib/hrm/configuracion/reglasVista';
import { SelectorHrm, pedirHrm, useFormatoHrm } from './comun';
import { URL_APROBACIONES } from './AprobacionesPanel';

const MOTIVOS = ['vacaciones', 'licencia', 'incapacidad', 'capacitacion', 'viaje', 'otro'] as const;
const ALCANCES = ['todas', 'ausencias', 'ausencias_horas', 'nomina'] as const;
/** Qué tipos cubre cada alcance (null = todas). */
const TIPOS_DE_ALCANCE: Record<(typeof ALCANCES)[number], string[] | null> = {
  todas: null,
  ausencias: ['ausencia'],
  ausencias_horas: ['ausencia', 'horas_extra'],
  nomina: ['novedad_nomina', 'horas_extra', 'prestamo'],
};
const TONO: Record<EstadoDelegacion, TonoBadge> = { programada: 'informacion', activa: 'exito', terminada: 'neutro' };

function alcanceDe(tipos: string[] | null): string {
  for (const a of ALCANCES) {
    const x = TIPOS_DE_ALCANCE[a];
    if (x === null ? tipos === null : tipos !== null && x.length === tipos.length && x.every((y) => tipos.includes(y))) return a;
  }
  return 'otras';
}

export function DelegacionesHrm({ datos, recargar }: { datos: DatosAprobaciones; recargar: () => Promise<void> }) {
  const t = useTranslations('hrmConfig.aprobaciones.delegaciones');
  const f = useFormatoHrm();
  const { toast } = useToast();
  const vacia = { deId: '', aId: '', desde: datos.hoy, hasta: datos.hoy, alcance: 'todas' as (typeof ALCANCES)[number], motivo: 'vacaciones' as (typeof MOTIVOS)[number] };
  const [nueva, setNueva] = useState(vacia);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [terminando, setTerminando] = useState<Delegacion | null>(null);
  const editable = datos.puedeEditar;
  const persona = (id: string) => datos.personas.find((p) => p.id === id);
  const opcionesPersona = datos.personas.map((p) => ({ valor: p.id, etiqueta: p.cargo ? `${p.nombre} · ${p.cargo}` : p.nombre }));

  const guardar = async () => {
    if (!nueva.deId || !nueva.aId || nueva.deId === nueva.aId) {
      setError(t('errores.personas'));
      return;
    }
    if (nueva.hasta < nueva.desde) {
      setError(t('errores.fechas'));
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await pedirHrm(URL_APROBACIONES, {
        metodo: 'POST',
        cuerpo: { accion: 'delegar', deId: nueva.deId, aId: nueva.aId, desde: nueva.desde, hasta: nueva.hasta, tipos: TIPOS_DE_ALCANCE[nueva.alcance], motivo: nueva.motivo },
      });
      toast({ title: t('guardada') });
      setNueva(vacia);
      await recargar();
    } catch {
      toast({ title: t('errores.guardar'), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const ordenadas = [...datos.delegaciones].sort((a, b) => (a.desde < b.desde ? 1 : -1));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-fg-muted">{t('ayuda')}</p>
      {editable && (
        <section aria-labelledby="hrm-delegacion-nueva" className="flex flex-col gap-4 rounded-xl border border-line-brand bg-surface p-4">
          <h3 id="hrm-delegacion-nueva" className="text-base font-medium text-fg">
            {t('nueva')}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t('quienSeAusenta')}
              <SelectorHrm valor={nueva.deId || null} onValor={(v) => setNueva((x) => ({ ...x, deId: v }))} etiqueta={t('quienSeAusenta')} marcador={t('elegirPersona')} opciones={opcionesPersona} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t('quienAprueba')}
              <SelectorHrm
                valor={nueva.aId || null}
                onValor={(v) => setNueva((x) => ({ ...x, aId: v }))}
                etiqueta={t('quienAprueba')}
                marcador={t('elegirPersona')}
                opciones={opcionesPersona.filter((o) => o.valor !== nueva.deId)}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <span id="hrm-delegacion-desde" className="text-sm font-medium text-fg">
                {t('desde')}
              </span>
              <CampoFecha valor={nueva.desde} onValorChange={(d) => setNueva((x) => ({ ...x, desde: d || datos.hoy }))} hoy={datos.hoy} min={datos.hoy} limpiable={false} aria-labelledby="hrm-delegacion-desde" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span id="hrm-delegacion-hasta" className="text-sm font-medium text-fg">
                {t('hasta')}
              </span>
              <CampoFecha valor={nueva.hasta} onValorChange={(d) => setNueva((x) => ({ ...x, hasta: d || x.desde }))} hoy={datos.hoy} min={nueva.desde} limpiable={false} aria-labelledby="hrm-delegacion-hasta" />
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t('queSolicitudes')}
              <SelectorHrm
                valor={nueva.alcance}
                onValor={(v) => setNueva((x) => ({ ...x, alcance: v as (typeof ALCANCES)[number] }))}
                etiqueta={t('queSolicitudes')}
                opciones={ALCANCES.map((a) => ({ valor: a, etiqueta: t(`alcance.${a}`) }))}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t('motivo')}
              <SelectorHrm
                valor={nueva.motivo}
                onValor={(v) => setNueva((x) => ({ ...x, motivo: v as (typeof MOTIVOS)[number] }))}
                etiqueta={t('motivo')}
                opciones={MOTIVOS.map((m) => ({ valor: m, etiqueta: t(`motivos.${m}`) }))}
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setNueva(vacia)}>
              {t('cancelar')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} disabled={guardando} onClick={() => void guardar()}>
              {t('guardar')}
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="hrm-delegaciones-lista" className="flex flex-col">
        <h3 id="hrm-delegaciones-lista" className="pb-2 text-base font-medium text-fg">
          {t('lista')}
        </h3>
        {ordenadas.length === 0 ? (
          <EmptyState icono={UserRoundCheck} titulo={t('vacio')} compacto />
        ) : (
          <ListaDatos divisores className="border-t border-line">
            {ordenadas.map((d) => {
              const estado = estadoDelegacion(d, datos.hoy);
              const alcance = alcanceDe(d.tipos);
              const deA = t('deA', { de: d.deNombre || persona(d.deId)?.nombre || '—', a: d.aNombre || persona(d.aId)?.nombre || '—' });
              return (
                <FilaDato
                  key={d.id}
                  className="py-3"
                  etiqueta={<span className="font-medium text-fg">{deA}</span>}
                  descripcion={t('resumen', {
                    desde: f.dia(d.desde),
                    hasta: f.dia(d.hasta),
                    motivo: (MOTIVOS as readonly string[]).includes(d.motivo) ? t(`motivos.${d.motivo}`) : d.motivo,
                    alcance: alcance === 'otras' ? t('alcance.otras', { n: d.tipos?.length ?? 0 }) : t(`alcance.${alcance}`),
                  })}
                  valor={
                    <Badge tono={TONO[estado]} apariencia="contorno" tamano="sm">
                      {t(`estado.${estado}`)}
                    </Badge>
                  }
                  accesorio={
                    editable && estado !== 'terminada' ? (
                      <RowActionsMenu titulo={deA} orientacion="horizontal" acciones={[{ id: 'terminar', etiqueta: t('terminar'), icono: StopCircle, destructiva: true, onSelect: () => setTerminando(d) }]} />
                    ) : (
                      <span className="w-8" aria-hidden="true" />
                    )
                  }
                />
              );
            })}
          </ListaDatos>
        )}
      </section>
      <AvisoTonal tono="neutro" icono={Info} titulo={t('avisoReemplazo')} compacto />
      <ConfirmDialog
        abierto={terminando !== null}
        onAbiertoChange={(a) => !a && setTerminando(null)}
        titulo={t('confirmarTerminar.titulo')}
        descripcion={t('confirmarTerminar.descripcion', { de: terminando?.deNombre ?? '', a: terminando?.aNombre ?? '' })}
        textoConfirmar={t('terminar')}
        tono="advertencia"
        onConfirmar={async () => {
          if (!terminando) return;
          try {
            await pedirHrm(URL_APROBACIONES, { metodo: 'POST', cuerpo: { accion: 'terminar', id: terminando.id } });
            await recargar();
          } catch {
            toast({ title: t('errores.guardar'), variant: 'destructive' });
          } finally {
            setTerminando(null);
          }
        }}
      />
    </div>
  );
}
