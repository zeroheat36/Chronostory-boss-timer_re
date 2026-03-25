import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialDashboardState,
  getServerStatus,
  recordBossKill,
  touchServer,
  type DashboardState
} from "./chronostory";

test("adds a server when touched for the first time", () => {
  const state = createInitialDashboardState();

  const next = touchServer(state, "Chrono 1", "2026-03-25T00:00:00.000Z");

  assert.equal(next.servers.length, 1);
  assert.equal(next.servers[0].name, "Chrono 1");
  assert.equal(next.servers[0].lastSeenAt, "2026-03-25T00:00:00.000Z");
});

test("accepts a new boss report and calculates the next respawn time", () => {
  const state = createInitialDashboardState();

  const next = recordBossKill(state, {
    serverName: "Chrono 1",
    bossId: "pianus",
    reportedAt: "2026-03-25T01:00:00.000Z",
    reporter: "Operator"
  });

  assert.equal(next.events[0].decision, "accepted");
  assert.equal(next.servers[0].bosses.pianus.lastKillAt, "2026-03-25T01:00:00.000Z");
  assert.equal(next.servers[0].bosses.pianus.nextRespawnAt, "2026-03-25T04:00:00.000Z");
  assert.equal(next.servers[0].bosses.pianus.version, 1);
});

test("treats nearby duplicate reports as log-only events", () => {
  const seeded = withInitialBossReport();

  const next = recordBossKill(seeded, {
    serverName: "Chrono 1",
    bossId: "pianus",
    reportedAt: "2026-03-25T01:00:45.000Z",
    reporter: "Second user"
  });

  assert.equal(next.events[0].decision, "duplicate");
  assert.equal(next.servers[0].bosses.pianus.version, 1);
  assert.equal(next.servers[0].bosses.pianus.lastKillAt, "2026-03-25T01:00:00.000Z");
});

test("ignores an older report for the current timer state", () => {
  const seeded = withInitialBossReport();

  const next = recordBossKill(seeded, {
    serverName: "Chrono 1",
    bossId: "pianus",
    reportedAt: "2026-03-25T00:30:00.000Z",
    reporter: "Late report"
  });

  assert.equal(next.events[0].decision, "ignored_old");
  assert.equal(next.servers[0].bosses.pianus.version, 1);
  assert.equal(next.servers[0].bosses.pianus.lastKillAt, "2026-03-25T01:00:00.000Z");
});

test("classifies server activity windows using the configured thresholds", () => {
  const state = touchServer(
    createInitialDashboardState(),
    "Chrono 1",
    "2026-03-25T00:00:00.000Z"
  );
  const server = state.servers[0];

  assert.equal(
    getServerStatus(server, state.serviceSettings, Date.parse("2026-03-25T01:00:00.000Z")),
    "active"
  );
  assert.equal(
    getServerStatus(server, state.serviceSettings, Date.parse("2026-03-25T04:00:00.000Z")),
    "stale"
  );
  assert.equal(
    getServerStatus(server, state.serviceSettings, Date.parse("2026-03-26T02:00:00.000Z")),
    "archived"
  );
});

function withInitialBossReport(): DashboardState {
  return recordBossKill(createInitialDashboardState(), {
    serverName: "Chrono 1",
    bossId: "pianus",
    reportedAt: "2026-03-25T01:00:00.000Z",
    reporter: "Operator"
  });
}
