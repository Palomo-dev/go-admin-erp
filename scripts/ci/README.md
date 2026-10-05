# Comprobaciones del PR

CI Web corre también en borradores. Usa el último Node 22 LTS; los lockfiles
incluyen dependencias que exigen Node 22.13 o posterior. Las corridas locales
hechas en otro runtime se documentan con su versión, sin atribuirles paridad
con Actions.

## ESLint frente a la base

El job audita todo `src` en el commit del PR y en el SHA de su base, usando las
mismas dependencias y configuración. Publica los dos diagnósticos completos y
el delta. Su nombre «sin regresiones frente a base» acredita ausencia de
errores nuevos: no acredita que la deuda global de ESLint esté cerrada.

Cada diagnóstico se identifica por archivo, regla, mensaje y línea de código,
y se cuenta cada aparición. Mover código intacto no crea una regresión; retirar
un error no compensa otro nuevo en una declaración distinta. Una configuración
cambiada o un reporte incompleto impiden acreditar la comparación.

Para comprobar el comparador:

```bash
node --test scripts/ci/eslint.test.mjs
```

Para reproducir la auditoría, instala las dependencias con `npm ci` y ejecuta
`node scripts/ci/eslint.mjs`. Puedes definir `CI_BASE_SHA` con el SHA completo de
la base y `CI_OUTPUT_DIR` con una carpeta fuera del working tree. Sin SHA
explícito se usa `origin/main`, que debe estar actualizado. El script crea y
retira un worktree temporal; no modifica la base ni realiza un push.

Actions exige un checkout limpio. Una corrida local con cambios se etiqueta
como snapshot y registra el HEAD de referencia y la huella SHA-256 de las
fuentes. Si estas cambian durante la auditoría, el gate falla.

## Tipos, pruebas y evidencia

TypeScript revisa el repositorio completo e instala también las dependencias
de Electron. Las pruebas usan fixtures y mocks; este workflow no recibe
credenciales de producción. La URL Supabase apunta a `127.0.0.1:54321` y las
claves anónima y de servicio son cadenas ficticias. Estas permiten construir
clientes lazy y firmar fixtures sin compartir secretos reales. No se activa
`RUN_LIVE`; las suites que comprueban la ausencia de configuración eliminan
las variables explícitamente durante esos casos.

`jest.mjs` conserva la configuración de Jest del repositorio, con dos workers
y reciclaje de memoria. La suite completa se reparte en dos partes por zona
(UTC y America/Bogota), sin excluir archivos. Las pruebas de zonas horarias
corren además en UTC, Bogotá, Ciudad de México, Madrid, Santiago y Katmandú.
El wrapper transmite el código de salida de Jest: los fallos bloquean el job.

Los JSON, logs y resúmenes se publican incluso cuando falla la comprobación.
Los resultados omitidos por las definiciones de tests se muestran aparte.
Estos artefactos documentan la corrida del job; no reutilizan resultados
declarados de ejecuciones anteriores.
