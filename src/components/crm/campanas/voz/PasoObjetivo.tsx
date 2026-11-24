'use client';

import { CalendarDays, FileText, RefreshCw, Target, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/kit/FormField';
import { TarjetaSeleccionable } from '@/components/kit/TarjetaSeleccionable';
import { NOMBRE_MAX, OBJETIVOS_CAMPANA, type ErrorPaso, type FormAsistente, type ObjetivoCampana } from './asistenteVozLogica';
import { QuePasaEnCrm } from './FlujoResultadoCrm';

const ICONOS: Record<ObjetivoCampana, LucideIcon> = {
  reuniones: CalendarDays,
  calificar: Target,
  seguimiento: FileText,
  reactivar: RefreshCw,
};

/** Paso 1 · Objetivo (Figma 1680:859620). */
export function PasoObjetivo({
  form,
  cambiar,
  errores,
}: {
  form: FormAsistente;
  cambiar: (p: Partial<FormAsistente>) => void;
  errores: ErrorPaso[];
}) {
  const t = useTranslations('crm.campanaVozAsistente.objetivo');
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
        <FormField etiqueta={t('nombre')} obligatorio error={errores.includes('nombre') ? t('errores.nombre') : null}>
          <Input value={form.name} maxLength={NOMBRE_MAX} placeholder={t('nombrePlaceholder')} onChange={(e) => cambiar({ name: e.target.value })} />
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-medium leading-[18px] text-fg">{t('pregunta')}</legend>
          <div role="radiogroup" aria-label={t('pregunta')} className="grid gap-3 sm:grid-cols-2">
            {OBJETIVOS_CAMPANA.map((g) => (
              <TarjetaSeleccionable
                key={g}
                orientacion="horizontal"
                icono={ICONOS[g]}
                titulo={t(`goals.${g}.titulo`)}
                descripcion={t(`goals.${g}.descripcion`)}
                seleccionada={form.goal === g}
                onSeleccionar={() => cambiar({ goal: g })}
              />
            ))}
          </div>
          {errores.includes('objetivo') && (
            <p role="alert" className="text-xs text-danger-text">
              {t('errores.objetivo')}
            </p>
          )}
        </fieldset>
        <FormField etiqueta={t('instruccion')} ayuda={t('instruccionAyuda')}>
          <Input value={form.instruccion} maxLength={500} placeholder={t('instruccionPlaceholder')} onChange={(e) => cambiar({ instruccion: e.target.value })} />
        </FormField>
      </section>
      <QuePasaEnCrm />
    </div>
  );
}
