'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { Dialogo } from '@/components/kit/Dialogo';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { columnasDeHorario, horarioDesdeColumnas, validarHorario, type HorarioFormulario } from '@/lib/promotions/horarioPromocion';
import { diasDelIdioma } from './diasPromocion';
import { PromotionsService } from './promotionsService';
import { SelectorHorarioPromocion } from './horario/SelectorHorarioPromocion';
import { lineasHorario } from './horario/textoHorario';

/**
 * Edición masiva del horario de varias promociones a la vez. Usa el MISMO
 * control que el asistente («Cuándo está activa»): todo el día, mismo
 * horario cada día o franjas que cruzan días. El horario elegido reemplaza
 * el de cada promoción. Pide confirmación antes de escribir y solo
 * actualiza promociones de la organización activa (`updateHorarioMasivo`).
 */
interface EdicionMasivaHorarioProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  ids: string[];
  onAplicado: () => void;
}

const INICIAL: HorarioFormulario = horarioDesdeColumnas({});

export function EdicionMasivaHorario({ abierto, onAbiertoChange, ids, onAplicado }: EdicionMasivaHorarioProps) {
  const t = useTranslations('posPromociones');
  const locale = useLocale();
  const { timezone } = useOrgTimezone();
  const [horario, setHorario] = useState<HorarioFormulario>(INICIAL);
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setHorario(INICIAL);
    setMostrarErrores(false);
  }, [abierto]);

  const n = ids.length;
  const invalido = validarHorario(horario) !== null;
  const resumen = lineasHorario(columnasDeHorario(horario), t, diasDelIdioma(locale)).join(' · ');

  const aplicar = async () => {
    setGuardando(true);
    try {
      const cambiadas = await PromotionsService.updateHorarioMasivo(ids, columnasDeHorario(horario));
      toast.success(t('masivo.aplicado', { n: cambiadas }));
      if (cambiadas < n) toast.warning(t('masivo.parcial', { n: cambiadas, total: n }));
      setConfirmando(false);
      onAbiertoChange(false);
      onAplicado();
    } catch (error: unknown) {
      toast.error((error as { message?: string } | null)?.message || t('masivo.error'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Dialogo
        abierto={abierto && !confirmando}
        onAbiertoChange={(v) => { if (!guardando) onAbiertoChange(v); }}
        titulo={t('masivo.titulo')}
        descripcion={t('masivo.descripcionHorario', { n })}
        icono={CalendarClock}
        ancho={880}
        textoCancelar={t('lista.cancelar')}
        primario={{
          etiqueta: t('masivo.continuar'),
          onClick: () => {
            if (invalido) {
              setMostrarErrores(true);
              return;
            }
            setConfirmando(true);
          },
        }}
      >
        <SelectorHorarioPromocion
          valor={horario}
          onValorChange={setHorario}
          zona={timezone}
          mostrarErrores={mostrarErrores}
          idBase="masivo-horario"
        />
      </Dialogo>

      <ConfirmDialog
        abierto={confirmando}
        onAbiertoChange={(v) => { if (!v && !guardando) setConfirmando(false); }}
        titulo={t('masivo.confirmarTitulo', { n })}
        descripcion={t('masivo.confirmarDescripcion', { resumen })}
        textoConfirmar={t('masivo.aplicar', { n })}
        textoCancelar={t('lista.cancelar')}
        onConfirmar={aplicar}
        tono="marca"
        icono={CalendarClock}
        cargando={guardando}
      />
    </>
  );
}
