'use client';

import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import type { ReglasPlan } from '@/lib/services/membresias/tipos';
import { nombreDiaIso } from '@/components/inventario/productos/logica/membresiaProducto';
import { textoDias, textoFranja } from './logicaPlanes';

/**
 * Textos de las reglas de un plan (listado y detalle), en el idioma activo: duración, cobro,
 * acceso (sedes · días · franja), congelamientos, activación, gracia y límite diario.
 */
export function useTextosPlan(nombreSede: ReadonlyMap<number, string>) {
  const tDur = useTranslations('membresias.duracion');
  const t = useTranslations('membresias.planes');
  const tr = useTranslations('membresias.plan.reglas');
  const locale = useLocaleIntl();

  const duracion = useCallback((r: ReglasPlan) => tDur(r.durationUnit, { n: r.durationValue }), [tDur]);
  const cobroCorto = useCallback((r: ReglasPlan) => t(`cobroCorto.${r.billingMode}`), [t]);

  const sedes = useCallback(
    (r: ReglasPlan, detallado = false) => {
      const ids = r.allowedBranchIds ?? [];
      if (ids.length === 0) return t('acceso.todas');
      if (ids.length === 1 || detallado) {
        const nombres = ids.map((id) => nombreSede.get(id));
        if (nombres.every(Boolean)) return nombres.join(' · ');
      }
      return t('acceso.sedes', { n: ids.length });
    },
    [nombreSede, t],
  );

  const horario = useCallback(
    (r: ReglasPlan) => {
      const s = r.accessSchedule;
      if (!s) return null;
      const dias = textoDias(s.dias, (d) => nombreDiaIso(d, locale));
      const franja = textoFranja(s);
      const partes = [dias, franja].filter(Boolean);
      return partes.length > 0 ? partes.join(' ') : null;
    },
    [locale],
  );

  /** «2 sedes · lun–vie 05:00–10:00» / «Todas · todo el día». */
  const acceso = useCallback((r: ReglasPlan) => `${sedes(r)} · ${horario(r) ?? t('acceso.todoElDia')}`, [sedes, horario, t]);

  const congelamientos = useCallback(
    (r: ReglasPlan) => {
      if (!r.freezeAllowed) return tr('congelarNo');
      const veces = r.freezeMaxTimes !== null ? tr('congelarVeces', { n: r.freezeMaxTimes }) : tr('congelarSinTopeVeces');
      const dias = r.freezeMaxDays !== null ? tr('congelarDias', { n: r.freezeMaxDays }) : tr('congelarSinTopeDias');
      return `${veces} · ${dias}`;
    },
    [tr],
  );

  const activacion = useCallback(
    (r: ReglasPlan) => {
      if (!r.requiresActivation) return tr('activacionNo');
      return r.activationWindowDays !== null ? tr('activacionSiVentana', { n: r.activationWindowDays }) : tr('activacionSi');
    },
    [tr],
  );

  const gracia = useCallback((r: ReglasPlan) => tr('graciaValor', { n: r.graceDays }), [tr]);
  const limite = useCallback(
    (r: ReglasPlan) => (r.dailyCheckinLimit !== null ? tr('limiteValor', { n: r.dailyCheckinLimit }) : tr('limiteSin')),
    [tr],
  );

  return useMemo(
    () => ({ duracion, cobroCorto, sedes, horario, acceso, congelamientos, activacion, gracia, limite }),
    [duracion, cobroCorto, sedes, horario, acceso, congelamientos, activacion, gracia, limite],
  );
}
