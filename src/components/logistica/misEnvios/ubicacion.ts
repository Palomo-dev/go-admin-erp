'use client';

/** Ubicación del celular para el evento (opcional: sin permiso o sin señal, no se manda). */
export function ubicacionActual(espera = 5000): Promise<{ latitude: number; longitude: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((ok) => {
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => ok(null),
      { enableHighAccuracy: true, timeout: espera, maximumAge: 60_000 },
    );
  });
}
