'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, ChipsOpcion, Dialogo } from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import type { ClavePolitica, ConfiguracionEstados, PoliticasFlujo } from '@/lib/finanzas/estados/tipos';
import { ErrorServidor, guardarConfiguracionEstados, leerConfiguracionEstados } from './clienteEstados';

const OPCIONES: Record<ClavePolitica, readonly string[]> = {
  intereses_pagados: ['operacion', 'financiacion'],
  intereses_recibidos: ['operacion', 'inversion'],
  dividendos_recibidos: ['operacion', 'inversion'],
  dividendos_pagados: ['financiacion', 'operacion'],
  impuestos: ['operacion'],
};
const CLAVES = Object.keys(OPCIONES) as ClavePolitica[];

/** Políticas de intereses, impuestos y dividendos: las decide el Contador (NIIF para pymes 7.14 a 7.17). */
export function PoliticasFlujoDialogo({
  abierto,
  puedeEditar,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  puedeEditar: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const t = useTranslations('estadosFinancieros.politicas');
  const [config, setConfig] = useState<ConfiguracionEstados | null>(null);
  const [politicas, setPoliticas] = useState<PoliticasFlujo | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    leerConfiguracionEstados()
      .then((c) => { if (vigente) { setConfig(c); setPoliticas(c.politicas); } })
      .catch((error) => { console.error('No se pudieron leer las políticas:', error); });
    return () => { vigente = false; };
  }, [abierto]);

  const guardar = async () => {
    if (!config || !politicas) return;
    setGuardando(true);
    try {
      await guardarConfiguracionEstados({ version: config.version, politicas_flujo: politicas, confirmar_politicas: true });
      toastSuccess(t('guardado'));
      onGuardado();
    } catch (error) {
      console.error('No se pudieron guardar las políticas:', error);
      toastError(t(error instanceof ErrorServidor && error.codigo === 'version_obsoleta' ? 'versionObsoleta' : 'error'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(a) => { if (!a) onCerrar(); }}
      titulo={t('titulo')}
      descripcion={t('detalle')}
      primario={{
        etiqueta: t('confirmar'),
        onClick: () => void guardar(),
        cargando: guardando,
        deshabilitada: !puedeEditar || !politicas,
        motivo: puedeEditar ? undefined : t('sinPermiso'),
      }}
      ancho={560}
    >
      <div className="space-y-4">
        {config && !config.politicasConfirmadas && (
          <AvisoTonal tono="advertencia" compacto titulo={t('sinConfirmar')} />
        )}
        {politicas && CLAVES.map((clave) => (
          <div key={clave} className="space-y-1">
            <p className="text-sm font-medium text-fg">{t(`clave.${clave}`)}</p>
            <ChipsOpcion
              etiqueta={t(`clave.${clave}`)}
              opciones={OPCIONES[clave].map((v) => ({ valor: v, etiqueta: t(`valor.${v}`) }))}
              valor={politicas[clave]}
              onValorChange={(v) => { if (puedeEditar) setPoliticas({ ...politicas, [clave]: v }); }}
            />
            <p className="text-xs text-fg-secondary">{t(`nota.${clave}`)}</p>
          </div>
        ))}
      </div>
    </Dialogo>
  );
}
