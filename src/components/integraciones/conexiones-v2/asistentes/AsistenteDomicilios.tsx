'use client';

/**
 * Rappi, Uber Eats e iFood (diseño 85-30…36): Tienda → Menú → Pedidos → Horario.
 *
 * Hoy NO existe conector con estas apps ni cuenta de aliado de GO Admin (la base no tiene
 * `integration_connectors` para ellas). El asistente recorre el flujo para que el cliente sepa
 * qué va a pasar, pero desde el primer paso dice que falta la cuenta de aliado; no pide llaves,
 * no guarda nada y el botón final queda deshabilitado. Nunca muestra éxito.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal } from '@/components/kit';
import type { ItemCatalogo } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { ListaNumerada, MarcoAsistente, type BotonMarco } from './MarcoAsistente';
import { pasoAnterior, pasoSiguiente, PASOS_DOMICILIOS, puedeActivarDomicilios, type PasoDomicilios } from './pasosLogica';
import { useNombreServicio } from './useNombreServicio';

export interface AsistenteDomiciliosProps {
  item: ItemCatalogo;
  abierto: boolean;
  onCerrar: () => void;
}

export function AsistenteDomicilios({ item, abierto, onCerrar }: AsistenteDomiciliosProps) {
  const t = useTranslations('integracionesConexiones');
  const nombre = useNombreServicio(item);
  const [paso, setPaso] = useState<PasoDomicilios>('tienda');
  const activable = puedeActivarDomicilios(item);

  useEffect(() => {
    if (!abierto) setPaso('tienda');
  }, [abierto]);

  const numero = PASOS_DOMICILIOS.indexOf(paso) + 1;
  const anterior = pasoAnterior(PASOS_DOMICILIOS, paso);
  const siguiente = pasoSiguiente(PASOS_DOMICILIOS, paso);
  const botones: BotonMarco[] = [
    anterior ? { etiqueta: t('comun.atras'), onClick: () => setPaso(anterior) } : { etiqueta: t('comun.cerrar'), onClick: onCerrar },
    siguiente
      ? { etiqueta: t('comun.siguiente'), onClick: () => setPaso(siguiente) }
      : { etiqueta: t('asistente.domicilios.activar'), onClick: () => undefined, deshabilitado: !activable, motivo: t('asistente.domicilios.disponibleCuando') },
  ];

  return (
    <MarcoAsistente
      abierto={abierto}
      onCerrar={onCerrar}
      servicioId={item.id}
      titulo={t('asistente.comun.titulo', { nombre })}
      subtitulo={t('asistente.comun.pasoDe', { n: numero, total: PASOS_DOMICILIOS.length, texto: t(`asistente.domicilios.subtitulos.${paso}`, { nombre }) })}
      pasos={PASOS_DOMICILIOS.map((p) => ({ valor: p, etiqueta: t(`asistente.domicilios.pasos.${p}`) }))}
      actual={paso}
      botones={botones}
    >
      <AvisoTonal
        tono="advertencia"
        rol="note"
        titulo={t('asistente.domicilios.sinCuenta.titulo', { nombre })}
        descripcion={t('asistente.domicilios.sinCuenta.descripcion', { nombre })}
      />
      <ListaNumerada items={[1, 2, 3].map((n) => t(`asistente.domicilios.explicacion.${paso}.p${n}`, { nombre }))} />
      {!siguiente && <p className="text-sm text-fg-secondary">{t('asistente.domicilios.disponibleCuando')}</p>}
    </MarcoAsistente>
  );
}
