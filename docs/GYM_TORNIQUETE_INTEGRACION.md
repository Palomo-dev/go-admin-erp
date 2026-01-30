# Integración Torniquete - Módulo Gym

## 📋 Estado Actual

**Estado:** ⏳ Pendiente - Esperando adquisición de hardware

**Fecha de documentación:** Enero 2026

---

## ✅ Lo que ya está implementado

### Sistema de QR Dinámico
- **Display QR:** `/gym-display/[deviceId]`
- **Gestión dispositivos:** `/app/gym/dispositivos`
- **Servicio:** `src/lib/services/gymDevicesService.ts`

### Funcionalidades activas:
1. QR dinámico que se regenera cada 30 segundos
2. Validación de membresía activa del cliente
3. Registro de check-in en tabla `member_checkins`
4. Soporte para múltiples dispositivos por sucursal

### Tablas en Supabase:
| Tabla | Propósito |
|-------|-----------|
| `gym_access_devices` | Dispositivos de acceso (torniquetes, kioscos, tablets) |
| `member_checkins` | Registro de entradas/salidas |
| `customer_biometrics` | Datos biométricos (huella digital) |
| `gym_memberships` | Membresías de clientes |

---

## 🔧 Lo que falta implementar

### 1. Integración con Hardware del Torniquete

Después de validar el check-in, el sistema debe enviar una señal al torniquete para que abra la barrera.

#### Opciones de integración:

**A) API HTTP del Torniquete**
```typescript
// Ejemplo conceptual
async function activarTorniquete(deviceId: string) {
  const response = await fetch(`http://${torniqueteIP}/api/open`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ gate: 1, duration: 5000 })
  });
  return response.ok;
}
```

**B) SDK del Fabricante**
- ZKTeco tiene SDK para Node.js
- HID Global tiene librerías REST
- Turnstar tiene API propietaria

**C) Relay/GPIO (Raspberry Pi)**
```typescript
// Ejemplo con GPIO
import { Gpio } from 'onoff';
const relay = new Gpio(17, 'out');

async function activarTorniquete() {
  relay.writeSync(1);
  await new Promise(r => setTimeout(r, 3000)); // 3 segundos abierto
  relay.writeSync(0);
}
```

**D) Webhook/MQTT**
```typescript
// El torniquete escucha eventos
await mqtt.publish('gym/torniquete/open', { deviceId, customerId });
```

---

## 📝 Información requerida para integrar

Cuando adquieras el torniquete, necesito saber:

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| **Marca** | Fabricante del torniquete | ZKTeco, HID, Boon Edam |
| **Modelo** | Modelo específico | TS2000, TripodMate |
| **Tipo conexión** | Cómo se comunica | Ethernet, RS485, USB |
| **IP/Puerto** | Dirección de red | 192.168.1.100:8080 |
| **API disponible** | Documentación técnica | URL o PDF |
| **SDK** | Librería de desarrollo | Node.js, Python, C# |
| **Protocolo** | Tipo de comunicación | REST, SOAP, TCP, Modbus |

---

## 🔄 Flujo completo propuesto

```
┌────────────────────────────────────────────────────────────────┐
│ 1. KIOSKO muestra QR dinámico                                  │
│    - Token único + deviceId + timestamp                        │
│    - Se regenera cada 30 segundos                              │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 2. CLIENTE escanea QR con app móvil del gym                    │
│    - Lee datos del QR                                          │
│    - Envía al backend: token + customerId                      │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 3. BACKEND valida                                              │
│    ├── Token válido y no expirado                              │
│    ├── Cliente existe y tiene membresía activa                 │
│    ├── Membresía no vencida                                    │
│    └── No hay restricciones (horario, días, etc.)              │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 4. SI VÁLIDO:                                                  │
│    ├── Registra check-in en member_checkins                    │
│    ├── ENVÍA SEÑAL AL TORNIQUETE → ABRE BARRERA               │
│    └── Muestra confirmación en pantalla del kiosko             │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 5. SI INVÁLIDO:                                                │
│    ├── Muestra error en kiosko (membresía vencida, etc.)       │
│    ├── NO activa torniquete                                    │
│    └── Opcionalmente notifica a recepción                      │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Seguridad

### Medidas implementadas:
- Tokens QR con expiración corta (30 segundos)
- Validación de membresía en tiempo real
- Registro de todos los intentos (exitosos y fallidos)
- RLS en Supabase para aislamiento por organización

### Medidas recomendadas para hardware:
- Comunicación cifrada (HTTPS/TLS) con el torniquete
- API keys rotativas para acceso al torniquete
- Red aislada (VLAN) para dispositivos de control de acceso
- Logs de auditoría en el torniquete

---

## 🛠️ Archivos a modificar cuando se integre

```
src/lib/services/
├── gymDevicesService.ts      ← Agregar función activarTorniquete()
└── turnstileService.ts       ← NUEVO: Lógica específica del hardware

src/app/api/gym/
└── turnstile/
    └── route.ts              ← NUEVO: Endpoint para señal de apertura

src/lib/config/
└── turnstileConfig.ts        ← NUEVO: Configuración del hardware
```

---

## 📱 Alternativa: Huella Digital

El sistema también soporta lectura de huella digital:

### Tabla `customer_biometrics`:
- `customer_id` - Cliente
- `biometric_type` - 'fingerprint'
- `finger_index` - Dedo (0-9)
- `template_data` - Plantilla biométrica encriptada
- `device_enrolled_on` - Dispositivo donde se registró

### Flujo con huella:
1. Cliente coloca dedo en lector del torniquete
2. Torniquete envía plantilla al backend
3. Backend busca coincidencia en `customer_biometrics`
4. Si match → valida membresía → abre torniquete

---

## 📞 Contacto para integración

Cuando tengas el torniquete, proporciona:
1. Manual técnico / API documentation
2. Credenciales de acceso al panel del torniquete
3. IP y puerto del dispositivo en la red local

---

## 📚 Referencias útiles

- [ZKTeco SDK Documentation](https://www.zkteco.com/en/download_catgory.html)
- [HID Access Control API](https://www.hidglobal.com/products/software/access-control)
- [Raspberry Pi GPIO for Relay Control](https://www.raspberrypi.org/documentation/usage/gpio/)

---

*Documentación creada para futura implementación. Actualizar cuando se adquiera el hardware.*
