import { mutateDashboardState as mutateFileDashboardState, readDashboardState as readFileDashboardState } from "@/lib/chronostory-store";
import {
  mutateDashboardState as mutateSupabaseDashboardState,
  readDashboardState as readSupabaseDashboardState
} from "@/lib/chronostory-supabase-store";
import { getChronostorySetupStatus } from "@/lib/chronostory-env";
import type { DashboardState } from "@/lib/chronostory";

export type ChronostoryStorageBackend = "file" | "supabase";

export async function readDashboardState() {
  if (getStorageBackend() === "supabase") {
    return readSupabaseDashboardState();
  }

  return readFileDashboardState();
}

export async function mutateDashboardState(
  mutate: (current: DashboardState) => DashboardState | Promise<DashboardState>
) {
  if (getStorageBackend() === "supabase") {
    return mutateSupabaseDashboardState(mutate);
  }

  return mutateFileDashboardState(mutate);
}

export function getStorageBackend(): ChronostoryStorageBackend {
  return getChronostorySetupStatus().backend;
}
