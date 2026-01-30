import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OrganizationAIConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemRules: string | null;
  tone: string;
  language: string;
  fallbackMessage: string;
  confidenceThreshold: number;
  maxFragmentsContext: number;
  isActive: boolean;
}

export interface AIResponseOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  organizationConfig?: OrganizationAIConfig;
}

export interface AIResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

export interface ConversationContext {
  customerName: string;
  customerEmail?: string;
  channelType: string;
  conversationHistory: Array<{
    role: 'customer' | 'agent' | 'ai';
    content: string;
    timestamp: string;
  }>;
  organizationName?: string;
  agentName?: string;
}

const DEFAULT_SYSTEM_PROMPT = `Eres un asistente de servicio al cliente profesional y amable. Tu objetivo es ayudar a los clientes de manera eficiente y cordial.

Directrices:
- Responde siempre en español
- Sé conciso pero completo en tus respuestas
- Mantén un tono profesional y amigable
- Si no tienes información suficiente, pide aclaraciones
- Ofrece soluciones concretas cuando sea posible
- No inventes información que no tengas
- Si el cliente está frustrado, muestra empatía primero`;

const TONE_PROMPTS: Record<string, string> = {
  professional: 'Mantén un tono profesional y corporativo.',
  friendly: 'Sé amigable y cercano, usa un tono cálido.',
  formal: 'Usa un lenguaje formal y respetuoso.',
  casual: 'Sé casual y relajado, como hablando con un amigo.',
  empathetic: 'Muestra empatía y comprensión en cada respuesta.',
};

const LANGUAGE_PROMPTS: Record<string, string> = {
  es: 'Responde siempre en español.',
  en: 'Always respond in English.',
  pt: 'Responda sempre em português.',
  fr: 'Répondez toujours en français.',
};

class OpenAIService {
  private defaultModel: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;

  constructor() {
    this.defaultModel = process.env.OPENAI_MODEL || 'gpt-4o';
    this.defaultTemperature = 0.7;
    this.defaultMaxTokens = 1000;
  }

  buildSystemPromptFromConfig(config: OrganizationAIConfig, basePrompt?: string): string {
    let prompt = config.systemRules || basePrompt || DEFAULT_SYSTEM_PROMPT;
    
    const tonePrompt = TONE_PROMPTS[config.tone] || TONE_PROMPTS.professional;
    const languagePrompt = LANGUAGE_PROMPTS[config.language] || LANGUAGE_PROMPTS.es;
    
    prompt += `\n\nInstrucciones adicionales:
- ${tonePrompt}
- ${languagePrompt}`;

    return prompt;
  }

  getConfigValues(options?: AIResponseOptions): { model: string; temperature: number; maxTokens: number } {
    const config = options?.organizationConfig;
    
    return {
      model: options?.model || config?.model || this.defaultModel,
      temperature: options?.temperature ?? config?.temperature ?? this.defaultTemperature,
      maxTokens: options?.maxTokens ?? config?.maxTokens ?? this.defaultMaxTokens,
    };
  }

  async generateResponse(
    messages: ChatMessage[],
    options?: AIResponseOptions
  ): Promise<AIResponse> {
    try {
      const { model, temperature, maxTokens } = this.getConfigValues(options);

      const response = await openai.chat.completions.create({
        model,
        messages: messages,
        temperature,
        max_tokens: maxTokens,
      });

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage;

      return {
        content,
        usage: {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
        },
        model: response.model,
      };
    } catch (error) {
      console.error('Error en OpenAI:', error);
      throw error;
    }
  }

  async generateChatResponse(
    context: ConversationContext,
    options?: AIResponseOptions
  ): Promise<AIResponse> {
    const systemPrompt = options?.systemPrompt || this.buildSystemPrompt(context);
    
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.convertHistoryToMessages(context.conversationHistory),
    ];

