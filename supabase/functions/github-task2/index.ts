import { createClient } from '@supabase/supabase-js';
import { createTask2Handler } from './handler.ts';
const env = (name: string) => Deno.env.get(name) || '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(
  createTask2Handler(admin, {
    supabaseUrl: env('SUPABASE_URL'),
    allowedOrigin: env('ALLOWED_ORIGIN'),
    frontendUrl: env('TASK2_FRONTEND_URL'),
    appId: env('GITHUB_APP_ID'),
    clientId: env('GITHUB_APP_CLIENT_ID'),
    clientSecret: env('GITHUB_APP_CLIENT_SECRET'),
    privateKey: env('GITHUB_APP_PRIVATE_KEY'),
    appSlug: env('GITHUB_APP_SLUG'),
    webhookSecret: env('GITHUB_APP_WEBHOOK_SECRET'),
  }),
);
