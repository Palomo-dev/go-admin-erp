/**
 * Test Script — Simula mensajes de Twilio ConversationRelay
 * GO Admin ERP
 *
 * Uso: npm run ws:test
 * Requiere que ws-server.ts esté corriendo (npm run ws:dev)
 */

import WebSocket from 'ws';

const WS_URL = process.env.WS_TEST_URL || 'ws://localhost:8080/conversation-relay';

console.log(`\n🧪 Test ConversationRelay`);
console.log(`   Conectando a: ${WS_URL}\n`);

const ws = new WebSocket(WS_URL);

let messageCount = 0;

ws.on('open', () => {
  console.log('✅ Conexión WebSocket establecida\n');

  // Paso 1: Enviar mensaje "setup" (simula lo que Twilio envía al conectar)
  const setupMessage = {
    type: 'setup',
    callSid: 'CA_TEST_' + Date.now(),
    from: '+573001234567',
    to: process.env.TWILIO_PHONE_NUMBER || '+18506003708',
    accountSid: 'AC_TEST',
    customParameters: {
      orgId: '2', // Org de prueba
    },
  };

  console.log('📤 Enviando setup:', JSON.stringify(setupMessage, null, 2));
  ws.send(JSON.stringify(setupMessage));

  // Paso 2: Después de 3 segundos, enviar un "prompt" (simula texto del usuario)
  setTimeout(() => {
    const promptMessage = {
      type: 'prompt',
      voiceInput: '¿Tienen disponibilidad para este fin de semana?',
      lang: 'es-MX',
      last: true,
    };
    console.log('\n📤 Enviando prompt:', promptMessage.voiceInput);
    ws.send(JSON.stringify(promptMessage));
  }, 3000);

  // Paso 3: Después de 10 segundos, enviar otro prompt
  setTimeout(() => {
    const promptMessage2 = {
      type: 'prompt',
      voiceInput: 'Somos 2 personas, queremos una habitación doble.',
      lang: 'es-MX',
      last: true,
    };
    console.log('\n📤 Enviando prompt:', promptMessage2.voiceInput);
    ws.send(JSON.stringify(promptMessage2));
  }, 10000);

  // Paso 4: Después de 20 segundos, cerrar conexión
  setTimeout(() => {
    console.log('\n🔌 Cerrando conexión...');
    ws.close();
  }, 20000);
});

ws.on('message', (data) => {
  messageCount++;
  const msg = JSON.parse(data.toString());
  
  if (msg.type === 'text') {
    console.log(`📥 [${messageCount}] Agente: ${msg.token}${msg.last ? ' (fin)' : ''}`);
  } else if (msg.type === 'end') {
    console.log(`📥 [${messageCount}] Fin de conversación`);
  } else {
    console.log(`📥 [${messageCount}] Mensaje:`, msg);
  }
});

ws.on('close', (code, reason) => {
  console.log(`\n🔒 Conexión cerrada (code: ${code})`);
  console.log(`📊 Total mensajes recibidos: ${messageCount}`);
  console.log('✅ Test completado\n');
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ Error:', error.message);
  console.log('\n💡 ¿Está corriendo el WS server? → npm run ws:dev\n');
  process.exit(1);
});
