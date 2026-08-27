---
name: technical-writing-docs
description: Usar SIEMPRE al escribir o actualizar READMEs, documentación de arquitectura, ADRs (Architecture Decision Records), comentarios de código complejos, o guías internas para el equipo. También usar cuando el usuario pide "documenta esto" o "explica cómo funciona X" para consumo futuro del equipo.
---

# Documentación técnica

## README de un proyecto/servicio
Estructura mínima útil:
1. Qué hace este proyecto/servicio (1-2 párrafos, no marketing, directo).
2. Cómo correrlo localmente (setup real, comandos exactos, no "instala las
   dependencias" vago).
3. Variables de entorno requeridas (referencia a `.env.example`).
4. Cómo correr los tests.
5. Decisiones de arquitectura no obvias o link a los ADRs relevantes.
6. Cómo desplegar (o link a la doc de CI/CD si es larga).

## ADRs (Architecture Decision Records)
Úsalos para decisiones importantes y no triviales (ej. "por qué Temporal.io y no
colas simples", "por qué Provider Router en vez de integración directa por
proveedor"). Formato corto:
```
# ADR-00X: <título>
## Contexto
¿Qué problema había que resolver?
## Decisión
Qué se decidió.
## Alternativas consideradas
Qué otras opciones había y por qué no se eligieron.
## Consecuencias
Qué trade-offs acepta esta decisión.
```
Esto evita que en 6 meses alguien (incluido tú) revierta una decisión sin saber
por qué se tomó originalmente.

## Comentarios en código
- Comenta el **por qué**, no el qué (el código ya dice qué hace si está bien
  escrito). Ejemplo útil: `// Reintentamos 3 veces porque Rapyd falla
  intermitentemente en horas pico, ver ADR-004`.
- No comentes lo obvio (`// incrementa el contador` sobre `contador += 1`).
- Si necesitas un comentario largo para explicar una función, considera si la
  función debería dividirse o renombrarse para ser más clara por sí misma.

## Documentación para el equipo (no público)
- Runbooks para incidentes comunes (ej. "qué hacer si un webhook de Stripe falla
  repetidamente", "cómo reconciliar un pago que quedó en estado inconsistente").
- Mantén la documentación cerca del código (`/docs` en el repo) en vez de solo en
  una wiki externa que se desactualiza sin que nadie lo note.

## Señales de que algo necesita documentación
- Tuviste que preguntar "por qué está hecho así" y la respuesta no era obvia del
  código.
- Un proceso se repite manualmente más de una vez (candidato a runbook).
- Una decisión de arquitectura generó debate — documenta el resultado y el porqué.
