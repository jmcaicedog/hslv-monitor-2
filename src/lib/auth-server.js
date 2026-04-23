import { createAuthServer, neonAuth } from "@neondatabase/auth/next/server";

let cachedAuthServer = null;

export function getAuthServer() {
  if (!cachedAuthServer) {
    cachedAuthServer = createAuthServer();
  }

  return cachedAuthServer;
}

export async function getCurrentUser() {
  const { user } = await neonAuth();
  return user;
}

export function isAdminUser(user) {
  return user?.role === "admin";
}
