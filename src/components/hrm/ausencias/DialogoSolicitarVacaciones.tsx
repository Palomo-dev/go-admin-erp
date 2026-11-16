'use client';

/**
 * Solicitar vacaciones (Figma 20.13.2, `96-hrm-f2-13-02-*`): saldo disponible y lo que
 * queda, días calendario menos domingos (o días no laborables) y festivos = días
 * hábiles que se descuentan (ADR-002 §5), día de regreso, cruces del equipo (no
 * bloquean) y quién aprueba (decisión 10). Todo sale de la vista previa de la base.
 * «Para alguien» (RR. HH.) pide además la persona.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import { AvisoTonal, CampoFecha, Dialogo, FilaDato, FormField, ListaDatos, Skeleton } from '@/components/kit';
import { diaDeSemana } from '@/components/kit/calendarioLogica';
import { ErrorPersonas } from '../personas/apiPersonas';
import { registrarAusencia, type DatosAusencia } from './apiAusencias';
import { requiereRrhh, type Simulacion } from './ausenciasLogica';
import { useFechas } from './piezasAusencias';
import { SelectorPersona, useEmpleadosVigentes } from './SelectorPersona';
import { claveError, useSimulacion } from './useSimulacion';

export interface DialogoSolicitarVacacionesProps {
  abierto: boolean;
  onAbiertoChange: (a: boolean) => void;
  hoy: string;
  /** RR. HH. registra para otra persona: aparece el campo «Persona». */
  paraAlguien: boolean;
  /** Persona fija (la propia en «Mis vacaciones»). */
  persona?: { vinculo_id: string; nombre: string | null; cargo: string | null; area: string | null } | null;
  onHecho: () => void;
}

export function DialogoSolicitarVacaciones({ abierto, onAbiertoChange, hoy, paraAlguien, persona, onHecho }: DialogoSolicitarVacacionesProps) {
  const t = useTranslations('hrmAusencias.solicitar');
  const te = useTranslations('hrmAusencias');
  const f = useFechas();
  const empleados = useEmpleadosVigentes(abierto && paraAlguien);
  const [vinculo, setVinculo] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setVinculo(persona?.vinculo_id ?? '');
    setDesde('');
    setHasta('');
  }, [abierto, persona?.vinculo_id]);

  const vinculoId = paraAlguien ? vinculo : persona?.vinculo_id ?? '';
  const datos: DatosAusencia | null = useMemo(
    () => (abierto && desde && hasta && hasta >= desde && (!paraAlguien || vinculo) ? { tipo: 'VAC', desde, hasta, ...(vinculoId ? { vinculo_id: vinculoId } : {}) } : null),
    [abierto, desde, hasta, paraAlguien, vinculo, vinculoId]
  );
  const { sim, cargando, error } = useSimulacion(datos);
  const elegido = paraAlguien ? (empleados ?? []).find((e) => e.vinculo_id === vinculo) : null;
  const nombre = sim?.nombre ?? elegido?.nombre ?? persona?.nombre ?? null;
  const detalle = [nombre, sim?.cargo ?? elegido?.cargo ?? persona?.cargo, sim?.area ?? elegido?.area ?? persona?.area].filter(Boolean).join(' · ');
  const fallo = sim?.error ?? error;

  const enviar = async () => {
    if (!datos) return;
    setEnviando(true);
    try {
      const r = await registrarAusencia(datos);
      toast.success(r.estado === 'approved' ? t('registrada') : t('enviada'));
      onHecho();
      onAbiertoChange(false);
    } catch (e) {
      toast.error(te(`errores.${claveError(e instanceof ErrorPersonas ? e.codigo : null)}`));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={detalle || undefined}
      ancho={560}
      primario={{
        etiqueta: t('enviar'),
        onClick: () => void enviar(),
        cargando: enviando,
        deshabilitada: !sim || !!fallo || cargando || enviando,
        motivo: !datos ? t('faltanFechas') : fallo ? te(`errores.${claveError(fallo)}`) : undefined,
      }}
    >
      <div className="flex flex-col gap-4">
        {paraAlguien ? (
          <FormField etiqueta={t('persona')} obligatorio>
            {(c) => <SelectorPersona id={c.id} valor={vinculo} onCambiar={(v) => setVinculo(v)} empleados={empleados} />}
          </FormField>
        ) : null}

        <Saldos sim={sim} cargando={cargando && !sim} hoy={hoy} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('desde')} obligatorio>
            <CampoFecha valor={desde} onValorChange={(d) => { setDesde(d); if (hasta && d && hasta < d) setHasta(''); }} hoy={hoy} min={hoy} required />
          </FormField>
          <FormField etiqueta={t('hasta')} obligatorio>
            <CampoFecha valor={hasta} onValorChange={setHasta} hoy={hoy} min={desde || hoy} required />
          </FormField>
        </div>

        {datos && cargando && !sim ? <Skeleton className="h-32 w-full" /> : null}
        {sim ? <Desglose sim={sim} /> : null}

        {fallo ? <AvisoTonal tono="peligro" rol="alert" titulo={te(`errores.${claveError(fallo)}`)} /> : null}

        {sim && sim.cruces.length > 0 ? (
          <AvisoTonal
            tono="advertencia"
            icono={TriangleAlert}
            titulo={t('cruce', {
              nombres: sim.cruces.map((c) => c.nombre ?? '—').join(', '),
              area: sim.area ?? '—',
              rango: f.rangoCorto(
                sim.cruces.reduce((m, c) => (c.desde > m ? c.desde : m), sim.desde),
                sim.cruces.reduce((m, c) => (c.hasta < m ? c.hasta : m), sim.hasta)
              ),
            })}
            descripcion={t('cruceNoBloquea')}
          />
        ) : null}

        {sim && !fallo ? <Aprobadores sim={sim} /> : null}
      </div>
    </Dialogo>
  );
}

