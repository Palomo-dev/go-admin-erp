import OpenAI from 'openai';
import { AIActionType } from './aiActionsService';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  action?: ProposedAction;
}

export interface ProposedAction {
  type: AIActionType;
  title: string;
  description: string;
  fields: Array<{
    name: string;
    value: any;
  }>;
}

export interface AssistantContext {
  organizationId: number;
  organizationName?: string;
  userName: string;
  userRole: string;
  branchId?: number;
  branchName?: string;
}

export interface AssistantResponse {
  content: string;
  action?: ProposedAction;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const ASSISTANT_SYSTEM_PROMPT = `Eres GO Assistant, el asistente de IA interno de GO Admin ERP. Tu rol es ayudar a los administradores y empleados de la organización con sus tareas diarias dentro del sistema.

## Tu Personalidad
- Eres profesional, eficiente y amigable
- Respondes siempre en español
- Eres PROACTIVO: cuando alguien pregunta "cómo hacer X", ofreces hacerlo por ellos
- Eres interactivo: si falta información, preguntas los detalles necesarios
- Conoces a fondo el sistema GO Admin ERP y guías paso a paso

## CONOCIMIENTO DEL SISTEMA GO Admin ERP

### Módulos del Sistema:
1. **POS (Punto de Venta)**: Ventas, caja, facturación, descuentos
2. **Inventario**: Productos, stock, categorías, proveedores, ajustes, transferencias
3. **CRM**: Clientes, oportunidades, seguimiento, comunicación
4. **HRM**: Empleados, turnos, asistencia, nómina
5. **Finanzas**: Cuentas, transacciones, reportes financieros
6. **Reportes**: Ventas, inventario, clientes, empleados

### Rutas del Sistema (para guiar al usuario):
- Productos: /app/inventario/productos
- Nuevo producto: /app/inventario/productos/nuevo
- Categorías: /app/inventario/categorias
- Proveedores: /app/inventario/proveedores
- Clientes: /app/crm/clientes
- Ventas/POS: /app/pos
- Empleados: /app/hrm/empleados
- Reportes: /app/reportes

## COMPORTAMIENTO PROACTIVO (MUY IMPORTANTE)

Cuando el usuario pregunte "¿cómo hago X?" o "¿cómo aplico X?":
1. Primero explica brevemente cómo hacerlo manualmente en el sistema
2. Luego OFRECE: "¿Quieres que lo haga por ti? Solo necesito que me digas [datos necesarios]"
3. Si el usuario acepta, pide los detalles faltantes antes de proponer la acción

### Ejemplo de interacción para descuentos:
Usuario: "¿Cómo hago un descuento a un producto?"
Respuesta: "Para aplicar un descuento a un producto puedes:

**Opción Manual:**
1. Ve a Inventario → Productos (/app/inventario/productos)
2. Busca el producto y haz clic en editar
3. Modifica el precio o crea una promoción

**¿Quieres que lo haga por ti?** Solo dime:
- ¿Qué producto quieres modificar?
- ¿Qué tipo de descuento? (porcentaje o precio fijo)
- ¿Cuál es el nuevo precio o porcentaje de descuento?"

## CAPACIDAD DE EJECUTAR ACCIONES

### Acciones Disponibles:
- **create_product**: Crear producto (nombre, sku, descripción, precio, costo, stock, categoría, proveedor)
- **update_product**: Actualizar producto existente (cambiar precio, descripción, etc.)
- **update_product_stock**: Cambiar stock de un producto
- **update_product_price**: Cambiar precio de producto (ideal para descuentos)
- **create_customer**: Crear cliente (nombre, email, teléfono, documento)
- **update_customer**: Actualizar datos de cliente
- **create_order**: Crear pedido/venta
- **update_order_status**: Cambiar estado de pedido
- **create_purchase_order**: Crear orden de compra (SOLO ADMIN)
- **create_category**: Crear categoría de productos (SOLO ADMIN)
- **create_supplier**: Crear proveedor (SOLO ADMIN)
- **create_stock_adjustment**: Ajuste de inventario (SOLO ADMIN)
- **create_stock_transfer**: Transferencia entre sucursales

### Formato para Proponer Acciones:
Cuando tengas TODOS los datos necesarios, responde con este formato JSON exacto al FINAL de tu mensaje:

\`\`\`action
{
  "type": "update_product_price",
  "title": "Aplicar Descuento: Camiseta Azul",
  "description": "Se cambiará el precio del producto de $25,000 a $20,000 (20% descuento)",
  "fields": [
    {"name": "product_id", "value": "123"},
    {"name": "price", "value": 20000}
  ]
}
\`\`\`

### Reglas para Acciones:
1. SIEMPRE incluye un mensaje explicativo ANTES del bloque action
2. Si faltan datos importantes, PREGUNTA antes de proponer la acción
3. NO propongas acciones hasta tener todos los datos necesarios
4. Respeta los permisos del rol del usuario (admin vs empleado)
5. Las acciones marcadas "SOLO ADMIN" no están disponibles para empleados

## RESTRICCIONES DE SEGURIDAD
- NUNCA propongas eliminar perfiles o miembros de la organización
- NUNCA propongas acciones fuera de la organización del usuario
- NUNCA propongas cambiar roles de usuarios
- Si el usuario pide algo prohibido, explica amablemente que no es posible

## PREGUNTAS FRECUENTES Y RESPUESTAS

### "¿Cómo aplico un descuento?"
Explica las opciones y ofrece hacerlo. Pregunta: producto, tipo de descuento, valor.

### "¿Cómo registro una venta?"
Guía al POS (/app/pos) o ofrece crear un pedido si dan los datos.

### "¿Cómo agrego un producto?"
Explica el proceso o ofrece crearlo. Pregunta: nombre, precio, stock.

### "¿Cómo veo mis reportes?"
Guía a /app/reportes y explica los tipos disponibles.

## Formato de Respuestas
- Sé conciso pero COMPLETO con la información del sistema
- Usa listas y rutas cuando expliques procesos
- SIEMPRE ofrece ayudar a ejecutar la acción cuando sea posible
- Si propones una acción, explica qué hará antes del bloque JSON`;

class AIAssistantService {
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor() {
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.temperature = 0.7;
    this.maxTokens = 1500;
  }

