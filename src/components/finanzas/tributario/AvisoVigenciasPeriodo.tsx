'use client';

/**
 * Aviso «cambio de vigencia dentro del período — revisar procedencia» (P8 del
 * Contador) para cualquier pantalla de un periodo tributario (hoy, el borrador
 * del IVA). No decide qué vigencia aplica: lista las que tocan el periodo y
 * lleva al perfil. También avisa si parte del periodo no tiene perfil.
 * Si la lectura falla, no muestra nada (el borrador sigue siendo un borrador).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { AnalisisPeriodo } from '@/lib/finanzas/tributario/vigenciasPeriodo';
import { tributarioCliente, RUTAS_TRIBUTARIO } from './tributarioCliente';

export function AvisoVigenciasPeriodo({ desde, hasta }: { desde: string; hasta: string }) {
  const t = useTranslations('finanzasTributarioR4.perfil.periodo');
  const tp = useTranslations('finanzasTributarioR4.perfil');
  const { formatPlain } = useFormatDate();
  const [analisis, setAnalisis] = useState<AnalisisPeriodo | null>(null);

  useEffect(() => {
    let vivo = true;
    setAnalisis(null);
    if (!desde || !hasta) return;
    tributarioCliente
      .vigenciasPeriodo(desde, hasta)
      .then((r) => {
        if (vivo) setAnalisis(r.analisis);
      })
      .catch(() => {
        if (vivo) setAnalisis(null);
      });
    return () => {
      vivo = false;
    };
  }, [desde, hasta]);

  if (!analisis || (!analisis.cambioDeVigencia && !analisis.sinPerfilCompleto)) return null;

  const lista = analisis.vigencias.map((v) => {
    const rango = v.vigenteHasta ? t('rango', { desde: formatPlain(v.vigenteDesde), hasta: formatPlain(v.vigenteHasta) }) : t('desde', { desde: formatPlain(v.vigenteDesde) });
    const renta = v.regimenRenta ? tp(`regimenRenta.${v.regimenRenta}`) : tp('campos.sinDefinir');
    const iva = v.condicionIva ? tp(`condicionIva.${v.condicionIva}`) : tp('campos.sinDefinir');
    return `${rango}: ${renta} · ${iva} · ${tp(`periodicidadIva.${v.periodicidadIva}`)}`;
  });

  return (
    <AvisoTonal
      tono="advertencia"
      titulo={analisis.cambioDeVigencia ? t('cambioTitulo') : t('sinPerfilTitulo')}
      descripcion={
        <>
          <p>{analisis.cambioDeVigencia ? t('cambioDescripcion') : t('sinPerfilDescripcion')}</p>
          {lista.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {lista.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </>
      }
      accion={{ etiqueta: t('irPerfil'), href: RUTAS_TRIBUTARIO.perfil }}
    />
  );
}
