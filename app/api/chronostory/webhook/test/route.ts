import { NextResponse } from "next/server";
import { applyChronostoryWebhook } from "@/lib/chronostory-webhook";

export async function POST() {
  try {
    const response = await applyChronostoryWebhook({
      type: "boss-kill",
      serverName: "웹훅 테스트",
      bossId: "pianus",
      reportedAt: new Date().toISOString(),
      reporter: "webhook-test",
      note: "local webhook simulation"
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to run webhook test."
      },
      { status: 500 }
    );
  }
}
