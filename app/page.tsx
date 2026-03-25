"use client";

import { useEffect, useState } from "react";
import {
  BOSS_IDS,
  BOSS_METADATA,
  createInitialDashboardState,
  formatLocalTimestamp,
  formatRelativeAge,
  fromLocalInputValue,
  getBossUrgency,
  getCountdownLabel,
  getDashboardSummary,
  getServerStatus,
  toLocalInputValue,
  type BossId,
  type ChronostoryAction,
  type ChronostoryResponse,
  type DashboardState,
  type ReportDecision,
  type ReportEvent,
  type ServerTimer
} from "@/lib/chronostory";
import styles from "./page.module.css";

const POLL_INTERVAL_MS = 15_000;
const REPORTER_PRESETS = ["본인", "파티원", "길드원", "운영자"] as const;

type SetupStatus = {
  backend: "file" | "supabase";
  supabaseReady: boolean;
  missingServerVars: string[];
};

type ReportFormState = {
  serverName: string;
  bossId: BossId;
  occurredAt: string;
  reporter: string;
  note: string;
};

type RenameFormState = {
  serverName: string;
  nextServerName: string;
};

type LogDecisionFilter = "all" | ReportDecision;
type ServerSortMode = "respawn" | "recent" | "name";
type ServerVisibilityFilter = "all" | "active" | "stale" | "archived" | "flagged";

const DECISION_COPY: Record<ReportDecision, string> = {
  accepted: "확정 입력",
  duplicate: "중복 제보",
  ignored_old: "오래된 제보"
};

const VALIDATION_COPY: Record<ReportDecision, string> = {
  accepted: "최근 입력 확정",
  duplicate: "중복 제보 감지",
  ignored_old: "오래된 제보 감지"
};

const URGENCY_COPY = {
  empty: "기록 없음",
  waiting: "대기 중",
  soon: "곧 리스폰",
  ready: "리스폰 가능"
} as const;

function getReviewSummary(events: ReportEvent[]) {
  return events.reduce(
    (accumulator, event) => {
      if (event.decision === "accepted") {
        accumulator.accepted += 1;
      } else {
        accumulator.flagged += 1;
      }
      return accumulator;
    },
    { accepted: 0, flagged: 0 }
  );
}

function getLatestBossEvent(events: ReportEvent[], serverName: string, bossId: BossId) {
  return events.find((event) => event.serverName === serverName && event.bossId === bossId) ?? null;
}

function getNearestRespawnMs(server: ServerTimer, now: number) {
  const candidates = BOSS_IDS.map((bossId) => {
    const value = server.bosses[bossId].nextRespawnAt;
    if (!value) return Number.POSITIVE_INFINITY;

    const targetMs = Date.parse(value);
    if (!Number.isFinite(targetMs)) return Number.POSITIVE_INFINITY;

    return Math.max(0, targetMs - now);
  });

  return Math.min(...candidates);
}

function getLatestSeenMs(server: ServerTimer) {
  const timestamp = Date.parse(server.lastSeenAt);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function compareServers(left: ServerTimer, right: ServerTimer, now: number, mode: ServerSortMode) {
  if (mode === "name") {
    return left.name.localeCompare(right.name, "ko-KR", { numeric: true });
  }

  if (mode === "recent") {
    return Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt);
  }

  return getNearestRespawnMs(left, now) - getNearestRespawnMs(right, now);
}

function hasFlaggedBoss(server: ServerTimer, events: ReportEvent[]) {
  return BOSS_IDS.some((bossId) => {
    const latestEvent = getLatestBossEvent(events, server.name, bossId);
    return latestEvent !== null && latestEvent.decision !== "accepted";
  });
}

function matchesServerVisibility(
  server: ServerTimer,
  dashboard: DashboardState,
  now: number,
  filter: ServerVisibilityFilter
) {
  if (filter === "all") {
    return true;
  }

  if (filter === "flagged") {
    return hasFlaggedBoss(server, dashboard.events);
  }

  return getServerStatus(server, dashboard.serviceSettings, now) === filter;
}

