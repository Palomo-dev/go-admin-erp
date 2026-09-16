# PROMPT RONDA 4 — Cerrar la migración de fechas

> Continuación de `docs/PROMPT-fix-fechas-timezone.md` (ronda 1),
> `docs/PROMPT-fechas-ronda2-correcciones.md` y `docs/PROMPT-fechas-ronda3.md`.
> Estado verificado contra el repo y contra producción el **2026-09-14**.
> Esta ronda es notablemente más pequeña que las anteriores: lo estructural ya está resuelto.

---

## 0. Estado verificado — no rehagas nada de esto

El commit `ce31e4fb` (244 archivos, +5260/−740) está mergeado en `main`, y `b87a893a` encima.
Ambos verificados: los números del resumen coinciden con el repo.

**Confirmado funcionando:**

- Capa de fechas: `src/lib/utils/dateDisplay.ts`, `src/lib/context/OrganizationTimezoneContext.tsx`
  (`useFormatDate()`, `useOrgTimezone()`), `src/lib/utils/timezone.ts`. **64 archivos ya adoptaron el hook.**
- Base de datos, aplicado y verificado en producción:
  `fn_today_for_org(org)`, `fn_today_system()`, `organizations.timezone` con 83/83 organizaciones
  pobladas, cero columnas con `DEFAULT CURRENT_DATE`, y ningún trigger que lea `NEW.organization_id`
  en una tabla que no la tenga.
- 7 migraciones + 7 rollbacks en el repo, registradas en `schema_migrations`.
- `.github/workflows/ci-web.yml` con matriz `TZ=UTC` / `TZ=America/Bogota`.
- El cambio de `/s` a `[\s\S]` en `src/__tests__/guardrails.test.ts` es correcto y no debilita
  ninguna aserción. Revisado.

**Los datos históricos son correctos.** Nunca ejecutes un `UPDATE` masivo sobre columnas de fecha.

---

## P0. La reimpresión de tickets usa el reloj del PC

Lo más barato de arreglar y lo único que el cliente ve en papel.

`printService` acepta y reenvía `timezone` correctamente, y estos tres sitios le pasan el valor real
desde `useOrgTimezone()`:

- `src/components/pos/CheckoutDialog.tsx`
- `src/components/pos/CartView.tsx`
- `src/app/app/pos/mesas/[id]/page.tsx`

**Estos dos no lo pasan:**

- `src/components/pos/ventas/VentaDetalle.tsx` — ya usa `useFormatDate()` para la pantalla, pero no
  le pasa el timezone a `PrintService`.
- `src/components/pos/ventas/VentasPage.tsx` — no usa ningún hook de timezone.

Como el parámetro es opcional (`timezone?: string`), no falla: cae silenciosamente al reloj del PC
de la impresora. El resultado es que el ticket que sale bien al cobrar puede salir con otra fecha si
se reimprime desde el detalle de la venta o desde el listado.

**Qué hacer:** pasar el timezone de la organización en ambos, igual que en `CheckoutDialog`.
Luego considera si `timezone` debería dejar de ser opcional en las firmas de `PrintService`, para que
el compilador impida volver a olvidarlo — evalúa el costo en call-sites antes de decidir.

---

## P1. Terminar los call-sites de escritura. Es el trabajo que queda.

Medido con el mismo grep antes y después:

| | antes | ahora |
|---|---|---|
| `toISOString().split('T')` / `.slice(0,10)` | 388 en 194 archivos | **320 en 165 archivos** |
| `parseLocalDate` | 90 | 68 |

La capa de **presentación** avanzó mucho y ya arregla el síntoma visible. El patrón de **escritura**
—el que mete la fecha equivocada *dentro* de la base— bajó solo un 18%. El criterio de aceptación
era cero.

Ojo con la asimetría: un error de presentación se ve y se corrige; un error de escritura queda
guardado y contamina reportes, cierres contables y vencimientos hacia atrás. Lo que queda es la
mitad más cara de equivocarse.

**Método, igual que en las rondas anteriores:**

1. Un PR por módulo. Empieza por los módulos que ya están en el bloque `error` de `.eslintrc.json`
   pero que todavía tienen ocurrencias — ahí el lint ya te marca exactamente qué falta.
2. Para cada valor, determina si la columna destino es `timestamptz` o `date` **consultando
   `information_schema.columns`**, no por el nombre. `timestamptz` → `plainDateToInstant()` /
   `toInstant()`. `date` → `toPlainDate()` / `todayInTz()`.
