// Mobile sticky download bar on /gig/ (dual-b). Shows once the hero badges have
// scrolled off the top, hides again while the closing band is on screen — so
// there is always exactly one set of badges in view. Progressive enhancement:
// the bar is invisible until this runs, and nothing here may throw.
try {
  const bar = document.querySelector("[data-sticky]");
  const hero = document.querySelector('[data-pos="hero"]');
  const closing = document.querySelector('[data-section="closing"]');

  if (bar && hero && "IntersectionObserver" in window) {
    let heroGone = false; // hero badges are above the viewport
    let closingIn = false;

    const update = () => {
      const on = heroGone && !closingIn;
      bar.classList.toggle("sticky-cta--on", on);
      document.body.classList.toggle("has-sticky", on);
    };

    new IntersectionObserver(([en]) => {
      heroGone = !en.isIntersecting && en.boundingClientRect.top < 0;
      update();
    }).observe(hero);

    if (closing) {
      new IntersectionObserver(([en]) => {
        closingIn = en.isIntersecting;
        update();
      }).observe(closing);
    }
  }
} catch (_) {
  // The bar just stays hidden.
}
