# App Store — App Privacy Questions

## Data Used to Track You

**No rastreamos al usuario.** No usamos SDKs de tracking (Facebook Analytics, Google Analytics, IDFA, etc.).

## Data Linked to You

| Tipo de datos | Propósito | ¿Se usa para tracking? |
|---------------|-----------|------------------------|
| Identifiers (User ID) | Cuenta de usuario, autenticación | No |
| Contact Info (Email) | Cuenta de usuario, notificaciones | No |
| User Content (Photos) | Fotos de productos, clientes | No |

## Data Not Linked to You

| Tipo de datos | Propósito |
|---------------|-----------|
| Diagnostics (Crash data) | Estabilidad de la app (si se integra Sentry en futuro) |

## Data Not Collected

- **Face ID / Touch ID:** Procesado exclusivamente on-device. Apple requiere declarar NSFaceIDUsageDescription pero los datos biométricos NO se recopilan ni transmiten.
- **Health data:** No recopilamos datos de salud.
- **Financial info:** No accedemos a datos financieros del usuario (tarjetas, cuentas bancarias). Las integraciones de pago (Wompi, Bancolombia) se procesan vía webhooks server-side, no desde la app.

## Permissions with explanations

### NSCameraUsageDescription
"GoAdmin usa la cámara para escanear códigos de barras y tomar fotos de productos."

### NSPhotoLibraryUsageDescription
"GoAdmin accede a la galería para seleccionar fotos de productos y clientes."

### NSFaceIDUsageDescription
"Usamos Face ID para que accedas a GoAdmin de forma rápida y segura."

### NSLocationWhenInUseUsageDescription
"GoAdmin usa tu ubicación para marcación de asistencia y seguimiento de transporte."

### NSBluetoothAlwaysUsageDescription
"GoAdmin usa Bluetooth para conectar con impresoras térmicas de tickets."

### NSBluetoothPeripheralUsageDescription
"GoAdmin usa Bluetooth para conectar con impresoras térmicas de tickets."

## App Tracking Transparency (ATT)

**No requerido.** No usamos IDFA ni ningún SDK de tracking. La app no rastrea al usuario entre apps y sitios web.

## Privacy Policy URL

https://app.goadmin.io/privacy
