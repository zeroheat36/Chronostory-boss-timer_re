const collator = new Intl.Collator("ko-KR", {
  numeric: true,
  sensitivity: "base"
});

export const STORAGE_KEY = "chronostory-dashboard-v1";
export const BOSS_IDS = ["pianus", "genomega"] as const;
export const MAX_EVENT_LOG = 36;

export type BossId = (typeof BOSS_IDS)[number];

export type BossMetadata = {
  id: BossId;
  name: string;
  shortLabel: string;
  description: string;
  accent: string;
};

export type BossSettings = Record<
  BossId,
  {
    respawnMinutes: number;
  }
>;

export type ServiceSettings = {
  activeGraceMinutes: number;
  archiveAfterHours: number;
  duplicateWindowSeconds: number;
};

export type BossTimer = {
  bossId: BossId;
  lastKillAt: string | null;
  nextRespawnAt: string | null;
  updatedBy: string;
  note: string;
  version: number;
};

export type ServerTimer = {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
  bosses: Record<BossId, BossTimer>;
};

export type ReportDecision = "accepted" | "duplicate" | "ignored_old";

export type ReportEvent = {
  id: string;
  serverId: string;
  serverName: string;
  bossId: BossId;
  reportedAt: string;
  submittedAt: string;
  reporter: string;
  note: string;
  decision: ReportDecision;
};

export type DashboardState = {
  bossSettings: BossSettings;
  serviceSettings: ServiceSettings;
  servers: ServerTimer[];
  events: ReportEvent[];
};

export type ChronostoryAction =
  | {
      type: "register-server";
      serverName: string;
    }
  | {
      type: "heartbeat";
      serverName: string;
    }
  | {
      type: "report-kill";
      serverName: string;
      bossId: BossId;
      reportedAt: string;
      reporter?: string;
      note?: string;
    }
  | {
      type: "update-boss-setting";
      bossId: BossId;
      respawnMinutes: number;
    }
  | {
      type: "update-service-settings";
      activeGraceMinutes?: number;
      archiveAfterHours?: number;
      duplicateWindowSeconds?: number;
    }
  | {
      type: "remove-archived";
      nowMs?: number;
    }
  | {
      type: "seed-demo";
    }
  | {
      type: "reset-dashboard";
    }
  | {
      type: "remove-server";
      serverName: string;
    }
  | {
      type: "rename-server";
      serverName: string;
      nextServerName: string;
    };

export type ChronostoryResponse = {
  backend: "file" | "supabase";
  state: DashboardState;
};

export type ReportInput = {
  serverName: string;
  bossId: BossId;
  reportedAt: string;
  reporter?: string;
  note?: string;
};

export type ServerStatus = "active" | "stale" | "archived";
export type BossUrgency = "empty" | "waiting" | "soon" | "ready";

export const BOSS_METADATA: Record<BossId, BossMetadata> = {
  pianus: {
    id: "pianus",
    name: "피아누스",
    shortLabel: "Pianus",
    description: "수중 보스의 처치 시각과 리스폰 타이머를 관리합니다.",
    accent: "#2a7d8b"
  },
  genomega: {
    id: "genomega",
    name: "제노메가",
    shortLabel: "Genomega",
    description: "기계형 보스의 처치 시각과 리스폰 타이머를 관리합니다.",
    accent: "#c35d29"
  }
};

export function createInitialDashboardState(): DashboardState {
  return {
    bossSettings: {
      pianus: { respawnMinutes: 180 },
      genomega: { respawnMinutes: 240 }
    },
    serviceSettings: {
      activeGraceMinutes: 180,
      archiveAfterHours: 24,
      duplicateWindowSeconds: 90
    },
    servers: [],
    events: []
  };
}

