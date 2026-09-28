# Permiso de ubicación del dispositivo — análisis y propuesta (2026-09-23)

Archivo de Figma `EAvjINVRnlzFM70GVoWXgl`. Capturas en `docs/design/figma/39-ubicacion-*.png`.
Estado: **propuesta para aprobación**. No se ha tocado código.

## 1. Qué pasa hoy

### Cuándo aparece

- El modal `GeolocationModal` (`src/components/auth/GeolocationModal.tsx`) se monta en
  **la página de login**, antes de autenticarse (`src/app/auth/login/page.tsx:16`, `:55`,
  `:121-127`, `:860-864`). Sale al segundo de cargar la página, con fondo oscuro, **encima del
  formulario**: hay que responderlo antes de poder escribir el correo.
- Aparece siempre que falte la cookie `geolocation_preference` (`src/lib/utils/geolocation.ts:117-119`).
  La cookie es **por navegador, no por usuario**, y dura un año (`geolocation.ts:27-34`). En la
  práctica sale:
  - la primera vez en cada navegador o equipo,
  - **siempre** en ventana privada,
  - después de borrar cookies, y
  - la primera vez en la app móvil y en la de escritorio.

  No sale en cada login del mismo navegador, pero sí es lo primero que ve cualquier persona nueva o
  en un equipo nuevo, que es justo cuando no conoce el producto.
- «Permitir Ubicación» llama a `getCurrentPosition` al momento (`GeolocationModal.tsx:36`). El
  navegador muestra su propio aviso **encima del modal, en la pantalla de login**, sin que la
  persona haya entrado.

### Qué pasa si dice que no

- «No Permitir» o la **X** guardan `denied` en la cookie (`login/page.tsx:364-371`). No vuelve a
  preguntar en ese navegador durante un año. El login sigue igual: la ubicación no es obligatoria.

### Qué se hace con la respuesta

- Tras entrar, `registerUserDevice` (`src/lib/auth/organizationAuth.ts:431-547`) registra el
  dispositivo en `user_devices`. Lo llaman el login con correo (`organizationAuth.ts:345-355`),
  el de Google (`src/lib/auth/googleAuth.ts:178`) y un reintento en `AppLayout.tsx:187-199`.
- `getLocationFromBrowser` (`geolocation.ts:39-96`):
  - Si la cookie dice `allowed`, **vuelve a pedir el GPS en cada inicio de sesión** y guarda el
    texto `Coordenadas GPS: lat, lon` con 4 decimales. Eso son unos 11 m: **no es una ubicación
    aproximada**, es prácticamente la dirección.
  - Si no, guarda en `location` la frase de estado («Usuario denegó el acceso a la ubicación»,
    «Error al obtener ubicación GPS»…).
- La ubicación **solo se escribe al crear el dispositivo**. Si el dispositivo ya existe, el UPDATE
  no toca `location` (`organizationAuth.ts:503-515`). Pedir el GPS en cada login no sirve para nada:
  la columna se queda con el valor de la primera vez.
- `ip_address` **ya no se escribe**. El comentario «La IP se captura en el servidor»
  (`organizationAuth.ts:478`) es falso desde que el registro pasó a insertar directo desde el
  navegador. La ruta `POST /api/sessions`, que sí capturaba la IP y la geolocalizaba con
  `ip-api.com`, ya no tiene quien la llame. Además usa `http://` sin TLS, y el plan gratuito de ese
  servicio no admite uso comercial (`src/app/api/sessions/route.ts:510-530`).
- **Nadie usa la ubicación para seguridad.** No hay detección de inicios inusuales en el código.
  El único uso es mostrar el texto crudo en Mi perfil › Sesiones y dispositivos
  (`src/components/profile/DeviceSessions.tsx:320-330`): coordenadas o la frase «Usuario denegó…».
  Las tres promesas del modal se cumplen a medias (el historial) o no se cumplen (inicios
  inusuales, más seguridad).

### Evidencia en la base (`user_devices`, 2026-09-23, 259 filas)

| `location` | Filas | % | Con `ip_address` |
|---|---|---|---|
| «Usuario denegó el acceso…» | 200 | 77 % | 22 |
| `Coordenadas GPS: …` (≈ 11 m) | 45 | 17 % | 6 |
| «Error al obtener ubicación GPS» | 12 | 5 % | 1 |
| Sin preferencia / NULL | 2 | 1 % | 1 |

Casi 4 de cada 5 personas dicen que no. Y de las que dicen que sí, se guarda un dato mucho más
preciso de lo que el modal promete («ubicación aproximada»).

### Dónde se cambia después

**En ningún sitio.** El modal dice «Puedes cambiar esta preferencia más tarde en la configuración
de tu perfil», pero Mi perfil (`src/app/app/perfil/page.tsx:328-335`) no tiene ese control. La única
forma es borrar las cookies del navegador.