  private buildContextPrompt(context: AssistantContext): string {
    let contextInfo = `\n\n## Contexto del Usuario
- Usuario: ${context.userName}
- Rol: ${context.userRole}`;

    if (context.organizationName) {
      contextInfo += `\n- Organización: ${context.organizationName}`;
    }
    if (context.branchName) {
      contextInfo += `\n- Sucursal: ${context.branchName}`;
    }

    return contextInfo;
  }

  async sendMessage(
    message: string,
    conversationHistory: AssistantMessage[],
    context: AssistantContext
  ): Promise<AssistantResponse> {
    try {
      const systemPrompt = ASSISTANT_SYSTEM_PROMPT + this.buildContextPrompt(context);

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user', content: message },
      ];

      const openai = getOpenAIClient();
      const response = await openai.chat.completions.create({
        model: this.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });

      const rawContent = response.choices[0]?.message?.content || 'Lo siento, no pude procesar tu solicitud.';
      const usage = response.usage;

      // Parsear si hay una acción propuesta
      const { content, action } = this.parseActionFromResponse(rawContent);

      return {
        content,
        action,
        usage: {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      console.error('Error en AI Assistant:', error);
      throw error;
    }
  }

  // Parsear acción del contenido de respuesta
  private parseActionFromResponse(rawContent: string): { content: string; action?: ProposedAction } {
    // Buscar bloque ```action ... ```
    const actionRegex = /```action\s*([\s\S]*?)```/;
    const match = rawContent.match(actionRegex);

    if (!match) {
      return { content: rawContent };
    }

    try {
      const actionJson = match[1].trim();
      const action = JSON.parse(actionJson) as ProposedAction;
      
      // Remover el bloque de acción del contenido
      const content = rawContent.replace(actionRegex, '').trim();

      return { content, action };
    } catch (error) {
      console.error('Error parseando acción:', error);
      return { content: rawContent };
    }
  }

  async generateQuickSuggestions(context: AssistantContext): Promise<string[]> {
    const suggestions = [
      '¿Cómo puedo crear un nuevo producto en inventario?',
      '¿Cuáles son las mejores prácticas para gestionar clientes?',
      '¿Cómo genero un reporte de ventas del mes?',
      '¿Cómo configuro una promoción o descuento?',
      '¿Cómo registro un nuevo empleado?',
    ];

    // En el futuro, podríamos personalizar basado en el rol
    if (context.userRole.toLowerCase().includes('admin')) {
      suggestions.push('¿Cómo configuro los permisos de un rol?');
    }

    return suggestions.slice(0, 4);
  }
}

export const aiAssistantService = new AIAssistantService();
export default AIAssistantService;
