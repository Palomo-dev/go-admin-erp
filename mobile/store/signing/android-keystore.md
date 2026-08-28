# Android Keystore — Guía de Generación

## Generar keystore release

```bash
keytool -genkey -v \
  -keystore mobile/android/release.keystore \
  -alias goadmin \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass <TU_STORE_PASSWORD> \
  -keypass <TU_KEY_PASSWORD> \
  -dname "CN=GoAdmin ERP, OU=Development, O=GoAdmin, L=Bogota, ST=Cundinamarca, C=CO"
```

## Configurar en build.gradle

Después de `cap add android`, editar `mobile/android/app/build.gradle`:

```gradle
android {
    signingConfigs {
        release {
            storeFile file('release.keystore')
            storePassword System.getenv('ANDROID_STORE_PASSWORD')
            keyAlias 'goadmin'
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

## GitHub Secrets

Configurar en GitHub repo → Settings → Secrets and variables → Actions:

| Secret | Valor |
|--------|-------|
| `ANDROID_KEYSTORE_BASE64` | `base64 release.keystore` (output del comando) |
| `ANDROID_STORE_PASSWORD` | Password del keystore |
| `ANDROID_KEY_PASSWORD` | Password de la key |

## Obtener base64 del keystore

```bash
base64 mobile/android/release.keystore > keystore.b64
# Copiar contenido a GitHub Secret ANDROID_KEYSTORE_BASE64
```

## Verificar keystore

```bash
keytool -list -v -keystore mobile/android/release.keystore -alias goadmin
```

## SHA-1 y SHA-256 para Firebase

```bash
keytool -list -v -keystore mobile/android/release.keystore -alias goadmin -storepass <PASSWORD>
```

Anotar SHA-1 y SHA-256 y añadirlos en Firebase Console → Project Settings → App → SHA certificates.