### Otros entornos

- **App de escritorio (Electron):** el manejador de permisos concede la geolocalización al origen
  de la web sin preguntar (`src/__tests__/electron/permissions.test.ts:144-165`, pensado para
  `/app/marcar`). Ahí el aviso del navegador ni siquiera aparece.
- **App móvil (Capacitor):** usa el plugin nativo (`geolocation.ts:47-58`). El aviso del sistema
  sale centrado.
- `src/app/test-geolocation/page.tsx` y `src/app/api/test-geolocation/route.ts` son páginas de
  depuración. La ruta API queda fuera del middleware (`api/test` está excluido en
  `middleware.ts:996`) y consulta `ip-api.com` con la IP de quien la llame.

### ¿Hace falta el GPS del navegador?

**No.** Para lo que el modal promete, que es avisar de inicios desde lugares nuevos y mostrar la
ciudad de cada dispositivo, basta la **ciudad aproximada por la IP**, calculada en el servidor.
Google y Microsoft lo hacen así. Además:

- El despliegue es en Vercel (`vercel.json`), que añade gratis a cada petición las cabeceras
  `x-vercel-ip-city`, `x-vercel-ip-country-region` y `x-vercel-ip-country`. No hace falta ningún
  servicio externo.
- El GPS no aporta seguridad: quien roba una contraseña controla su navegador y va a responder
  «Bloquear». La IP, en cambio, no depende de lo que conteste.
- Pedir el GPS y guardarlo con 11 m de precisión es un dato personal sensible que no se necesita.
  Con la Ley 1581 de 2012, la finalidad declarada tiene que coincidir con el dato que se recoge.
  Esto es para que lo mire quien lleve el tema legal; aquí no se emite concepto jurídico.

El GPS sí tiene sentido donde ya se usa y hace falta: marcar asistencia (`/app/marcar`) y el mapa
de paradas de transporte. Nada de esta propuesta toca esos flujos.

## 2. Propuesta

### Principios

1. **No interrumpir el login.** Nada entre la persona y el formulario de entrada.
2. **Pedir en contexto y una sola vez**, ya dentro de la app, y **por usuario**. La preferencia se
   guarda en el servidor, no en una cookie por navegador.
3. **Explicar en una línea.**
4. **«Ahora no» igual de fácil que «Permitir»**: mismo tamaño y uno al lado del otro.
5. **No volver a preguntar.** Se reactiva solo desde Mi perfil.
6. **Pedir solo lo necesario**: la ciudad (`enableHighAccuracy: false` y redondeo a ciudad antes de
   guardar). Nunca coordenadas.

### Recomendación

- **Base: opción C, sin preguntar nada.** Ciudad aproximada por IP en el servidor y aviso de
  inicio inusual. Cumple lo que el modal promete sin pedir permiso a nadie.
- **Opción A encima, solo si el dueño quiere más precisión** en la ciudad (p. ej. con VPN o datos
  móviles, donde la IP ubica mal): la tarjeta no bloqueante de abajo.
- Las dos se pueden activar por separado. El componente `AvisoPermiso` sirve además para
  notificaciones y cámara.

### Figma

**Componentes** (`02 Componentes` › «Permisos (Nuevo)», `638:37525`):

| Componente | Nodo | Propiedades |
|---|---|---|
| `AvisoPermiso` | `638:37526` | `Permiso` = ubicación · notificaciones · cámara. `Estado` = pedido · navegador · permitido · bloqueado. `Layout` = tarjeta (escritorio, 400 px) · hoja (móvil, 390 px) · banner (bajo el header). 36 variantes. Booleanos «Mostrar marca» (isotipo + «GO Admin · …») y «Mostrar enlace». |
| `DispositivoRow` | `638:385613` | `Tipo` = escritorio · móvil. `Estado` = actual · otro · inusual · sin-ubicación. |
| `AvisoInicioInusual` | `638:385758` | `Estado` = pregunta · no-fui-yo. `Layout` = tarjeta · hoja. |

Todo se hace con instancias del kit (Button, IconButton, Badge, Isotipo, iconos) y variables
Light/Dark. Interruptor del perfil: `SettingRow Control=switch` (`492:17`, de `10 Configuración`).

**Pantallas** (`08 Acceso y organización` › «16. Ubicación del dispositivo — propuesta»,
`638:385779`, con notas fuera de los frames):

