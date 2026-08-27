---
name: debugging-systematic
description: Usar SIEMPRE que el usuario reporte un bug, un error, un comportamiento inesperado, o pida "arreglar" algo que no funciona. También usar proactivamente cuando un cambio propio no produce el resultado esperado, en vez de seguir probando cambios al azar.
---

# Debugging sistemático

## Proceso (en orden, no saltar pasos)

1. **Reproducir de forma confiable** — antes de cambiar nada, confirma los pasos
   exactos para reproducir el bug. Si no puedes reproducirlo, no puedes verificar
   que lo arreglaste.
2. **Leer el error completo** — stack trace completo, no solo la última línea.
   El origen real suele estar más arriba en la traza, no en el punto donde explotó.
3. **Aislar la causa** — reduce el caso al mínimo que sigue fallando (bisección:
   comenta/quita partes hasta encontrar qué línea/condición lo dispara).
4. **Formular una hipótesis explícita** antes de cambiar código: "creo que falla
   porque X". Si el fix no soluciona el bug, la hipótesis era incorrecta — vuelve
   al paso 3, no agregues otro cambio encima sin entender el primero.
5. **Verificar el fix** contra el caso de reproducción original, más al menos un
   caso relacionado (para confirmar que no rompiste algo cercano).
6. **Preguntar "por qué no lo atrapó un test"** — si había tests y no lo detectaron,
   agrega el caso faltante.

## Herramientas según el tipo de bug
- **Datos incorrectos en DB**: query directa a la base para confirmar el estado
  real antes de asumir qué está pasando en el código.
- **Comportamiento async/concurrencia**: agrega logs con timestamps para ver el
  orden real de ejecución, no asumas el orden esperado.
- **Bug intermitente**: sospecha de condiciones de carrera, dependencia de orden
  de tests, o estado compartido entre requests — no lo descartes como "flaky" sin
  investigar.
- **Bug solo en producción**: revisa diferencias de configuración/env vars antes
  de asumir que es un problema de código (a menudo es config).

## Qué evitar
- Cambiar múltiples cosas a la vez "a ver si algo funciona" — no sabrás cuál fue.
- Agregar `try/except`/`catch` genérico para silenciar el error sin entender la
  causa — eso oculta el bug, no lo arregla.
- Asumir que el error está donde se lanzó la excepción sin revisar la causa raíz
  más arriba en la pila.