function Saldos({ sim, cargando, hoy }: { sim: Simulacion | null; cargando: boolean; hoy: string }) {
  const t = useTranslations('hrmAusencias.solicitar');
  const f = useFechas();
  const saldo = sim?.saldo ?? null;
  const quedan = saldo ? saldo.disponibles - (sim?.dias_habiles ?? 0) : null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-line p-3">
        <p className="text-xs text-fg-secondary">{t('saldoDisponible')}</p>
        {cargando ? <Skeleton className="mt-1 h-7 w-20" /> : <p className="text-xl font-semibold tabular-nums text-fg">{saldo ? t('nDias', { n: f.dias(saldo.disponibles) }) : '—'}</p>}
        <p className="text-xs text-fg-secondary">{t('habilesAl', { fecha: f.corta(saldo?.fecha ?? hoy) })}</p>
      </div>
      <div className="rounded-lg border border-line p-3">
        <p className="text-xs text-fg-secondary">{t('quedanDespues')}</p>
        <p className={quedan !== null && quedan < 0 ? 'text-xl font-semibold tabular-nums text-danger-text' : 'text-xl font-semibold tabular-nums text-fg'}>
          {quedan === null ? '—' : t('nDias', { n: f.dias(quedan) })}
        </p>
      </div>
    </div>
  );
}

/** Días calendario − no laborables − festivos = hábiles; y el regreso. */
export function Desglose({ sim }: { sim: Simulacion }) {
  const t = useTranslations('hrmAusencias.solicitar');
  const f = useFechas();
  const soloDomingos = sim.no_laborables.every((d) => diaDeSemana(d) === 0);
  const lista = (dias: string[]) => dias.map((d) => f.sinAnio(d)).join(', ');
  return (
    <div className="rounded-lg bg-subtle px-3 py-2">
      <ListaDatos>
        <FilaDato etiqueta={t('diasCalendario')} valor={f.dias(sim.dias_calendario)} />
        {sim.no_laborables.length > 0 ? (
          <FilaDato
            etiqueta={soloDomingos ? t('domingos') : t('noLaborables')}
            valor={t('menos', { n: sim.no_laborables.length, lista: lista(sim.no_laborables) })}
          />
        ) : null}
        {sim.festivos.length > 0 ? (
          <FilaDato etiqueta={t('festivos')} valor={t('menos', { n: sim.festivos.length, lista: lista(sim.festivos.map((x) => x.fecha)) })} />
        ) : null}
        <FilaDato etiqueta={t('habilesDescuentan')} tono="fuerte" valor={f.dias(sim.dias_habiles)} />
        <FilaDato etiqueta={t('regresa')} valor={f.diaLargo(sim.regresa)} />
      </ListaDatos>
    </div>
  );
}

/** «Aprueba Martha Lucía Rojas, su jefe directa. Después también Recursos humanos.» */
export function Aprobadores({ sim }: { sim: Pick<Simulacion, 'pasos' | 'estado'> }) {
  const t = useTranslations('hrmAusencias.solicitar');
  if (sim.estado === 'approved') return <p className="text-sm text-fg-secondary">{t('quedaRegistrada')}</p>;
  const primero = sim.pasos[0];
  if (!primero) return <p className="text-sm text-fg-secondary">{t('sinAprobador')}</p>;
  const nombres = primero.aprobadores.filter(Boolean).join(', ');
  const texto =
    primero.tipo === 'jefe_directo' ? t('apruebaJefe', { nombre: nombres || '—' }) : primero.tipo === 'rrhh' || primero.respaldo ? t('apruebaRrhh') : t('aprueba', { nombre: nombres || '—' });
  return (
    <p className="text-sm text-fg-secondary">
      {texto}
      {requiereRrhh({ pasos: sim.pasos }) ? ` ${t('tambienRrhh')}` : ''}
    </p>
  );
}
