# ADR-CC-003 · Org de prueba 149 y verificación E2E por SQL

**Fecha:** 2026-09-23 · **Estado:** vigente

## Contexto

El mandato indicaba usar la org 148 «TEST F42-F45 E2E». No existe:
`organizations_id_seq` está en 148 y no hay fila con ese id; la org se creó y se
borró. Además, probar por la UI exige un usuario de prueba con acceso, y
`organization_members.user_id` referencia `auth.users`.

## Decisión

- Se crea la org **149 «TEST cierre contable E2E»** (Colombia, COP). Sus
  disparadores de alta sembraron la sucursal 129, 45 cuentas, las reglas por
  defecto y los 6 impuestos de COL. Queda viva al terminar.
- **No se crea ninguna cuenta de acceso.** Crear un usuario de `auth.users` es
  crear una cuenta, y eso lo hace una persona. Las filas de prueba llevan como
  autor el usuario del dueño del repositorio, que **no** se agrega como miembro
  de la 149.
- Los casos E2E se verifican por SQL, replicando las escrituras exactas de cada
  ruta (mismas tablas, mismo orden, misma agrupación en transacciones), y cada
  caso lleva su consulta y su resultado.

## Consecuencias

- Queda pendiente de una persona: crear el usuario de prueba miembro solo de la
  149 y recorrer los casos por la interfaz, en particular la advertencia visible
  de «producto sin impuesto» (caso f) y la llamada real a `pos_checkout_v1`, que
  exige un miembro activo.
