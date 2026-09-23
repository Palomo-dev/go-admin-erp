# Recursos de marca de la app móvil

Generados por `node scripts/brand/generar-iconos.mjs` (desde la raíz del repo) a
partir del isotipo del manual de marca v2.0, el mismo vector que
`public/icon.svg` y que el Desktop. No se editan a mano.

- **Android**: el script escribe directamente en `android/app/src/main/res`
  (launcher, adaptativo con monocromo para Android 13, `ic_stat_goadmin` para
  las notificaciones y `splash.png`).
- **iOS**: todavía no hay proyecto Xcode (`ios/App` solo tiene
  `exportOptions.plist`). Después de `npx cap add ios`, copiar
  `ios/AppIcon.appiconset` y `ios/Splash.imageset` de esta carpeta sobre
  `ios/App/App/Assets.xcassets/`. El 1024 va sin alfa, como exige App Store.
- **Alternativa**: `npx @capacitor/assets generate` desde `mobile/` usa como
  entrada `icon-only.png`, `icon-foreground.png`, `icon-background.png`,
  `splash.png` y `splash-dark.png` de esta carpeta.
