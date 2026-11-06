import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/pool.js", () => ({
  pool: { query: queryMock },
}));

import {
  hashPassword,
  normalizeEmail,
  validEmail,
  validPassword,
} from "../../../apps/api/src/auth.js";
import authRoutes from "../../../apps/api/src/routes/auth.js";
import moderatorRoutes from "../../../apps/api/src/routes/moderator.js";

const user = {
  id: "52c9da92-8dc3-512f-b24b-ec1caa3c3248",
  name: "Example User",
  email: "user@example.com",
  role: "user",
};

function readCookie(response: { headers: Record<string, string | string[] | undefined> }, name: string) {
  const headers = response.headers["set-cookie"];
  const cookies = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  return cookie?.split(";")[0] ?? "";
}

describe("authentication and moderator access", () => {
  let sessionActive = false;
  let passwordHash = "";

  beforeEach(async () => {
    sessionActive = false;
    passwordHash = await hashPassword("correct horse battery staple");
    queryMock.mockReset().mockImplementation(async (query: string) => {
      if (query.startsWith('INSERT INTO "Users"')) {
        return { rows: [user], rowCount: 1 };
      }
      if (query.startsWith("INSERT INTO user_sessions")) {
        sessionActive = true;
        return { rows: [], rowCount: 1 };
      }
      if (query.includes("password_hash FROM \"Users\"")) {
        return {
          rows: [{ ...user, password_hash: passwordHash }],
          rowCount: 1,
        };
      }
      if (query.includes("FROM user_sessions s")) {
        return {
          rows: sessionActive ? [{ ...user, session_id: "session-id" }] : [],
          rowCount: sessionActive ? 1 : 0,
        };
      }
      if (query.startsWith("DELETE FROM user_sessions")) {
        sessionActive = false;
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected authentication query: ${query}`);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers, creates and resolves a session, logs in, and logs out", async () => {
    expect(normalizeEmail(" USER@Example.COM ")).toBe("user@example.com");
    expect(validEmail("user@example.com")).toBe(true);
    expect(validPassword("correct horse battery staple")).toBe(true);
    expect(validPassword("short")).toBe(false);

    const app = Fastify();
    await app.register(authRoutes, { prefix: "/auth" });
    try {
      const csrf = await app.inject({ method: "GET", url: "/auth/csrf" });
      const csrfCookie = readCookie(csrf, "nutrascore_csrf");
      const csrfToken = csrf.json().csrfToken as string;
      const csrfHeaders = {
        cookie: csrfCookie,
        "x-csrf-token": csrfToken,
      };

      const registered = await app.inject({
        method: "POST",
        url: "/auth/register",
        headers: csrfHeaders,
        payload: {
          name: user.name,
          email: " USER@Example.COM ",
          password: "correct horse battery staple",
        },
      });
      expect(registered.statusCode).toBe(201);
      expect(registered.json().user).toMatchObject({ email: user.email });
      const registrationSession = readCookie(registered, "nutrascore_session");
      expect(registrationSession).not.toBe("");

      const profile = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: registrationSession },
      });
      expect(profile.json().user).toMatchObject({ id: user.id, role: "user" });

      const logout = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: {
          cookie: `${csrfCookie}; ${registrationSession}`,
          "x-csrf-token": csrfToken,
        },
        payload: {},
      });
      expect(logout.statusCode).toBe(200);
      expect(sessionActive).toBe(false);

      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: csrfHeaders,
        payload: {
          email: "user@example.com",
          password: "correct horse battery staple",
        },
      });
      expect(login.statusCode).toBe(200);
      expect(readCookie(login, "nutrascore_session")).not.toBe("");
      expect(sessionActive).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("denies moderator catalogue access to a signed-in non-moderator", async () => {
    sessionActive = true;
    const app = Fastify();
    await app.register(moderatorRoutes, { prefix: "/moderator" });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/moderator/products",
        headers: { cookie: "nutrascore_session=valid-session" },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: "MODERATOR_REQUIRED" });
      expect(queryMock).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
