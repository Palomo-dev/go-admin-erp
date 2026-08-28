# Google Play — Data Safety Section

## Data collected

| Tipo de datos | Propósito | ¿Se comparte? | ¿Es opcional? |
|---------------|-----------|---------------|---------------|
| **Información personal** (email, nombre) | Cuenta de usuario | No | No (requerido para login) |
| **Fotos y cámara** | Fotos de productos, clientes, escaneo de códigos | No | Sí (se solicita permiso) |
| **Ubicación** | Marcación de asistencia, transporte | No | Sí (se solicita permiso) |
| **Identificadores del dispositivo** (push token) | Notificaciones push | No | Sí (se solicita permiso) |
| **Datos de actividad** (ventas, inventario) | Funcionalidad ERP | No | No (datos del negocio) |

## Data not collected

- **Datos biométricos:** La huella y Face ID se procesan exclusivamente en el dispositivo. Nunca se envían a servidores.
- **Contactos:** No accedemos a la libreta de contactos.
- **SMS:** No leemos mensajes SMS.
- **Historial de navegación:** No rastreamos navegación fuera de la app.
- **Micrófono:** No accedemos al micrófono.
- **Datos analíticos de terceros:** No usamos Facebook Analytics, Google Analytics ni SDKs de tracking.

## Security practices

- **Cifrado en tránsito:** TLS/HTTPS para todas las comunicaciones.
- **Cifrado en reposo:** Base de datos PostgreSQL con cifrado en reposo.
- **Row Level Security (RLS):** Cada organización solo accede a sus propios datos.
- **Autenticación OAuth:** Soporte para Google y Microsoft OAuth.
- **Biometría on-device:** Face ID/huella procesados localmente, nunca transmitidos.

## Permissions requested

| Permiso | Justificación |
|---------|---------------|
| CAMERA | Escaneo de códigos de barras/QR, fotos de productos y clientes |
| ACCESS_FINE_LOCATION | Marcación de asistencia con GPS, seguimiento de transporte |
| ACCESS_COARSE_LOCATION | Ubicación aproximada para funcionalidades de transporte |
| INTERNET | Conexión con servidor GoAdmin |
| BLUETOOTH | Conexión con impresoras térmicas de tickets |
| BLUETOOTH_ADMIN | Descubrimiento de impresoras Bluetooth |
| BLUETOOTH_SCAN | Escaneo de dispositivos Bluetooth LE (Android 12+) |
| BLUETOOTH_CONNECT | Conexión a dispositivos Bluetooth LE (Android 12+) |
| NFC | Lectura de tags NFC para check-in y marcación |
| VIBRATE | Feedback háptico en acciones de POS |
| POST_NOTIFICATIONS | Notificaciones push en tiempo real (Android 13+) |
| READ_EXTERNAL_STORAGE | Selección de fotos de la galería |
| WRITE_EXTERNAL_STORAGE | Exportación de reportes PDF/CSV al dispositivo |
