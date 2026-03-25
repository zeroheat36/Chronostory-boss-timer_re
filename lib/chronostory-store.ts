import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createInitialDashboardState,
  loadDashboardState,
  type DashboardState
} from "@/lib/chronostory";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "chronostory.json");
let mutationQueue: Promise<DashboardState> | null = null;

export async function readDashboardState(): Promise<DashboardState> {
  await ensureDataFile();
  const raw = await readFile(DATA_FILE, "utf8");
  return loadDashboardState(raw);
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

async function ensureDataFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(DATA_FILE, "utf8");
  } catch {
    await writeDashboardState(createInitialDashboardState());
  }
}

async function writeDashboardState(state: DashboardState) {
  const payload = `${JSON.stringify(state, null, 2)}\n`;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, payload, "utf8");
}
