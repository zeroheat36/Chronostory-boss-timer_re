import type { ChronostoryStorageBackend } from "@/lib/chronostory-storage";

const REQUIRED_SUPABASE_SERVER_VARS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const REQUIRED_SUPABASE_CLIENT_VARS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const REQUIRED_WEBHOOK_VARS = ["CHRONOSTORY_WEBHOOK_SECRET"] as const;

export type ChronostorySetupStatus = {
  backend: ChronostoryStorageBackend;
  supabaseReady: boolean;
  missingServerVars: string[];
  missingClientVars: string[];
  webhookReady: boolean;
  missingWebhookVars: string[];
  webhookPath: string;
};

export function getChronostorySetupStatus(): ChronostorySetupStatus {
  const missingServerVars = REQUIRED_SUPABASE_SERVER_VARS.filter((name) => !process.env[name]);
  const missingClientVars = REQUIRED_SUPABASE_CLIENT_VARS.filter((name) => !process.env[name]);
  const missingWebhookVars = REQUIRED_WEBHOOK_VARS.filter((name) => !process.env[name]);
  const supabaseReady = missingServerVars.length === 0;
  const webhookReady = missingWebhookVars.length === 0;

  return {
    backend: supabaseReady ? "supabase" : "file",
    supabaseReady,
    missingServerVars: [...missingServerVars],
    missingClientVars: [...missingClientVars],
    webhookReady,
    missingWebhookVars: [...missingWebhookVars],
    webhookPath: "/api/chronostory/webhook"
  };
}