3. Al terminar un módulo, muévelo (o confirma que ya está) en el bloque `error` de `.eslintrc.json`.
4. Un test por módulo que corra con `TZ=UTC` y con `TZ=America/Bogota`.
5. **Reporta el conteo del grep al inicio y al final de cada PR.** Es la única métrica que importa
   aquí y hace el progreso indiscutible.

Nada de find-and-replace ciego: la decisión `timestamptz` vs `date` es caso por caso.

---

## P2. El lint en CI no rompe el build

`.github/workflows/ci-web.yml`, job `lint`:

```yaml
      - run: npm run lint
        continue-on-error: true
```

Está honestamente comentado, y como decisión provisional se entiende: con 320 ocurrencias
pendientes, un lint bloqueante dejaría el pipeline en rojo permanente, y un CI siempre rojo se
ignora — que es peor que no tenerlo.

Pero mientras siga así, la regla anti-regresión no protege nada en CI: código nuevo puede
reintroducir el patrón sin que nadie se entere.

**La salida sin rojo permanente:** lintear solo los archivos cambiados en el PR, de forma bloqueante,
en vez de todo el repo con `continue-on-error`. Así el código nuevo no puede reintroducir el patrón,
y la deuda histórica no bloquea a nadie. Cuando P1 llegue a cero, se pasa a lint completo bloqueante
y se borra el filtro.

Implementa esa variante, o propón otra y justifícala — pero el job no debería quedarse como está.

---

## P3. Revisar la migración de sucursal por defecto en CRM

`supabase/migrations/20260911160000_sucursal_por_defecto_en_tablas_crm.sql` no tiene relación con
fechas y entró dentro del commit de 244 archivos, sin revisión propia.

Crea `fn_org_main_branch(p_org_id)` y `fn_set_branch_from_org()`, y monta triggers `BEFORE INSERT` en
`opportunities`, `conversations`, `messages` y `activities`.

Puede estar perfectamente bien. Lo que hay que confirmar es:

1. **Rendimiento en `messages`**, que es la tabla de más volumen de las cuatro: el trigger hace un
   lookup por fila. Mide el impacto de un insert masivo (una sincronización de WhatsApp, una
   importación) antes de darlo por bueno. Si pesa, evalúa cachear por transacción o resolver la
   sucursal en la capa de aplicación.
2. Qué pasa cuando `fn_org_main_branch` no encuentra sucursal principal: ¿deja `branch_id` en NULL o
   lanza excepción? Debe degradar, nunca romper el INSERT. Pruébalo con el patrón de
   INSERT-con-rollback de la ronda 3.
3. Que el rollback correspondiente efectivamente revierta los cuatro triggers.

Si todo está bien, documéntalo en `docs/hallazgos/` y cierra el punto. Si no, corrígelo en su propia
migración.

---

## Criterios de aceptación

- [ ] `VentaDetalle.tsx` y `VentasPage.tsx` pasan el timezone de la organización a `PrintService`;
      reimprimir un ticket de una venta nocturna muestra la misma fecha que el ticket original.
- [ ] El conteo de `toISOString().split('T')` / `.slice(0,10)` baja de forma medible y reportada en
      cada PR, con meta en **0**.
- [ ] El job de lint en CI falla ante una violación nueva introducida en un PR.
- [ ] La migración CRM queda revisada: medición de rendimiento en `messages`, comportamiento ante
      sucursal ausente verificado, rollback probado.
- [ ] `npm run test:tz-all` pasa.
- [ ] Cero `UPDATE` sobre datos históricos de fechas.

---

## Reglas de trabajo

Las mismas de siempre, y vale decir que esta última ronda las cumplió — los números del resumen
coincidieron con el repo, que no había pasado antes:

1. Cada "está hecho" viene con el comando o la consulta que lo demuestra.
2. Una parte hecha se reporta como una parte. "320 ocurrencias restantes, bajé de 388" es una
   respuesta mejor que "migración completa".
3. Todo DDL por `apply_migration`, con archivo en `supabase/migrations/` y rollback.
4. Un PR por punto. Cambios sin relación con el objetivo del PR van en su propio commit, aunque sean
   pequeños — P3 existe por eso.
5. Si algo acá contradice lo que encuentres en el código o en la base, dilo.
