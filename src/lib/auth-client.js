"use client";

import "./crypto-randomuuid-polyfill";
import { createAuthClient } from "@neondatabase/auth/next";

export const authClient = createAuthClient();