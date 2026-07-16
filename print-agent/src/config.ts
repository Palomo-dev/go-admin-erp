import 'dotenv/config';

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
  organizationId: Number(required('ORGANIZATION_ID')),
  branchId: Number(required('BRANCH_ID')),
  agentName: process.env.AGENT_NAME || 'Print Agent',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 5000),
  heartbeatIntervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS || 20000),
};