function ServerCard({
  server,
  now,
  dashboard,
  saving,
  collapsed,
  highlightLabels,
  onToggleCollapse,
  onQuickReset,
  onHeartbeat,
  onRemoveServer
}: {
  server: ServerTimer;
  now: number;
  dashboard: DashboardState;
  saving: boolean;
  collapsed: boolean;
  highlightLabels: string[];
  onToggleCollapse: (serverName: string) => void;
  onQuickReset: (serverName: string, bossId: BossId) => Promise<void>;
  onHeartbeat: (serverName: string) => Promise<void>;
  onRemoveServer: (serverName: string) => Promise<void>;
}) {
  const status = getServerStatus(server, dashboard.serviceSettings, now);

  return (
    <article className={`${styles.serverCard} ${highlightLabels.length > 0 ? styles.serverCardHighlighted : ""}`}>
      <div className={styles.serverTop}>
        <div>
          <h3>{server.name}</h3>
          <p>
            마지막 입력 {formatLocalTimestamp(server.lastSeenAt)} / {formatRelativeAge(server.lastSeenAt, now)}
          </p>
        </div>
        <div className={styles.serverActions}>
          {highlightLabels.map((label) => (
            <span key={label} className={styles.priorityBadge}>
              {label}
            </span>
          ))}
          <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
            {status === "active" ? "활성" : status === "stale" ? "유예" : "보관"}
          </span>
          <button
            className={styles.ghostButton}
            type="button"
            onClick={() => onToggleCollapse(server.name)}
            disabled={saving}
          >
            {collapsed ? "펼치기" : "접기"}
          </button>
          <button className={styles.ghostButton} type="button" onClick={() => void onHeartbeat(server.name)} disabled={saving}>
            heartbeat
          </button>
          <button className={styles.dangerButton} type="button" onClick={() => void onRemoveServer(server.name)} disabled={saving}>
            삭제
          </button>
        </div>
      </div>

      <div className={`${styles.bossGrid} ${collapsed ? styles.bossGridCollapsed : ""}`}>
        {BOSS_IDS.map((bossId) => {
          const timer = server.bosses[bossId];
          const urgency = getBossUrgency(timer.nextRespawnAt, now);
          const latestEvent = getLatestBossEvent(dashboard.events, server.name, bossId);

          return (
            <section
              key={bossId}
              className={`${styles.bossCard} ${styles[`bossCard_${urgency}`]}`}
              style={{ ["--boss-accent" as string]: BOSS_METADATA[bossId].accent }}
            >
              <div className={styles.bossHeader}>
                <div>
                  <p>{BOSS_METADATA[bossId].shortLabel}</p>
                  <h4>{BOSS_METADATA[bossId].name}</h4>
                </div>
                <span>{dashboard.bossSettings[bossId].respawnMinutes}분</span>
              </div>

              <div className={styles.bossStateRow}>
                <span className={`${styles.urgencyBadge} ${styles[`urgency_${urgency}`]}`}>
                  {URGENCY_COPY[urgency]}
                </span>
                {latestEvent ? (
                  <span className={`${styles.validationBadge} ${styles[`validation_${latestEvent.decision}`]}`}>
                    {VALIDATION_COPY[latestEvent.decision]}
                  </span>
                ) : null}
              </div>

              <div className={`${styles.timerValue} ${styles[`timer_${urgency}`]}`}>
                {getCountdownLabel(timer.nextRespawnAt, now)}
              </div>

              <dl className={styles.metaGrid}>
                <div>
                  <dt>최근 처치</dt>
                  <dd>{formatLocalTimestamp(timer.lastKillAt)}</dd>
                </div>
                <div>
                  <dt>다음 리스폰</dt>
                  <dd>{formatLocalTimestamp(timer.nextRespawnAt)}</dd>
                </div>
                <div>
                  <dt>갱신자</dt>
                  <dd>{timer.updatedBy || "-"}</dd>
                </div>
                <div>
                  <dt>최근 판정</dt>
                  <dd>{latestEvent ? DECISION_COPY[latestEvent.decision] : "-"}</dd>
                </div>
              </dl>

              {timer.note ? <p className={styles.noteLine}>{timer.note}</p> : null}

              <button
                className={styles.primaryButton}
                type="button"
                onClick={() => void onQuickReset(server.name, bossId)}
                disabled={saving}
              >
                지금 시각으로 초기화
              </button>
            </section>
          );
        })}
      </div>
    </article>
  );
}

