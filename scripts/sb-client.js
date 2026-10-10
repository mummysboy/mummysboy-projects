/**
 * A minimal Supabase client, written here rather than added as a dependency —
 * the hub is a no-build static site (see CLAUDE.md → Stack) and supabase-js
 * would be the first thing on the page that needs a bundler.
 *
 * It covers exactly what the hub's signed-in pages need: PostgREST reads and
 * writes over `fetch`, and enough of GoTrue to sign someone in and keep the
 * session alive.
 *
 * `createClient()` is a factory rather than a module singleton because two
 * routes on this origin sign into the same project as different kinds of user
 * (the IRL admin, a family member on /mummy/). Each gets its own session under
 * its own localStorage key, so signing out of one never signs out the other.
 *
 * The publishable key passed in is *meant* to be public. It grants nothing on
 * its own; every table is protected by row-level security, so the worst a
 * leaked key does is what any visitor can already do.
 */

/** Thrown for anything the caller might want to show a human. */
export class DbError extends Error {
  constructor(message, { status = 0, code = "", details = "" } = {}) {
    super(message);
    this.name = "DbError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {Object} opts
 * @param {string} opts.url         Supabase project URL
 * @param {string} opts.key         the project's publishable (anon) key
 * @param {string} opts.storageKey  localStorage key the session persists under
 * @param {boolean} [opts.retryAnon=true]
 *   When a stored token is refused (401), drop it and retry once as anon. Right
 *   for a page with public reads (IRL's listings must not look broken because
 *   of a stale admin token). Wrong for a page where everything needs a signed-in
 *   user — there the 401 should surface as "sign in again", so pass false.
 */
export function createClient({ url, key, storageKey, retryAnon = true }) {
  const REST = `${url}/rest/v1`;
  const AUTH = `${url}/auth/v1`;

  // --- Session -------------------------------------------------------------
  // Kept in localStorage so people stay signed in between visits — the whole
  // point is opening this on a phone without logging in every time.

  let session = null;

  function loadSession() {
    try {
      const raw = localStorage.getItem(storageKey);
      session = raw ? JSON.parse(raw) : null;
    } catch {
      session = null;
    }
    return session;
  }

  function saveSession(next) {
    session = next;
    try {
      if (next) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
    } catch {
      /* private mode — the session just won't survive a reload */
    }
  }

  loadSession();

  /** Normalize a GoTrue token payload into what we persist. */
  function toSession(data) {
    if (!data || !data.access_token) return null;
    const expiresAt =
      data.expires_at != null
        ? Number(data.expires_at) * 1000
        : Date.now() + Number(data.expires_in || 3600) * 1000;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || "",
      expiresAt,
      user: data.user || session?.user || null,
    };
  }

  async function authFetch(path, { method = "POST", body, token } = {}) {
    const res = await fetch(`${AUTH}${path}`, {
      method,
      headers: {
        apikey: key,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new DbError(
        data.error_description || data.msg || data.message || "Sign-in failed.",
        { status: res.status, code: data.error_code || data.error || "" },
      );
    }
    return data;
  }

  /** Refresh the access token if it's expired or about to be. */
  async function freshToken() {
    if (!session) return null;
    if (Date.now() < session.expiresAt - 60_000) return session.accessToken;
    if (!session.refreshToken) {
      saveSession(null);
      return null;
    }
    try {
      const data = await authFetch("/token?grant_type=refresh_token", {
        body: { refresh_token: session.refreshToken },
      });
      saveSession(toSession(data));
      return session.accessToken;
    } catch {
      saveSession(null); // refresh token is dead — force a fresh sign-in
      return null;
    }
  }

  const auth = {
    /** Current session, or null. Does not hit the network. */
    current: () => session,

    /** Email + password sign-in (accounts are created in the Supabase dashboard). */
    async signIn(email, password) {
      const data = await authFetch("/token?grant_type=password", {
        body: { email, password },
      });
      saveSession(toSession(data));
      return session;
    },

    /**
     * Send a one-time sign-in link. The fallback for "I can't remember the
     * password." Supabase's built-in mailer is rate-limited, so this is a
     * backup path, not the main one.
     */
    async sendMagicLink(email, redirectTo) {
      await authFetch(`/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
        body: { email, create_user: false },
      });
    },

    /**
     * Consume the `#access_token=…` fragment a magic link lands on, then scrub
     * it from the URL so the token never sits in history or gets shared.
     */
    consumeUrlSession() {
      const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
      if (!hash.includes("access_token")) return null;

      const params = new URLSearchParams(hash);
      const next = toSession({
        access_token: params.get("access_token"),
        refresh_token: params.get("refresh_token"),
        expires_in: params.get("expires_in"),
      });
      if (next) saveSession(next);
      history.replaceState(null, "", location.pathname + location.search);
      return next;
    },

    /** Ask the server who this token belongs to — also validates it. */
    async me() {
      const token = await freshToken();
      if (!token) return null;
      try {
        const user = await authFetch("/user", { method: "GET", token });
        saveSession({ ...session, user });
        return user;
      } catch {
        saveSession(null);
        return null;
      }
    },

    async signOut() {
      const token = session?.accessToken;
      saveSession(null);
      if (token) {
        // Best-effort: the local session is already gone either way.
        await authFetch("/logout", { token }).catch(() => {});
      }
    },
  };

  // --- PostgREST -----------------------------------------------------------

  async function send(path, { method, body, prefer, signal }, token) {
    const headers = {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    };

    try {
      return await fetch(`${REST}${path}`, {
        method,
        headers,
        signal,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new DbError("Network error. Check your connection and try again.");
    }
  }

  async function rest(path, opts = {}) {
    const options = { method: "GET", ...opts };
    const token = await freshToken();
    let res = await send(path, options, token);

    // A stored session that the server rejects must not be allowed to break
    // anonymous reads. Public listings work with the anon key alone, so if a
    // token is refused — expired, revoked, or corrupt in localStorage — drop it
    // and retry once as an anonymous caller. Without this, one bad token in a
    // visitor's browser makes the whole page look broken to them forever.
    // (Pages with no anonymous reads opt out via `retryAnon: false`, so the
    // 401 reaches them and they can ask for a fresh sign-in.)
    if (res.status === 401 && token && retryAnon) {
      saveSession(null);
      res = await send(path, options, null);
    }

    if (res.status === 204) return null;

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const payload = data || {};
      throw new DbError(payload.message || `Request failed (${res.status}).`, {
        status: res.status,
        code: payload.code || "",
        details: payload.details || payload.hint || "",
      });
    }
    return data;
  }

  /** Build a PostgREST query string from a plain object. */
  function qs(params = {}) {
    const search = new URLSearchParams();
    for (const [k, value] of Object.entries(params)) {
      if (value == null) continue;
      search.append(k, String(value));
    }
    const s = search.toString();
    return s ? `?${s}` : "";
  }

  const db = {
    select: (table, params, opts) => rest(`/${table}${qs(params)}`, opts),

    insert: (table, rows, { returning = false } = {}) =>
      rest(`/${table}`, {
        method: "POST",
        body: rows,
        prefer: returning ? "return=representation" : "return=minimal",
      }),

    /** Insert, or overwrite the row that collides on the primary key. */
    upsert: (table, rows) =>
      rest(`/${table}`, {
        method: "POST",
        body: rows,
        prefer: "resolution=merge-duplicates,return=minimal",
      }),

    update: (table, params, patch, { returning = true } = {}) =>
      rest(`/${table}${qs(params)}`, {
        method: "PATCH",
        body: patch,
        prefer: returning ? "return=representation" : "return=minimal",
      }),

    remove: (table, params) =>
      rest(`/${table}${qs(params)}`, { method: "DELETE" }),

    /** Call a Postgres function. Scalar-returning functions come back as the
     *  bare JSON value, which is how submit_signup returns its status. */
    rpc: (fn, args) =>
      rest(`/rpc/${fn}`, { method: "POST", body: args || {} }),
  };

  return { auth, db };
}
