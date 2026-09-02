# FASE 15 — Motion UX y cross-platform: PWA, Capacitor y Electron

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: F0–F14 (todas las fases anteriores)
> Bloquea: — (fase final de polish)

---

## 0. Objetivo y alcance

**Qué resuelve:** pulir la experiencia en las 4 plataformas (Web, PWA, Electron, Capacitor) con Motion.dev para micro-interacciones, transiciones fluidas, y consistencia visual. Asegura que TODAS las funcionalidades del CRM Revenue OS funcionen en cada plataforma.

**Puntos del método que cubre:** 30 (cross-platform completo).

---

## 1. Estado actual verificado

| Qué | Estado | Archivo:línea |
|---|---|---|
| `motion` (motion.dev) | ❌ pendiente — instalar en F0: `npm install motion` | `package.json` |
| `public/sw.js` | ✅ existe | `public/sw.js` |
| `mobile/capacitor.config.ts` | ✅ existe | `mobile/capacitor.config.ts` |
| `electron/src/main/index.ts` | ✅ existe | `electron/src/main/index.ts` |
| `next-pwa` o equivalente | verificar | `package.json` |
| Animaciones Motion dispersas | ✅ en varios componentes | grep `motion.` |
| Sistema de animaciones consistente | ❌ | — |
| Tests E2E cross-platform | ❌ | — |
| `platformCapabilities.ts` | ❌ a crear (F3/F15) | `src/lib/services/voice/platformCapabilities.ts` |

---

## 2. Sistema de animaciones Motion unificado

### 2.1 Archivo central de variantes

```typescript
// src/lib/motion/variants.ts
import { Variants } from 'motion/react';

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

export const staggerContainerFast: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
};

export const pulse: Variants = {
  initial: { scale: 1 },
  animate: { scale: [1, 1.05, 1], transition: { repeat: Infinity, duration: 1.5 } },
};

export const shimmer: Variants = {
  initial: { backgroundPosition: '-200% 0' },
  animate: { backgroundPosition: '200% 0', transition: { repeat: Infinity, duration: 1.5, ease: 'linear' } },
};

// Page transitions
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn' } },
};

// Drawer/Modal transitions
export const drawerTransition: Variants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } },
  exit: { x: '100%', transition: { duration: 0.2, ease: 'easeIn' } },
};

export const modalTransition: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 25 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};
```

### 2.2 Hook `useMotionPref`

```typescript
// src/lib/motion/useMotionPref.ts
import { usePreferences } from '@/hooks/usePreferences';

export function useMotionPref() {
  const { preferences } = usePreferences();
  const reduceMotion = preferences?.reduceMotion ?? false;

  return {
    reduceMotion,
    // Si reduceMotion es true, las animaciones son instantáneas
    transition: reduceMotion ? { duration: 0 } : undefined,
  };
}
```

> Respeta `prefers-reduced-motion` del SO + preferencia del usuario.

---

## 3. PWA

### 3.1 Service Worker

```javascript
// public/sw.js — actualizaciones de F3 + F15
const CACHE_NAME = 'goadmin-crm-v15';
const STATIC_CACHE = [
  '/',
  '/offline',
  '/manifest.json',
];

const NETWORK_FIRST = [
  '/api/',
  'twilio.com',
  'twilio.*',
  'wss://',
];

// Estrategia:
// - Static assets: cache-first
// - API calls: network-first, fallback a cache
// - Twilio/WebRTC: NUNCA cachear (network-only)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Twilio y WebSocket: network-only
  if (NETWORK_FIRST.some(pattern => url.href.includes(pattern))) {
    return; // no interceptar
  }

  // Static: cache-first
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => caches.match('/offline'));
      })
    );
  }
});
```

### 3.2 Manifest

```json
// public/manifest.json
{
  "name": "GoAdmin CRM",
  "short_name": "GoAdmin",
  "description": "CRM Revenue OS",
  "start_url": "/app/crm",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#6366f1",
  "orientation": "any",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Pipeline", "url": "/app/crm/pipeline", "icons": [{ "src": "/icons/pipeline-96.png", "sizes": "96x96" }] },
    { "name": "Llamadas", "url": "/app/crm/llamadas", "icons": [{ "src": "/icons/calls-96.png", "sizes": "96x96" }] },
    { "name": "Inicio", "url": "/app/inicio", "icons": [{ "src": "/icons/dashboard-96.png", "sizes": "96x96" }] }
  ]
}
```

