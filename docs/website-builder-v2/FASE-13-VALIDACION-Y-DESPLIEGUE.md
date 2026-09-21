# Fase 13 — Validación integral y despliegue gradual

Estado: **transversal** ([ADR-002](ADR-002-DECISIONES-Y-SECUENCIA.md)): sus compuertas se ejecutan al cierre de cada etapa con la tabla de evidencia de D8; la matriz completa se acumula, no se deja para el final. Resultado: habilitar el sistema con evidencia de funcionamiento, compatibilidad y recuperación.

## UX y criterios de cierre

Revisar flujos completos con personas editando: elegir sitio, aplicar tema en borrador, sustituir imagen/video, personalizar header/footer, crear página, mover sección, editar carta/habitación, previsualizar, guardar, publicar y restaurar. Medir errores de comprensión de alcance y del estado publicado.

No cerrar la épica solo porque compila o hay muchas variantes. Todas las filas de la matriz de referencias y los patrones adoptados del catálogo deben tener evidencia, responsable y estado. Una capacidad no implementada se oculta como acción operativa y queda registrada como pendiente; no se declara «completamente funcional» con ese pendiente obligatorio abierto.

## Matriz mínima de pruebas

| Dimensión | Casos |
|---|---|
| Identidad | Sitio global, hotel, dos restaurantes, comercio; heredado y propio |
| Publicación | Sin cambios, borrador, conflicto, revisión antigua, restore, falla/reintento de invalidación |
| Rutas | Inicio, contenido, colección, detalle, reserva, carrito/checkout; dominio, subdominio y prefijo ofrecidos |
| Datos | Vacío, textos largos, recurso ausente, entidad archivada, catálogo grande, servicio sin disponibilidad |
| Seguridad | Otra organización, permiso revocado, ID ajeno, preview expirado, origen/fuente de mensaje inválidos |
| Pantallas | 360, 390, 768, 1280 y 1440 px; zoom del lienzo separado del ancho real |
| Accesibilidad | Teclado, foco, nombres de campos, contraste, errores de formulario y movimiento reducido |
| Operaciones | Precios/stock/envío/pagos/reservas correctos; preview sin efectos |

## Código y backend

- F13-01. Automatizar contrato, adaptadores, herencia, rutas y serialización. No añadir tests que solo repliquen la implementación: comprobar resultados y fallos reales.
- F13-02. Seleccionar infraestructura de pruebas de navegador compatible con el repo; websites no tenía framework en la línea base. Si se introduce uno, declarar dependencia, alcance y cómo ejecutarlo. No afirmar que `npm test` verifica algo si no existen pruebas.
- F13-03. Capturas comparables por combinación crítica de composición/tema/página, con recursos fijos y datos sintéticos. Cubrir todas las variantes con escenas y priorizar recorridos completos para cada familia.
- F13-04. Medir red, cantidad de consultas, peso multimedia, tamaño del documento, latencia de patch y tiempo de publicación. Probar página de 40 secciones y catálogo grande sin multiplicar consultas; fijar presupuestos contra F00.
- F13-05. Registrar fallos de preview, guardado, validación, publicación y renderer por identificadores de sitio/revisión; sin tokens ni contenido privado en logs. Alertas por fallos de operación pública, no solo errores del editor.
- F13-06. Ejecutar compuertas de ambos repositorios. Clasificar fallos previos con evidencia actual; no usar el build que ignora tipos como sustituto de `tsc`.

## Base de datos y despliegue

Verificar migraciones/rollbacks, constraints, RLS y planes de consultas por MCP. Probar revocación, aislamiento y RPC con rol limitado, no solo service role. No correr comandos SQL por rutas alternativas para ahorrar tiempo.

Secuencia de adopción:

1. Infraestructura y lectores compatibles; flags apagados.
2. Probar la transformación a borrador localmente con fixtures y compararla con legacy. Para el piloto autorizado en producción, crear un borrador aislado del sitio y comparar sin publicar; no sustituir contenido vivo. Este aislamiento de contenido no aísla cambios globales de esquema. Aplican las condiciones de ejecución en producción del plan maestro.
3. Sitios sintéticos y piloto autorizado; publicar y recuperar una revisión deliberadamente.
4. Cohorte pequeña de adopción explícita; observar un ciclo operativo completo y condiciones de tráfico acordadas en F00.
5. Ampliar por familias/capacidades cuando no haya regresiones críticas.
6. Mantener lectura legacy mientras existan sitios sin migrar. Su retirada es otra decisión posterior, fuera de esta entrega.

## Umbrales y recuperación

Detener ampliación si aparece exposición entre tenants, pérdida de borrador, mezcla de revisión, publicación parcial, fallo de checkout/reserva o cambio visual involuntario de sitios no adoptados. Para rendimiento, usar presupuestos acordados y comparaciones con la línea base, no porcentajes sin medición.

Apagar flags afectados, restaurar puntero de presentación compatible y reintentar invalidación. Conservar datos operativos y revisiones; no reinstalar constraints incompatibles ni borrar outlets. Documentar quién puede ejecutar recuperación y probarla antes de producción.

## Entrega final

- [ ] Catálogo y matriz de las 32 referencias completos con evidencia de componentes, rutas y móvil.
- [ ] Guía de uso: identidad, herencia, editor, biblioteca multimedia, borrador/publicación y recuperación.
- [ ] Runbook técnico de despliegue, rollback y compatibilidad ERP/website/BD.
- [ ] Registro de licencias/recursos iniciales y procedimiento de sustitución.
- [ ] Cero pendientes obligatorios ocultos; métricas y limitaciones documentadas.

La compatibilidad se demuestra mediante esas pruebas y la adopción gradual; no se promete ausencia absoluta de fallos sin verificar cada entorno.
