import { NextResponse } from "next/server";
import {
  applyChronostoryWebhook,
  isChronostoryWebhookPayload
} from "@/lib/chronostory-webhook";

export async function POST(request: Request) {
  const expectedSecret = process.env.CHRONOSTORY_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Webhook secret is not configured." },
      { status: 503 }
    );
  }

  const providedSecret = getProvidedSecret(request);
  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json(
      { error: "Invalid webhook secret." },
      { status: 401 }
    );
  }

  try {
    const payload = (await request.json()) as unknown;
    if (!isChronostoryWebhookPayload(payload)) {
      return NextResponse.json(
        { error: "Invalid webhook payload." },
        { status: 400 }
      );
    }

    const response = await applyChronostoryWebhook(payload);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process webhook."
      },
      { status: 500 }
    );
  }
}

function getProvidedSecret(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  return request.headers.get("x-chronostory-secret");
}
