'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { Dialogo } from '@/components/kit/Dialogo';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { CampoHora } from '@/components/kit/CampoHora';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { WeekDay } from './types';
import { diasDelIdioma } from './diasPromocion';
import { PromotionsService } from './promotionsService';

/**
 * Edición masiva de días aplicables y franja horaria para varias
 * promociones a la vez. Cada bloque se activa con su casilla: lo que no se
 * marca no se toca. Pide confirmación antes de escribir y solo actualiza
 * promociones de la organización activa (ver `updateHorarioMasivo`).
 */
interface EdicionMasivaHorarioProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  ids: string[];
  onAplicado: () => void;
}

type ModoFranja = 'todo' | 'franja';

export function EdicionMasivaHorario({ abierto, onAbiertoChange, ids, onAplicado }: EdicionMasivaHorarioProps) {
  const t = useTranslations('posPromociones');
  const locale = useLocale();
  const diasSemana = diasDelIdioma(locale);
  const [cambiarDias, setCambiarDias] = useState(false);
  const [dias, setDias] = useState<WeekDay[]>([]);
  const [cambiarFranja, setCambiarFranja] = useState(false);
  const [modo, setModo] = useState<ModoFranja>('franja');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setCambiarDias(false);
    setDias([]);
    setCambiarFranja(false);
    setModo('franja');
    setInicio('');
    setFin('');
  }, [abierto]);

  const n = ids.length;
  const franjaIncompleta = cambiarFranja && modo === 'franja' && (!inicio || !fin);
  const sinCambios = !cambiarDias && !cambiarFranja;
  const motivo = sinCambios ? t('masivo.elegirAlgo') : franjaIncompleta ? t('masivo.franjaIncompleta') : undefined;
  const cruza = cambiarFranja && modo === 'franja' && inicio && fin && fin < inicio;

  const resumen = (): string => {
    const partes: string[] = [];
    if (cambiarDias) {
      partes.push(
        dias.length === 0
          ? t('masivo.resumenTodosLosDias')
          : diasSemana.filter((d) => dias.includes(d.value)).map((d) => d.corto).join(', '),
      );
    }
    if (cambiarFranja) partes.push(modo === 'todo' ? t('formulario.todoElDia') : `${inicio}–${fin}${cruza ? ` (${t('lista.diaSiguiente')})` : ''}`);
    return partes.join(' · ');
  };

  const aplicar = async () => {
    setGuardando(true);
    try {
      const cambiadas = await PromotionsService.updateHorarioMasivo(ids, {
        applicable_days: cambiarDias ? dias : undefined,
        franja: cambiarFranja
          ? modo === 'todo'
            ? { start_time: null, end_time: null }
            : { start_time: inicio, end_time: fin }
          : undefined,
      });
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
        descripcion={t('masivo.descripcion', { n })}
        icono={CalendarClock}
        ancho={560}
        textoCancelar={t('lista.cancelar')}
        primario={{
          etiqueta: t('masivo.continuar'),
          onClick: () => setConfirmando(true),
          deshabilitada: Boolean(motivo),
          motivo,
        }}
      >
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Checkbox id="masivo-cambiar-dias" checked={cambiarDias} onCheckedChange={(v) => setCambiarDias(v === true)} />
              <Label htmlFor="masivo-cambiar-dias" className="text-fg">{t('masivo.cambiarDias')}</Label>
            </div>
            {cambiarDias && (
              <div className="flex flex-col gap-1.5 pl-6">
                <ChipsOpcion<WeekDay>
                  multiple
                  etiqueta={t('masivo.cambiarDias')}
                  opciones={diasSemana.map((d) => ({ valor: d.value, etiqueta: d.largo }))}
                  valor={dias}
                  onValorChange={setDias}
                />
                <p className="text-[13px] leading-[18px] text-fg-secondary">{t('masivo.diasAyuda')}</p>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Checkbox id="masivo-cambiar-franja" checked={cambiarFranja} onCheckedChange={(v) => setCambiarFranja(v === true)} />
              <Label htmlFor="masivo-cambiar-franja" className="text-fg">{t('masivo.cambiarFranja')}</Label>
            </div>
            {cambiarFranja && (
              <div className="flex flex-col gap-3 pl-6">
                <SegmentedControl<ModoFranja>
                  etiqueta={t('masivo.cambiarFranja')}
                  opciones={[
                    { valor: 'franja', etiqueta: t('masivo.conHorario') },
                    { valor: 'todo', etiqueta: t('formulario.todoElDia') },
                  ]}
                  valor={modo}
                  onValorChange={setModo}
                />
                {modo === 'franja' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label id="masivo-hora-inicio" className="text-fg">{t('formulario.horaInicio')}</Label>
                      <CampoHora aria-labelledby="masivo-hora-inicio" valor={inicio} onValorChange={setInicio} paso={15} formato24h required />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label id="masivo-hora-fin" className="text-fg">{t('formulario.horaFin')}</Label>
                      <CampoHora aria-labelledby="masivo-hora-fin" valor={fin} onValorChange={setFin} paso={15} formato24h required />
                    </div>
                  </div>
                )}
                {cruza && <p className="text-[13px] leading-[18px] text-fg">{t('formulario.franjaCruzaMedianoche')}</p>}
              </div>
            )}
          </section>
        </div>
      </Dialogo>

      <ConfirmDialog
        abierto={confirmando}
        onAbiertoChange={(v) => { if (!v && !guardando) setConfirmando(false); }}
        titulo={t('masivo.confirmarTitulo', { n })}
        descripcion={t('masivo.confirmarDescripcion', { resumen: resumen() })}
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
