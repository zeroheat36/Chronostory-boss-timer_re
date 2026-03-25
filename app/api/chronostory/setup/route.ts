import { NextResponse } from "next/server";
import { getChronostorySetupStatus } from "@/lib/chronostory-env";

export async function GET() {
  return NextResponse.json(getChronostorySetupStatus());
}
