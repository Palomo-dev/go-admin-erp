---
name: cross-platform-shipping
description: Usar SIEMPRE que se trabaje en código que debe correr en múltiples plataformas usando Capacitor, Electron o React Native — especialmente al compartir lógica/UI entre web, desktop y móvil, manejar diferencias de plataforma, permisos nativos, almacenamiento seguro, o empaquetado/distribución. Aplica también a decisiones de arquitectura sobre qué código compartir vs. cuál mantener nativo por plataforma.
---

# Apps multiplataforma: Capacitor, Electron, React Native

## Principio general
Maximiza código compartido en lógica de negocio y llamadas a API; minimiza (pero no
elimines) código específico de plataforma en UI nativa, permisos y almacenamiento.

## Decidir dónde va el código
- Lógica de negocio pura (validaciones, formateo, cálculos) → paquete compartido
  (ej. `packages/core` en un monorepo), consumible desde Next.js web, Electron,
  Capacitor y React Native.
- Acceso a hardware/OS (cámara, biometría, notificaciones push, filesystem) → capa
  de abstracción con implementación específica por plataforma detrás de una misma
  interfaz (patrón similar al Provider Router del backend).
- Nunca uses `window`, `localStorage`, o APIs de browser directamente en código que
  también corre en React Native — usa una capa de storage abstracta
  (`@react-native-async-storage/async-storage` en RN, `Capacitor Preferences` en
  Capacitor, storage seguro del OS en Electron).

## Capacitor
- Usa plugins oficiales de Capacitor cuando existan antes de escribir un plugin
  nativo custom.
- Datos sensibles (tokens, sesión) van en `Capacitor Preferences`/Keychain/Keystore,
  nunca en `localStorage` plano.
- Prueba siempre en el WebView real de iOS/Android, no solo en `npx cap serve` 
  en el navegador — hay diferencias de comportamiento (safe areas, teclado, deep
  links).

## Electron
- Separa claramente proceso principal (`main`) de proceso de renderer — nunca
  accedas a Node.js APIs directamente desde el renderer sin pasar por
  `contextBridge`/`preload` (riesgo de seguridad si `nodeIntegration` está mal
  configurado).
- `contextIsolation: true` y `nodeIntegration: false` como default de seguridad,
  a menos que haya una razón explícita y documentada para cambiarlo.
- Auto-updates: usa `electron-updater` con firmas verificadas, no descargues y
  ejecutes binarios sin verificar integridad.

## React Native
- Prefiere Expo managed workflow salvo que se necesite un módulo nativo custom
  no soportado — evita "eject" prematuro.
- Maneja diferencias iOS/Android explícitamente con `Platform.select()`, no con
  hacks de CSS/estilos condicionales dispersos.
- Para apps con wallet/finanzas (ej. Go Chat): biometría vía
  `expo-local-authentication` o equivalente para desbloquear acciones sensibles,
  nunca solo un PIN guardado en storage no seguro.

## Checklist antes de considerar una feature "lista" en multiplataforma
- [ ] Probado en al menos web + 1 plataforma nativa real (no solo simulador si es
      algo que depende de hardware).
- [ ] Ningún dato sensible en storage no seguro/no cifrado.
- [ ] Comportamiento de red offline/pérdida de conexión manejado explícitamente
      (crítico en apps financieras).
