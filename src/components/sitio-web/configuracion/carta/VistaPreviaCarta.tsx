'use client';

/**
 * Vista previa de la carta (F-flujos/1 paso 4; la carta pública de B/13-05
 * dentro del marco de dispositivo): «Ver como» por sede, día y hora, en
 * escritorio o celular. Lo que se ve lo decide la MISMA RPC del sitio público
 * (`get_public_menu`), con la hora leída en la zona de la organización.
 */
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Monitor, Smartphone, UtensilsCrossed } from 'lucide-react';
import { AvisoTonal, CampoFecha, EmptyState, FormField, SegmentedControl } from '@/components/kit';
import { CampoHora } from '@/components/kit/CampoHora';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { MarcoSitioWeb } from '../../MarcoSitioWeb';
import { DevicePreviewFrame } from '../../ui/DevicePreviewFrame';
import { useTextosConfiguracion } from '../textos';
import { CartaPublicaVista } from './CartaPublicaVista';
import { RUTA_CARTA } from './rutasCarta';
import { useVistaPreviaCarta } from './useCarta';

export function VistaPreviaCarta() {
  const t = useTextosConfiguracion();
  const params = useSearchParams();
  const { getToday } = useFormatDate();
  const sedeInicial = Number(params?.get('sede'));
  const menu = params?.get('menu') ?? null;
  const [sedeId, setSedeId] = useState<number | null>(Number.isInteger(sedeInicial) && sedeInicial > 0 ? sedeInicial : null);
  const [fecha, setFecha] = useState<string>(getToday());
  const [hora, setHora] = useState<string>('12:30');
  const [dispositivo, setDispositivo] = useState<'escritorio' | 'celular'>('celular');
  const v = useVistaPreviaCarta({ sedeId, fecha, hora });
  const d = v.datos;
  // Con `?menu=` la carta elegida va primero (las demás vigentes siguen como pestañas).
  const cartas = d ? [...d.cartas].sort((a, b) => (a.id === menu ? -1 : b.id === menu ? 1 : 0)) : [];

  const vista = () => {
    if (v.fallo === 'sin_permiso') return <EmptyState variante="forbidden" titulo={t('carta.sinPermisoTitulo')} descripcion={t('carta.sinPermisoDescripcion')} />;
    if (v.fallo) return <EmptyState variante="error" titulo={t('carta.errorTitulo')} descripcion={t('carta.errorDescripcion')} onReintentar={() => void v.recargar()} />;
    if (v.cargando || !d) return <Skeleton className="mx-auto h-[640px] w-full max-w-sm rounded-2xl" />;
    if (!d.disponible) return <AvisoTonal tono="informacion" titulo={t('vistaPrevia.noDisponible')} />;
    return (
      <DevicePreviewFrame dispositivo={dispositivo} host={d.host}>
        <div className="min-h-full bg-surface p-4">
          {cartas.length === 0 ? (
            <EmptyState variante="empty" icono={UtensilsCrossed} titulo={t('vistaPrevia.sinCarta')} descripcion={t('vistaPrevia.sinCartaDescripcion')} compacto />
          ) : (
            <CartaPublicaVista
              t={t}
              cartas={cartas}
              moneda={d.moneda}
              conPedir
              encabezado={{ titulo: [t('vistaPrevia.tuMarca'), d.sede?.nombre].filter(Boolean).join(' · ') }}
            />
          )}
        </div>
      </DevicePreviewFrame>
    );
  };

  return (
    <MarcoSitioWeb
      href={`${RUTA_CARTA}/vista-previa`}
      titulo={t('vistaPrevia.titulo')}
      migasPadre={[{ etiqueta: t('carta.titulo'), href: RUTA_CARTA }]}
      subtitulo={d?.zonaHoraria}
      sinVerSitio
      nombreContenido={t('vistaPrevia.nombreContenido')}
    >
      <div className="flex flex-col gap-4 lg:gap-6">
        <section aria-label={t('vistaPrevia.verComo')} className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-surface p-4">
          <FormField etiqueta={t('vistaPrevia.sede')} className="w-full sm:w-52">
            {(campo) => (
              <Select value={d?.sede ? String(d.sede.id) : ''} onValueChange={(x) => setSedeId(Number(x))}>
                <SelectTrigger className="h-10 rounded-lg" aria-labelledby={campo.idEtiqueta}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(d?.sedes ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('vistaPrevia.dia')}>
            <CampoFecha valor={fecha} onValorChange={(x) => x && setFecha(x)} hoy={getToday()} limpiable={false} />
          </FormField>
          <FormField etiqueta={t('vistaPrevia.hora')}>
            <CampoHora valor={hora} onValorChange={setHora} paso={15} />
          </FormField>
          <FormField etiqueta={t('vistaPrevia.dispositivo')}>
            {(campo) => (
              <SegmentedControl
                aria-labelledby={campo.idEtiqueta}
                opciones={[
                  { valor: 'escritorio', etiqueta: t('vistaPrevia.escritorio'), icono: Monitor },
                  { valor: 'celular', etiqueta: t('vistaPrevia.celular'), icono: Smartphone },
                ]}
                valor={dispositivo}
                onValorChange={setDispositivo}
              />
            )}
          </FormField>
        </section>
        {vista()}
      </div>
    </MarcoSitioWeb>
  );
}
