"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import {
  formatLocalTimestamp,
  formatRelativeAge,
  fromLocalInputValue,
  getBossUrgency,
  getCountdownLabel,
  getDashboardSummary,
  getServerStatus,
  toLocalInputValue,
  type BossDefinition,
  type BossId,
  type BossUrgency,
  type ChronostoryAction,
  type ChronostoryResponse,
  type DashboardState,
  type ReportDecision,
  type ServerStatus,
  type ServerTimer
} from "@/lib/chronostory";

type SetupStatus = {
  backend: "file" | "supabase";
  supabaseReady: boolean;
  missingServerVars: string[];
  missingClientVars: string[];
  webhookReady: boolean;
  missingWebhookVars: string[];
  webhookPath: string;
};

type ServerFilter = "all" | "active" | "stale" | "archived" | "review";
type ServerSort = "soon" | "recent" | "name";

const REPORTER_PRESETS = ["본인", "파티원", "길드원", "운영자"];
const FLASH_INTERVAL_MS = 700;
const FLASH_DURATION_MS = 15_000;

const TIME_ADJUSTMENTS = [
  { label: "지금", mode: "now" as const, minutes: 0 },
  { label: "-10분", mode: "delta" as const, minutes: -10 },
  { label: "-5분", mode: "delta" as const, minutes: -5 },
  { label: "-1분", mode: "delta" as const, minutes: -1 },
  { label: "+1분", mode: "delta" as const, minutes: 1 },
  { label: "+5분", mode: "delta" as const, minutes: 5 }
];

function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  }).then(async (response) => {
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? "요청에 실패했습니다.");
    }
    return data as T;
  });
}

function parseMinuteDraft(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return Math.min(Math.floor(parsed), 24 * 60);
}

function getNearestRespawnDelta(server: ServerTimer, bosses: BossDefinition[], nowMs: number) {
  const deltas = bosses
    .map((boss) => {
      const nextRespawnAt = server.bosses[boss.id]?.nextRespawnAt;
      if (!nextRespawnAt) {
        return Number.POSITIVE_INFINITY;
      }

      const parsed = Date.parse(nextRespawnAt);
      if (!Number.isFinite(parsed)) {
        return Number.POSITIVE_INFINITY;
      }

      return Math.max(0, parsed - nowMs);
    })
    .filter((value) => Number.isFinite(value));

  if (deltas.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.min(...deltas);
}

function compareSoonness(
  left: ServerTimer,
  right: ServerTimer,
  dashboard: DashboardState,
  nowMs: number
) {
  const leftSoon = getNearestRespawnDelta(left, dashboard.bossDefinitions, nowMs);
  const rightSoon = getNearestRespawnDelta(right, dashboard.bossDefinitions, nowMs);

  if (leftSoon !== rightSoon) {
    return leftSoon - rightSoon;
  }

  return Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt);
}

function getStatusLabel(status: ServerStatus) {
  switch (status) {
    case "active":
      return "활성 서버";
    case "stale":
      return "유예 서버";
    case "archived":
      return "보관 서버";
  }
}

function getUrgencyLabel(urgency: BossUrgency) {
  switch (urgency) {
    case "empty":
      return "기록 없음";
    case "waiting":
      return "대기 중";
    case "soon":
      return "곧 리스폰";
    case "ready":
      return "리스폰 가능";
  }
}

function getDecisionLabel(decision: ReportDecision) {
  switch (decision) {
    case "accepted":
      return "확정 입력";
    case "duplicate":
      return "중복 제보";
    case "ignored_old":
      return "오래된 제보";
  }
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function playFallbackAlertSound(context: AudioContext | null) {
  if (!context) {
    return;
  }

  const startTime = context.currentTime;
  for (const [index, offset] of [0, 0.22, 0.44, 0.66].entries()) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = index % 2 === 0 ? "square" : "sawtooth";
    oscillator.frequency.value = index % 2 === 0 ? 988 : 740;

    gain.gain.setValueAtTime(0.0001, startTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.28, startTime + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + offset + 0.2);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime + offset);
    oscillator.stop(startTime + offset + 0.22);
  }
}

