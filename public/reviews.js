const reviewEl = (tag, text) => {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  return e;
};
async function loadPublicReviews() {
  const r = await fetch("/api/reviews"),
    data = await r.json();
  if (!r.ok) throw Error(data.error);
  const root = document.querySelector("#published-reviews");
  root.replaceChildren();
  if (!data.reviews.length)
    root.append(reviewEl("p", "No published reviews yet."));
  for (const review of data.reviews) {
    const card = reviewEl("article");
    card.className = "mini-card";
    card.append(
      reviewEl("h3", review.display_name),
      reviewEl(
        "p",
        `${review.rating}/5 · ${review.verified_job ? "Completed job verified" : "Customer-submitted"} · ${new Date(review.created_at).toLocaleDateString()}`,
      ),
      reviewEl("p", review.feedback),
    );
    root.append(card);
  }
  const google = document.querySelector("#google-review-link");
  google.hidden = !data.links.google;
  if (data.links.google) google.href = data.links.google;
}
let reviewKey = crypto.randomUUID();
document
  .querySelector("#review-form")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.querySelector("#review-status"),
      button = e.submitter;
    button.disabled = true;
    try {
      const f = new FormData(e.target),
        body = {
          displayName: f.get("displayName"),
          rating: Number(f.get("rating")),
          feedback: f.get("feedback"),
          consent: f.has("consent"),
          website: f.get("website"),
        };
      const r = await fetch("/api/reviews", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": reviewKey,
          },
          body: JSON.stringify(body),
        }),
        data = await r.json();
      if (!r.ok) throw Error(data.error);
      status.textContent =
        "Review received and awaiting content moderation. All ratings are welcome.";
      reviewKey = crypto.randomUUID();
      e.target.reset();
    } catch (e) {
      status.textContent = e.message;
    } finally {
      button.disabled = false;
    }
  });
if (document.querySelector("#published-reviews"))
  loadPublicReviews().catch((e) => {
    document.querySelector("#review-status").textContent = e.message;
  });
async function renderOwnerReviews() {
  const root = document.querySelector("#review-management");
  root.replaceChildren();
  const links = await api("review-links");
  document.querySelector("#google-review-url").value = links.google ?? "";
  document.querySelector("#invoice-review-links").textContent =
    `Future invoice links: ${links.website}${links.google ? " · " + links.google : " · Google link awaiting confirmation"}`;
  for (const review of await api("reviews")) {
    const card = el("article", null, "request");
    card.append(
      el("h3", review.display_name + " · " + review.rating + "/5"),
      el("p", review.feedback),
      el(
        "p",
        "Status: " +
          review.status +
          (review.moderation_reason ? " · " + review.moderation_reason : ""),
      ),
    );
    const reason = el("select");
    reason.setAttribute("aria-label", "Content policy reason");
    for (const value of [
      "spam",
      "inappropriate_content",
      "personal_information",
      "unrelated_content",
      "duplicate",
    ]) {
      const option = el("option", value.replaceAll("_", " "));
      option.value = value;
      reason.append(option);
    }
    const moderate = async (status) => {
      await api("reviews", "PUT", {
        id: review.id,
        version: review.version,
        status,
        reason: reason.value,
      });
      await renderOwnerReviews();
    };
    card.append(
      button("Approve for display", () => moderate("approved")),
      button("Return to pending", () => moderate("pending")),
      reason,
      button("Reject for content policy", () => moderate("rejected")),
    );
    root.append(card);
  }
}
document.querySelector("#review-link-form")?.addEventListener(
  "submit",
  safeForReviews(async (e) => {
    e.preventDefault();
    await api("settings", "PUT", {
      ...dashboard.settings,
      googleReviewUrl:
        document.querySelector("#google-review-url").value || null,
    });
    await refresh();
  }),
);
function safeForReviews(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      document.querySelector("#status").textContent = e.message;
    }
  };
}
