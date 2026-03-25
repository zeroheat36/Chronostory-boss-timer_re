import {
  recordBossKill,
  touchServer,
  type BossId,
  type ChronostoryResponse
} from "@/lib/chronostory";
import {
  getStorageBackend,
  mutateDashboardState
} from "@/lib/chronostory-storage";

export type ChronostoryWebhookPayload =
  | {
      type: "boss-kill";
      serverName: string;
      bossId: BossId;
      reportedAt?: string;
      reporter?: string;
      note?: string;
    }
  | {
      type: "heartbeat";
      serverName: string;
      seenAt?: string;
    };

export async function applyChronostoryWebhook(
  payload: ChronostoryWebhookPayload
): Promise<ChronostoryResponse> {
  const state = await mutateDashboardState((current) => {
    switch (payload.type) {
      case "boss-kill":
        return recordBossKill(current, {
          serverName: payload.serverName,
          bossId: payload.bossId,
          reportedAt: payload.reportedAt ?? new Date().toISOString(),
          reporter: payload.reporter,
          note: payload.note
        });
      case "heartbeat":
        return touchServer(current, payload.serverName, payload.seenAt ?? new Date().toISOString());
    }
  });

  return {
    backend: getStorageBackend(),
    state
  };
}

export function isChronostoryWebhookPayload(value: unknown): value is ChronostoryWebhookPayload {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "boss-kill":
      return (
        typeof value.serverName === "string" &&
        typeof value.bossId === "string" &&
        (typeof value.reportedAt === "undefined" || typeof value.reportedAt === "string") &&
        (typeof value.reporter === "undefined" || typeof value.reporter === "string") &&
        (typeof value.note === "undefined" || typeof value.note === "string")
      );
    case "heartbeat":
      return (
        typeof value.serverName === "string" &&
        (typeof value.seenAt === "undefined" || typeof value.seenAt === "string")
      );
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