export function createDemoDashboardState(now = new Date()): DashboardState {
  const baseState = createInitialDashboardState();
  const nowMs = now.getTime();

  let nextState = touchServer(baseState, "크로노 1", new Date(nowMs - 4 * 60_000).toISOString());
  nextState = touchServer(nextState, "크로노 2", new Date(nowMs - 12 * 60_000).toISOString());
  nextState = touchServer(nextState, "크로노 3", new Date(nowMs - 3 * 60 * 60_000).toISOString());

  nextState = recordBossKill(nextState, {
    serverName: "크로노 1",
    bossId: "pianus",
    reportedAt: new Date(nowMs - 170 * 60_000).toISOString(),
    reporter: "파티A",
    note: "곧 리스폰"
  });
  nextState = recordBossKill(nextState, {
    serverName: "크로노 1",
    bossId: "genomega",
    reportedAt: new Date(nowMs - 60 * 60_000).toISOString(),
    reporter: "파티A",
    note: "여유 있음"
  });
  nextState = recordBossKill(nextState, {
    serverName: "크로노 2",
    bossId: "pianus",
    reportedAt: new Date(nowMs - 181 * 60_000).toISOString(),
    reporter: "파티B",
    note: "리스폰 가능"
  });
  nextState = recordBossKill(nextState, {
    serverName: "크로노 2",
    bossId: "genomega",
    reportedAt: new Date(nowMs - 238 * 60_000).toISOString(),
    reporter: "파티B",
    note: "곧 리스폰"
  });
  nextState = recordBossKill(nextState, {
    serverName: "크로노 3",
    bossId: "pianus",
    reportedAt: new Date(nowMs - 7 * 60 * 60_000).toISOString(),
    reporter: "파티C",
    note: "유예 상태 샘플"
  });

  return nextState;
}

export function loadDashboardState(raw: string | null): DashboardState {
  const fallback = createInitialDashboardState();

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DashboardState> | null;
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }

    const bossSettings: BossSettings = {
      pianus: {
        respawnMinutes: readNumber(
          parsed.bossSettings?.pianus?.respawnMinutes,
          fallback.bossSettings.pianus.respawnMinutes
        )
      },
      genomega: {
        respawnMinutes: readNumber(
          parsed.bossSettings?.genomega?.respawnMinutes,
          fallback.bossSettings.genomega.respawnMinutes
        )
      }
    };

    const serviceSettings: ServiceSettings = {
      activeGraceMinutes: readNumber(
        parsed.serviceSettings?.activeGraceMinutes,
        fallback.serviceSettings.activeGraceMinutes
      ),
      archiveAfterHours: readNumber(
        parsed.serviceSettings?.archiveAfterHours,
        fallback.serviceSettings.archiveAfterHours
      ),
      duplicateWindowSeconds: readNumber(
        parsed.serviceSettings?.duplicateWindowSeconds,
        fallback.serviceSettings.duplicateWindowSeconds
      )
    };

    const servers = Array.isArray(parsed.servers)
      ? parsed.servers
          .map((server) => hydrateServer(server, bossSettings))
          .filter((server): server is ServerTimer => server !== null)
      : [];

    const events = Array.isArray(parsed.events)
      ? parsed.events
          .map((event) => hydrateEvent(event))
          .filter((event): event is ReportEvent => event !== null)
          .slice(0, MAX_EVENT_LOG)
      : [];

    return {
      bossSettings,
      serviceSettings,
      servers: sortServers(servers),
      events
    };
  } catch {
    return fallback;
  }
}

export function touchServer(
  state: DashboardState,
  serverName: string,
  nowIso = new Date().toISOString()
): DashboardState {
  const normalized = normalizeServerName(serverName);
  if (!normalized) {
    return state;
  }

  const existingIndex = state.servers.findIndex((server) => server.name === normalized);
  const nextServers = [...state.servers];

  if (existingIndex === -1) {
    nextServers.push(createServerRecord(normalized, nowIso));
  } else {
    const current = nextServers[existingIndex];
    nextServers[existingIndex] = {
      ...current,
      lastSeenAt: maxIso(current.lastSeenAt, nowIso)
    };
  }

  return {
    ...state,
    servers: sortServers(nextServers)
  };
}

export function updateBossRespawnMinutes(
  state: DashboardState,
  bossId: BossId,
  respawnMinutes: number
): DashboardState {
  const safeMinutes = clampNumber(respawnMinutes, 1, 24 * 60);
  const nextBossSettings: BossSettings = {
    ...state.bossSettings,
    [bossId]: {
      respawnMinutes: safeMinutes
    }
  };

  return {
    ...state,
    bossSettings: nextBossSettings,
    servers: state.servers.map((server) => ({
      ...server,
      bosses: {
        ...server.bosses,
        [bossId]: rebuildTimer(server.bosses[bossId], safeMinutes)
      }
    }))
  };
}

