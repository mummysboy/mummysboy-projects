// Hero video on /gig/vid/. The <video> autoplays on its own (muted + playsinline); this
// only makes it polite: no motion under Reduce Motion or Save-Data (the poster stays), and
// it pauses while scrolled off-screen so a 17 s loop isn't decoding under the FAQ.
// Progressive enhancement — nothing here may throw, and without it the loop just plays.
try {
  const video = document.querySelector("[data-hero-video]");
  if (video) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = !!(navigator.connection && navigator.connection.saveData);

    if (reduceMotion || saveData) {
      video.removeAttribute("autoplay");
      video.pause();
      video.classList.add("pitch-vid__video--still");
      video.removeAttribute("src"); // keep the poster, skip the 1.5–1.8 MB download
    } else {
      const play = () => video.play().catch(() => {});
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(
          ([en]) => (en.isIntersecting ? play() : video.pause()),
          { threshold: 0.1 }
        ).observe(video);
      } else {
        play();
      }
      // Autoplay that was refused before the user touched the page (some in-app browsers)
      // is allowed after the first interaction.
      const retry = () => {
        if (video.paused) play();
        window.removeEventListener("touchstart", retry);
        window.removeEventListener("click", retry);
      };
      window.addEventListener("touchstart", retry, { passive: true, once: true });
      window.addEventListener("click", retry, { once: true });
    }
  }
} catch (_) {
  // The loop plays or shows its poster on its own.
}
