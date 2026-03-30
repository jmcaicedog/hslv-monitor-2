import { NextResponse } from "next/server";
import { runUbiBotSync } from "@/lib/ubibot-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const authHeader = (request.headers.get("authorization") || "").trim();
  const headerSecret = (request.headers.get("x-cron-secret") || "").trim();

  if (headerSecret === secret) {
    return true;
  }

  if (!authHeader) {
    return false;
  }

  if (authHeader === secret) {
    return true;
  }

  if (/^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    return token === secret;
  }

  return false;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  try {
    const result = await runUbiBotSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
