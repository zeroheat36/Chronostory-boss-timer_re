import { createInitialDashboardState, loadDashboardState, type DashboardState } from "@/lib/chronostory";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const STATE_ROW_ID = "primary";
let mutationQueue: Promise<DashboardState> | null = null;

type StateRow = {
  id: string;
  payload: DashboardState;
  updated_at: string;
};

export async function readDashboardState(): Promise<DashboardState> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("chronostory_state")
    .select("id, payload, updated_at")
    .eq("id", STATE_ROW_ID)
    .maybeSingle<StateRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    const initial = createInitialDashboardState();
    await writeDashboardState(initial);
    return initial;
  }

  return loadDashboardState(JSON.stringify(data.payload));
}

export async function mutateDashboardState(
  mutate: (current: DashboardState) => DashboardState | Promise<DashboardState>
): Promise<DashboardState> {
  const nextTask = async () => {
    const current = await readDashboardState();
    const next = await mutate(current);
    const normalized = loadDashboardState(JSON.stringify(next));

    await writeDashboardState(normalized);
    return normalized;
  };

  const queuedTask = (mutationQueue ?? Promise.resolve(createInitialDashboardState()))
    .then(nextTask, nextTask)
    .finally(() => {
      if (mutationQueue === queuedTask) {
        mutationQueue = null;
      }
    });

  mutationQueue = queuedTask;
  return queuedTask;
}

async function writeDashboardState(state: DashboardState) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("chronostory_state").upsert(
    {
      id: STATE_ROW_ID,
      payload: state
    },
    {
      onConflict: "id"
    }
  );

  if (error) {
    throw error;
  }
}
