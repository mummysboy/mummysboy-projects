/**
 * IRL's connection to its Supabase backend, plus the few brand constants the
 * scripts need. This is the only place either value is written down.
 *
 * SUPABASE_KEY is the project's public key and is *supposed* to ship to the
 * browser — it identifies the project, it doesn't authorize anything. Every
 * table is guarded by row-level security (see scripts/irl-db.js for the model).
 * The service-role key must never appear in this repo.
 */
export const SUPABASE_URL = "https://ykqeshyloyemchswsusn.supabase.co";
export const SUPABASE_KEY = "sb_publishable_f5d1HUm0Llv56gALG-zpug_YOIHIo-s";

/** Where the "reply to" address on confirmations points, and the page's contact link. */
export const CONTACT_EMAIL = "support@rightimagedigital.com";

/** Options offered in the participant questionnaire. Values are stored verbatim,
 *  so changing a label changes what lands in the database — add rather than
 *  rename once real applications exist. */
export const GENDERS = ["Woman", "Man", "Non-binary", "Prefer to self-describe"];

export const SEEKING = ["Women", "Men", "Non-binary people", "Everyone"];

export const INTENTIONS = [
  "Something serious",
  "Dating, see where it goes",
  "Something casual",
  "Just here to meet people",
];
