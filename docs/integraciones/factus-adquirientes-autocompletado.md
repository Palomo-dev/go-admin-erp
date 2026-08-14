# Endpoint de Adquirientes de Factus - Autocompletado de Clientes

> **Fecha de implementación:** 2026-08-14
> **Módulos afectados:** CRM (clientes), Inventario (proveedores)
> **Proveedores:** Verifik (primario) + CoreSoft (fallback) + Factus (adquirientes)
> **Proyecto Supabase:** `jgmgphmzusbluqhuqihj`

---

## 1. Objetivo

Aprovechar el endpoint `GET /v2/dian/acquirer` de Factus (ya contratado para facturación electrónica) para autocompletar el **nombre** y **correo electrónico** de clientes y proveedores desde la base oficial de DIAN, sin contratar un proveedor adicional.

---

## 2. Qué entrega el endpoint

### Endpoint

```
GET /v2/dian/acquirer?identification_document_code={code}&identification_number={number}
Authorization: Bearer {factus_access_token}
Accept: application/json
```

- **Sandbox**: `https://api-sandbox.factus.com.co/v2/dian/acquirer`
- **Producción**: `https://api.factus.com.co/v2/dian/acquirer`

### Parámetros

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `identification_document_code` | string | Código DIAN (`13`=CC, `31`=NIT, `41`=Pasaporte, etc.) |
| `identification_number` | string | Número de documento sin DV ni guiones |

### Respuesta (HTTP 200)

```json
{
  "status": "OK",
  "message": "Solicitud exitosa",
  "data": {
    "name": "Nombre Cédula de ciudadanía 5",
    "email": "Mail_Cédula de ciudadanía[email protected]"
  }
}
```

**Campos devueltos:**
- `data.name` — Nombre o razón social del adquiriente
- `data.email` — Correo electrónico registrado en DIAN

### Limitaciones

El endpoint **SOLO devuelve nombre y email**. NO devuelve:
- ❌ Teléfono
- ❌ Dirección
- ❌ Responsabilidades fiscales (O-13, O-15, O-23, etc.)
- ❌ Régimen tributario
- ❌ CIIU
- ❌ Municipio
- ❌ DV
- ❌ Datos RUES

### Datos de prueba (sandbox)

| Tipo doc | Número | Nombre | Email |
|----------|--------|--------|-------|
| 11 | 1199991 | Nombre Registro civil 1 | Mail_Registro[email protected] |
| 12 | 1299991 | Nombre Tarjeta de identidad 1 | Mail_Tarjeta de[email protected] |
| 13 | 1399991 | Nombre Cédula de ciudadanía 1 | Mail_Cédula de ciudadanía[email protected] |
| 13 | 1399995 | Nombre Cédula de ciudadanía 5 | Mail_Cédula de ciudadanía[email protected] |
| 31 | 1699991 | Nombre NIT 1 | Mail_NIT[email protected] |

### Rate limit

- **80 solicitudes por minuto** por usuario
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
- Error al exceder: HTTP 429

### Códigos de error

| Código | Significado | Acción |
|--------|-------------|--------|
| 200 | OK | Procesar respuesta |
| 401 | Token inválido/expirado | Refrescar token |
| 404 | Adquiriente no encontrado | Mostrar "no encontrado" |
| 422 | Parámetros inválidos | Validar tipo/número |
| 429 | Rate limit excedido | Esperar `Retry-After` segundos |
| 500 | Error interno Factus | Reintentar o usar fallback |

---

## 3. Arquitectura implementada

```
src/
├── lib/services/
│   ├── factusService.ts              ← Agregado: getAcquirer() + FactusAcquirerResponse
│   ├── factusTokenManager.ts         ← Sin cambios (reutiliza getValidToken + getCredentials)
│   └── dianLookupService.ts          ← Agregado: 'factus' como proveedor terciario
├── app/api/
│   ├── factus/acquirer/route.ts      ← NUEVO: GET endpoint server-side
│   └── dian/lookup/route.ts          ← Sin cambios (usa dianLookupService que ya incluye Factus)
└── components/shared/
    └── DianLookupButton.tsx          ← Actualizado: muestra "Factus" en toast
```

### Flujo de consulta (3 proveedores con fallback)

```
1. Verificar cache (dian_lookup_cache, TTL 24h)
2. Verifik (primario)    → RUES completo + responsabilidades + representantes
3. CoreSoft (fallback 1) → régimen + teléfono + dirección
4. Factus (fallback 2)   → nombre + email (gratis, ya pagado)
5. Normalizar respuesta y guardar en cache
```

### Autenticación

Reutiliza el `factusTokenManager.ts` existente:
- `getValidToken()` — obtiene token OAuth2 cacheado (duracion 1 hora, refresh automático)
- `getCredentials()` — lee credenciales de variables de entorno

No requiere variables de entorno nuevas. Ya están configuradas:
```env
FACTUS_CLIENT_ID=...
FACTUS_CLIENT_SECRET=...
FACTUS_USERNAME=...
FACTUS_PASSWORD=...
FACTUS_ENVIRONMENT=sandbox
```

---

## 4. Archivos modificados

### 4.1 `src/lib/services/factusService.ts`

**Agregado:**
- Interfaz `FactusAcquirerResponse` — `{ name: string; email: string }`
- Función `getAcquirer(environment, accessToken, identificationDocumentCode, identificationNumber)` — consulta `GET /v2/dian/acquirer`
- `getAcquirer` agregado al objeto `factusService` exportado

### 4.2 `src/app/api/factus/acquirer/route.ts` (NUEVO)

