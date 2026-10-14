// Sends the inquiry form without leaving the page. Netlify Forms accepts a urlencoded
// POST (with the hidden form-name field) to any static page, so this posts to the
// form's own action. Without JavaScript the form still posts there and the browser
// lands on contact/thanks/.
const form = document.querySelector('form[name="inquiry"]');
const done = document.getElementById("form-done");

if (form && done) {
  const status = form.querySelector(".form__status");
  const button = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    status.dataset.state = "";
    status.textContent = "Sending…";

    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(form)).toString(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.hidden = true;
      done.hidden = false;
      done.querySelector("h2").focus();
    } catch {
      status.dataset.state = "error";
      status.textContent = "That didn’t send. Please try again in a moment.";
      button.disabled = false;
    }
  });
}
