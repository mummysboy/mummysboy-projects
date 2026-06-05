import { projects } from "../data/projects.js";

/** Escape text before it goes into innerHTML. */
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

const STATUS_LABELS = {
  live: "Live",
  building: "Building",
  concept: "Concept",
};

/** Two-digit ordinal: 1 → "01". */
function ordinal(n) {
  return String(n).padStart(2, "0");
}

function cardHTML(project, i) {
  const { slug, name, blurb, status, tags, href } = project;
  const isExternal = Boolean(href);
  const destination = isExternal ? href : `/${slug}/`;
  const attrs = isExternal ? ` target="_blank" rel="noopener noreferrer"` : "";

  const tagsHTML = tags
    .map((tag) => `<li class="tag">${esc(tag)}</li>`)
    .join("");

  return `
    <li>
      <a class="card" href="${esc(destination)}"${attrs}>
        <div class="card__head">
          <span class="card__index">${ordinal(i + 1)}</span>
          <span class="card__arrow" aria-hidden="true">${isExternal ? "↗" : "→"}</span>
        </div>
        <h2 class="card__name">${esc(name)}</h2>
        <p class="card__blurb">${esc(blurb)}</p>
        <div class="card__meta">
          <span class="chip">
            <span class="chip__dot chip__dot--${esc(status)}" aria-hidden="true"></span>
            ${esc(STATUS_LABELS[status] ?? status)}
          </span>
          <ul class="tags">${tagsHTML}</ul>
        </div>
      </a>
    </li>`;
}

const grid = document.querySelector("#project-grid");
if (grid) {
  grid.innerHTML = projects.map(cardHTML).join("");
}

const count = document.querySelector("[data-count]");
if (count) {
  const n = projects.length;
  count.textContent = `${ordinal(n)} — ${n === 1 ? "project" : "projects"}`;
}
