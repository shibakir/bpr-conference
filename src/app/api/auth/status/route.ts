import { NextResponse } from "next/server";

import { getBroadcastPassword } from "@/lib/server-env";

export async function GET() {
  const passwordRequired = !!getBroadcastPassword();
  return NextResponse.json({ passwordRequired });
}
