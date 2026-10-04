# GO Admin · propuesta de Voces y Campañas

Prototipo independiente para revisar la composición y el recorrido de las pestañas
de Agentes IA antes de integrarlas. No cambia archivos de `src`, rutas del CRM,
servicios, tablas ni los diseños aprobados en Figma.

Referencia: Manual de marca GO Admin v2.0 proporcionado por el usuario; Figma
`1298:84133` (Agentes IA), `1395:17` (Campañas) y `1395:1065` (asistente de campaña).
La biblioteca se propone con el mismo kit, tipografía, colores, controles y
jerarquía del ERP.

## Ver la propuesta

Desde la raíz del repositorio, con las dependencias instaladas:

```bash
node propuestas/agentes-ia/build.cjs
node propuestas/agentes-ia/serve.cjs
```

Abre <http://127.0.0.1:4318>. También puedes abrir directamente
`propuestas/agentes-ia/propuesta.html`: es un HTML portátil con código, estilos y
fuente embebidos, sin servidor ni conexión. Los archivos generados se ignoran en Git.

## Recorridos incluidos

- Biblioteca: buscar, filtrar por acento/tipo/uso, guardar voces y abrir detalle.
- Mis voces: asignar una voz al agente y elegir la predeterminada; quitar voces
  sin asignaciones mediante confirmación.
- Voz personal: consentimiento, archivo local y revisión de una ficha de ejemplo.
- Campañas: tabla y tarjetas móviles, filtros, detalle y relaciones con agente,
  audiencia, llamadas, calendario y pipeline.
- Nueva campaña: audiencia → agente y voz → cumplimiento/horario → revisión.
  Guardar y reabrir el borrador conserva los datos; programar requiere fecha
  válida y los tres requisitos simulados. Pausar y reanudar conservan resultados.

La aprobación o el descarte se comunican por el chat o el PR. El contexto de la
propuesta queda en esta documentación; las pantallas muestran contenido del CRM.

La campaña usa la voz del agente; no hay una segunda selección de voz por campaña.
Las relaciones abren ejemplos locales y no llevan identificadores ficticios al CRM.

## Límites de la demostración

Todos los nombres, conteos y comprobaciones son ficticios. Los cambios viven en
memoria y se restablecen al recargar. No hay sesión
real, verificación RNE, entrenamiento de voces, consumo de minutos ni llamadas.
Las muestras utilizan síntesis del dispositivo cuando existe una voz en español;
no representan el timbre ni la calidad de ElevenLabs. La ficha personal no crea
una voz válida en el proveedor.

Se reutilizan directamente `PageHeader`, `SidebarShell`, `AppHeader`,
`SegmentedControl`, `TabBar`, `Tarjeta`, `DataTable`, `ListCard`, `KpiStrip`,
`StatCard`, `StatusBadge`, `AvatarIniciales`, `ListToolbar`, `SearchInput`,
`FilterPanel`, `FilterChips`, `RowActionsMenu`, `Dialogo`, `HojaDetalle`,
`Stepper`, `RelatedLinkCard`, `FormField`, `SelectCrm` y los tokens actuales.
Sólo los contextos y el transporte del shell se sustituyen por ejemplos locales.

El renderizador rechaza importaciones de backend. El HTML bloquea conexiones
mediante CSP y el código bloquea `fetch`/XHR. Los formularios no se envían.

## Verificación y eliminación

Con el preview iniciado:

```bash
node propuestas/agentes-ia/verificar.cjs
node_modules/.bin/tsc --noEmit -p propuestas/agentes-ia/tsconfig.json
```

Comprueba interacciones, herencia de voz, borradores, requisitos, programación,
portales, consentimiento y anchos 1440/390/375. Genera capturas en `evidencia/`.
No utiliza APIs ni bases de datos.

Validación de esta versión: build del prototipo, TypeScript aislado y ESLint
correctos; recorridos de navegador sin errores ni solicitudes externas en
1440, 390 y 375 px. La revisión adicional cubrió la ficha personal y la
conservación del borrador al cambiar de agente.

La compilación Next de la rama base completó las 367 páginas, con la comprobación
de tipos ejecutada aparte. Jest completó 19.104 pruebas: un proceso fue terminado
por memoria y sus 14 pruebas pasaron al repetir esa suite por separado.
El TypeScript global señala tipos de `electron` ausentes en este entorno;
la configuración aislada comprueba la propuesta y sus dependencias de interfaz.

Para descartar, detener el servidor y eliminar únicamente `propuestas/agentes-ia/`
en esta rama. No hay migraciones ni cambios que revertir en producción.

Inter se distribuye bajo SIL Open Font License: <https://github.com/rsms/inter/blob/master/LICENSE.txt>.
El archivo WOFF2 local corresponde a la fuente Inter ya utilizada por el ERP.