### 3.3 Offline

- Página `/offline` con mensaje y botón de reintentar.
- Datos críticos (pipeline, oportunidades) se cachean para lectura offline.
- Mutaciones offline se encolan en IndexedDB y se sincronizan al recuperar conexión (Background Sync API).

---

## 4. Capacitor

### 4.1 Configuración

```typescript
// mobile/capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.goadmin.crm',
  appName: 'GoAdmin CRM',
  webDir: 'out', // o 'build' según Next.js config
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Carga URL remota en producción, local en dev
    url: process.env.NODE_ENV === 'production'
      ? 'https://app.goadmin.co'
      : undefined,
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#6366f1',
    },
  },
};

export default config;
```

### 4.2 Permisos nativos

| Plataforma | Permiso | Para qué | Cuándo se pide |
|---|---|---|---|
| iOS | Microphone | Llamadas WebRTC | Al pulsar "Llamar" por primera vez |
| iOS | Notifications | Notificaciones push | Al login, con explicación |
| Android | Microphone | Llamadas WebRTC | Al pulsar "Llamar" por primera vez |
| Android | Notifications | Notificaciones push | Al login |
| Android | Vibrate | Feedback háptico | Al usar la app |

### 4.3 Bridge nativo

```typescript
// src/lib/services/platform/nativeBridge.ts
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics } from '@capacitor/haptics';

export class NativeBridge {
  static isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  static async registerPushNotifications(): Promise<void> {
    if (!this.isNative()) return;

    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== 'granted') return;

    await PushNotifications.register();
    PushNotifications.addListener('registration', (token) => {
      // Enviar token al backend para registrar dispositivo
      fetch('/api/notifications/register-device', {
        method: 'POST',
        body: JSON.stringify({ token: token.value, platform: Capacitor.getPlatform() }),
      });
    });
  }

  static async hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
    if (!this.isNative()) return;
    await Haptics.impact({ style: type });
  }

  static async localNotification(params: {
    title: string;
    body: string;
    id: number;
    schedule?: { at: Date };
  }): Promise<void> {
    if (!this.isNative()) return;
    await LocalNotifications.schedule({
      notifications: [{
        id: params.id,
        title: params.title,
        body: params.body,
        schedule: params.schedule ? { at: params.schedule.at } : undefined,
      }],
    });
  }
}
```

---

## 5. Electron

### 5.1 Permisos

```typescript
// electron/src/main/index.ts — actualizaciones de F3 + F15
import { session } from 'electron';

session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
  const url = new URL(webContents.getURL());

  // Solo permitir permisos para el origen de la app
  const allowedOrigins = ['https://app.goadmin.co', 'http://localhost:3000'];
  if (!allowedOrigins.includes(url.origin)) {
    return callback(false);
  }

  const allowedPermissions = {
    media: true, // micrófono para llamadas
    notifications: true,
    'clipboard-read': false,
    'clipboard-write': true,
  };

  callback(allowedPermissions[permission] ?? false);
});
```

### 5.2 Notificaciones nativas

```typescript
// electron/src/main/notifications.ts
import { Notification, BrowserWindow } from 'electron';

export function showNativeNotification(params: {
  title: string;
  body: string;
  onClick?: () => void;
}) {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title: params.title,
    body: params.body,
    icon: path.join(__dirname, 'icons/notification-icon.png'),
  });

  if (params.onClick) {
    notification.on('click', params.onClick);
  }

  notification.show();
}
```

### 5.3 Auto-update

```typescript
// electron/src/main/autoUpdater.ts
import { autoUpdater } from 'electron-updater';

export function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', () => {
    // Notificar al renderer
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('update-available');
    });
  });

  autoUpdater.on('update-downloaded', () => {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('update-downloaded');
    });
  });

  autoUpdater.checkForUpdates();
}
```

---

## 6. Micro-interacciones Motion por componente

### 6.1 Lista de micro-interacciones a estandarizar