| Pantalla | Nodo | Captura |
|---|---|---|
| Escritorio · pedido | `638:385780` | `39-ubicacion-escritorio-1-pedido.png` |
| Escritorio · el navegador pregunta | `638:386126` | `39-ubicacion-escritorio-2-navegador.png` |
| Escritorio · permitido | `638:386461` | `39-ubicacion-escritorio-3-permitido.png` |
| Escritorio · bloqueado por el navegador | `638:386800` | `39-ubicacion-escritorio-4-bloqueado.png` |
| Escritorio · pedido (oscuro) | `638:387142` | `39-ubicacion-escritorio-5-oscuro.png` |
| Móvil · pedido / navegador / permitido / bloqueado / oscuro | `638:387486` · `638:387665` · `638:387811` · `638:387961` · `638:388114` | `39-ubicacion-movil-1…5-*.png` |
| Alternativa: banner bajo el header | `638:388269` | `39-ubicacion-escritorio-alternativa-banner.png` |
| Mi perfil › Sesiones y dispositivos (escritorio) | `638:389868` | `39-ubicacion-perfil-escritorio.png` |
| Mi perfil › Sesiones y dispositivos (móvil) | `638:390306` | `39-ubicacion-perfil-movil.png` |
| Opción C · «¿Fuiste tú?» (escritorio / móvil) | `638:390475` · `638:390804` | `39-ubicacion-opcion-c-*.png` |
| Opción C · «No fui yo» | `638:390959` | `39-ubicacion-opcion-c-no-fui-yo.png` |

Vista general: `39-ubicacion-seccion.png`. Componentes: `39-ubicacion-componente-*.png`.

### a) Aviso no bloqueante dentro de la app

- Aparece **después de entrar**, unos 3 s después de cargar Inicio. No sale en el POS, con la caja
  abierta ni en medio de un formulario.
- En **escritorio** es una tarjeta anclada abajo a la derecha, a 24 px del borde, sin fondo oscuro.
  En **móvil** es una hoja pequeña apoyada sobre la barra inferior, también sin fondo oscuro.
- Contenido: chip de marca con MapPin, el título «Protege tu cuenta con la ubicación de tus
  dispositivos» y una línea («Guardamos solo la ciudad aproximada…») con «Más información».
  Botones «Ahora no» (ghost) y «Permitir» (Azul acción), más la X. En la hoja móvil los dos botones
  miden lo mismo.
- Estados:
  1. **pedido**.
  2. **navegador**: «Tu navegador te va a preguntar». Le dice a la persona dónde mirar. Si no
     responde en 30 s, la tarjeta se cierra sola.
  3. **permitido**: confirmación breve que se cierra sola a los 5 s.
  4. **bloqueado** (el navegador lo negó o ya estaba bloqueado): sin rojo y sin culpa. La cuenta
     sigue protegida y la tarjeta dice cómo activarlo desde el candado junto a la dirección.
- «Ahora no» y la X **cierran sin más** y guardan `pospuesto`. No se vuelve a preguntar.
- Si `navigator.permissions.query({ name: 'geolocation' })` ya devuelve `granted` o `denied`, la
  tarjeta no se muestra.

### b) Dónde se gestiona después

Mi perfil › **Sesiones y dispositivos**, la pestaña que ya existe con `DeviceSessions.tsx`:

- Fila con interruptor: «Registrar ubicación aproximada al iniciar sesión». Explicación: «Solo la
  ciudad, nunca el GPS…».
- Lista de dispositivos con la **ciudad aproximada** («Bogotá, Colombia (aprox.) · Activo ahora»),
  el distintivo «Este dispositivo» o «Inicio inusual» y «Cerrar sesión».
- Si no hay ciudad, se muestra «Ubicación no registrada». Nunca coordenadas ni frases de estado.

### c) Sin pedir nada (opción C) — viable, y la recomendada como base

- En cada inicio de sesión, el servidor lee la IP y la ciudad de las cabeceras de Vercel y
  actualiza el dispositivo.
- Si el **país** es nuevo para esa persona, o la **ciudad** lo es y además el dispositivo es nuevo,
  el inicio se marca como inusual. Entonces:
  - en su siguiente sesión conocida sale `AvisoInicioInusual` («¿Fuiste tú?»),
  - se crea una notificación en la campana, y
  - se envía un correo.
- «Sí, fui yo» → `is_trusted = true` (la columna ya existe) y no se vuelve a preguntar por ese
  dispositivo.
- «No fui yo» → `revoked_at` en ese dispositivo, cierre de sus sesiones y paso a cambiar la
  contraseña.

| Pros | Contras |
|---|---|
| Cero preguntas: no hay nada que rechazar. | La IP puede ubicar mal (VPN, datos móviles, operadores que salen por otra ciudad). Por eso se dice «aprox.». |
| Funciona igual en navegador, app móvil y escritorio. | En desarrollo local no hay cabeceras de Vercel (se muestra «Ubicación no registrada»). |
| No depende de lo que conteste el atacante. | Si mañana se sale de Vercel, hace falta una base GeoIP local (p. ej. MaxMind GeoLite2) en lugar de un servicio externo. |
| Sin terceros ni costo: las cabeceras ya vienen en cada petición. | Hay que diseñar la regla de «inusual» para no molestar a quien viaja. |
| Guarda menos datos personales. | |

