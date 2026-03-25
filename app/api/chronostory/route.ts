import { NextResponse } from "next/server";
import {
  BOSS_IDS,
  createDemoDashboardState,
  createInitialDashboardState,
  recordBossKill,
  renameServer,
  removeServer,
  removeArchivedServers,
  touchServer,
  updateBossRespawnMinutes,
  updateServiceSettings,
  type ChronostoryAction,
  type ChronostoryResponse
} from "@/lib/chronostory";
import {
  getStorageBackend,
  mutateDashboardState,
  readDashboardState
} from "@/lib/chronostory-storage";

export async function GET() {
  const state = await readDashboardState();
  return NextResponse.json<ChronostoryResponse>({ backend: getStorageBackend(), state });
}

export async function POST(request: Request) {
  try {
    const action = (await request.json()) as unknown;

    if (!isChronostoryAction(action)) {
      return NextResponse.json({ error: "Invalid action payload." }, { status: 400 });
    }

    const state = await mutateDashboardState((current) => {
      switch (action.type) {
        case "register-server":
          return touchServer(current, action.serverName);
        case "heartbeat":
          return touchServer(current, action.serverName);
        case "report-kill":
          return recordBossKill(current, {
            serverName: action.serverName,
            bossId: action.bossId,
            reportedAt: action.reportedAt,
            reporter: action.reporter,
            note: action.note
          });
        case "update-boss-setting":
          return updateBossRespawnMinutes(current, action.bossId, action.respawnMinutes);
        case "update-service-settings":
          return updateServiceSettings(current, {
            activeGraceMinutes: action.activeGraceMinutes,
            archiveAfterHours: action.archiveAfterHours,
            duplicateWindowSeconds: action.duplicateWindowSeconds
          });
        case "remove-archived":
          return removeArchivedServers(current, action.nowMs ?? Date.now());
        case "seed-demo":
          return createDemoDashboardState();
        case "reset-dashboard":
          return createInitialDashboardState();
        case "remove-server":
          return removeServer(current, action.serverName);
        case "rename-server":
          return renameServer(current, action.serverName, action.nextServerName);
      }
    });

    return NextResponse.json<ChronostoryResponse>({ backend: getStorageBackend(), state });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process chronostory request."
      },
      { status: 500 }
    );
  }
}

function isChronostoryAction(value: unknown): value is ChronostoryAction {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "register-server":
    case "heartbeat":
      return typeof value.serverName === "string";
    case "report-kill":
      return (
        typeof value.serverName === "string" &&
        typeof value.reportedAt === "string" &&
        isBossIdString(value.bossId) &&
        (typeof value.reporter === "undefined" || typeof value.reporter === "string") &&
        (typeof value.note === "undefined" || typeof value.note === "string")
      );
    case "update-boss-setting":
      return (
        isBossIdString(value.bossId) &&
        typeof value.respawnMinutes === "number"
      );
    case "update-service-settings":
      return (
        isOptionalNumber(value.activeGraceMinutes) &&
        isOptionalNumber(value.archiveAfterHours) &&
        isOptionalNumber(value.duplicateWindowSeconds)
      );
    case "remove-archived":
      return isOptionalNumber(value.nowMs);
    case "seed-demo":
    case "reset-dashboard":
      return true;
    case "remove-server":
      return typeof value.serverName === "string";
    case "rename-server":
      return typeof value.serverName === "string" && typeof value.nextServerName === "string";
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalNumber(value: unknown) {
  return typeof value === "undefined" || typeof value === "number";
}

function isBossIdString(value: unknown): value is (typeof BOSS_IDS)[number] {
  return typeof value === "string" && BOSS_IDS.includes(value as (typeof BOSS_IDS)[number]);
}