| Componente | Interacción | Variante |
|---|---|---|
| Botones | Hover scale | `scale: 1.02` |
| Cards | Hover lift | `y: -2, boxShadow` |
| Tabs | Underline animado | `layoutId` |
| Toast | Slide in + auto dismiss | `slideInRight` |
| Modal | Scale in + backdrop fade | `modalTransition` |
| Drawer | Slide from right | `drawerTransition` |
| Kanban card | Drag + tilt | `drag + rotate: 2deg` |
| Kanban column | Highlight on drag over | `backgroundColor` |
| Page transition | Fade + slide | `pageTransition` |
| Loading skeleton | Shimmer | `shimmer` |
| Success state | Checkmark draw | `pathLength: 0 → 1` |
| Error state | Shake | `x: [0, -10, 10, -10, 0]` |
| Number counter | Animate value | `key + scaleIn` |
| Progress bar | Width animate | `width: 0 → %` |
| Pulse (live indicator) | Scale loop | `pulse` |
| Stagger list | Children stagger | `staggerContainer` |

### 6.2 Ejemplo — checkmark de éxito

```tsx
import { motion } from 'motion/react';

export function SuccessCheckmark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <motion.circle
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="2"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3 }}
      />
      <motion.path
        d="M8 12l3 3 5-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      />
    </svg>
  );
}
```

### 6.3 Ejemplo — shake de error

```tsx
export function ErrorShake({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      animate={{ x: [0, -10, 10, -10, 10, 0] }}
      transition={{ duration: 0.4 }}
    >
      {children}
    </motion.div>
  );
}
```

---

## 7. Accesibilidad y `prefers-reduced-motion`

```css
/* src/app/globals.css */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

```typescript
// useMotionPref respeta prefers-reduced-motion del SO
// + preferencia del usuario en settings
// Si reduceMotion es true, todas las animaciones son instantáneas
```

---

## 8. Tests E2E cross-platform

### 8.1 Web (Puppeteer)

- Navegación entre páginas funciona.
- Animaciones se reproducen (verificar clases de Motion aplicadas).
- `prefers-reduced-motion` desactiva animaciones.

### 8.2 PWA

- Instalable desde Chrome (verificar manifest válido).
- Funciona offline (modo avión en DevTools).
- Service Worker no intercepta dominios de Twilio.

### 8.3 Electron

- Build de Electron arranca.
- Permisos de micrófono se piden al pulsar "Llamar".
- Notificaciones nativas aparecen.
- Auto-update detecta versión nueva.

### 8.4 Capacitor

- Build de iOS arranca en simulador.
- Build de Android arranca en emulador.
- Permisos se piden correctamente.
- Push notifications se registran.
- Haptics funcionan.
- Llamadas WebRTC funcionan (o bridge de F5).

---

## 9. Performance

- Animaciones Motion usan GPU (transform/opacity, no layout properties).
- `will-change: transform` en elementos animados frecuentemente.
- Lazy-load de componentes pesados (gráficos, editores).
- Code-splitting por ruta.
- Bundle size < 500 KB initial JS.

---

## 10. Definition of Done

- [ ] `src/lib/motion/variants.ts` con todas las variantes centralizadas.
- [ ] `useMotionPref` respeta `prefers-reduced-motion` + preferencia del usuario.
- [ ] Todas las micro-interacciones de la lista están estandarizadas.
- [ ] PWA instalable + offline + manifest válido.
- [ ] Electron con permisos + notificaciones + auto-update.
- [ ] Capacitor con permisos + push + haptics + llamadas.
- [ ] Tests E2E cross-platform pasan.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` + `npm run build` limpios.
- [ ] Bundle size < 500 KB initial JS.
- [ ] Cero archivos `.sql` en el repo.

---

## 11. Archivos tocados — resumen

| Ruta | Acción | Motivo |
|---|---|---|
| `src/lib/motion/variants.ts` | crear | Variantes centralizadas |
| `src/lib/motion/useMotionPref.ts` | crear | Hook preferencia |
| `src/lib/services/platform/nativeBridge.ts` | crear | Bridge nativo Capacitor |
| `public/sw.js` | modificar | No cachear Twilio + offline |
| `public/manifest.json` | modificar | Shortcuts CRM |
| `mobile/capacitor.config.ts` | modificar | Config CRM |
| `electron/src/main/index.ts` | modificar | Permisos |
| `electron/src/main/notifications.ts` | crear | Notificaciones nativas |
| `electron/src/main/autoUpdater.ts` | crear | Auto-update |
| `src/app/globals.css` | modificar | prefers-reduced-motion |
| Componentes con animaciones | modificar | Estandarizar variantes |
