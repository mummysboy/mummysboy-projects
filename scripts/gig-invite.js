// /gig/invite/: turns the plain "You're invited" card into "{name} is inviting you to Gig".
// Three sources, all optional:
//   0. The macro link /gig/invite={name} — the name is the path itself (see netlify.toml).
//   1. An invite code in the path (/gig/invite/ABCD12) or ?code=. It is shown on the card
//      for sign-up, and resolved: the public team resolver (GET /api/teams/resolve/:code —
//      first name + team name for an active team member's code), then the public referral
//      resolver (GET /api/referral/resolve/:code — first name for any code). Both answer
//      nulls for an unknown code, so nothing can be enumerated.
//   2. ?from=Name — the sharer's own first name, for links that carry no code.
// Everything here is progressive: without JS, or on any failure, the card reads as the
// generic invitation. Names are written with textContent only — never as HTML.
const BACKEND = "https://backend-production-9a98f.up.railway.app";


// People the site has a photo for, by lower-cased first name (gig/invite/people/). A name
// without one, and the plain card, show the Gig logo — never an empty avatar.
const PHOTOS = {
  nicolette: "/gig/invite/people/nicolette-1.png",
};

try {
  const q = new URLSearchParams(location.search);

  // Code: the path segment after /gig/invite/ (not an id= campaign tag), else ?code=.
  let code = null;
  const m = location.pathname.match(/\/gig\/invite\/([A-Za-z0-9]{3,12})\/?$/i);
  if (m) code = m[1];
  if (!code && q.get("code")) code = q.get("code");
  code = code ? code.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12) : null;

  // Name from the link: letters (any script), apostrophes and hyphens, first word, 24 chars.
  const cleanName = (raw) => {
    if (!raw) return null;
    const first = String(raw).trim().split(/\s+/)[0] || "";
    const safe = first.replace(/[^\p{L}\p{M}'’-]/gu, "").slice(0, 24);
    return safe.length >= 2 ? safe : null;
  };
  // The macro form: /gig/invite=Alex (a netlify.toml rewrite serves the page; the name is
  // the path, percent-decoded). ?from=Alex still works, and a code can ride along as ?code=.
  let name = null;
  const nm = location.pathname.match(/\/gig\/invite=([^/]+)(?:\/([A-Za-z0-9]{3,12}))?\/?$/i);
  if (nm) {
    if (nm[2] && !code) code = nm[2].toUpperCase();
    try {
      name = cleanName(decodeURIComponent(nm[1].replace(/\+/g, " ")));
    } catch {
      name = cleanName(nm[1]);
    }
  }
  if (!name) name = cleanName(q.get("from"));
  let team = null;

  const el = (sel) => document.querySelector(sel);
  const logo = () => {
    const img = document.createElement("img");
    img.className = "inv-avatar__icon";
    img.src = "/gig/shots/app-icon-black-rounded.png";
    img.alt = "";
    img.width = 64;
    img.height = 64;
    return img;
  };
  // Display form: first letter up, the rest as typed ("nicolette" → "Nicolette").
  const display = (n) => [...n][0].toLocaleUpperCase() + [...n].slice(1).join("");

  const render = () => {
    const avatar = el("[data-inv-avatar]");
    const title = el("[data-inv-title]");
    const eyebrow = el("[data-inv-eyebrow]");
    const line = el("[data-inv-line]");
    if (name) {
      // The inviter's face where the site ships one, and the Gig logo otherwise.
      const src = PHOTOS[name.toLocaleLowerCase()];
      if (src) {
        avatar.textContent = "";
        const img = document.createElement("img");
        img.className = "inv-avatar__photo";
        img.src = src;
        img.alt = "";
        img.width = 64;
        img.height = 64;
        img.decoding = "async";
        // A photo that fails to load falls back to the logo rather than a broken image.
        img.addEventListener("error", () => {
          avatar.textContent = "";
          avatar.appendChild(logo());
        });
        avatar.appendChild(img);
      }

      eyebrow.textContent = "You’re invited";
      const who = display(name);
      title.textContent = team ? `${who} is inviting you to ${team} on Gig.` : `${who} is inviting you to Gig.`;
      document.title = `${who} is inviting you to Gig`;
      if (team) {
        line.textContent =
          "Get the app, then enter the code under Profile → Team to join. Gig itself is free, and takes nothing from what you earn.";
      }
    }
    if (code) {
      const box = el("[data-inv-code]");
      el("[data-inv-code-value]").textContent = code;
      if (team) {
        el("[data-inv-code-label]").textContent = `Invite code for ${team}`;
        el("[data-inv-code-hint]").textContent = "Enter it in the app under Profile → Team.";
      }
      box.hidden = false;
    }
  };

  // Copy button: clipboard where allowed, with a quiet confirmation in the button itself.
  const copy = el("[data-inv-copy]");
  if (copy) {
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code || "");
        copy.textContent = "Copied";
        copy.classList.add("inv-code__copy--done");
        setTimeout(() => {
          copy.textContent = "Copy";
          copy.classList.remove("inv-code__copy--done");
        }, 1800);
      } catch {
        /* no clipboard access: the code is on screen to type */
      }
    });
  }

  render();

  if (code) {
    const get = (path) =>
      fetch(`${BACKEND}${path}`, { mode: "cors" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    // Teams first: a team member's code also names the team. Then the plain referral
    // resolver (GET /api/referral/resolve/:code — first name + avatar seed only, by design:
    // it never returns a photo, so the card's photos come from the site itself).
    get(`/api/teams/resolve/${encodeURIComponent(code)}`).then((d) => {
      if (d && d.firstName) {
        name = cleanName(d.firstName) || name;
        team = typeof d.teamName === "string" && d.teamName.trim() ? d.teamName.trim().slice(0, 40) : null;
        render();
      }
      return get(`/api/referral/resolve/${encodeURIComponent(code)}`);
    }).then((d) => {
      if (!d || !d.firstName) return;
      name = cleanName(d.firstName) || name;
      render();
    });
  }
} catch (_) {
  // The generic invitation stands.
}
