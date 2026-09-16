# Prueba manual: pantalla del cliente (Go Admin Desktop)

`electron/` no tiene jest ni vitest; esta es la prueba de humo del puente
`window.goAdminDesktop.posDisplay` (`src/main/posDisplayIpc.ts`,
`src/main/windows/posDisplayWindow.ts`). Se ejecuta desde la consola de
DevTools de la web (F12 en desarrollo) o desde la UI del POS una vez la web
la use.

## Preparación

```bash
cd electron && npm run build && npx electron .
```

En desarrollo la web es `http://localhost:3000` (`npm run dev` en el raíz) o,
con `GOADMIN_DESKTOP_LOCAL_WEB=1`, el servidor Next embebido. Si hay otra
instancia (la app instalada) abierta, ciérrala: el candado de instancia única
comparte `userData` y la segunda instancia sale sin hacer nada.

## 1. Relé de mensajes (sin eco al emisor, baja individual)

En la consola de la web principal:

```js
const pd = window.goAdminDesktop.posDisplay;
const off = pd.onMessage((p) => console.log('caja recibe', p));
pd.send({ channel: 'prueba', data: 1 }); // NO debe imprimir nada: el emisor no se recibe
```

Abre la pantalla (`await pd.open()`) y en su consola:

```js
window.goAdminDesktop.posDisplay.onMessage((p) => console.log('pantalla recibe', p));
window.goAdminDesktop.posDisplay.send({ channel: 'prueba', data: 2 });
```

Esperado: la caja imprime `{ channel: 'prueba', data: 2 }`; la pantalla nada.
Tras `off()` en la caja, un nuevo `send` desde la pantalla no imprime en la
caja; otro listener registrado aparte sigue recibiendo.

Descarte: `pd.send('x')` y `pd.send({ data: 1 })` no llegan a nadie y el
main registra `Mensaje descartado ... sobre inválido`.

Sin internet: desconecta la red; el relé sigue funcionando igual (no hay
ningún salto por red).

## 2. Ventana y monitores

```js
await pd.listDisplays();            // [{ id, label, isPrimary, bounds }]
await pd.status();                  // { open: false, displayId: null }
await pd.open();                    // { ok: true }; carga `${origin}/pos-display`
await pd.status();                  // { open: true, displayId: <id o null> }
await pd.open();                    // { ok: true } y NO abre una segunda ventana
await pd.open({ origin: 'https://evil.example' }); // { ok: false, reason: 'origen no permitido' }
await pd.open('x');                 // { ok: false, reason: 'opts debe ser un objeto' }
await pd.close();                   // la ventana se cierra
```

- Con **un solo monitor**: ventana normal 1280×800 con marco, `displayId: null`.
- Con **dos monitores**: pantalla completa sin marco en el secundario, sin
  aparecer en la barra de tareas; la caja **conserva el foco** (sigue
  escribiendo en el buscador del POS). `open(<id del principal>)` la abre a
  pantalla completa en el principal.
- `onStatus`: `pd.onStatus((s) => console.log('status', s))` imprime
  `{ open: true, ... }` al abrir y `{ open: false, displayId: null }` al cerrar.
- **Ctrl+Shift+D** desde cualquier ventana (incluida la pantalla) la cierra.
- Cerrar (X) u ocultar la ventana principal cierra la pantalla.
- Desconectar el monitor donde está: se cierra sola (`display-removed`).

## 3. Persistencia y apertura automática

```js
await pd.setEnabled(true, (await pd.listDisplays())[0].id);
await pd.setEnabled(true, 1.5);     // rechaza: displayId debe ser un entero
```

`%APPDATA%/go-admin-desktop/config.json` contiene
`"posDisplay": { "enabled": true, "displayId": <id> }`. Cierra la app y vuelve
a abrirla: cuando la web principal termina de cargar, la pantalla se abre sola
con el origen real de esa web. Desconectar y reconectar el monitor la cierra y
la reabre. `setEnabled(false)` deja de abrirla al arrancar (no cierra la que
esté abierta: eso es `close()`).

## 4. Salida limpia

`Ctrl+Q` o «Salir» del menú: la pantalla se cierra, el atajo global se
desregistra y no queda ningún proceso `electron.exe`.

## Arnés automatizado (opcional)

Lo que se verificó el 2026-09-16 con un arnés en Electron (sin jest): con un
servidor HTTP mínimo en `localhost:3000` y dos ventanas con el preload real,
el relé no devuelve el mensaje al emisor, la baja quita solo su listener,
`open()` carga `${origin}/pos-display` en la misma sesión, la segunda llamada
no abre otra ventana, los orígenes externos y las opciones mal tipadas se
rechazan, `setEnabled` persiste en `config.json` y rechaza flotantes, y
`close()` emite `pos-display:status` una sola vez.
