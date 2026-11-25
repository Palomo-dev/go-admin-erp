'use client';

/**
 * Mapa de la ruta en el celular (Figma «10»): las paradas numeradas sobre el mismo mapa Leaflet,
 * la parada elegida (de entrada, la actual) en su tarjeta y «Abrir la ruta en Google Maps» con
 * las pendientes en orden para navegar.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ExternalLink, MapPinOff } from 'lucide-react';
import { EmptyState, PageHeader, Skeleton, StatusBadge, clasesBoton } from '@/components/kit';
import { useBranch } from '@/lib/context/BranchContext';
import { agruparMisEnvios, enlaceRutaGoogleMaps, numeroParada, pinesRuta, resumenRuta, paradasDelFiltro } from '@/lib/logistica/misEnvios';
import { useMiRuta } from './useMiRuta';
import { MapaRutaDinamico } from './MapaRutaDinamico';
import { TarjetaParada } from './TarjetaParada';
import { RUTA_MIS_ENVIOS, rutaParada } from './rutas';

export function MapaRutaPantalla() {
  const t = useTranslations('logistica.misEnvios');
  const router = useRouter();
  const { branches } = useBranch();
  const { driver, envios, estado, recargar, hoy, zonaDe } = useMiRuta();
  const [elegida, setElegida] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const grupos = useMemo(() => agruparMisEnvios(envios, hoy, zonaDe), [envios, hoy, zonaDe]);
  const resumen = useMemo(() => resumenRuta(grupos, envios), [grupos, envios]);
  const pines = useMemo(() => pinesRuta(grupos), [grupos]);
  const enlace = enlaceRutaGoogleMaps(grupos.pendientes);
  const todas = paradasDelFiltro(grupos, 'todos');
  const actual = grupos.pendientes[0] ?? null;
  const parada = todas.find((e) => e.id === elegida) ?? actual;
  const sinCoordenadas = grupos.pendientes.filter((e) => !pines.some((p) => p.id === e.id)).length;
  const sede = driver ? branches.find((b) => b.id === (driver as { branch_id?: number | null }).branch_id) : null;
  const origen = sede?.latitude != null && sede?.longitude != null ? { lat: Number(sede.latitude), lng: Number(sede.longitude), nombre: sede.name } : null;
  const migas = [{ etiqueta: t('titulo'), href: RUTA_MIS_ENVIOS }];
  const subtitulo =
    resumen.estado === 'vacia' ? t('ruta.vacia') : t('mapa.subtitulo', { n: resumen.parada, total: resumen.totalParadas, pendientes: resumen.porEntregar });

  if (estado === 'sin_domiciliario' || estado === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-4 pb-28 sm:pt-6">
        <PageHeader titulo={t('mapa.titulo')} variante="form" migas={migas} volverA={RUTA_MIS_ENVIOS} />
        <EmptyState
          variante={estado === 'error' ? 'error' : 'forbidden'}
          compacto
          titulo={estado === 'error' ? t('error.titulo') : t('sinDomiciliario.titulo')}
          descripcion={estado === 'error' ? t('error.descripcion') : t('sinDomiciliario.descripcion')}
          onReintentar={estado === 'error' ? recargar : undefined}
        />
      </div>
    );
  }

  const numeroDe = (id: string) => {
    const i = grupos.pendientes.findIndex((e) => e.id === id);
    return i >= 0 ? numeroParada(i, resumen.entregados) : null;
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 pt-4 pb-28 sm:pt-6">
      <PageHeader
        titulo={t('mapa.titulo')}
        subtitulo={subtitulo}
        variante="form"
        migas={migas}
        volverA={RUTA_MIS_ENVIOS}
        cargando={estado === 'cargando'}
        badge={resumen.estado === 'en_ruta' ? <StatusBadge estado="en_ruta" etiqueta={t('ruta.estados.en_ruta')} tono="informacion" apariencia="contorno" /> : undefined}
      />

      {estado === 'cargando' ? (
        <Skeleton className="h-[55dvh] w-full rounded-xl" />
      ) : pines.length > 0 ? (
        <MapaRutaDinamico
          pines={pines}
          origen={origen}
          etiqueta={t('mapa.etiqueta')}
          onElegir={setElegida}
          className="h-[55dvh] min-h-72 w-full overflow-hidden rounded-xl border border-line"
        />
      ) : (
        <EmptyState variante="empty" compacto icono={MapPinOff} titulo={t('mapa.sinPuntos.titulo')} descripcion={t('mapa.sinPuntos.descripcion')} />
      )}

      {sinCoordenadas > 0 && pines.length > 0 && <p className="text-xs text-fg-muted">{t('mapa.sinCoordenadas', { n: sinCoordenadas })}</p>}

      {parada && (
        <TarjetaParada
          como="div"
          envio={parada}
          numero={numeroDe(parada.id)}
          zona={zonaDe(parada)}
          ahora={ahora}
          onAbrir={() => router.push(rutaParada(parada.id))}
        />
      )}

      {enlace && (
        <a href={enlace} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}>
          <ExternalLink aria-hidden="true" className="size-5" strokeWidth={1.5} />
          {t('mapa.abrirGoogle')}
        </a>
      )}
    </div>
  );
}
