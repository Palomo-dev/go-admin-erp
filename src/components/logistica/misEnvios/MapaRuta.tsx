'use client';

/**
 * Mapa de la ruta (Figma Envío/PinMapa y «10 Mapa de la ruta»): Leaflet con OpenStreetMap, como
 * los demás mapas del ERP (decisión del dueño 2026-11-25: sin costo por mapa; para navegar está
 * «Abrir en Google Maps»). Pines numerados: entregado (✓ verde), parada actual (azul lleno),
 * pendiente (contorno azul) y novedad (contorno rojo). Lo hecho va en línea continua verde y lo
 * que falta en punteada azul. Solo dibuja: el orden y los estados salen de `pinesRuta`.
 *
 * Se carga solo en el navegador (`MapaRutaDinamico`): Leaflet necesita `window`.
 */
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import { DivIcon, latLngBounds, type LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { EstadoPin, PinRuta } from '@/lib/logistica/misEnvios';

export interface MapaRutaProps {
  pines: readonly PinRuta[];
  /** Punto de salida (la sede), si tiene coordenadas. */
  origen?: { lat: number; lng: number; nombre: string } | null;
  /** Nombre accesible del mapa. */
  etiqueta: string;
  onElegir?: (id: string) => void;
  className?: string;
}

/**
 * Colores de los tokens (src/styles/tokens.css). Leaflet pinta HTML y SVG sueltos, sin clases de
 * Tailwind: dentro del icono van como `rgb(var(--token))` y en las líneas se leen del documento.
 */
const v = (token: string) => `rgb(var(${token}))`;
const COLOR: Record<EstadoPin, { fondo: string; borde: string; texto: string }> = {
  entregado: { fondo: v('--state-success'), borde: v('--state-success'), texto: v('--text-on-brand') },
  actual: { fondo: v('--brand-primary'), borde: v('--brand-primary'), texto: v('--text-on-brand') },
  pendiente: { fondo: v('--bg-surface'), borde: v('--brand-primary'), texto: v('--brand-primary') },
  novedad: { fondo: v('--state-danger-subtle'), borde: v('--state-danger'), texto: v('--state-danger') },
};

/** Un token como color de trazo SVG (los atributos no resuelven `var()`). */
function colorDe(token: string): string {
  if (typeof document === 'undefined') return 'currentColor';
  const valor = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return valor ? `rgb(${valor.split(/\s+/).join(',')})` : 'currentColor';
}

function icono(p: PinRuta): DivIcon {
  const c = COLOR[p.estado];
  const tamano = p.estado === 'actual' ? 36 : 28;
  const contenido = p.estado === 'entregado' ? '&#10003;' : String(p.numero);
  return new DivIcon({
    className: '',
    iconSize: [tamano, tamano],
    iconAnchor: [tamano / 2, tamano / 2],
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${tamano}px;height:${tamano}px;border-radius:9999px;background:${c.fondo};border:2px solid ${c.borde};color:${c.texto};font:600 13px/1 system-ui,sans-serif;box-shadow:0 1px 3px rgb(var(--text-primary) / .25)">${contenido}</span>`,
  });
}

function Encuadre({ puntos }: { puntos: LatLngExpression[] }) {
  const mapa = useMap();
  useEffect(() => {
    if (puntos.length === 1) mapa.setView(puntos[0], 15);
    else if (puntos.length > 1) mapa.fitBounds(latLngBounds(puntos), { padding: [32, 32] });
  }, [mapa, puntos]);
  return null;
}

export default function MapaRuta({ pines, origen, etiqueta, onElegir, className }: MapaRutaProps) {
  const puntos = useMemo<LatLngExpression[]>(
    () => [...(origen ? [[origen.lat, origen.lng] as LatLngExpression] : []), ...pines.map((p) => [p.lat, p.lng] as LatLngExpression)],
    [pines, origen],
  );
  const hechos = useMemo<LatLngExpression[]>(
    () => [...(origen ? [[origen.lat, origen.lng] as LatLngExpression] : []), ...pines.filter((p) => p.estado === 'entregado').map((p) => [p.lat, p.lng] as LatLngExpression)],
    [pines, origen],
  );
  const porHacer = useMemo<LatLngExpression[]>(() => {
    const ultimoHecho = hechos[hechos.length - 1];
    const pendientes = pines.filter((p) => p.estado === 'actual' || p.estado === 'pendiente').map((p) => [p.lat, p.lng] as LatLngExpression);
    return ultimoHecho && pendientes.length > 0 ? [ultimoHecho, ...pendientes] : pendientes;
  }, [pines, hechos]);

  // Sin puntos no se dibuja el mapa (quien lo usa muestra «sin coordenadas»); el centro es el primero.
  const centro: LatLngExpression | null = puntos[0] ?? null;
  const verde = useMemo(() => colorDe('--state-success'), []);
  const azul = useMemo(() => colorDe('--brand-primary'), []);
  if (!centro) return null;

  return (
    <div role="region" aria-label={etiqueta} className={className}>
      <MapContainer center={centro} zoom={13} scrollWheelZoom={false} attributionControl className="size-full" style={{ minHeight: 160 }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {hechos.length > 1 && <Polyline positions={hechos} pathOptions={{ color: verde, weight: 4 }} />}
        {porHacer.length > 1 && <Polyline positions={porHacer} pathOptions={{ color: azul, weight: 4, dashArray: '2 10', lineCap: 'round' }} />}
        {origen && (
          <Marker
            position={[origen.lat, origen.lng]}
            title={origen.nombre}
            icon={
              new DivIcon({
                className: '',
                iconSize: [12, 12],
                iconAnchor: [6, 6],
                html: '<span style="display:block;width:12px;height:12px;border-radius:9999px;background:rgb(var(--text-primary));border:2px solid rgb(var(--bg-surface))"></span>',
              })
            }
          />
        )}
        {pines.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={icono(p)}
            title={String(p.numero)}
            eventHandlers={onElegir ? { click: () => onElegir(p.id) } : undefined}
          />
        ))}
        <Encuadre puntos={puntos} />
      </MapContainer>
    </div>
  );
}