export function updateServiceSettings(
  state: DashboardState,
  updates: Partial<ServiceSettings>
): DashboardState {
  return {
    ...state,
    serviceSettings: {
      activeGraceMinutes: clampNumber(
        updates.activeGraceMinutes ?? state.serviceSettings.activeGraceMinutes,
        1,
        24 * 60
      ),
      archiveAfterHours: clampNumber(
        updates.archiveAfterHours ?? state.serviceSettings.archiveAfterHours,
        1,
        24 * 30
      ),
      duplicateWindowSeconds: clampNumber(
        updates.duplicateWindowSeconds ?? state.serviceSettings.duplicateWindowSeconds,
        5,
        10 * 60
      )
    }
  };
}

export function removeArchivedServers(state: DashboardState, nowMs: number): DashboardState {
  return {
    ...state,
    servers: state.servers.filter(
      (server) => getServerStatus(server, state.serviceSettings, nowMs) !== "archived"
    )
  };
}

export function removeServer(state: DashboardState, serverName: string): DashboardState {
  const normalized = normalizeServerName(serverName);
  if (!normalized) {
    return state;
  }

  const nextServers = state.servers.filter((server) => server.name !== normalized);
  const nextEvents = state.events.filter((event) => event.serverName !== normalized);

  if (nextServers.length === state.servers.length && nextEvents.length === state.events.length) {
    return state;
  }

  return {
    ...state,
    servers: nextServers,
    events: nextEvents
  };
}

export function renameServer(
  state: DashboardState,
  serverName: string,
  nextServerName: string
): DashboardState {
  const normalizedCurrent = normalizeServerName(serverName);
  const normalizedNext = normalizeServerName(nextServerName);

  if (!normalizedCurrent || !normalizedNext) {
    return state;
  }

  if (normalizedCurrent === normalizedNext) {
    return state;
  }

  if (state.servers.some((server) => server.name === normalizedNext)) {
    throw new Error("같은 이름의 서버가 이미 있습니다.");
  }

  const currentServer = state.servers.find((server) => server.name === normalizedCurrent);
  if (!currentServer) {
    return state;
  }

  const nextServers = sortServers(
    state.servers.map((server) =>
      server.name === normalizedCurrent
        ? {
            ...server,
            id: createServerId(normalizedNext),
            name: normalizedNext
          }
        : server
    )
  );

  const nextEvents = state.events.map((event) =>
    event.serverName === normalizedCurrent
      ? {
          ...event,
          serverId: createServerId(normalizedNext),
          serverName: normalizedNext
        }
      : event
  );

  return {
    ...state,
    servers: nextServers,
    events: nextEvents
  };
}

export function recordBossKill(state: DashboardState, input: ReportInput): DashboardState {
  const normalizedServerName = normalizeServerName(input.serverName);
  const normalizedReporter = normalizeServerName(input.reporter ?? "") || "수동 입력";
  const normalizedNote = (input.note ?? "").trim();
  const reportedAtMs = Date.parse(input.reportedAt);

  if (!normalizedServerName || !Number.isFinite(reportedAtMs)) {
    return state;
  }

  const reportedAtIso = new Date(reportedAtMs).toISOString();
  const nowIso = new Date().toISOString();
  const serverIndex = state.servers.findIndex((server) => server.name === normalizedServerName);
  const server =
    serverIndex === -1 ? createServerRecord(normalizedServerName, reportedAtIso) : state.servers[serverIndex];
  const timer = server.bosses[input.bossId];
  const currentKillMs = timer.lastKillAt ? Date.parse(timer.lastKillAt) : null;
  const duplicateWindowMs = state.serviceSettings.duplicateWindowSeconds * 1000;

  let decision: ReportDecision = "accepted";
  let nextTimer = timer;

  if (currentKillMs !== null) {
    const distance = Math.abs(reportedAtMs - currentKillMs);
    if (distance <= duplicateWindowMs) {
      decision = "duplicate";
    } else if (reportedAtMs < currentKillMs) {
      decision = "ignored_old";
    }
  }

  if (decision === "accepted") {
    nextTimer = {
      ...timer,
      lastKillAt: reportedAtIso,
      nextRespawnAt: new Date(
        reportedAtMs + state.bossSettings[input.bossId].respawnMinutes * 60_000
      ).toISOString(),
      updatedBy: normalizedReporter,
      note: normalizedNote,
      version: timer.version + 1
    };
  }

  const nextServer: ServerTimer = {
    ...server,
    lastSeenAt: maxIso(server.lastSeenAt, reportedAtIso),
    bosses: {
      ...server.bosses,
      [input.bossId]: nextTimer
    }
  };

  const nextServers =
    serverIndex === -1
      ? sortServers([...state.servers, nextServer])
      : sortServers(
          state.servers.map((current, index) => (index === serverIndex ? nextServer : current))
        );

  const event: ReportEvent = {
    id: createEventId(normalizedServerName, input.bossId, reportedAtIso, nowIso),
    serverId: nextServer.id,
    serverName: normalizedServerName,
    bossId: input.bossId,
    reportedAt: reportedAtIso,
    submittedAt: nowIso,
    reporter: normalizedReporter,
    note: normalizedNote,
    decision
  };

  return {
    ...state,
    servers: nextServers,
    events: [event, ...state.events].slice(0, MAX_EVENT_LOG)
  };
}

