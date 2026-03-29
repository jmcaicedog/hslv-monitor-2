import { authApiHandler } from "@neondatabase/auth/next/server";
import { NextResponse } from "next/server";

let cachedHandlers = null;

function getAuthHandlers() {
	if (!cachedHandlers) {
		cachedHandlers = authApiHandler();
	}
	return cachedHandlers;
}

function missingAuthBaseUrlResponse() {
	return NextResponse.json(
		{
			error:
				"Falta NEON_AUTH_BASE_URL. Configura esta variable en Vercel (Project Settings > Environment Variables).",
		},
		{ status: 500 }
	);
}

async function runHandler(method, request, context) {
	if (!process.env.NEON_AUTH_BASE_URL) {
		return missingAuthBaseUrlResponse();
	}

	const handlers = getAuthHandlers();
	const handler = handlers[method];

	if (typeof handler !== "function") {
		return NextResponse.json({ error: "Metodo no soportado" }, { status: 405 });
	}

	return handler(request, context);
}

export async function GET(request, context) {
	return runHandler("GET", request, context);
}

export async function POST(request, context) {
	return runHandler("POST", request, context);
}

export async function PUT(request, context) {
	return runHandler("PUT", request, context);
}

export async function DELETE(request, context) {
	return runHandler("DELETE", request, context);
}

export async function PATCH(request, context) {
	return runHandler("PATCH", request, context);
}
