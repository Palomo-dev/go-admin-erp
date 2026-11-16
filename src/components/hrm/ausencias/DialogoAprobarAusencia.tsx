'use client';

/**
 * Aprobar una solicitud de vacaciones o un permiso (Figma 20.13.4,
 * `96-hrm-f2-13-04-*`, y menú de Permisos 20.14.8): el cruce del equipo, el saldo
 * antes y después, lo que se descuenta y quién aprueba. Si el actor no decide en
 * este paso, el diálogo es solo de lectura. La decisión va por la ruta de siempre
 * (`POST /api/hrm/aprobaciones/[id]`): nadie aprueba lo propio y rechazar pide comentario.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import { AvisoTonal, Dialogo, FilaDato, FormField, ListaDatos } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ErrorPersonas, decidirAprobacion } from '../personas/apiPersonas';
import { cruceDeFila, horasEntre, requiereRrhh, type Festivo, type FilaAusencia } from './ausenciasLogica';
import { useFechas } from './piezasAusencias';

export interface DialogoAprobarAusenciaProps {
  fila: FilaAusencia | null;
  festivos: readonly Festivo[];
  onCerrar: () => void;
  onResuelta: () => void;
  /** Abre directo con «Rechazar» a la vista (menú «Rechazar» de Permisos). */
  enfoque?: 'aprobar' | 'rechazar';
}

export function DialogoAprobarAusencia({ fila, festivos, onCerrar, onResuelta, enfoque = 'aprobar' }: DialogoAprobarAusenciaProps) {
  const t = useTranslations('hrmAusencias.aprobar');
  const ta = useTranslations('hrmAusencias');
  const f = useFechas();
  const { formatDate } = useFormatDate();
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState<null | 'aprobar' | 'rechazar'>(null);

  useEffect(() => {
    setComentario('');
  }, [fila?.id]);

  if (!fila) return null;
  const a = fila.aprobacion;
  const puede = !!a?.puede_decidir;
  const vacaciones = fila.seccion === 'vacaciones';
  const cruce = cruceDeFila(fila);
  const habiles = Number(fila.dias_habiles ?? fila.dias_calendario);
  const festivosEn = festivos.filter((x) => x.fecha >= fila.desde && x.fecha <= fila.hasta);
  const paso = a?.pasos.find((p) => p.orden === a.paso_actual);
  const quien = !a
    ? t('sinAprobacion')
    : paso?.soy_yo
      ? `${paso.tipo === 'jefe_directo' ? t('tuJefe') : t('tu')} · ${requiereRrhh(a) && paso.orden === 1 ? t('despuesRrhh') : t('noRequiereRrhh')}`
      : (paso?.aprobadores.filter(Boolean).join(', ') || '—');

  const decidir = async (accion: 'aprobar' | 'rechazar') => {
    if (!a) return;
    setEnviando(accion);
    try {
      const r = await decidirAprobacion(a.id, accion, comentario.trim() || null);
      toast.success(accion === 'rechazar' ? t('rechazada') : r.status === 'aprobada' ? t('aprobada') : t('siguientePaso'));
      onResuelta();
      onCerrar();
    } catch (e) {
      const c = e instanceof ErrorPersonas ? e.codigo : '';
      toast.error(c === 'no_puede_aprobar_lo_propio' ? t('loPropio') : e instanceof ErrorPersonas && e.status === 409 ? t('yaResuelta') : ta('errores.generico'));
    } finally {
      setEnviando(null);
    }
  };

  const cuando = fila.horas
    ? t('rangoHoras', { dia: f.corta(fila.desde), inicio: fila.horas.inicio, fin: fila.horas.fin, horas: f.dias(horasEntre(fila.horas.inicio, fila.horas.fin)) })
    : f.rango(fila.desde, fila.hasta);

  return (
    <Dialogo
      abierto
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={vacaciones ? t('tituloVacaciones', { nombre: fila.nombre ?? '—' }) : t('tituloPermiso', { nombre: fila.nombre ?? '—' })}
      descripcion={[cuando, vacaciones ? t('nHabiles', { n: f.dias(habiles) }) : null, t('pidio', { fecha: formatDate(fila.creado) })].filter(Boolean).join(' · ')}
      ancho={560}
      primario={
        puede
          ? { etiqueta: t('aprobar'), onClick: () => void decidir('aprobar'), cargando: enviando === 'aprobar', deshabilitada: enviando !== null }
          : { etiqueta: ta('cerrar'), onClick: onCerrar }
      }
      secundarios={
        puede
          ? [
              {
                etiqueta: t('rechazar'),
                destructiva: true,
                onClick: () => void decidir('rechazar'),
                cargando: enviando === 'rechazar',
                deshabilitada: !comentario.trim() || enviando !== null,
                motivo: t('comentarioObligatorio'),
              },
            ]
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {cruce ? (
          <AvisoTonal
            tono="advertencia"
            icono={TriangleAlert}
            titulo={t('cruceTitulo', {
              area: fila.area ?? '—',
              quedan: Math.max(fila.area_personas - 1 - (fila.cruces?.length ?? 0), 0),
              total: fila.area_personas,
              rango: f.rangoCorto(cruce.desde, cruce.hasta),
            })}
            descripcion={t('cruceDetalle', { nombres: (fila.cruces ?? []).map((c) => c.nombre ?? '—').join(', ') })}
          />
        ) : null}
        <ListaDatos>
          {vacaciones && fila.saldo_despues !== null ? <FilaDato etiqueta={t('saldoAntes')} valor={t('nHabiles', { n: f.dias(fila.saldo_despues + habiles) })} /> : null}
          {vacaciones ? (
            <FilaDato
              etiqueta={t('seDescuentan')}
              tono="fuerte"
              valor={
                festivosEn.length > 0
                  ? t('descuentaConFestivo', { n: f.dias(habiles), dias: festivosEn.map((x) => f.sinAnio(x.fecha)).join(', ') })
                  : t('nHabiles', { n: f.dias(habiles) })
              }
            />
          ) : (
            <FilaDato etiqueta={t('remunerado')} valor={fila.remunerado ? t('si') : fila.se_repone ? t('noSeRepone') : t('no')} />
          )}
          {vacaciones && fila.saldo_despues !== null ? <FilaDato etiqueta={t('saldoDespues')} valor={t('nHabiles', { n: f.dias(fila.saldo_despues) })} /> : null}
          {fila.motivo ? <FilaDato etiqueta={t('motivo')} valor={fila.motivo} /> : null}
          <FilaDato etiqueta={t('quienAprueba')} valor={quien} />
        </ListaDatos>
        {puede ? (
          <FormField etiqueta={t('comentario')} ayuda={enfoque === 'rechazar' ? t('comentarioObligatorio') : undefined}>
            <Input value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={2000} className="h-10" autoFocus={enfoque === 'rechazar'} />
          </FormField>
        ) : null}
      </div>
    </Dialogo>
  );
}
