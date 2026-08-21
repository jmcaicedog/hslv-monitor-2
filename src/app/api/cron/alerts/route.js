import { NextResponse } from "next/server";
import { runThresholdAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function missingConfig() {
  return NextResponse.json(
    { error: "CRON_SECRET no configurada en el entorno del servidor" },
    { status: 500 }
  );
}

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return null;
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
  const authorization = isAuthorized(request);

  if (authorization === null) {
    return missingConfig();
  }

  if (!authorization) {
    return unauthorized();
  }

  try {
    const result = await runThresholdAlerts();

    if (result.ok) {
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ ok: false, ...result }, { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Alert check failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
