# Llamadas: primera carga y reintento

La captura reportada muestra el error de carga y el usuario indica que una
recarga obtiene el historial. El lector anterior abortaba a los 20 segundos
y conservaba sólo un booleano de error. Se reprodujo ese recorrido con una
primera respuesta lenta y una lectura posterior correcta. Sigue pendiente
conocer el estado HTTP y la duración del primer GET de la sesión reportada;
esa reproducción no identifica por sí sola qué servicio estuvo lento.

## Ajuste

- `leerLlamadas` reutiliza `withRequestDeadline`: el plazo incluye la petición,
  la recuperación canónica de sesión y la lectura completa del cuerpo. Cancela
  el transporte y termina incluso si éste ignora el aborto.
- El límite es 60 s en `next dev`, que compila rutas al usarlas por primera vez,
  y 20 s en producción. Permite que una primera lectura de 25 s en desarrollo
  complete con una sola petición.
- La tabla espera una organización activa. El estado se asocia a organización,
  filtros y revisión; oculta el resultado anterior desde el primer render y
  descarta respuestas posteriores a la cancelación.
- El timeout conserva el código `REQUEST_TIMEOUT` y muestra su propio mensaje.
  Otros errores usan un mensaje de historial fallido; las traducciones cubren
  es/en/fr/pt. El kit, el reintento manual y la autorización existente siguen
  siendo los puntos canónicos.

## Verificación

18 regresiones del lector y hook prueban espera inicial de 25 s en desarrollo,
timeout de producción, cuerpo pendiente, transporte no cooperativo, señal ya
cancelada, limpieza de timers, desmontaje, 401/403, organización pendiente,
filtros/organizaciones anteriores y reintento manual. La tabla recorre seis
estados en cuatro idiomas, incluido timeout; el historial móvil conserva sus
pruebas de ámbito y sesión. Son transportes simulados sin base ni proveedores
reales. Los resultados globales se registran en la fase 83 de `PROGRESS.md`.
