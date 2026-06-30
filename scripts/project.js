import { projects } from "../data/projects.js";

const STATUS_LABELS = {
  live: "Live",
  building: "Building",
  concept: "Concept",
};

/** A line of voice per status — beats a generic "coming soon". */
const STATUS_NOTES = {
  live: "Live and in the open. Go have a look.",
  building: "In the workshop right now — taking shape, rough edges and all.",
  concept: "Still a sketch. Notes and intent, not nails, at this stage.",
};

function esc(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

const slug = document.body.dataset.project;
const index = projects.findIndex((p) => p.slug === slug);
const project = projects[index];

function set(selector, fn) {
  const el = document.querySelector(selector);
  if (el) fn(el);
}

if (project) {
  // A project page may supply its own SEO <title>, benefit headline, and a longer hero
  // blurb (the hub index card keeps using the short `blurb`). Prefer those richer fields
  // when present so the static, conversion-tuned hero is reinforced — not overwritten —
  // once JS runs. Falls back to the original behaviour for every other project.
  document.title = project.titleTag ?? `${project.name} — mummysboy`;

  set("[data-path]", (el) => (el.textContent = `/ ${project.slug}`));
  set("[data-name]", (el) => (el.textContent = project.headline ?? project.name));
  set("[data-blurb]", (el) => (el.textContent = project.heroBlurb ?? project.blurb));
  set("[data-note]", (el) => (el.textContent = STATUS_NOTES[project.status] ?? ""));

  set("[data-chip]", (el) => {
    el.innerHTML = `
      <span class="chip__dot chip__dot--${project.status}" aria-hidden="true"></span>
      ${STATUS_LABELS[project.status] ?? project.status}`;
  });

  set("[data-tags]", (el) => {
    el.innerHTML = project.tags
      .map((tag) => `<li class="tag">${esc(tag)}</li>`)
      .join("");
  });

  // Cycle to the next project in the registry, wrapping at the end.
  set("[data-next]", (el) => {
    const next = projects[(index + 1) % projects.length];
    const destination = next.href ?? `/${next.slug}/`;
    el.href = destination;
    if (next.href) {
      el.target = "_blank";
      el.rel = "noopener noreferrer";
    }
    el.innerHTML = `
      <span class="next__label">Next</span>
      ${esc(next.name)}
      <span class="next__arrow" aria-hidden="true">→</span>`;
  });
}
