// dotenv solo existe en el print-agent standalone (consola). Dentro de
// Go Admin Desktop (Electron) no está instalado: las variables las inyecta
// agentRunner en process.env antes de cargar este módulo.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv/config');
} catch {
  // Sin dotenv: se usan las variables ya presentes en process.env
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa tu archivo .env (ver .env.example).`);
  }
  return value;
}

export const config = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseAnonKey: required('SUPABASE_ANON_KEY'),
  agentEmail: required('AGENT_EMAIL'),
  agentPassword: required('AGENT_PASSWORD'),
  // Opcionales: se detectan dinámicamente al arrancar (agentSetup.ts)
  // Pero se pueden forzar via .env para deployments automatizados
  organizationId: process.env.ORGANIZATION_ID ? Number(process.env.ORGANIZATION_ID) : null,
  branchId: process.env.BRANCH_ID ? Number(process.env.BRANCH_ID) : null,
  agentName: process.env.AGENT_NAME || 'Print Agent',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 5000),
  heartbeatIntervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS || 20000),
  discoveryPort: Number(process.env.DISCOVERY_PORT || 3456),
};
