'use client';

/**
 * Diálogos de mantenimiento de una ausencia (menús de fila de 20.13 y 20.14):
 * «Anular» (con motivo, `ConfirmDialog` destructivo del kit: `DialogoMotivo`) e
 * «Interrumpir vacaciones» (último día disfrutado y motivo; devuelve los días).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Ban, Pause } from 'lucide-react';
import { CampoFecha, DialogoMotivo, FormField } from '@/components/kit';
import { addPlainDays } from '@/lib/utils/dateCore';
import { ErrorPersonas } from '../personas/apiPersonas';
import { cancelarAusencia, interrumpirVacaciones } from './apiAusencias';
import type { FilaAusencia } from './ausenciasLogica';
import { useFechas } from './piezasAusencias';
import { claveError } from './useSimulacion';

type Objetivo = Pick<FilaAusencia, 'id' | 'nombre' | 'desde' | 'hasta' | 'tipo_nombre'>;

export function DialogoAnular({ fila, onCerrar, onHecho }: { fila: Objetivo | null; onCerrar: () => void; onHecho: () => void }) {
  const t = useTranslations('hrmAusencias.anular');
  const te = useTranslations('hrmAusencias');
  const f = useFechas();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!fila) return null;
  return (
    <DialogoMotivo
      abierto
      onAbiertoChange={(v) => {
        if (!v) {
          setError(null);
          onCerrar();
        }
      }}
      icono={Ban}
      titulo={t('titulo')}
      descripcion={t('descripcion', { nombre: fila.nombre ?? '—', tipo: fila.tipo_nombre ?? t('ausencia'), rango: f.rango(fila.desde, fila.hasta) })}
      textoConfirmar={t('confirmar')}
      consecuencias={[t('consecuenciaTurnos'), t('consecuenciaAprobacion')]}
      cargando={cargando}
      error={error}
      onConfirmar={async (motivo) => {
        setCargando(true);
        try {
          await cancelarAusencia(fila.id, motivo);
          toast.success(t('hecho'));
          onHecho();
          onCerrar();
        } catch (e) {
          setError(te(`errores.${claveError(e instanceof ErrorPersonas ? e.codigo : null)}`));
        } finally {
          setCargando(false);
        }
      }}
    />
  );
}

export function DialogoInterrumpir({ fila, hoy, onCerrar, onHecho }: { fila: Objetivo | null; hoy: string; onCerrar: () => void; onHecho: () => void }) {
  const t = useTranslations('hrmAusencias.interrumpir');
  const te = useTranslations('hrmAusencias');
  const f = useFechas();
  const [ultimo, setUltimo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!fila) return null;
  const max = addPlainDays(fila.hasta, -1);
  return (
    <DialogoMotivo
      abierto
      onAbiertoChange={(v) => {
        if (!v) {
          setUltimo('');
          setError(null);
          onCerrar();
        }
      }}
      icono={Pause}
      destructiva={false}
      titulo={t('titulo')}
      descripcion={t('descripcion', { nombre: fila.nombre ?? '—', rango: f.rango(fila.desde, fila.hasta) })}
      textoConfirmar={t('confirmar')}
      cargando={cargando}
      bloqueo={ultimo ? null : t('eligeDia')}
      error={error}
      onConfirmar={async (motivo) => {
        setCargando(true);
        try {
          const r = await interrumpirVacaciones(fila.id, ultimo, motivo);
          toast.success(t('hecho', { n: f.dias(r.dias_devueltos) }));
          onHecho();
          onCerrar();
        } catch (e) {
          setError(te(`errores.${claveError(e instanceof ErrorPersonas ? e.codigo : null)}`));
        } finally {
          setCargando(false);
        }
      }}
    >
      <FormField etiqueta={t('ultimoDia')} obligatorio ayuda={t('ultimoDiaAyuda')}>
        <CampoFecha valor={ultimo} onValorChange={setUltimo} min={fila.desde} max={max} hoy={hoy} required />
      </FormField>
    </DialogoMotivo>
  );
}
