const collator = new Intl.Collator("ko-KR", {
  numeric: true,
  sensitivity: "base"
});

const BOSS_ACCENTS = ["#2a7d8b", "#c35d29", "#6d8e3a", "#8b5fbf", "#9f4f3f", "#2f6ca3"] as const;

export const STORAGE_KEY = "chronostory-dashboard-v2";
export const MAX_EVENT_LOG = 36;

export type BossId = string;

export type BossDefinition = {
  id: BossId;
  name: string;
  shortLabel: string;
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
  bossDefinitions: BossDefinition[];
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
      type: "add-boss";
      bossName: string;
      respawnMinutes?: number;
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

export const DEFAULT_BOSS_DEFINITIONS: BossDefinition[] = [
  { id: "pianus", name: "피아누스", shortLabel: "Pianus", accent: BOSS_ACCENTS[0] },
  { id: "genomega", name: "제노메가", shortLabel: "Genomega", accent: BOSS_ACCENTS[1] }
];

export function createInitialDashboardState(): DashboardState {
  return {
    bossDefinitions: DEFAULT_BOSS_DEFINITIONS,
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

    const bossDefinitions = hydrateBossDefinitions(parsed, fallback);
    const bossSettings = hydrateBossSettings(parsed.bossSettings, bossDefinitions, fallback.bossSettings);
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
          .map((server) => hydrateServer(server, bossDefinitions, bossSettings))
          .filter((server): server is ServerTimer => server !== null)
      : [];

    const events = Array.isArray(parsed.events)
      ? parsed.events
          .map((event) => hydrateEvent(event))
          .filter((event): event is ReportEvent => event !== null)
          .slice(0, MAX_EVENT_LOG)
      : [];

    return {
      bossDefinitions,
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
  const normalized = normalizeLabel(serverName);
  if (!normalized) {
    return state;
  }

  const existingIndex = state.servers.findIndex((server) => server.name === normalized);
  const nextServers = [...state.servers];

  if (existingIndex === -1) {
    nextServers.push(createServerRecord(normalized, nowIso, state.bossDefinitions));
  } else {
    const current = nextServers[existingIndex];
    nextServers[existingIndex] = {
      ...current,
      lastSeenAt: maxIso(current.lastSeenAt, nowIso),
      bosses: ensureServerBossTimers(current.bosses, state.bossDefinitions)
    };
  }

  return {
    ...state,
    servers: sortServers(nextServers)
  };
}

export function addBoss(state: DashboardState, bossName: string, respawnMinutes = 180): DashboardState {
  const normalizedName = normalizeLabel(bossName);
  if (!normalizedName) {
    return state;
  }

  const existingByName = state.bossDefinitions.find((boss) => boss.name === normalizedName);
  if (existingByName) {
    return updateBossRespawnMinutes(state, existingByName.id, respawnMinutes);
  }

  const bossId = createBossId(normalizedName, state.bossDefinitions);
  const bossDefinition: BossDefinition = {
    id: bossId,
    name: normalizedName,
    shortLabel: normalizedName,
    accent: pickBossAccent(state.bossDefinitions.length)
  };
  const safeMinutes = clampNumber(respawnMinutes, 1, 24 * 60);

  return {
    ...state,
    bossDefinitions: [...state.bossDefinitions, bossDefinition],
    bossSettings: {
      ...state.bossSettings,
      [bossId]: {
        respawnMinutes: safeMinutes
      }
    },
    servers: state.servers.map((server) => ({
      ...server,
      bosses: {
        ...server.bosses,
        [bossId]: createEmptyBossTimer(bossId)
      }
    }))
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
        [bossId]: rebuildTimer(server.bosses[bossId] ?? createEmptyBossTimer(bossId), safeMinutes)
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
  const normalized = normalizeLabel(serverName);
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
  const normalizedCurrent = normalizeLabel(serverName);
  const normalizedNext = normalizeLabel(nextServerName);

  if (!normalizedCurrent || !normalizedNext || normalizedCurrent === normalizedNext) {
    return state;
  }

  if (state.servers.some((server) => server.name === normalizedNext)) {
    throw new Error("같은 이름의 서버가 이미 있습니다.");
  }

  if (!state.servers.some((server) => server.name === normalizedCurrent)) {
    return state;
  }

  return {
    ...state,
    servers: sortServers(
      state.servers.map((server) =>
        server.name === normalizedCurrent
          ? {
              ...server,
              id: createServerId(normalizedNext),
              name: normalizedNext
            }
          : server
      )
    ),
    events: state.events.map((event) =>
      event.serverName === normalizedCurrent
        ? {
            ...event,
            serverId: createServerId(normalizedNext),
            serverName: normalizedNext
          }
        : event
    )
  };
}

export function recordBossKill(state: DashboardState, input: ReportInput): DashboardState {
  const normalizedServerName = normalizeLabel(input.serverName);
  const normalizedReporter = normalizeLabel(input.reporter ?? "") || "수동 입력";
  const normalizedNote = (input.note ?? "").trim();
  const reportedAtMs = Date.parse(input.reportedAt);
  const bossId = input.bossId;

  if (
    !normalizedServerName ||
    !Number.isFinite(reportedAtMs) ||
    !state.bossDefinitions.some((boss) => boss.id === bossId)
  ) {
    return state;
  }

  const reportedAtIso = new Date(reportedAtMs).toISOString();
  const nowIso = new Date().toISOString();
  const serverIndex = state.servers.findIndex((server) => server.name === normalizedServerName);
  const server =
    serverIndex === -1
      ? createServerRecord(normalizedServerName, reportedAtIso, state.bossDefinitions)
      : {
          ...state.servers[serverIndex],
          bosses: ensureServerBossTimers(state.servers[serverIndex].bosses, state.bossDefinitions)
        };
  const timer = server.bosses[bossId];
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
        reportedAtMs + state.bossSettings[bossId].respawnMinutes * 60_000
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
      [bossId]: nextTimer
    }
  };

  const nextServers =
    serverIndex === -1
      ? sortServers([...state.servers, nextServer])
      : sortServers(state.servers.map((current, index) => (index === serverIndex ? nextServer : current)));

  const event: ReportEvent = {
    id: createEventId(normalizedServerName, bossId, reportedAtIso, nowIso),
    serverId: nextServer.id,
    serverName: normalizedServerName,
    bossId,
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

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
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
    trackedBosses: state.servers.length * state.bossDefinitions.length,
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

    for (const boss of state.bossDefinitions) {
      const nextRespawnAt = server.bosses[boss.id]?.nextRespawnAt ?? null;
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

function hydrateBossDefinitions(parsed: Partial<DashboardState>, fallback: DashboardState): BossDefinition[] {
  if (Array.isArray(parsed.bossDefinitions) && parsed.bossDefinitions.length > 0) {
    const definitions = parsed.bossDefinitions
      .map((value, index) => hydrateBossDefinition(value, index))
      .filter((value): value is BossDefinition => value !== null);

    if (definitions.length > 0) {
      return definitions;
    }
  }

  const legacyKeys = parsed.bossSettings ? Object.keys(parsed.bossSettings) : [];
  if (legacyKeys.length > 0) {
    return legacyKeys.map((bossId, index) => {
      const legacy = fallback.bossDefinitions.find((boss) => boss.id === bossId);
      return (
        legacy ?? {
          id: bossId,
          name: bossId,
          shortLabel: bossId,
          accent: pickBossAccent(index)
        }
      );
    });
  }

  return fallback.bossDefinitions;
}

function hydrateBossDefinition(value: unknown, index: number): BossDefinition | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<BossDefinition>;
  const id = normalizeBossId(String(candidate.id ?? ""));
  const name = normalizeLabel(String(candidate.name ?? ""));
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    shortLabel: normalizeLabel(String(candidate.shortLabel ?? "")) || name,
    accent: typeof candidate.accent === "string" && candidate.accent ? candidate.accent : pickBossAccent(index)
  };
}

function hydrateBossSettings(
  value: unknown,
  bossDefinitions: BossDefinition[],
  fallback: BossSettings
): BossSettings {
  const candidate = value && typeof value === "object" ? (value as Partial<BossSettings>) : {};

  return bossDefinitions.reduce<BossSettings>((accumulator, boss) => {
    accumulator[boss.id] = {
      respawnMinutes: readNumber(candidate?.[boss.id]?.respawnMinutes, fallback[boss.id]?.respawnMinutes ?? 180)
    };
    return accumulator;
  }, {});
}

function hydrateServer(
  value: unknown,
  bossDefinitions: BossDefinition[],
  bossSettings: BossSettings
): ServerTimer | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ServerTimer>;
  const name = normalizeLabel(candidate.name ?? "");
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
    bosses: bossDefinitions.reduce<Record<BossId, BossTimer>>((accumulator, boss) => {
      accumulator[boss.id] = hydrateBossTimer(
        candidate.bosses?.[boss.id],
        boss.id,
        bossSettings[boss.id].respawnMinutes
      );
      return accumulator;
    }, {})
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
  const decision = candidate.decision;
  if (decision !== "accepted" && decision !== "duplicate" && decision !== "ignored_old") {
    return null;
  }

  const bossId = normalizeBossId(String(candidate.bossId ?? ""));
  const reportedAt = readIso(candidate.reportedAt);
  const submittedAt = readIso(candidate.submittedAt);
  const serverId = typeof candidate.serverId === "string" ? candidate.serverId : "";
  const serverName = normalizeLabel(candidate.serverName ?? "");

  if (!bossId || !reportedAt || !submittedAt || !serverId || !serverName) {
    return null;
  }

  return {
    id:
      typeof candidate.id === "string"
        ? candidate.id
        : createEventId(serverName, bossId, reportedAt, submittedAt),
    serverId,
    serverName,
    bossId,
    reportedAt,
    submittedAt,
    reporter: typeof candidate.reporter === "string" ? candidate.reporter : "",
    note: typeof candidate.note === "string" ? candidate.note : "",
    decision
  };
}

function createServerRecord(name: string, nowIso: string, bossDefinitions: BossDefinition[]): ServerTimer {
  return {
    id: createServerId(name),
    name,
    createdAt: nowIso,
    lastSeenAt: nowIso,
    bosses: bossDefinitions.reduce<Record<BossId, BossTimer>>((accumulator, boss) => {
      accumulator[boss.id] = createEmptyBossTimer(boss.id);
      return accumulator;
    }, {})
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

function ensureServerBossTimers(
  timers: Record<BossId, BossTimer>,
  bossDefinitions: BossDefinition[]
): Record<BossId, BossTimer> {
  return bossDefinitions.reduce<Record<BossId, BossTimer>>((accumulator, boss) => {
    accumulator[boss.id] = timers[boss.id] ?? createEmptyBossTimer(boss.id);
    return accumulator;
  }, {});
}

function sortServers(servers: ServerTimer[]): ServerTimer[] {
  return [...servers].sort((left, right) => collator.compare(left.name, right.name));
}

function pickBossAccent(index: number): string {
  return BOSS_ACCENTS[index % BOSS_ACCENTS.length];
}

function createServerId(name: string): string {
  return `server:${normalizeLabel(name).toLowerCase()}`;
}

function createEventId(serverName: string, bossId: BossId, reportedAt: string, submittedAt: string): string {
  return `${serverName}:${bossId}:${reportedAt}:${submittedAt}`;
}

function createBossId(name: string, bossDefinitions: BossDefinition[]): string {
  const base = normalizeBossId(name);
  if (!bossDefinitions.some((boss) => boss.id === base)) {
    return base;
  }

  let index = 2;
  while (bossDefinitions.some((boss) => boss.id === `${base}-${index}`)) {
    index += 1;
  }

  return `${base}-${index}`;
}

function maxIso(left: string, right: string): string {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeBossId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "") || "";
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
