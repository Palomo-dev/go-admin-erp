# iOS Certificates — Guía de Generación

## Prerequisitos

- Cuenta Apple Developer ($99/año)
- Xcode instalado (macOS)
- Bundle ID: `io.goadmin.app`

## Paso 1: Certificate Signing Request (CSR)

1. Abrir Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority
2. Email: tu email
3. Common Name: GoAdmin ERP
4. Saved to disk → generar `CertificateSigningRequest.certSigningRequest`

## Paso 2: Distribution Certificate

1. Apple Developer → Certificates, Identifiers & Profiles → Certificates → +
2. Seleccionar `Apple Distribution`
3. Subir CSR del paso 1
4. Descargar `.cer` y doble clic para instalar en Keychain

## Paso 3: App ID

1. Apple Developer → Identifiers → +
2. App IDs → App
3. Bundle ID: `io.goadmin.app` (Explicit)
4. Capabilities:
   - Push Notifications
   - Associated Domains (si se usa universal links)
5. Registrar

## Paso 4: Provisioning Profile

1. Apple Developer → Profiles → +
2. Seleccionar `App Store`
3. App ID: `io.goadmin.app`
4. Certificate: seleccionar el del paso 2
5. Nombre: `GoAdmin Distribution`
6. Descargar `.mobileprovision`

## Paso 5: Exportar .p12

1. Keychain Access → My Certificates
2. Click derecho sobre "Apple Distribution: GoAdmin ERP" → Export
3. Formato: Personal Information Exchange (.p12)
4. Password: tu contraseña del certificado
5. Guardar como `certificate.p12`

## Paso 6: GitHub Secrets

| Secret | Valor |
|--------|-------|
| `IOS_CERTIFICATE_P12_BASE64` | `base64 certificate.p12` |
| `IOS_CERTIFICATE_PASSWORD` | Password del .p12 |
| `IOS_PROVISIONING_PROFILE_BASE64` | `base64 GoAdmin_Distribution.mobileprovision` |
| `IOS_TEAM_ID` | Team ID de Apple Developer (ej: `ABC123XYZ`) — se inyecta en `exportOptions.plist` |

## Obtener base64

```bash
base64 certificate.p12 > cert.b64
base64 GoAdmin_Distribution.mobileprovision > profile.b64
```

## Configuración en Xcode

Después de `cap add ios`:

1. Abrir `mobile/ios/App/App.xcworkspace` en Xcode
2. Seleccionar App target → Signing & Capabilities
3. Team: tu Apple Developer team
4. Bundle Identifier: `io.goadmin.app`
5. Provisioning Profile: `GoAdmin Distribution`

## Info.plist

Añadir permisos (ver `mobile/store/app-store/privacy-questions.md`):

```xml
<key>NSCameraUsageDescription</key>
<string>GoAdmin usa la cámara para escanear códigos de barras y tomar fotos de productos.</string>

<key>NSFaceIDUsageDescription</key>
<string>Usamos Face ID para que accedas a GoAdmin de forma rápida y segura.</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>GoAdmin usa tu ubicación para marcación de asistencia y seguimiento de transporte.</string>

<key>NSBluetoothAlwaysUsageDescription</key>
<string>GoAdmin usa Bluetooth para conectar con impresoras térmicas de tickets.</string>

<key>NSBluetoothPeripheralUsageDescription</key>
<string>GoAdmin usa Bluetooth para conectar con impresoras térmicas de tickets.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>GoAdmin accede a la galería para seleccionar fotos de productos y clientes.</string>
```

## NFC Entitlement (iOS)

Para NFC en iOS:

1. Capabilities → Near Field Communication Tag Reading
2. Añadir a entitlements:
```xml
<key>com.apple.developer.nfc.readersession.formats</key>
<array>
  <string>NDEF</string>
</array>
```

3. Info.plist:
```xml
<key>NFCReaderUsageDescription</key>
<string>GoAdmin usa NFC para check-in de gimnasio y marcación de asistencia.</string>
```
