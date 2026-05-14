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
    const maxChannelsFromEnv = Number(process.env.CRON_MAX_CHANNELS_PER_RUN);
    const maxChannelsPerRun =
      Number.isFinite(maxChannelsFromEnv) && maxChannelsFromEnv > 0
        ? Math.floor(maxChannelsFromEnv)
        : 10;

    const softTimeoutFromEnv = Number(process.env.CRON_SOFT_TIMEOUT_MS);
    const timeBudgetMs =
      Number.isFinite(softTimeoutFromEnv) && softTimeoutFromEnv >= 5000
        ? Math.floor(softTimeoutFromEnv)
        : 25000;

    const requestTimeoutFromEnv = Number(process.env.UBIBOT_SYNC_REQUEST_TIMEOUT_MS);
    const requestTimeoutMs =
      Number.isFinite(requestTimeoutFromEnv) && requestTimeoutFromEnv >= 1000
        ? Math.floor(requestTimeoutFromEnv)
        : 7000;

    const cronRetryFlag = (process.env.CRON_ENABLE_RETRY || "false").trim().toLowerCase();
    const enableRetry = cronRetryFlag === "1" || cronRetryFlag === "true";

    const result = await runUbiBotSync({
      maxChannelsPerRun,
      timeBudgetMs,
      requestTimeoutMs,
      enableRetry,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
