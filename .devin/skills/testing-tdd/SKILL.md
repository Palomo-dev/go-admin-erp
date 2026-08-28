---
name: testing-tdd
description: Usar SIEMPRE al escribir tests unitarios, de integración o end-to-end, o cuando el usuario pide implementar una feature siguiendo TDD (test-driven development). Aplica a cualquier lenguaje del stack (TypeScript/JavaScript, Python). También usar cuando se detecta código nuevo sin tests que cubra lógica de negocio no trivial.
---

# Testing y TDD

## Cuándo escribir tests primero vs. después
- TDD estricto (test antes que código) para lógica de negocio con reglas claras:
  cálculos financieros, validaciones, parsers, funciones puras.
- Test después del código está bien para UI exploratoria/prototipos, pero antes de
  considerar la feature "terminada" debe tener cobertura de los casos importantes.

## Qué probar (prioridad)
1. Lógica de negocio crítica (ledger, cálculos de precios/comisiones, validaciones
   de NIT/documentos, reglas de multi-tenancy).
2. Edge cases: valores nulos/vacíos, límites (0, negativo, muy grande), timezones,
   concurrencia (dos requests simultáneos modificando lo mismo).
3. Integración entre capas (API ↔ DB, webhook ↔ procesamiento) más que solo unit
   tests aislados con mocks excesivos que no prueban nada real.
4. Regresión: cuando arregles un bug, agrega el test que lo hubiera atrapado antes
   de arreglarlo.

## Por stack
- **TypeScript/JS (Next.js, Node)**: Vitest o Jest para unit/integración; Playwright
  para e2e de flujos críticos (login, checkout, creación de factura). React Testing
  Library para componentes — testea comportamiento visible al usuario, no detalles
  de implementación internos.
- **Python (FastAPI)**: `pytest` + `httpx.AsyncClient` para endpoints; fixtures para
  DB de test aislada (no contra la DB real de desarrollo).

## Estructura de un buen test
- Arrange / Act / Assert claro, un concepto por test.
- Nombres descriptivos: `test_rechaza_nit_duplicado_mismo_tenant`, no `test_1`.
- Tests independientes entre sí — no dependas del orden de ejecución ni de estado
  dejado por otro test.

## Qué NO hacer
- No mockees tanto que el test termine probando el mock y no el código real.
- No escribas tests solo para subir cobertura sin verificar comportamiento real
  (asserts vacíos o `assert True`).
- No dejes tests en `skip`/`todo` sin un issue o nota explicando por qué.
