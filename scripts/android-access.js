// Android early-access request. Collects an email and POSTs it to the Gig backend
// endpoint (phone/contact_method sent as defaults to keep the API contract). On success
// it shows a checkmark, then the modal dismisses itself. Also records the full Android
// funnel via window.gigTrack: android_open (modal opened) → android_submit_attempt
// (button pressed, pre-validation) → android_submit (the TRUE conversion — an invite was
// actually requested), plus android_error (labeled invalid_email / server_<status> /
// network) and android_abandon (labeled typed/empty) so drop-off has a visible cause.
const BACKEND = "https://backend-production-9a98f.up.railway.app";

const overlay = document.getElementById("afOverlay");

if (overlay) {
  const openEls = document.querySelectorAll("#androidBtn, .js-android-open");
  const closeBtn = document.getElementById("afClose");
  const form = document.getElementById("afForm");
  const success = document.getElementById("afSuccess");
  const submit = document.getElementById("afSubmit");
  const msg = document.getElementById("afMsg");
  const emailEl = document.getElementById("af-email");
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let dismissTimer = null;
  let lastFocused = null;

  // Everything behind the dialog — made inert while it's open so keyboard and
  // screen-reader focus stay trapped inside the modal.
  const pageRegions = document.querySelectorAll(
    "body > header, body > main, body > footer",
  );

  const reset = () => {
    form.hidden = false;
    success.hidden = true;
    submit.style.display = "";
    submit.disabled = false;
    submit.textContent = "Send my invite";
    msg.textContent = "";
    msg.className = "af-msg";
    emailEl.value = "";
  };

  const open = () => {
    lastFocused = document.activeElement;
    pageRegions.forEach((el) => el.setAttribute("inert", ""));
    document.body.style.overflow = "hidden"; // lock the page behind the modal
    overlay.classList.add("open");
    setTimeout(() => emailEl.focus(), 50);
    // The Android funnel's first real step: the visitor opened the invite form.
    if (window.gigTrack) window.gigTrack("android_open");
  };

  const close = () => {
    // Abandon = closed while the form was still showing (the post-success
    // auto-dismiss hides the form first, so it never counts). "typed" vs
    // "empty" separates form friction from curiosity clicks.
    if (!form.hidden && overlay.classList.contains("open") && window.gigTrack) {
      window.gigTrack("android_abandon", emailEl.value.trim() ? "typed" : "empty");
    }
    clearTimeout(dismissTimer);
    overlay.classList.remove("open");
    pageRegions.forEach((el) => el.removeAttribute("inert"));
    document.body.style.overflow = "";
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus(); // return focus to whatever opened the modal
    }
    setTimeout(reset, 220); // after the fade-out transition
  };

  openEls.forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      open();
    }),
  );
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) close();
  });

  submit.addEventListener("click", async () => {
    if (window.gigTrack) window.gigTrack("android_submit_attempt");
    const email = emailEl.value.trim();

    if (!emailRe.test(email)) {
      if (window.gigTrack) window.gigTrack("android_error", "invalid_email");
      msg.className = "af-msg af-msg--err";
      msg.textContent = "Enter a valid email.";
      return;
    }

    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = "Sending…";
    msg.className = "af-msg";
    msg.textContent = "";

    try {
      const res = await fetch(`${BACKEND}/android-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone: "", contact_method: "email" }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        form.hidden = true;
        success.hidden = false; // triggers the checkmark draw-in
        // The TRUE Android conversion — an invite was actually requested.
        if (window.gigTrack) window.gigTrack("android_submit");
        dismissTimer = setTimeout(close, 2600); // bow out on its own
      } else {
        if (window.gigTrack) window.gigTrack("android_error", `server_${res.status}`);
        msg.className = "af-msg af-msg--err";
        msg.textContent = data.error || "Something went wrong. Try again.";
        submit.disabled = false;
        submit.textContent = original;
      }
    } catch {
      if (window.gigTrack) window.gigTrack("android_error", "network");
      msg.className = "af-msg af-msg--err";
      msg.textContent = "Network error. Please try again.";
      submit.disabled = false;
      submit.textContent = original;
    }
  });
}
