'use client';

/**
 * «Revertir asiento» (Figma `983:67211` normal · `983:67354` periodo cerrado ·
 * `983:67493` ya revertido · `983:67562` resultado; móvil `989:76474`).
 *
 * Usa `ContabilidadService.revertirAsiento` → `fn_revertir_asiento_manual`:
 * reversa idempotente, permiso «Revertir asientos» y regla de fecha en la base.
 * La pantalla solo anticipa la fecha y los bloqueos con las mismas reglas
 * (`fn_is_period_open` del día del asiento y de hoy).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { DialogoMotivo, PanelAdaptable, ResultadoOperacion } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { bloqueoReversa, fechaContraAsiento } from '@/lib/finanzas/contabilidad/asientosLogica';
import { useNumeroAsiento } from '../piezas';
import { ContabilidadService, type JournalEntry } from '../ContabilidadService';

export interface RevertirAsientoDialogProps {
  asiento: JournalEntry;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  puedeRevertir: boolean;
  revertidoPor: number | null;
  /** Tras revertir (con contra-asiento o con la reversa pendiente). */
  onRevertido: () => void;
}

export function RevertirAsientoDialog({ asiento, abierto, onAbiertoChange, puedeRevertir, revertidoPor, onRevertido }: RevertirAsientoDialogProps) {
  const t = useTranslations('finanzasContabilidadR3.detalle.revertir');
  const tr = useTranslations('redondeoReversa.asiento');
  const router = useRouter();
  const numero = useNumeroAsiento();
  const { formatDate, toDate, getToday } = useFormatDate(asiento.branch_id);
  const [periodoAsiento, setPeriodoAsiento] = useState<boolean | null>(null);
  const [periodoHoy, setPeriodoHoy] = useState<boolean | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contraAsiento, setContraAsiento] = useState<number | null>(null);

  const diaAsiento = toDate(new Date(asiento.entry_date));
  const hoy = getToday();
  useEffect(() => {
    if (!abierto) return;
    setError(null);
    let vigente = true;
    Promise.all([ContabilidadService.periodoAbierto(diaAsiento), ContabilidadService.periodoAbierto(hoy)])
      .then(([a, h]) => {
        if (!vigente) return;
        setPeriodoAsiento(a);
        setPeriodoHoy(h);
      })
      .catch(() => {
        if (!vigente) return;
        setPeriodoAsiento(null);
        setPeriodoHoy(null);
      });
    return () => {
      vigente = false;
    };
  }, [abierto, diaAsiento, hoy]);

  const bloqueo = bloqueoReversa({ puedeRevertir, revertidoPor, periodoAsiento, periodoHoy });
  const textoBloqueo =
    bloqueo === 'yaRevertido'
      ? t('bloqueo.yaRevertido', { numero: numero(revertidoPor ?? 0) })
      : bloqueo === 'sinPermiso'
        ? t('bloqueo.sinPermiso')
        : bloqueo === 'periodoCerrado'
          ? t('bloqueo.periodoCerrado')
          : null;
  const fecha = fechaContraAsiento(periodoAsiento);
  const consecuencias = [
    t('consecuencias.invertido'),
    fecha === 'original'
      ? t('consecuencias.fechaOriginal', { fecha: formatDate(asiento.entry_date) })
      : fecha === 'hoy'
        ? t('consecuencias.fechaHoy', { fecha: formatDate(new Date()) })
        : t('consecuencias.fechaRegla'),
    t('consecuencias.original'),
  ];

  const confirmar = async (motivo: string) => {
    setEnviando(true);
    setError(null);
    try {
      const id = await ContabilidadService.revertirAsiento(asiento.id, motivo.trim());
      onAbiertoChange(false);
      if (id) {
        setContraAsiento(id);
      } else {
        toast.warning(tr('reversaPendiente'));
      }
      onRevertido();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <DialogoMotivo
        abierto={abierto}
        onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
        titulo={t('titulo', { numero: numero(asiento.id) })}
        descripcion={t('descripcion')}
        textoConfirmar={t('confirmar')}
        onConfirmar={confirmar}
        tituloConsecuencias={t('consecuencias.titulo')}
        consecuencias={consecuencias}
        motivosRapidos={[t('motivos.cuenta'), t('motivos.importe'), t('motivos.duplicado')]}
        etiquetaMotivo={t('motivo')}
        placeholder={t('motivoPlaceholder')}
        minimo={5}
        destructiva
        cargando={enviando}
        bloqueo={textoBloqueo}
        error={error}
        icono={Undo2}
      />
      <PanelAdaptable abierto={contraAsiento !== null} onAbiertoChange={(v) => !v && setContraAsiento(null)} titulo={t('resultado.titulo')} ancho={520}>
        {contraAsiento !== null && (
          <ResultadoOperacion
            titulo={t('resultado.creado', { numero: numero(contraAsiento) })}
            descripcion={t('resultado.descripcion', { numero: numero(asiento.id) })}
            primaria={{ etiqueta: t('resultado.ver'), onClick: () => router.push(`/app/finanzas/contabilidad/asientos/${contraAsiento}`) }}
            onCerrar={() => setContraAsiento(null)}
            textoCerrar={t('resultado.cerrar')}
            atajoCerrar={false}
          />
        )}
      </PanelAdaptable>
    </>
  );
}
