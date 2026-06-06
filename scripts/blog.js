// Renders the blog index grid from the posts registry, and — on an article
// page — fills the registry-driven "more reading" list. Article prose itself
// is static HTML; this only handles the listings around it.
import { posts } from "../data/posts.js";

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

function cardHTML(post) {
  const { slug, title, excerpt, date, dateLabel, readMins, tags, image, alt } =
    post;

  const tagsHTML = tags
    .map((tag) => `<li class="tag">${esc(tag)}</li>`)
    .join("");

  return `
    <li class="post-card">
      <a class="post-card__link" href="/gig/blog/${esc(slug)}/">
        <span class="post-card__media">
          <img src="${esc(image)}" alt="${esc(alt)}" loading="lazy" width="1200" height="675" />
        </span>
        <span class="post-card__body">
          <span class="post-card__meta">
            <time datetime="${esc(date)}">${esc(dateLabel)}</time>
            <span aria-hidden="true">·</span>
            <span>${esc(readMins)} read</span>
          </span>
          <span class="post-card__title">${esc(title)}</span>
          <span class="post-card__excerpt">${esc(excerpt)}</span>
          <ul class="tags">${tagsHTML}</ul>
        </span>
      </a>
    </li>`;
}

// --- Blog index -------------------------------------------------------------
const grid = document.querySelector("#post-grid");
if (grid) {
  grid.innerHTML = posts.map(cardHTML).join("");
}

const count = document.querySelector("[data-post-count]");
if (count) {
  const n = posts.length;
  count.textContent = `${String(n).padStart(2, "0")} — ${
    n === 1 ? "post" : "posts"
  }`;
}

// --- "More reading" on an article page --------------------------------------
const related = document.querySelector("[data-related]");
if (related) {
  const current = document.body.dataset.post;
  const others = posts.filter((p) => p.slug !== current).slice(0, 2);

  if (others.length) {
    related.innerHTML = others
      .map(
        (p) => `
        <li>
          <a class="more__link" href="/gig/blog/${esc(p.slug)}/">
            <span class="more__kicker">${esc(p.dateLabel)} · ${esc(p.readMins)} read</span>
            <span class="more__title">${esc(p.title)}</span>
            <span class="more__arrow" aria-hidden="true">→</span>
          </a>
        </li>`,
      )
      .join("");
  } else {
    // Nothing else published yet — hide the section rather than show an empty one.
    const section = related.closest("[data-related-section]");
    if (section) section.hidden = true;
  }
}