Endpoint server-side que oculta las credenciales de Factus:
- `GET /api/factus/acquirer?documentType=13&documentNumber=123456789`
- Valida parámetros, obtiene token via `factusTokenManager`, llama a `factusService.getAcquirer`
- Maneja 404 (adquiriente no encontrado) como respuesta normal, no como error 500

### 4.3 `src/lib/services/dianLookupService.ts`

**Cambios:**
- Tipo `Provider` extendido: `'verifik' | 'coresoft' | 'factus'`
- `getProviderToken('factus')` devuelve `FACTUS_CLIENT_ID` (truthy si hay credenciales)
- Nueva función `consultarFactus(documentType, documentNumber)` — usa import dinámico de `factusTokenManager` y `factusService` para evitar dependencia circular
- Nueva función `normalizarFactus(acquirerData, documentType, documentNumber)` — mapea `{ name, email }` a `DianNormalizedData`
- Flujo `consultarDian` ahora itera sobre 3 proveedores: `[providerPrimario, providerSecundario, 'factus']`
- Mensaje de error actualizado para mencionar los 3 proveedores

### 4.4 `src/components/shared/DianLookupButton.tsx`

**Cambio:**
- `providerLabel` ahora maneja 3 casos: `'verifik'` → Verifik, `'coresoft'` → CoreSoft, `'factus'` → Factus

---

## 5. Comparativa: Factus vs Verifik vs CoreSoft

| Dato | Verifik | CoreSoft | Factus |
|------|---------|----------|--------|
| Nombre/razón social | ✅ | ✅ | ✅ |
| Email | ❌ | ❌ | ✅ |
| Teléfono | ❌ | ✅ | ❌ |
| Dirección | ❌ | ✅ | ❌ |
| Responsabilidades fiscales | ❌ | ✅ (texto) | ❌ |
| Régimen tributario | ❌ | ✅ (texto) | ❌ |
| CIIU | ❌ | ❌ | ❌ |
| RUES (representantes, matrícula) | ✅ | ✅ | ❌ |
| Firma digital/auditoría | ✅ | ❌ | ❌ |
| Costo adicional | Sí (créditos) | Sí (plan COP) | Incluido en plan facturación |
| Rate limit | Variable | Por plan | 80 req/min |

**Ventaja clave de Factus:** es el único proveedor que entrega **email** para personas naturales, y como ya se paga por facturación electrónica, no tiene costo adicional.

---

## 6. Cumplimiento legal

- Los datos provienen de la base oficial de DIAN (registrada por adquirientes 2023-2024)
- El uso está destinado a facturación electrónica, que es el caso de uso del ERP
- Se mantiene el checkbox de Habeas Data (Ley 1581/2012) en los formularios
- La auditoría se registra en `dian_lookup_cache` con `provider='factus'`
- Rate limit de 80 req/min previene uso abusivo

---

## 7. Verificación

### Comandos ejecutados (2026-08-14)

```bash
npx eslint src/lib/services/factusService.ts src/lib/services/dianLookupService.ts src/app/api/factus/acquirer/route.ts src/components/shared/DianLookupButton.tsx
# Resultado: sin errores

npm run build
# Resultado: exit code 0, build exitoso
```

### Pruebas manuales sugeridas

1. Configurar credenciales de Factus en `.env.local` (si no están):
   ```env
   FACTUS_CLIENT_ID=tu_client_id
   FACTUS_CLIENT_SECRET=tu_client_secret
   FACTUS_USERNAME=tu_username
   FACTUS_PASSWORD=tu_password
   FACTUS_ENVIRONMENT=sandbox
   ```

2. Probar el endpoint directo:
   ```bash
   curl "http://localhost:3000/api/factus/acquirer?documentType=13&documentNumber=1399995"
   ```
   Respuesta esperada:
   ```json
   {
     "success": true,
     "provider": "factus",
     "fromCache": false,
     "data": {
       "name": "Nombre Cédula de ciudadanía 5",
       "email": "Mail_Cédula de ciudadanía[email protected]"
     }
   }
   ```

3. Probar a través del flujo de autocompletado (deshabilitar Verifik y CoreSoft temporalmente):
   - Ir a Crear Cliente → ingresar cédula `1399995`
   - Presionar botón de consulta
   - Verificar que el toast muestre "Datos obtenidos desde Factus"
   - Verificar que se autocompleten nombre y email

4. Probar con NIT de prueba:
   - `documentType=31&documentNumber=1699991` → Nombre NIT 1

5. Probar error 404:
   - `documentType=13&documentNumber=9999999999` → "Adquiriente no encontrado en DIAN"

---

## 8. ¿Consume créditos del plan?

⚠️ **No documentado públicamente.** La documentación de Factus no especifica si este endpoint consume créditos. Recomendación: contactar a Factus para confirmar, y monitorear el consumo después de las primeras consultas en producción.

---

## 9. Fuentes consultadas

- **Endpoint adquirientes**: https://developers.factus.com.co/informacion-adquirientes/obtener-datos-adquiriente/
- **Tablas de referencia**: https://developers.factus.com.co/tablas-de-referencia/tablas/
- **Autenticación**: https://developers.factus.com.co/autenticacion/auth/
- **Rate limits**: https://developers.factus.com.co/limite-de-request
- **Documentación completa Factus**: https://developers.factus.com.co/
- **Guía DIAN consulta adquirientes**: https://www.dian.gov.co/impuestos/factura-electronica/Documents/Paso-a-paso-Servicio-de-consulta-para-completar-la-informacion.pdf
- **Postman collection**: https://developers.factus.com.co/coleccion

---

*Documento creado: 2026-08-14*
*GO Admin ERP - Endpoint de Adquirientes de Factus*