export default function HomePage() {
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [backend, setBackend] = useState<"file" | "supabase">("file");
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [notificationPermission, setNotificationPermission] = useState("default");

  const [serverNameInput, setServerNameInput] = useState("");
  const [renameSource, setRenameSource] = useState("");
  const [renameTarget, setRenameTarget] = useState("");
  const [reportServerName, setReportServerName] = useState("");
  const [reportBossId, setReportBossId] = useState("");
  const [reporter, setReporter] = useState("본인");
  const [reportNote, setReportNote] = useState("");
  const [reportedAtInput, setReportedAtInput] = useState(() => toLocalInputValue());

  const [bossNameInput, setBossNameInput] = useState("");
  const [bossRespawnInput, setBossRespawnInput] = useState("180");
  const [respawnDrafts, setRespawnDrafts] = useState<Record<string, string>>({});

  const [serverFilter, setServerFilter] = useState<ServerFilter>("all");
  const [serverSort, setServerSort] = useState<ServerSort>("soon");
  const [collapsedServers, setCollapsedServers] = useState<Record<string, boolean>>({});

  const audioContextRef = useRef<AudioContext | null>(null);
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const titleFlashIntervalRef = useRef<number | null>(null);
  const titleFlashTimeoutRef = useRef<number | null>(null);
  const titleDefaultRef = useRef("크로노스토리 수동 입력 타이머");
  const faviconLinkRef = useRef<HTMLLinkElement | null>(null);
  const originalFaviconRef = useRef<string | null>(null);
  const alertFaviconRef = useRef<string | null>(null);
  const readyStateRef = useRef<Map<string, boolean>>(new Map());
  const readyStateInitializedRef = useRef(false);

  const bossDefinitions = dashboard?.bossDefinitions ?? [];
  const summary = useMemo(
    () => (dashboard ? getDashboardSummary(dashboard, nowMs) : null),
    [dashboard, nowMs]
  );

  const latestDecisionMap = useMemo(() => {
    const map = new Map<string, ReportDecision>();
    if (!dashboard) {
      return map;
    }

    for (const event of dashboard.events) {
      const key = `${event.serverName}:${event.bossId}`;
      if (!map.has(key)) {
        map.set(key, event.decision);
      }
    }

    return map;
  }, [dashboard]);

  const recentServerNames = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    const seen = new Set<string>();
    const names: string[] = [];

    for (const event of dashboard.events) {
      if (!seen.has(event.serverName)) {
        names.push(event.serverName);
        seen.add(event.serverName);
      }
      if (names.length >= 6) {
        break;
      }
    }

    for (const server of dashboard.servers) {
      if (!seen.has(server.name)) {
        names.push(server.name);
        seen.add(server.name);
      }
      if (names.length >= 6) {
        break;
      }
    }

    return names;
  }, [dashboard]);

  const visibleServers = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    const filtered = dashboard.servers.filter((server) => {
      const status = getServerStatus(server, dashboard.serviceSettings, nowMs);
      const hasReview = dashboard.bossDefinitions.some((boss) => {
        const decision = latestDecisionMap.get(`${server.name}:${boss.id}`);
        return decision && decision !== "accepted";
      });

      if (serverFilter === "review") {
        return hasReview;
      }

      if (serverFilter === "all") {
        return true;
      }

      return status === serverFilter;
    });

    return [...filtered].sort((left, right) => {
      if (serverSort === "name") {
        return left.name.localeCompare(right.name, "ko-KR", { numeric: true });
      }

      if (serverSort === "recent") {
        return Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt);
      }

      return compareSoonness(left, right, dashboard, nowMs);
    });
  }, [dashboard, latestDecisionMap, nowMs, serverFilter, serverSort]);

  const playAlertSound = useCallback(() => {
    const audio = alertAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise) {
        void playPromise.catch(() => {
          playFallbackAlertSound(audioContextRef.current);
        });
      }
      return;
    }

    playFallbackAlertSound(audioContextRef.current);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const audio = new Audio("/audio/boss-respawn.mp3");
    audio.preload = "auto";
    audio.volume = 1;
    alertAudioRef.current = audio;

    return () => {
      audio.pause();
      alertAudioRef.current = null;
    };
  }, []);

  const ensureFaviconLink = useCallback(() => {
    if (typeof document === "undefined") {
      return null;
    }

    if (!faviconLinkRef.current) {
      const existing = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      faviconLinkRef.current = existing ?? document.createElement("link");

      if (!existing) {
        faviconLinkRef.current.rel = "icon";
        document.head.appendChild(faviconLinkRef.current);
      }
    }

    if (originalFaviconRef.current === null) {
      originalFaviconRef.current = faviconLinkRef.current.href || "";
    }

    return faviconLinkRef.current;
  }, []);

  const getAlertFavicon = useCallback(() => {
    if (typeof document === "undefined") {
      return "";
    }

    if (alertFaviconRef.current) {
      return alertFaviconRef.current;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");

    if (!context) {
      return "";
    }

    context.fillStyle = "#9d4f2f";
    context.beginPath();
    context.arc(32, 32, 30, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#fff6ea";
    context.font = "bold 38px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("!", 32, 34);

    alertFaviconRef.current = canvas.toDataURL("image/png");
    return alertFaviconRef.current;
  }, []);

  const setAlertFavicon = useCallback(
    (active: boolean) => {
      const link = ensureFaviconLink();
      if (!link) {
        return;
      }

      if (active) {
        const nextHref = getAlertFavicon();
        if (nextHref) {
          link.href = nextHref;
        }
        return;
      }

      if (originalFaviconRef.current !== null) {
        link.href = originalFaviconRef.current;
      }
    },
    [ensureFaviconLink, getAlertFavicon]
  );

  const stopTitleFlash = useCallback(() => {
    if (titleFlashIntervalRef.current !== null) {
      window.clearInterval(titleFlashIntervalRef.current);
      titleFlashIntervalRef.current = null;
    }

    if (titleFlashTimeoutRef.current !== null) {
      window.clearTimeout(titleFlashTimeoutRef.current);
      titleFlashTimeoutRef.current = null;
    }

    if (typeof document !== "undefined") {
      document.title = titleDefaultRef.current;
    }
    setAlertFavicon(false);
  }, [setAlertFavicon]);

  const startTitleFlash = useCallback(
    (message: string) => {
      stopTitleFlash();

      let blink = false;
      titleFlashIntervalRef.current = window.setInterval(() => {
        document.title = blink ? titleDefaultRef.current : message;
        setAlertFavicon(!blink);
        blink = !blink;
      }, FLASH_INTERVAL_MS);

      titleFlashTimeoutRef.current = window.setTimeout(() => {
        stopTitleFlash();
      }, FLASH_DURATION_MS);
    },
    [setAlertFavicon, stopTitleFlash]
  );

  useEffect(() => {
    void refreshDashboard();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      titleDefaultRef.current = document.title || titleDefaultRef.current;
    }
    ensureFaviconLink();

    const clearOnFocus = () => {
      stopTitleFlash();
    };

    window.addEventListener("focus", clearOnFocus);
    document.addEventListener("visibilitychange", clearOnFocus);

    return () => {
      window.removeEventListener("focus", clearOnFocus);
      document.removeEventListener("visibilitychange", clearOnFocus);
      stopTitleFlash();
    };
  }, [ensureFaviconLink, stopTitleFlash]);

  useEffect(() => {
    const unlockAudio = () => {
      if (typeof window === "undefined") {
        return;
      }

      if (!audioContextRef.current) {
        const AudioContextCtor =
          window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor) {
          audioContextRef.current = new AudioContextCtor();
        }
      }

      void audioContextRef.current?.resume();
    };

    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(window.Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!dashboard) {
      return;
    }

    setRespawnDrafts(
      Object.fromEntries(
        dashboard.bossDefinitions.map((boss) => [
          boss.id,
          String(dashboard.bossSettings[boss.id]?.respawnMinutes ?? 180)
        ])
      )
    );

    if (!reportBossId || !dashboard.bossDefinitions.some((boss) => boss.id === reportBossId)) {
      setReportBossId(dashboard.bossDefinitions[0]?.id ?? "");
    }

    if (!renameSource || !dashboard.servers.some((server) => server.name === renameSource)) {
      const firstServer = dashboard.servers[0]?.name ?? "";
      setRenameSource(firstServer);
      setRenameTarget(firstServer);
    }

    if (!reportServerName && dashboard.servers[0]?.name) {
      setReportServerName(dashboard.servers[0].name);
    }
  }, [dashboard, renameSource, reportBossId, reportServerName]);

  useEffect(() => {
    if (!dashboard) {
      return;
    }

    const nextMap = new Map<string, boolean>();
    const newlyReady: Array<{ server: ServerTimer; boss: BossDefinition }> = [];

    for (const server of dashboard.servers) {
      for (const boss of dashboard.bossDefinitions) {
        const timer = server.bosses[boss.id];
        const key = `${server.id}:${boss.id}`;
        const isReady = getBossUrgency(timer?.nextRespawnAt ?? null, nowMs) === "ready";
        nextMap.set(key, isReady);

        if (readyStateInitializedRef.current && isReady && !readyStateRef.current.get(key)) {
          newlyReady.push({ server, boss });
        }
      }
    }

    readyStateRef.current = nextMap;

    if (!readyStateInitializedRef.current) {
      readyStateInitializedRef.current = true;
      return;
    }

    for (const item of newlyReady) {
      playAlertSound();
      startTitleFlash(`Boss Respawn | ${item.server.name} | ${item.boss.name}`);

      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        window.Notification.permission === "granted"
      ) {
        new window.Notification("Boss Respawn", {
          body: `${item.server.name} 서버의 ${item.boss.name}가 리스폰 가능한 상태입니다.`
        });
      }
    }
  }, [dashboard, nowMs, playAlertSound, startTitleFlash]);

  async function refreshDashboard() {
    setErrorMessage("");

    try {
      const [dashboardResponse, setupResponse] = await Promise.all([
        fetchJson<ChronostoryResponse>("/api/chronostory"),
        fetchJson<SetupStatus>("/api/chronostory/setup")
      ]);

      setDashboard(dashboardResponse.state);
      setBackend(dashboardResponse.backend);
      setSetup(setupResponse);
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "대시보드를 불러오지 못했습니다."));
    }
  }

  async function submitAction(action: ChronostoryAction) {
    setIsBusy(true);
    setErrorMessage("");

    try {
      const response = await fetchJson<ChronostoryResponse>("/api/chronostory", {
        method: "POST",
        body: JSON.stringify(action)
      });

      setDashboard(response.state);
      setBackend(response.backend);
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "요청 처리 중 문제가 발생했습니다."));
    } finally {
      setIsBusy(false);
    }
  }

  function adjustReportedAt(mode: "now" | "delta", minutes: number) {
    if (mode === "now") {
      setReportedAtInput(toLocalInputValue());
      return;
    }

    const baseIso = fromLocalInputValue(reportedAtInput);
    const baseDate = baseIso ? new Date(baseIso) : new Date();
    const nextDate = new Date(baseDate.getTime() + minutes * 60_000);
    setReportedAtInput(toLocalInputValue(nextDate));
  }

  async function handleRegisterServer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!serverNameInput.trim()) {
      setErrorMessage("서버 이름을 입력해 주세요.");
      return;
    }

    const normalizedName = serverNameInput.trim();
    await submitAction({ type: "register-server", serverName: normalizedName });
    setServerNameInput("");
    setReportServerName(normalizedName);
  }

  async function handleRenameServer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameSource.trim() || !renameTarget.trim()) {
      setErrorMessage("변경할 서버와 새 이름을 입력해 주세요.");
      return;
    }

    await submitAction({
      type: "rename-server",
      serverName: renameSource,
      nextServerName: renameTarget
    });

    setReportServerName((current) => (current === renameSource ? renameTarget : current));
    setRenameSource(renameTarget);
  }

  async function handleRemoveServer(serverName: string) {
    if (!window.confirm(`"${serverName}" 서버를 삭제할까요?`)) {
      return;
    }

    await submitAction({ type: "remove-server", serverName });
  }

  async function handleReportKill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedServerName = reportServerName.trim();
    const normalizedBossId = reportBossId.trim();
    const reportedAtIso = fromLocalInputValue(reportedAtInput);

    if (!normalizedServerName || !normalizedBossId || !reportedAtIso) {
      setErrorMessage("서버, 보스, 처치 시각을 모두 확인해 주세요.");
      return;
    }

    await submitAction({
      type: "report-kill",
      serverName: normalizedServerName,
      bossId: normalizedBossId,
      reportedAt: reportedAtIso,
      reporter: reporter.trim(),
      note: reportNote.trim()
    });

    setReportServerName(normalizedServerName);
    setReportNote("");
  }

  async function handleAddBoss(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = bossNameInput.trim();
    const minutes = parseMinuteDraft(bossRespawnInput);

    if (!normalizedName) {
      setErrorMessage("보스 이름을 입력해 주세요.");
      return;
    }

    if (minutes === null) {
      setErrorMessage("리스폰 주기는 1분 이상 숫자로 입력해 주세요.");
      return;
    }

    await submitAction({
      type: "add-boss",
      bossName: normalizedName,
      respawnMinutes: minutes
    });

    setBossNameInput("");
    setBossRespawnInput("180");
  }

  async function commitRespawnDraft(bossId: BossId) {
    const minutes = parseMinuteDraft(respawnDrafts[bossId] ?? "");
    if (minutes === null) {
      setRespawnDrafts((current) => ({
        ...current,
        [bossId]: String(dashboard?.bossSettings[bossId]?.respawnMinutes ?? 180)
      }));
      return;
    }

    await submitAction({
      type: "update-boss-setting",
      bossId,
      respawnMinutes: minutes
    });
  }

  async function requestBrowserNotificationPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
  }

  return (
    <main className={styles.pageShell}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Manual Input Mode</p>
          <h1>크로노스토리 수동 입력 타이머</h1>
          <p className={styles.description}>
            보스 처치 시간을 유저가 직접 입력하고, 여러 사람이 함께 서버별 리스폰 타이머를 보는
            공유 대시보드입니다.
          </p>

          <div className={styles.callout}>
            <strong>현재 상태</strong>
            <span>
              자동 연동 없이 수동 입력으로 운영 중이며, 원격 저장소를 통해 여러 기기에서 같은 값을 볼 수
              있습니다.
            </span>
          </div>

          <div className={styles.syncRow}>
            <span className={styles.inlineBadge}>수동 입력 대시보드</span>
            <span className={styles.syncMeta}>
              마지막 동기화 {lastSyncedAt ? formatLocalTimestamp(lastSyncedAt) : "없음"}
            </span>
            <button className={styles.ghostButton} type="button" onClick={() => void refreshDashboard()}>
              새로고침
            </button>
          </div>

          <div className={styles.heroActions}>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={isBusy}
              onClick={() => void submitAction({ type: "seed-demo" })}
            >
              샘플 데이터 넣기
            </button>
            <button
              className={styles.ghostButton}
              type="button"
              disabled={isBusy}
              onClick={() => void submitAction({ type: "reset-dashboard" })}
            >
              전체 초기화
            </button>
            <button
              className={styles.ghostButton}
              type="button"
              disabled={isBusy}
              onClick={() => void submitAction({ type: "remove-archived", nowMs })}
            >
              보관 서버 정리
            </button>
          </div>

          {errorMessage ? <div className={styles.errorBanner}>{errorMessage}</div> : null}

          <div className={styles.featureGrid}>
            <article className={styles.featureCard}>
              <span>활성 서버</span>
              <strong>{summary?.activeServers ?? 0}</strong>
              <p>최근 입력이 들어온 서버 수입니다.</p>
            </article>
            <article className={styles.featureCard}>
              <span>확정 입력</span>
              <strong>
                {dashboard?.events.filter((event) => event.decision === "accepted").length ?? 0}
              </strong>
              <p>정상 반영된 최근 입력 수입니다.</p>
            </article>
            <article className={styles.featureCard}>
              <span>검토 필요</span>
              <strong>
                {dashboard?.events.filter((event) => event.decision !== "accepted").length ?? 0}
              </strong>
              <p>중복 또는 오래된 입력으로 분류된 수입니다.</p>
            </article>
          </div>
        </div>

        <aside className={styles.sidePanel}>
          <div className={styles.panelBlock}>
            <p className={styles.eyebrow}>Storage</p>
            <div className={styles.statusStack}>
              <div className={styles.statusLine}>
                <span>현재 저장 방식</span>
                <strong>{backend === "supabase" ? "Supabase" : "로컬 파일"}</strong>
              </div>
              <div className={styles.statusLine}>
                <span>원격 저장 준비</span>
                <strong>{setup?.supabaseReady ? "완료" : "미완료"}</strong>
              </div>
            </div>
          </div>

          <div className={styles.panelBlock}>
            <p className={styles.eyebrow}>Alerts</p>
            <div className={styles.setupCard}>
              <strong>완료 알림</strong>
              <p>타이머가 끝나면 알림음을 재생하고 브라우저 제목을 깜빡이게 했습니다.</p>
              <span>
                브라우저 알림 권한:{" "}
                {notificationPermission === "granted"
                  ? "허용"
                  : notificationPermission === "denied"
                    ? "차단"
                    : "미설정"}
              </span>
            </div>
            {notificationPermission !== "granted" ? (
              <button
                className={styles.ghostButton}
                type="button"
                onClick={() => void requestBrowserNotificationPermission()}
              >
                브라우저 알림 허용
              </button>
            ) : null}
          </div>

          <div className={styles.panelBlock}>
            <p className={styles.eyebrow}>Boss Registry</p>
            <div className={styles.settingList}>
              {bossDefinitions.map((boss) => (
                <div className={styles.settingRow} key={boss.id}>
                  <span>{boss.name}</span>
                  <input
                    inputMode="numeric"
                    value={respawnDrafts[boss.id] ?? ""}
                    onChange={(event) =>
                      setRespawnDrafts((current) => ({
                        ...current,
                        [boss.id]: event.target.value.replace(/[^\d]/g, "").slice(0, 4)
                      }))
                    }
                    onBlur={() => void commitRespawnDraft(boss.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void commitRespawnDraft(boss.id);
                      }
                    }}
                  />
                  <button
                    className={styles.ghostButton}
                    type="button"
                    onClick={() => void commitRespawnDraft(boss.id)}
                  >
                    저장
                  </button>
                </div>
              ))}
            </div>

            <form className={styles.formStack} onSubmit={handleAddBoss}>
              <div className={styles.twoColumnFields}>
                <label className={styles.field}>
                  <span>보스 이름</span>
                  <input
                    value={bossNameInput}
                    onChange={(event) => setBossNameInput(event.target.value)}
                    placeholder="예: 혼테일"
                  />
                </label>
                <label className={styles.field}>
                  <span>리스폰 주기(분)</span>
                  <input
                    inputMode="numeric"
                    value={bossRespawnInput}
                    onChange={(event) =>
                      setBossRespawnInput(event.target.value.replace(/[^\d]/g, "").slice(0, 4))
                    }
                    placeholder="180"
                  />
                </label>
              </div>
              <button className={styles.primaryButton} type="submit" disabled={isBusy}>
                보스 추가
              </button>
            </form>
          </div>
        </aside>
      </section>

      <section className={styles.workspace}>
        <div className={styles.formColumn}>
          <section className={styles.panelCard}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>Server Registry</p>
                <h2>서버 관리</h2>
              </div>
            </div>

            <form className={styles.formStack} onSubmit={handleRegisterServer}>
              <label className={styles.field}>
                <span>새 서버 이름</span>
                <input
                  value={serverNameInput}
                  onChange={(event) => setServerNameInput(event.target.value)}
                  placeholder="예: 크로노 1"
                />
              </label>
              <button className={styles.primaryButton} type="submit" disabled={isBusy}>
                서버 등록
              </button>
            </form>

            <form className={styles.formStack} onSubmit={handleRenameServer}>
              <div className={styles.twoColumnFields}>
                <label className={styles.field}>
                  <span>이름 변경할 서버</span>
                  <select value={renameSource} onChange={(event) => setRenameSource(event.target.value)}>
                    {dashboard?.servers.map((server) => (
                      <option key={server.id} value={server.name}>
                        {server.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>새 이름</span>
                  <input
                    value={renameTarget}
                    onChange={(event) => setRenameTarget(event.target.value)}
                    placeholder="변경할 이름"
                  />
                </label>
              </div>
              <button className={styles.ghostButton} type="submit" disabled={isBusy || !renameSource}>
                서버 이름 변경
              </button>
            </form>

            <div className={styles.serverList}>
              {dashboard?.servers.map((server) => (
                <div className={styles.serverListItem} key={server.id}>
                  <strong>{server.name}</strong>
                  <button
                    className={styles.dangerButton}
                    type="button"
                    onClick={() => void handleRemoveServer(server.name)}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.panelCard}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>Boss Reporting</p>
                <h2>보스 처치 입력</h2>
              </div>
            </div>

            <form className={styles.formStack} onSubmit={handleReportKill}>
              {recentServerNames.length > 0 ? (
                <div className={styles.quickSelectGroup}>
                  <span className={styles.quickSelectLabel}>최근 서버</span>
                  <div className={styles.quickChipRow}>
                    {recentServerNames.map((serverName) => (
                      <button
                        className={styles.quickChip}
                        key={serverName}
                        type="button"
                        onClick={() => setReportServerName(serverName)}
                      >
                        {serverName}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={styles.quickSelectGroup}>
                <span className={styles.quickSelectLabel}>입력자 프리셋</span>
                <div className={styles.quickChipRow}>
                  {REPORTER_PRESETS.map((preset) => (
                    <button
                      className={styles.quickChip}
                      key={preset}
                      type="button"
                      onClick={() => setReporter(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.twoColumnFields}>
                <label className={styles.field}>
                  <span>서버 이름</span>
                  <input
                    value={reportServerName}
                    onChange={(event) => setReportServerName(event.target.value)}
                    placeholder="예: 크로노 1"
                  />
                </label>
                <label className={styles.field}>
                  <span>보스</span>
                  <select value={reportBossId} onChange={(event) => setReportBossId(event.target.value)}>
                    {bossDefinitions.map((boss) => (
                      <option key={boss.id} value={boss.id}>
                        {boss.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={styles.twoColumnFields}>
                <label className={styles.field}>
                  <span>입력자</span>
                  <input value={reporter} onChange={(event) => setReporter(event.target.value)} />
                </label>
                <label className={styles.field}>
                  <span>메모</span>
                  <input
                    value={reportNote}
                    onChange={(event) => setReportNote(event.target.value)}
                    placeholder="선택 입력"
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span>처치 시각</span>
                <input
                  type="datetime-local"
                  value={reportedAtInput}
                  onChange={(event) => setReportedAtInput(event.target.value)}
                />
              </label>

              <div className={styles.timeShortcutRow}>
                {TIME_ADJUSTMENTS.map((shortcut) => (
                  <button
                    className={styles.timeShortcutButton}
                    key={shortcut.label}
                    type="button"
                    onClick={() => adjustReportedAt(shortcut.mode, shortcut.minutes)}
                  >
                    {shortcut.label}
                  </button>
                ))}
              </div>

              <button className={styles.primaryButton} type="submit" disabled={isBusy}>
                타이머 반영
              </button>
            </form>
          </section>

          <section className={styles.serverArea}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>Server Timers</p>
                <h2>서버별 타이머</h2>
              </div>

              <div className={styles.serverHeaderTools}>
                <div className={styles.filterControls}>
                  <select
                    className={styles.sortSelect}
                    value={serverFilter}
                    onChange={(event) => setServerFilter(event.target.value as ServerFilter)}
                  >
                    <option value="all">전체 서버</option>
                    <option value="active">활성 서버만</option>
                    <option value="stale">유예 서버만</option>
                    <option value="archived">보관 서버만</option>
                    <option value="review">검토 필요 서버만</option>
                  </select>
                  <select
                    className={styles.sortSelect}
                    value={serverSort}
                    onChange={(event) => setServerSort(event.target.value as ServerSort)}
                  >
                    <option value="soon">리스폰 임박 순</option>
                    <option value="recent">최근 입력 순</option>
                    <option value="name">서버명 순</option>
                  </select>
                </div>
                <div className={styles.filterControls}>
                  <button
                    className={styles.ghostButton}
                    type="button"
                    onClick={() =>
                      setCollapsedServers(
                        Object.fromEntries((dashboard?.servers ?? []).map((server) => [server.id, true]))
                      )
                    }
                  >
                    전체 접기
                  </button>
                  <button
                    className={styles.ghostButton}
                    type="button"
                    onClick={() => setCollapsedServers({})}
                  >
                    전체 펼치기
                  </button>
                </div>
              </div>
            </div>

            {visibleServers.length > 0 ? (
              <div className={styles.serverGrid}>
                {visibleServers.map((server) => {
                  const status = getServerStatus(server, dashboard!.serviceSettings, nowMs);
                  const collapsed = collapsedServers[server.id] ?? false;
                  const isMostRecent = dashboard?.servers[0]?.id === server.id;
                  const hasReview = bossDefinitions.some((boss) => {
                    const decision = latestDecisionMap.get(`${server.name}:${boss.id}`);
                    return decision && decision !== "accepted";
                  });
                  const hasReadyBoss = bossDefinitions.some(
                    (boss) => getBossUrgency(server.bosses[boss.id]?.nextRespawnAt ?? null, nowMs) === "ready"
                  );

                  return (
                    <article
                      className={`${styles.serverCard} ${hasReview ? styles.serverCardHighlighted : ""} ${
                        hasReadyBoss ? styles.serverCardReady : ""
                      }`}
                      key={server.id}
                    >
                      <div className={styles.serverHeader}>
                        <div className={styles.serverTop}>
                          <div className={styles.serverActions}>
                            <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
                              {getStatusLabel(status)}
                            </span>
                            {hasReadyBoss ? (
                              <span className={`${styles.priorityBadge} ${styles.priorityBadgeReady}`}>
                                리스폰 활성
                              </span>
                            ) : null}
                            {isMostRecent ? <span className={styles.priorityBadge}>최근 입력</span> : null}
                            {hasReview ? <span className={styles.priorityBadge}>검토 필요</span> : null}
                          </div>
                          <h3>{server.name}</h3>
                          <p>마지막 입력 {formatRelativeAge(server.lastSeenAt, nowMs)}</p>
                        </div>

                        <div className={styles.serverActions}>
                          <button
                            className={styles.ghostButton}
                            type="button"
                            onClick={() =>
                              setCollapsedServers((current) => ({
                                ...current,
                                [server.id]: !collapsed
                              }))
                            }
                          >
                            {collapsed ? "펼치기" : "접기"}
                          </button>
                          <button
                            className={styles.ghostButton}
                            type="button"
                            onClick={() => {
                              setReportServerName(server.name);
                              setReportedAtInput(toLocalInputValue());
                            }}
                          >
                            지금 시각으로 초기화
                          </button>
                          <button
                            className={styles.dangerButton}
                            type="button"
                            onClick={() => void handleRemoveServer(server.name)}
                          >
                            삭제
                          </button>
                        </div>
                      </div>

                      <div className={`${styles.bossGrid} ${collapsed ? styles.bossGridCollapsed : ""}`}>
                        {bossDefinitions.map((boss) => {
                          const timer = server.bosses[boss.id];
                          const urgency = getBossUrgency(timer?.nextRespawnAt ?? null, nowMs);
                          const decision = latestDecisionMap.get(`${server.name}:${boss.id}`);

                          return (
                            <div
                              className={`${styles.bossCard} ${
                                urgency === "ready"
                                  ? styles.bossCard_ready
                                  : urgency === "soon"
                                    ? styles.bossCard_soon
                                    : ""
                              }`}
                              key={`${server.id}:${boss.id}`}
                              style={{ ["--boss-accent" as string]: boss.accent }}
                            >
                              <div className={styles.bossHeader}>
                                <div>
                                  <p>Boss</p>
                                  <h4>{boss.name}</h4>
                                </div>
                                <span>{dashboard?.bossSettings[boss.id]?.respawnMinutes ?? 0}분</span>
                              </div>

                              <div className={styles.bossStateRow}>
                                <span className={`${styles.urgencyBadge} ${styles[`urgency_${urgency}`]}`}>
                                  {getUrgencyLabel(urgency)}
                                </span>
                                {decision ? (
                                  <span
                                    className={`${styles.validationBadge} ${styles[`validation_${decision}`]}`}
                                  >
                                    {getDecisionLabel(decision)}
                                  </span>
                                ) : null}
                              </div>

                              <strong className={`${styles.timerValue} ${styles[`timer_${urgency}`]}`}>
                                {getCountdownLabel(timer?.nextRespawnAt ?? null, nowMs)}
                              </strong>

                              <dl className={styles.metaGrid}>
                                <div>
                                  <dt>최근 처치</dt>
                                  <dd>{formatLocalTimestamp(timer?.lastKillAt ?? null)}</dd>
                                </div>
                                <div>
                                  <dt>다음 리스폰</dt>
                                  <dd>{formatLocalTimestamp(timer?.nextRespawnAt ?? null)}</dd>
                                </div>
                                <div>
                                  <dt>갱신자</dt>
                                  <dd>{timer?.updatedBy || "없음"}</dd>
                                </div>
                                <div>
                                  <dt>버전</dt>
                                  <dd>{timer?.version ?? 0}</dd>
                                </div>
                              </dl>

                              <p className={styles.noteLine}>{timer?.note || "메모 없음"}</p>

                              <button
                                className={styles.ghostButton}
                                type="button"
                                onClick={() => {
                                  setReportServerName(server.name);
                                  setReportBossId(boss.id);
                                  setReportedAtInput(toLocalInputValue());
                                }}
                              >
                                이 보스로 입력하기
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyCard}>
                <strong>표시할 서버가 없습니다.</strong>
                <span>서버를 등록하거나 보스 처치 입력을 먼저 추가해 주세요.</span>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
