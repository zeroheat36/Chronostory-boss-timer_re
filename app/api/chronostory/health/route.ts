import { NextResponse } from "next/server";
import { getChronostorySetupStatus } from "@/lib/chronostory-env";
import { getStorageBackend, readDashboardState } from "@/lib/chronostory-storage";

export async function GET() {
  try {
    const state = await readDashboardState();
    const setup = getChronostorySetupStatus();

    return NextResponse.json({
      ok: true,
      backend: getStorageBackend(),
      setup,
      serverCount: state.servers.length,
      eventCount: state.events.length,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        backend: getStorageBackend(),
        setup: getChronostorySetupStatus(),
        error: error instanceof Error ? error.message : "Health check failed."
      },
      { status: 500 }
    );
  }
}
