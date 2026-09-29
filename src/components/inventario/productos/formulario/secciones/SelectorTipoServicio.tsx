'use client';

import { BookOpen, CalendarClock, CalendarDays, Info, Tag, Ticket, TriangleAlert, UserCheck, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/kit';
import { TIPOS_SERVICIO, type TipoServicio } from '../../logica/membresiaProducto';
import type { PropsSeccionFormulario } from '../tipos';
import { TarjetasOpcion } from './TarjetasOpcion';

const ICONO: Record<TipoServicio, LucideIcon> = {
  standard: Tag,
  membership: UserCheck,
  session_pack: Ticket,
  class: CalendarClock,
  course: BookOpen,
  appointment: CalendarDays,
};

/**
 * «¿Qué tipo de servicio es?» (products.service_type), tras el selector Producto/Servicio
 * (Figma A1 978:605773). Solo «Membresía» abre configuración en esta fase; los demás se
 * guardan como tipo. Una membresía no lleva variantes: la tarjeta se bloquea con el motivo.
 */
export function SelectorTipoServicio({ estado, actualizar, errores, membresiasVivas = 0 }: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.informacion');
  const tErr = useTranslations('productoForm.errores');
  const conVivas = membresiasVivas > 0 && estado.service_type !== 'membership';

  return (
    <FormField
      etiqueta={t('tipoServicioPregunta')}
      ayuda={t('tipoServicioAyuda')}
      error={errores.service_type ? tErr(errores.service_type) : null}
      className="md:col-span-2"
    >
      {(campo) => (
        <div className="flex flex-col gap-3" id={campo.id} aria-invalid={campo['aria-invalid']}>
          <p className="flex items-start gap-2 text-xs text-fg-secondary">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
            {t('tipoServicioNota')}
          </p>
          <TarjetasOpcion
            aria-labelledby={campo.idEtiqueta}
            aria-describedby={campo['aria-describedby']}
            valor={estado.service_type}
            onValorChange={(v) => actualizar({ service_type: v })}
            opciones={TIPOS_SERVICIO.map((v) => ({
              valor: v,
              titulo: t(`tipoServicioOpciones.${v}.titulo`),
              descripcion: t(`tipoServicioOpciones.${v}.descripcion`),
              icono: ICONO[v],
              deshabilitada: v === 'membership' && estado.tiene_variantes && estado.service_type !== 'membership',
              motivo: t('tipoServicioConVariantes'),
            }))}
          />
          {conVivas && (
            <p role="status" className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-xs text-warning-text">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
              {t('tipoServicioConVivas', { n: membresiasVivas })}
            </p>
          )}
        </div>
      )}
    </FormField>
  );
}
