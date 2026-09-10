import {
  buildOutboundBrowserTwiml,
  buildInboundTwiml,
  buildConsentTwiml,
  buildHangupTwiml,
  buildCallbackUrl,
  clampTimeout,
  escapeXml,
  EMPTY_TWIML,
} from '../twimlBuilders';

const origin = 'https://app.goadmin.io';

describe('twimlBuilders (FASE-03 §4.5)', () => {
  test('escapeXml escapa <>&"\'', () => {
    expect(escapeXml(`a<b>&"c'`)).toBe('a&lt;b&gt;&amp;&quot;c&apos;');
  });

  test('buildCallbackUrl codifica query y no deja & sin escapar en atributos', () => {
    const url = buildCallbackUrl(origin, '/api/voice/dial-complete', { callId: 'abc def', t: 'x&y' });
    expect(url).toBe('https://app.goadmin.io/api/voice/dial-complete?callId=abc%20def&t=x%26y');
    expect(escapeXml(url)).toContain('&amp;t=');
  });

  test('clampTimeout limita a 10..60 con fallback', () => {
    expect(clampTimeout(5)).toBe(10);
    expect(clampTimeout(90)).toBe(60);
    expect(clampTimeout(null, 25)).toBe(25);
    expect(clampTimeout(30)).toBe(30);
  });

  test('saliente browser: Dial con callerId, record dual, whisper y statusCallback (§4.5.1)', () => {
    const xml = buildOutboundBrowserTwiml({
      origin,
      callId: '9b2f',
      to: '+573001234567',
      callerId: '+5760123456',
      recordingEnabled: true,
      ringTimeoutSeconds: 30,
      agentPrompt: 'Conectando. Esta llamada se grabará.',
    });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Say language="es-MX" voice="Polly.Mia-Neural">Conectando. Esta llamada se grabará.</Say>');
    expect(xml).toContain('callerId="+5760123456"');
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(xml).toContain('recordingStatusCallback="https://app.goadmin.io/api/voice/recording"');
    expect(xml).toContain('recordingStatusCallbackEvent="completed absent"');
    expect(xml).toContain('answerOnBridge="true"');
    expect(xml).toContain('timeout="30"');
    expect(xml).toContain('timeLimit="7200"');
    expect(xml).toContain('action="https://app.goadmin.io/api/voice/dial-complete?callId=9b2f"');
    expect(xml).toContain('<Number statusCallback="https://app.goadmin.io/api/voice/status" statusCallbackEvent="initiated ringing answered completed"');
    expect(xml).toContain('url="https://app.goadmin.io/api/voice/twiml/consent-whisper?callId=9b2f"');
    expect(xml).toContain('>+573001234567</Number>');
    expect(xml).not.toContain('machineDetection');
    // Ningún & crudo dentro de atributos
    expect(xml.match(/&(?!amp;|lt;|gt;|quot;|apos;)/g)).toBeNull();
  });

  test('saliente sin grabación: sin record ni whisper; AMD solo si se pide', () => {
    const xml = buildOutboundBrowserTwiml({ origin, callId: 'c1', to: '+573001234567', callerId: '+571', recordingEnabled: false, ringTimeoutSeconds: 999, machineDetection: true });
    expect(xml).not.toContain('record=');
    expect(xml).not.toContain('consent-whisper');
    expect(xml).toContain('machineDetection="Enable"');
    expect(xml).toContain('timeout="60"');
  });

  test('entrante: consentimiento + <Client> por identity (máx 10) y sin agentes → Hangup', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `u_${'a'.repeat(32)}_o_${i}`);

    // N-4: primera pasada = SOLO el aviso + <Redirect>. Sin <Dial>, porque hasta
    // que Twilio no pida el redirect no hay prueba de que el aviso sonara.
    const announce = buildInboundTwiml({
      origin, callId: 'in1', from: '+573009998877', identities: ids, recordingEnabled: true,
      consentMessage: 'Esta llamada será grabada & analizada', ringTimeoutSeconds: 25,
      consentRedirectUrl: `${origin}/api/voice/twiml/inbound?announced=1`,
    });
    expect(announce).toContain('Esta llamada será grabada &amp; analizada');
    expect(announce).toContain('<Redirect method="POST">https://app.goadmin.io/api/voice/twiml/inbound?announced=1</Redirect>');
    expect(announce).not.toContain('<Dial');

    // Segunda pasada = el <Dial>, y el aviso NO se repite.
    const xml = buildInboundTwiml({ origin, callId: 'in1', from: '+573009998877', identities: ids, recordingEnabled: true, consentMessage: 'Esta llamada será grabada & analizada', ringTimeoutSeconds: 25 });
    expect((xml.match(/<Client /g) ?? []).length).toBe(10);
    expect(xml).toContain('callerId="+573009998877"');
    expect(xml).not.toContain('Esta llamada será grabada &amp; analizada');
    expect(xml).toContain('record="record-from-answer-dual"');

    const none = buildInboundTwiml({ origin, callId: 'in2', from: '+571', identities: [], recordingEnabled: false, consentMessage: '', ringTimeoutSeconds: 25 });
    expect(none).toContain('<Hangup/>');
    expect(none).not.toContain('<Dial');
  });

  test('consent / hangup / vacío', () => {
    expect(buildConsentTwiml('Hola <cliente>')).toContain('<Say language="es-MX" voice="Polly.Mia-Neural">Hola &lt;cliente&gt;</Say>');
    expect(buildHangupTwiml('Adiós')).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say language="es-MX" voice="Polly.Mia-Neural">Adiós</Say>\n  <Hangup/>\n</Response>');
    expect(buildHangupTwiml()).toContain('<Hangup/>');
    expect(EMPTY_TWIML).toContain('<Response></Response>');
  });
});
