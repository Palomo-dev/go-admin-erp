// ============================================================
// Setup de Jest — Zona horaria del runtime de tests.
//
// Fijamos TZ=UTC por defecto para reproducir el entorno de Vercel
// (donde los Route Handlers y Server Components corren en UTC).
// Las funciones de dateDisplay.ts usan Intl.DateTimeFormat con
// timeZone explicito, por lo que producen el mismo resultado
// sin importar el TZ del runtime — estos tests lo verifican.
//
// Para correr con America/Bogota: npm run test:tz-bogota
// Para correr con UTC:              npm run test:tz-utc
// ============================================================

// Si TZ no viene del entorno (ej: npm run test sin :tz-*), forzar UTC.
if (!process.env.TZ) {
  process.env.TZ = 'UTC';
}
