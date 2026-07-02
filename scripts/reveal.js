// Scroll-reveal, progressive-enhancement style: [data-reveal] elements fade up
// 10px over 200ms the first time they enter the viewport (CSS in
// gig-additions.css, gated on .reveal-ready). The gate class is only added
// here — so with no JS, a failed load, or prefers-reduced-motion, nothing is
// ever hidden. The hero is deliberately never revealed-in: an ad-click visitor
// gets the pitch and the CTA painted instantly.
const els = document.querySelectorAll("[data-reveal]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (els.length && "IntersectionObserver" in window && !reduceMotion) {
  document.documentElement.classList.add("reveal-ready");
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        en.target.classList.add("reveal-in");
        io.unobserve(en.target); // reveal once; no re-animating on scroll-back
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  els.forEach((el) => io.observe(el));
}