## 3. Qué cambia en código

Pendiente de aprobación. Ningún cambio está hecho.

1. **Quitar el modal del login.**
   - `src/app/auth/login/page.tsx`: import (`:16`, `:18`), estado (`:55`), efecto (`:121-127`),
     manejadores (`:357-371`) y render (`:859-864`).
   - Borrar `src/components/auth/GeolocationModal.tsx`.
   - Añadir a `src/__tests__/guardrails.test.ts` una regla: sin `navigator.geolocation` ni
     `GeolocationModal` bajo `src/app/auth/**`.
2. **Registro del dispositivo en el servidor.** `registerUserDevice` deja de insertar desde el
   navegador y llama a un route handler (`POST /api/devices/register`, o se recupera
   `POST /api/sessions`):
   - Empieza por la sesión, y el usuario sale de la sesión, nunca del body.
   - Lee la IP (`x-forwarded-for`) y la ciudad (`x-vercel-ip-city`, `-country-region`, `-country`).
   - **Actualiza la ubicación en cada inicio**, no solo al crear el dispositivo.
   - Si hay permiso del navegador, el cliente manda las coordenadas y el servidor las **reduce a
     ciudad** antes de guardarlas. Las coordenadas no se persisten.
   - Se quita `ip-api.com` (`route.ts:510-530`).
3. **Esquema (aditivo, por MCP y con su rollback).** En `user_devices`, columnas `NULL`-ables:
   `city`, `region`, `country_code`, `location_source` (`ip` | `navegador`) y `unusual_at`.
   `location` se deja de escribir.
4. **Datos existentes.** Dejar de mostrar `location` cuando empiece por `Coordenadas GPS` o sea una
   frase de estado. Borrar las 45 coordenadas guardadas es un borrado de datos: **necesita
   autorización** (ver preguntas).
5. **Preferencia por usuario, no por cookie.** Va en `profiles.metadata.permisos.ubicacion`
   (`{ estado: 'permitido' | 'pospuesto' | 'bloqueado', decidido_en }`). `profiles.metadata`
   ya existe (jsonb) y no hace falta migración. Se retira la cookie `geolocation_preference` y
   `src/lib/utils/geolocation.ts` queda solo con el redondeo a ciudad.
6. **Componente nuevo** `src/components/permissions/PermissionPrompt.tsx`, espejo de
   `AvisoPermiso`:
   - Props: `permiso`, `estado`, `layout`.
   - Hook `usePermissionPrompt(permiso)`, que decide si mostrarlo con la preferencia del servidor
     más `navigator.permissions.query`.
   - Se monta una vez en `AppLayout` (no en el login) y usa la tarjeta en escritorio y la hoja en
     móvil.
7. **Mi perfil.** En `DeviceSessions.tsx`:
   - fila con interruptor que escribe la preferencia;
   - `getLocationText` muestra «ciudad, país (aprox.)» o «Ubicación no registrada»;
   - distintivo «Inicio inusual»;
   - «Sí, fui yo» / «No fui yo».
8. **Opción C.** Regla de inusual en el servidor al registrar. Por cada inicio inusual:
   notificación en la campana, correo (plantilla nueva) y `AvisoInicioInusual` en la siguiente
   sesión. Pasa por `security-review`: toca autenticación y sesiones.
9. **i18n.** Textos nuevos en `messages/{es,en,fr,pt}.json`.
10. **Depuración.** Retirar `src/app/test-geolocation/` y `src/app/api/test-geolocation/`.

## 4. Preguntas para el dueño

1. ¿Aprobamos la **opción C como base** (ciudad por IP, sin preguntar a nadie) y dejamos el aviso
   del navegador **fuera**? ¿O quiere además la tarjeta a) para quien acepte dar más precisión?
2. Si va la tarjeta a): ¿**tarjeta** abajo a la derecha (recomendada) o **banner** bajo el header?
3. ¿Borramos las **45 coordenadas GPS** ya guardadas (precisión ≈ 11 m) y las frases de estado de
   `user_devices.location`? Es borrado de datos: hace falta su autorización.
4. Inicio inusual: ¿se avisa por **país nuevo** solamente, o también por **ciudad nueva en un
   dispositivo nuevo**? ¿Se manda **correo** además del aviso en la app?
5. «No fui yo»: ¿cierra solo esa sesión o **todas las demás** también, y obliga a cambiar la
   contraseña?
6. ¿Quiere que `AvisoPermiso` se use ya para **notificaciones** del navegador y **cámara** (escáner
   del POS), o lo dejamos para otra fase?
7. En la app de escritorio el permiso se concede solo. ¿Mantenemos eso para asistencia y lo
   excluimos del registro de dispositivos, o también ahí se usa solo la IP?