export default function HomePage() {
  const [dashboard, setDashboard] = useState<DashboardState>(() => createInitialDashboardState());
  const [backend, setBackend] = useState<ChronostoryResponse["backend"]>("file");
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [serverDraft, setServerDraft] = useState("");
  const [logQuery, setLogQuery] = useState("");
  const [logDecisionFilter, setLogDecisionFilter] = useState<LogDecisionFilter>("all");
  const [logBossFilter, setLogBossFilter] = useState<"all" | BossId>("all");
  const [serverSortMode, setServerSortMode] = useState<ServerSortMode>("respawn");
  const [serverVisibilityFilter, setServerVisibilityFilter] = useState<ServerVisibilityFilter>("all");
  const [collapsedServers, setCollapsedServers] = useState<string[]>([]);
  const [renameForm, setRenameForm] = useState<RenameFormState>({ serverName: "", nextServerName: "" });
  const [reportForm, setReportForm] = useState<ReportFormState>({
    serverName: "",
    bossId: "pianus",
    occurredAt: toLocalInputValue(),
    reporter: "",
    note: ""
  });

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    void refreshDashboard(true);
    const pollId = window.setInterval(() => void refreshDashboard(false), POLL_INTERVAL_MS);
    return () => window.clearInterval(pollId);
  }, []);

  useEffect(() => {
    setCollapsedServers((current) =>
      current.filter((serverName) => dashboard.servers.some((server) => server.name === serverName))
    );
  }, [dashboard.servers]);

  async function refreshDashboard(showLoader = false) {
    if (showLoader) setLoading(true);

    try {
      const [dashboardResponse, setupResponse] = await Promise.all([
        fetch("/api/chronostory", { cache: "no-store" }),
        fetch("/api/chronostory/setup", { cache: "no-store" })
      ]);

      if (!dashboardResponse.ok || !setupResponse.ok) {
        throw new Error("대시보드 정보를 불러오지 못했습니다.");
      }

      const dashboardPayload = (await dashboardResponse.json()) as ChronostoryResponse;
      const setupPayload = (await setupResponse.json()) as SetupStatus;

      setDashboard(dashboardPayload.state);
      setBackend(dashboardPayload.backend);
      setSetupStatus(setupPayload);
      setLastSyncedAt(new Date().toISOString());
      setErrorMessage("");
      setReportForm((current) => ({
        ...current,
        serverName: current.serverName || dashboardPayload.state.servers[0]?.name || ""
      }));
      setRenameForm((current) => ({
        serverName: current.serverName || dashboardPayload.state.servers[0]?.name || "",
        nextServerName: current.nextServerName
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "불러오기에 실패했습니다.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function applyAction(action: ChronostoryAction) {
    setSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/chronostory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action)
      });

      const payload = (await response.json()) as ChronostoryResponse | { error?: string };
      if (!response.ok || !("state" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "요청 처리에 실패했습니다.");
      }

      setDashboard(payload.state);
      setBackend(payload.backend);
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "요청 처리에 실패했습니다.");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  const summary = getDashboardSummary(dashboard, now);
  const reviewSummary = getReviewSummary(dashboard.events);
  const recentServerNames = Array.from(new Set(dashboard.events.map((event) => event.serverName))).slice(0, 6);
  const filteredEvents = dashboard.events.filter((event) => {
    const normalizedQuery = logQuery.trim().toLowerCase();
    return (
      (logDecisionFilter === "all" || event.decision === logDecisionFilter) &&
      (logBossFilter === "all" || event.bossId === logBossFilter) &&
      (!normalizedQuery ||
        event.serverName.toLowerCase().includes(normalizedQuery) ||
        BOSS_METADATA[event.bossId].name.toLowerCase().includes(normalizedQuery) ||
        event.reporter.toLowerCase().includes(normalizedQuery) ||
        event.note.toLowerCase().includes(normalizedQuery))
    );
  });
  const sortedServers = [...dashboard.servers].sort((left, right) =>
    compareServers(left, right, now, serverSortMode)
  );
  const visibleServers = sortedServers.filter((server) =>
    matchesServerVisibility(server, dashboard, now, serverVisibilityFilter)
  );
  const soonestServerName =
    visibleServers
      .filter((server) => Number.isFinite(getNearestRespawnMs(server, now)))
      .sort((left, right) => getNearestRespawnMs(left, now) - getNearestRespawnMs(right, now))[0]?.name ?? null;
  const latestServerName =
    [...visibleServers].sort((left, right) => getLatestSeenMs(right) - getLatestSeenMs(left))[0]?.name ?? null;

  function handleToggleServerCollapse(serverName: string) {
    setCollapsedServers((current) =>
      current.includes(serverName)
        ? current.filter((name) => name !== serverName)
        : [...current, serverName]
    );
  }

  function handleCollapseAllVisible() {
    setCollapsedServers((current) => Array.from(new Set([...current, ...visibleServers.map((server) => server.name)])));
  }

  function handleExpandAllVisible() {
    setCollapsedServers((current) =>
      current.filter((serverName) => !visibleServers.some((server) => server.name === serverName))
    );
  }

  async function handleAddServer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = serverDraft.trim();
    if (!nextName) return;
    await applyAction({ type: "register-server", serverName: nextName });
    setServerDraft("");
  }

  async function handleRenameServer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const serverName = renameForm.serverName.trim();
    const nextServerName = renameForm.nextServerName.trim();
    if (!serverName || !nextServerName) return;

    await applyAction({ type: "rename-server", serverName, nextServerName });
    setRenameForm({ serverName: nextServerName, nextServerName: "" });
    setReportForm((current) =>
      current.serverName === serverName ? { ...current, serverName: nextServerName } : current
    );
  }

  async function handleRemoveServer(serverName: string) {
    await applyAction({ type: "remove-server", serverName });
    setReportForm((current) => (current.serverName === serverName ? { ...current, serverName: "" } : current));
  }

  async function handleReportSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const occurredAt = fromLocalInputValue(reportForm.occurredAt);
    if (!reportForm.serverName.trim() || !occurredAt) return;

    await applyAction({
      type: "report-kill",
      serverName: reportForm.serverName.trim(),
      bossId: reportForm.bossId,
      reportedAt: occurredAt,
      reporter: reportForm.reporter.trim(),
      note: reportForm.note.trim()
    });

    setReportForm((current) => ({
      ...current,
      occurredAt: toLocalInputValue(),
      note: ""
    }));
  }

  function handleSetOccurredAt(minutesAgo: number) {
    setReportForm((current) => ({
      ...current,
      occurredAt: toLocalInputValue(new Date(Date.now() - minutesAgo * 60_000))
    }));
  }

  async function handleQuickReset(serverName: string, bossId: BossId) {
    await applyAction({
      type: "report-kill",
      serverName,
      bossId,
      reportedAt: new Date().toISOString(),
      reporter: reportForm.reporter || "빠른 입력",
      note: "카드에서 즉시 초기화"
    });
  }

  return (
    <main className={styles.pageShell}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Manual Input Mode</p>
          <h1>크로노스토리 수동 입력 타이머</h1>
          <p className={styles.description}>
            보스 처치 시간을 유저가 직접 입력하고, 최근 제보를 검토하면서 서버별 리스폰 타이머를 함께 보는
            대시보드입니다.
          </p>
          <div className={styles.callout}>
            <strong>현재 상태</strong>
            <span>자동 연동 없음 / {backend === "supabase" ? "원격 저장소 사용 가능" : "로컬 저장소 사용 중"}</span>
          </div>
          <div className={styles.syncRow}>
            <span className={styles.inlineBadge}>{loading ? "불러오는 중" : "수동 입력 대시보드"}</span>
            <span className={styles.syncMeta}>
              {lastSyncedAt ? `마지막 동기화 ${formatLocalTimestamp(lastSyncedAt)}` : "첫 동기화 대기 중"}
            </span>
            {saving ? <span className={styles.syncMeta}>저장 중</span> : null}
            <button className={styles.ghostButton} type="button" onClick={() => void refreshDashboard(true)} disabled={loading || saving}>새로고침</button>
            <button className={styles.primaryButton} type="button" onClick={() => void applyAction({ type: "seed-demo" })} disabled={saving}>샘플 데이터 넣기</button>
            <button className={styles.ghostButton} type="button" onClick={() => void applyAction({ type: "reset-dashboard" })} disabled={saving}>전체 초기화</button>
          </div>
          {errorMessage ? <p className={styles.errorBanner}>{errorMessage}</p> : null}
          <div className={styles.featureGrid}>
            <article className={styles.featureCard}><span>활성 서버</span><strong>{summary.activeServers}</strong><p>최근 입력이 들어온 서버 수입니다.</p></article>
            <article className={styles.featureCard}><span>확정 입력</span><strong>{reviewSummary.accepted}</strong><p>최근 로그 중 정상 반영된 입력 수입니다.</p></article>
            <article className={styles.featureCard}><span>검토 필요</span><strong>{reviewSummary.flagged}</strong><p>중복 제보나 오래된 제보로 분류된 입력 수입니다.</p></article>
          </div>
        </div>

        <div className={styles.sidePanel}>
          <div className={styles.panelBlock}>
            <div className={styles.sectionHeader}>
              <div><p className={styles.eyebrow}>Storage</p><h2>저장 상태</h2></div>
            </div>
            <div className={styles.statusStack}>
              <div className={styles.statusLine}><span>현재 저장 방식</span><strong>{setupStatus?.backend === "supabase" ? "Supabase" : "로컬 파일"}</strong></div>
              <div className={styles.statusLine}><span>원격 저장 준비</span><strong>{setupStatus?.supabaseReady ? "완료" : "미완료"}</strong></div>
            </div>
            {!setupStatus?.supabaseReady ? <div className={styles.setupCard}><strong>필수 환경변수</strong><p>{setupStatus?.missingServerVars.join(", ") || "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"}</p><span>지금은 없어도 수동 입력 기능은 정상적으로 사용할 수 있습니다.</span></div> : null}
          </div>

          <div className={styles.panelBlock}>
            <div className={styles.sectionHeader}>
              <div><p className={styles.eyebrow}>Boss Settings</p><h2>리스폰 주기</h2></div>
            </div>
            <div className={styles.settingList}>
              {BOSS_IDS.map((bossId) => (
                <label key={bossId} className={styles.settingRow}>
                  <span>{BOSS_METADATA[bossId].name}</span>
                  <input type="number" min={1} max={1440} value={dashboard.bossSettings[bossId].respawnMinutes} onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    if (Number.isFinite(value)) {
                      void applyAction({ type: "update-boss-setting", bossId, respawnMinutes: value });
                    }
                  }} />
                  <small>분</small>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.formColumn}>
          <article className={styles.panelCard}>
            <div className={styles.sectionHeader}>
              <div><p className={styles.eyebrow}>Server Registry</p><h2>서버 관리</h2></div>
            </div>
            <form className={styles.formStack} onSubmit={(event) => void handleAddServer(event)}>
              <label className={styles.field}><span>새 서버 이름</span><input type="text" value={serverDraft} placeholder="예: 크로노 1" onChange={(event) => setServerDraft(event.target.value)} /></label>
              <button className={styles.primaryButton} type="submit" disabled={saving}>서버 등록</button>
            </form>
            <form className={styles.formStack} onSubmit={(event) => void handleRenameServer(event)}>
              <label className={styles.field}><span>이름 변경할 서버</span><select value={renameForm.serverName} onChange={(event) => setRenameForm((current) => ({ ...current, serverName: event.target.value }))}><option value="">서버 선택</option>{dashboard.servers.map((server) => <option key={server.id} value={server.name}>{server.name}</option>)}</select></label>
              <label className={styles.field}><span>새 이름</span><input type="text" value={renameForm.nextServerName} placeholder="예: 크로노 1-1" onChange={(event) => setRenameForm((current) => ({ ...current, nextServerName: event.target.value }))} /></label>
              <button className={styles.ghostButton} type="submit" disabled={saving || dashboard.servers.length === 0}>서버 이름 변경</button>
            </form>
          </article>

          <article className={styles.panelCard}>
            <div className={styles.sectionHeader}>
              <div><p className={styles.eyebrow}>Manual Report</p><h2>보스 처치 입력</h2></div>
            </div>
            <div className={styles.quickSelectGroup}>
              <span className={styles.quickSelectLabel}>입력자 프리셋</span>
              <div className={styles.quickChipRow}>
                {REPORTER_PRESETS.map((reporter) => <button key={reporter} className={styles.quickChip} type="button" onClick={() => setReportForm((current) => ({ ...current, reporter }))}>{reporter}</button>)}
              </div>
            </div>
            <form className={styles.formStack} onSubmit={(event) => void handleReportSubmit(event)}>
              {recentServerNames.length > 0 ? <div className={styles.quickSelectGroup}><span className={styles.quickSelectLabel}>최근 서버</span><div className={styles.quickChipRow}>{recentServerNames.map((serverName) => <button key={serverName} className={styles.quickChip} type="button" onClick={() => setReportForm((current) => ({ ...current, serverName }))}>{serverName}</button>)}</div></div> : null}
              <label className={styles.field}>
                <span>서버</span>
                <input list="server-options" value={reportForm.serverName} onChange={(event) => setReportForm((current) => ({ ...current, serverName: event.target.value }))} placeholder="없는 서버 이름이면 자동 생성" />
                <datalist id="server-options">{dashboard.servers.map((server) => <option key={server.id} value={server.name} />)}</datalist>
              </label>
              <div className={styles.twoColumnFields}>
                <label className={styles.field}><span>보스</span><select value={reportForm.bossId} onChange={(event) => setReportForm((current) => ({ ...current, bossId: event.target.value as BossId }))}>{BOSS_IDS.map((bossId) => <option key={bossId} value={bossId}>{BOSS_METADATA[bossId].name}</option>)}</select></label>
                <label className={styles.field}>
                  <span>처치 시각</span>
                  <input type="datetime-local" value={reportForm.occurredAt} onChange={(event) => setReportForm((current) => ({ ...current, occurredAt: event.target.value }))} />
                  <div className={styles.timeShortcutRow}>{[0, 5, 10, 30].map((minutesAgo) => <button key={minutesAgo} className={styles.timeShortcutButton} type="button" onClick={() => handleSetOccurredAt(minutesAgo)}>{minutesAgo === 0 ? "지금" : `${minutesAgo}분 전`}</button>)}</div>
                </label>
              </div>
              <div className={styles.twoColumnFields}>
                <label className={styles.field}><span>입력자</span><input type="text" value={reportForm.reporter} placeholder="닉네임 또는 운영자" onChange={(event) => setReportForm((current) => ({ ...current, reporter: event.target.value }))} /></label>
                <label className={styles.field}><span>메모</span><input type="text" value={reportForm.note} placeholder="예: 2채널, 파티 확인" onChange={(event) => setReportForm((current) => ({ ...current, note: event.target.value }))} /></label>
              </div>
              <button className={styles.primaryButton} type="submit" disabled={saving}>타이머 반영</button>
            </form>
          </article>
        </div>

        <div className={styles.feedColumn}>
          <article className={styles.panelCard}>
            <div className={styles.sectionHeader}>
              <div><p className={styles.eyebrow}>Live Feed</p><h2>최근 제보 로그</h2></div>
            </div>
            <div className={styles.logFilters}>
              <input className={styles.logSearch} type="text" value={logQuery} placeholder="서버명, 보스명, 입력자, 메모 검색" onChange={(event) => setLogQuery(event.target.value)} />
              <div className={styles.logFilterRow}>
                <select value={logDecisionFilter} onChange={(event) => setLogDecisionFilter(event.target.value as LogDecisionFilter)}>
                  <option value="all">전체 판정</option>
                  <option value="accepted">확정 입력</option>
                  <option value="duplicate">중복 제보</option>
                  <option value="ignored_old">오래된 제보</option>
                </select>
                <select value={logBossFilter} onChange={(event) => setLogBossFilter(event.target.value as "all" | BossId)}>
                  <option value="all">전체 보스</option>
                  {BOSS_IDS.map((bossId) => <option key={bossId} value={bossId}>{BOSS_METADATA[bossId].name}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.logList}>
              {filteredEvents.length === 0 ? <div className={styles.emptyCard}><strong>표시할 로그가 없습니다.</strong><span>검색어나 필터를 바꾸거나 새 입력을 추가해 보세요.</span></div> : filteredEvents.slice(0, 12).map((event) => (
                <article key={event.id} className={`${styles.logCard} ${styles[`logCard_${event.decision}`]}`}>
                  <div className={styles.logHeader}>
                    <strong>{event.serverName} / {BOSS_METADATA[event.bossId].name}</strong>
                    <span className={`${styles.inlineBadge} ${styles[`decisionBadge_${event.decision}`]}`}>{DECISION_COPY[event.decision]}</span>
                  </div>
                  <p>{formatLocalTimestamp(event.reportedAt)} / {event.reporter || "익명"}</p>
                  <span>{event.note || "메모 없음"}</span>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className={styles.serverArea}>
        <div className={styles.serverHeader}>
          <div><p className={styles.eyebrow}>Manual Timer Board</p><h2>서버별 타이머</h2></div>
          <div className={styles.serverHeaderTools}>
            <span className={styles.inlineMeta}>활성 {sortedServers.filter((server) => getServerStatus(server, dashboard.serviceSettings, now) === "active").length} / 유예 {sortedServers.filter((server) => getServerStatus(server, dashboard.serviceSettings, now) === "stale").length} / 보관 {sortedServers.filter((server) => getServerStatus(server, dashboard.serviceSettings, now) === "archived").length}</span>
            <div className={styles.filterControls}>
              <button className={styles.ghostButton} type="button" onClick={handleCollapseAllVisible} disabled={saving || visibleServers.length === 0}>전체 접기</button>
              <button className={styles.ghostButton} type="button" onClick={handleExpandAllVisible} disabled={saving || visibleServers.length === 0}>전체 펼치기</button>
              <select className={styles.sortSelect} value={serverVisibilityFilter} onChange={(event) => setServerVisibilityFilter(event.target.value as ServerVisibilityFilter)}>
                <option value="all">전체 서버</option>
                <option value="active">활성 서버만</option>
                <option value="stale">유예 서버만</option>
                <option value="archived">보관 서버만</option>
                <option value="flagged">검토 필요 서버만</option>
              </select>
              <select className={styles.sortSelect} value={serverSortMode} onChange={(event) => setServerSortMode(event.target.value as ServerSortMode)}>
                <option value="respawn">리스폰 임박 순</option>
                <option value="recent">최근 입력 순</option>
                <option value="name">서버명 순</option>
              </select>
            </div>
          </div>
        </div>
        {visibleServers.length === 0 ? <div className={styles.emptyCard}><strong>현재 필터에 맞는 서버가 없습니다.</strong><span>필터를 바꾸거나 샘플 데이터를 넣어서 화면을 점검해 보세요.</span></div> : null}
        <div className={styles.serverGrid}>
          {visibleServers.map((server) => (
            <ServerCard key={server.id} server={server} now={now} dashboard={dashboard} saving={saving} collapsed={collapsedServers.includes(server.name)} highlightLabels={[server.name === soonestServerName ? "가장 임박" : null, server.name === latestServerName ? "최근 입력" : null].filter((value): value is string => value !== null)} onToggleCollapse={handleToggleServerCollapse} onQuickReset={handleQuickReset} onHeartbeat={async (serverName) => applyAction({ type: "heartbeat", serverName })} onRemoveServer={handleRemoveServer} />
          ))}
        </div>
      </section>
    </main>
  );
}
