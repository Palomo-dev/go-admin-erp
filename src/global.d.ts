// Type declarations for side-effect CSS imports (Next.js App Router)
declare module '*.css';

// Supabase Edge Functions usan imports por URL (Deno), no resolvibles en Node/TS local
declare module 'https://*';