export function getServerStatus(
  server: ServerTimer,
  settings: ServiceSettings,
  nowMs: number
): ServerStatus {
  const lastSeenMs = Date.parse(server.lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) {
    return "archived";
  }

  const ageMs = Math.max(0, nowMs - lastSeenMs);
  if (ageMs <= settings.activeGraceMinutes * 60_000) {
    return "active";
  }

  if (ageMs <= settings.archiveAfterHours * 60 * 60_000) {
    return "stale";
  }

  return "archived";
}

export function getCountdownLabel(nextRespawnAt: string | null, nowMs: number): string {
  if (!nextRespawnAt) {
    return "기록 대기";
  }

  const targetMs = Date.parse(nextRespawnAt);
  if (!Number.isFinite(targetMs)) {
    return "시간 오류";
  }

  const remainingMs = targetMs - nowMs;
  if (remainingMs <= 0) {
    return "리스폰 가능";
  }

  return formatDuration(remainingMs);
}

export function getBossUrgency(nextRespawnAt: string | null, nowMs: number): BossUrgency {
  if (!nextRespawnAt) {
    return "empty";
  }

  const targetMs = Date.parse(nextRespawnAt);
  if (!Number.isFinite(targetMs)) {
    return "empty";
  }

  const remainingMs = targetMs - nowMs;
  if (remainingMs <= 0) {
    return "ready";
  }

  if (remainingMs <= 15 * 60_000) {
    return "soon";
  }

  return "waiting";
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function formatLocalTimestamp(value: string | null): string {
  if (!value) {
    return "없음";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "없음";
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatRelativeAge(value: string, nowMs: number): string {
  const targetMs = Date.parse(value);
  if (!Number.isFinite(targetMs)) {
    return "-";
  }

  const diffMs = Math.max(0, nowMs - targetMs);
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) {
    return "방금 전";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}시간 전`;
  }

  return `${Math.floor(diffHours / 24)}일 전`;
}

export function getDashboardSummary(state: DashboardState, nowMs: number) {
  const summary = {
    activeServers: 0,
    staleServers: 0,
    archivedServers: 0,
    trackedBosses: state.servers.length * BOSS_IDS.length,
    readyBosses: 0,
    pendingBosses: 0
  };

  for (const server of state.servers) {
    const status = getServerStatus(server, state.serviceSettings, nowMs);
    if (status === "active") {
      summary.activeServers += 1;
    } else if (status === "stale") {
      summary.staleServers += 1;
    } else {
      summary.archivedServers += 1;
    }

    for (const bossId of BOSS_IDS) {
      const nextRespawnAt = server.bosses[bossId].nextRespawnAt;
      if (nextRespawnAt && Date.parse(nextRespawnAt) <= nowMs) {
        summary.readyBosses += 1;
      } else {
        summary.pendingBosses += 1;
      }
    }
  }

  return summary;
}

export function toLocalInputValue(date = new Date()): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function fromLocalInputValue(value: string): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function hydrateServer(value: unknown, bossSettings: BossSettings): ServerTimer | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ServerTimer>;
  const name = normalizeServerName(candidate.name ?? "");
  const createdAt = readIso(candidate.createdAt);
  const lastSeenAt = readIso(candidate.lastSeenAt);

  if (!name || !createdAt || !lastSeenAt) {
    return null;
  }

  return {
    id: String(candidate.id ?? createServerId(name)),
    name,
    createdAt,
    lastSeenAt,
    bosses: {
      pianus: hydrateBossTimer(candidate.bosses?.pianus, "pianus", bossSettings.pianus.respawnMinutes),
      genomega: hydrateBossTimer(
        candidate.bosses?.genomega,
        "genomega",
        bossSettings.genomega.respawnMinutes
      )
    }
  };
}

function hydrateBossTimer(value: unknown, bossId: BossId, respawnMinutes: number): BossTimer {
  const timer = createEmptyBossTimer(bossId);
  if (!value || typeof value !== "object") {
    return timer;
  }

  const candidate = value as Partial<BossTimer>;
  const lastKillAt = readIso(candidate.lastKillAt);

  return rebuildTimer(
    {
      bossId,
      lastKillAt,
      nextRespawnAt: readIso(candidate.nextRespawnAt),
      updatedBy: typeof candidate.updatedBy === "string" ? candidate.updatedBy : "",
      note: typeof candidate.note === "string" ? candidate.note : "",
      version: readNumber(candidate.version, 0)
    },
    respawnMinutes
  );
}

function hydrateEvent(value: unknown): ReportEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ReportEvent>;
  if (!isBossId(candidate.bossId)) {
    return null;
  }

  const decision = candidate.decision;
  if (decision !== "accepted" && decision !== "duplicate" && decision !== "ignored_old") {
    return null;
  }

  const reportedAt = readIso(candidate.reportedAt);
  const submittedAt = readIso(candidate.submittedAt);
  const serverId = typeof candidate.serverId === "string" ? candidate.serverId : "";
  const serverName = normalizeServerName(candidate.serverName ?? "");
  const reporter = typeof candidate.reporter === "string" ? candidate.reporter : "";

  if (!reportedAt || !submittedAt || !serverId || !serverName) {
    return null;
  }

  return {
    id:
      typeof candidate.id === "string"
        ? candidate.id
        : createEventId(serverName, candidate.bossId, reportedAt, submittedAt),
    serverId,
    serverName,
    bossId: candidate.bossId,
    reportedAt,
    submittedAt,
    reporter,
    note: typeof candidate.note === "string" ? candidate.note : "",
    decision
  };
}

function createServerRecord(name: string, nowIso: string): ServerTimer {
  return {
    id: createServerId(name),
    name,
    createdAt: nowIso,
    lastSeenAt: nowIso,
    bosses: {
      pianus: createEmptyBossTimer("pianus"),
      genomega: createEmptyBossTimer("genomega")
    }
  };
}

function createEmptyBossTimer(bossId: BossId): BossTimer {
  return {
    bossId,
    lastKillAt: null,
    nextRespawnAt: null,
    updatedBy: "",
    note: "",
    version: 0
  };
}

function rebuildTimer(timer: BossTimer, respawnMinutes: number): BossTimer {
  if (!timer.lastKillAt) {
    return {
      ...timer,
      nextRespawnAt: null
    };
  }

  const lastKillMs = Date.parse(timer.lastKillAt);
  if (!Number.isFinite(lastKillMs)) {
    return {
      ...timer,
      lastKillAt: null,
      nextRespawnAt: null
    };
  }

  return {
    ...timer,
    nextRespawnAt: new Date(lastKillMs + respawnMinutes * 60_000).toISOString()
  };
}

function sortServers(servers: ServerTimer[]): ServerTimer[] {
  return [...servers].sort((left, right) => collator.compare(left.name, right.name));
}

function createServerId(name: string): string {
  return `server:${normalizeServerName(name).toLowerCase()}`;
}

function createEventId(serverName: string, bossId: BossId, reportedAt: string, submittedAt: string): string {
  return `${serverName}:${bossId}:${reportedAt}:${submittedAt}`;
}

function maxIso(left: string, right: string): string {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function normalizeServerName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readIso(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function isBossId(value: unknown): value is BossId {
  return value === "pianus" || value === "genomega";
}
