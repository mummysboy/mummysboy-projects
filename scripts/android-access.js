// Android early-access request. Mirrors the Gig landing page: collects an
// email (+ optional phone and a delivery method) and POSTs the same payload
// to the same backend endpoint. On success it shows a checkmark, then the
// modal dismisses itself.
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
  const phoneEl = document.getElementById("af-phone");
  const methodBtns = document.querySelectorAll(".af-opt-btn");
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let method = "sms";
  let dismissTimer = null;

  methodBtns.forEach((opt) => {
    opt.addEventListener("click", () => {
      methodBtns.forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      method = opt.dataset.method;
    });
  });

  const reset = () => {
    form.hidden = false;
    success.hidden = true;
    submit.style.display = "";
    submit.disabled = false;
    submit.textContent = "Request an invite";
    msg.textContent = "";
    msg.className = "af-msg";
    emailEl.value = "";
    phoneEl.value = "";
    method = "sms";
    methodBtns.forEach((o) =>
      o.classList.toggle("selected", o.dataset.method === "sms"),
    );
  };

  const open = () => {
    overlay.classList.add("open");
    setTimeout(() => emailEl.focus(), 50);
  };

  const close = () => {
    clearTimeout(dismissTimer);
    overlay.classList.remove("open");
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
    const email = emailEl.value.trim();
    const phone = phoneEl.value.trim();

    if (!emailRe.test(email)) {
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
        body: JSON.stringify({ email, phone, contact_method: method }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        form.hidden = true;
        success.hidden = false; // triggers the checkmark draw-in
        dismissTimer = setTimeout(close, 2600); // bow out on its own
      } else {
        msg.className = "af-msg af-msg--err";
        msg.textContent = data.error || "Something went wrong. Try again.";
        submit.disabled = false;
        submit.textContent = original;
      }
    } catch {
      msg.className = "af-msg af-msg--err";
      msg.textContent = "Network error. Please try again.";
      submit.disabled = false;
      submit.textContent = original;
    }
  });
}