    return this.generateResponse(messages, options);
  }

  async generateSuggestedResponse(
    context: ConversationContext,
    options?: AIResponseOptions
  ): Promise<AIResponse> {
    const systemPrompt = `${options?.systemPrompt || DEFAULT_SYSTEM_PROMPT}

CONTEXTO:
- Cliente: ${context.customerName}
- Canal: ${context.channelType}
${context.organizationName ? `- Empresa: ${context.organizationName}` : ''}
${context.agentName ? `- Agente: ${context.agentName}` : ''}

Tu tarea es generar una respuesta sugerida para el agente basándote en el historial de la conversación. La respuesta debe ser profesional y resolver la consulta del cliente.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.convertHistoryToMessages(context.conversationHistory),
      { 
        role: 'user', 
        content: 'Genera una respuesta apropiada para el último mensaje del cliente.' 
      },
    ];

    return this.generateResponse(messages, {
      ...options,
      temperature: 0.5,
    });
  }

  async generateConversationSummary(
    context: ConversationContext
  ): Promise<{ summary: string; keyPoints: string[]; sentiment: string }> {
    const systemPrompt = `Eres un asistente que analiza conversaciones de servicio al cliente. Tu tarea es:
1. Generar un resumen conciso de la conversación
2. Identificar los puntos clave (máximo 5)
3. Determinar el sentimiento general del cliente (positive, neutral, negative)

Responde en formato JSON con la siguiente estructura:
{
  "summary": "resumen de la conversación",
  "keyPoints": ["punto 1", "punto 2"],
  "sentiment": "positive|neutral|negative"
}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.convertHistoryToMessages(context.conversationHistory),
      { role: 'user', content: 'Analiza esta conversación y proporciona el resumen en formato JSON.' },
    ];

    try {
      const response = await this.generateResponse(messages, {
        temperature: 0.3,
        maxTokens: 500,
      });

      const parsed = JSON.parse(response.content);
      return {
        summary: parsed.summary || '',
        keyPoints: parsed.keyPoints || [],
        sentiment: parsed.sentiment || 'neutral',
      };
    } catch (error) {
      console.error('Error parseando respuesta de resumen:', error);
      return {
        summary: 'No se pudo generar el resumen',
        keyPoints: [],
        sentiment: 'neutral',
      };
    }
  }

  async classifyIntent(
    message: string
  ): Promise<{ intent: string; confidence: number; suggestedTags: string[] }> {
    const systemPrompt = `Eres un clasificador de intenciones de mensajes de clientes. Analiza el mensaje y determina:
1. La intención principal (consulta, queja, solicitud, agradecimiento, saludo, despedida, urgente, otro)
2. Un nivel de confianza (0-1)
3. Tags sugeridos para la conversación

Responde en formato JSON:
{
  "intent": "consulta|queja|solicitud|agradecimiento|saludo|despedida|urgente|otro",
  "confidence": 0.95,
  "suggestedTags": ["tag1", "tag2"]
}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ];

    try {
      const response = await this.generateResponse(messages, {
        temperature: 0.2,
        maxTokens: 200,
      });

      const parsed = JSON.parse(response.content);
      return {
        intent: parsed.intent || 'otro',
        confidence: parsed.confidence || 0.5,
        suggestedTags: parsed.suggestedTags || [],
      };
    } catch (error) {
      console.error('Error clasificando intención:', error);
      return {
        intent: 'otro',
        confidence: 0,
        suggestedTags: [],
      };
    }
  }

  async generateAutoResponse(
    context: ConversationContext,
    knowledgeBase?: string[]
  ): Promise<AIResponse> {
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;

    if (knowledgeBase && knowledgeBase.length > 0) {
      systemPrompt += `\n\nBase de conocimiento disponible:\n${knowledgeBase.join('\n---\n')}`;
    }

    systemPrompt += `\n\nCONTEXTO:
- Cliente: ${context.customerName}
- Canal: ${context.channelType}

Responde directamente al cliente de manera profesional y útil.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.convertHistoryToMessages(context.conversationHistory),
    ];

    return this.generateResponse(messages, {
      temperature: 0.6,
    });
  }

  private buildSystemPrompt(context: ConversationContext): string {
    return `${DEFAULT_SYSTEM_PROMPT}

CONTEXTO DE LA CONVERSACIÓN:
- Cliente: ${context.customerName}
- Canal: ${context.channelType}
${context.organizationName ? `- Empresa: ${context.organizationName}` : ''}
${context.agentName ? `- Agente asistido: ${context.agentName}` : ''}`;
  }

  private convertHistoryToMessages(
    history: ConversationContext['conversationHistory']
  ): ChatMessage[] {
    return history.map((msg) => ({
      role: msg.role === 'customer' ? 'user' as const : 'assistant' as const,
      content: msg.content,
    }));
  }

  calculateCost(usage: AIResponse['usage'], model: string): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 0.0025, output: 0.01 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'o1': { input: 0.015, output: 0.06 },
      'o1-mini': { input: 0.003, output: 0.012 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    };

    const modelPricing = pricing[model] || pricing['gpt-4o-mini'];
    const inputCost = (usage.promptTokens / 1000) * modelPricing.input;
    const outputCost = (usage.completionTokens / 1000) * modelPricing.output;

    return inputCost + outputCost;
  }
}

export const openaiService = new OpenAIService();
export default OpenAIService;
