/**
 * IRL's Supabase client — the shared factory in `sb-client.js`, pointed at the
 * IRL project and persisting its session under its own key. Exports are what
 * irl-admin.js, irl-events.js and irl-signup.js have always imported.
 *
 * Security model — the publishable/anon key is *meant* to be public. It
 * grants nothing on its own; every table is protected by row-level security:
 *
 *   events   anon may read published rows (public columns only, via column
 *            grants); only an authenticated admin may write.
 *   signups  anon may INSERT and nothing else. There is deliberately no public
 *            SELECT policy — the questionnaire holds real personal data, so
 *            once a row is in, the public key cannot read it back. Public
 *            "spots left" numbers come from trigger-maintained counters on
 *            `events`, never from counting signups.
 *
 * So the worst a leaked key does is what any visitor can already do: read the
 * listings and submit a signup.
 */
import { SUPABASE_URL, SUPABASE_KEY } from "../data/irl-config.js";
import { createClient, DbError } from "./sb-client.js";

const { auth, db } = createClient({
  url: SUPABASE_URL,
  key: SUPABASE_KEY,
  storageKey: "irl.session",
});

export { DbError, auth, db };
