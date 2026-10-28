const photoNode = (tag, text) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
};
async function loadWebsitePhotos() {
  const response = await fetch("/api/website-photos"),
    photos = await response.json();
  if (!response.ok) throw Error(photos.error);
  for (const photo of photos) {
    for (const root of document.querySelectorAll(
      '[data-photo-slot="' + photo.slot + '"]',
    )) {
      const image = photoNode("img");
      image.src =
        "/api/website-photo?id=" +
        encodeURIComponent(photo.id) +
        "&v=" +
        photo.updated_at;
      image.alt = photo.alt;
      image.loading = photo.slot === "hero" ? "eager" : "lazy";
      root.replaceChildren(image);
      if (photo.caption) root.append(photoNode("figcaption", photo.caption));
      root.classList.add("has-photo");
    }
  }
}
async function loadWebsitePhotoManager() {
  const root = document.querySelector("#website-photo-manager");
  if (!root) return;
  const data = await api("website-photos");
  root.replaceChildren();
  for (const slot of data.slots) {
    const photo = data.photos.find((p) => p.slot === slot.slot),
      card = el("article", null, "request");
    card.append(el("h3", slot.label + " · " + slot.ratio));
    if (photo) {
      const image = el("img");
      image.src = "/api/owner/website-photo?id=" + photo.id;
      image.alt = photo.alt;
      image.className = "website-photo-preview";
      card.append(image, el("p", photo.status + " · " + photo.caption));
      const consent = el("label", null, "check"),
        check = el("input");
      check.type = "checkbox";
      consent.append(
        check,
        document.createTextNode(
          "I confirm this business has the rights and any customer permission required for public website use.",
        ),
      );
      card.append(
        consent,
        button(
          photo.status === "published"
            ? "Unpublish photo"
            : "Publish approved photo",
          async () => {
            await api("website-publish", "PUT", {
              slot: slot.slot,
              publish: photo.status !== "published",
              confirmPermission: check.checked,
            });
            await loadWebsitePhotoManager();
          },
        ),
      );
    }
    const form = el("form"),
      file = el("input");
    file.type = "file";
    file.accept =
      "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
    file.required = true;
    file.setAttribute("aria-label", slot.label + " file");
    form.append(file);
    field(
      form,
      "Accessible description",
      "alt",
      "text",
      photo?.alt ?? "",
    ).required = true;
    field(form, "Caption", "caption", "text", photo?.caption ?? "");
    field(
      form,
      "Ownership / permission record",
      "rightsNote",
      "text",
      photo?.rights_note ?? "",
    ).required = true;
    form.append(el("button", "Save photo draft"));
    form.onsubmit = safe(async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      await api("website-photos", "POST", {
        slot: slot.slot,
        alt: values.alt,
        caption: values.caption,
        rightsNote: values.rightsNote,
        photos: await readPhotos(file.files),
      });
      await loadWebsitePhotoManager();
    });
    card.append(form);
    root.append(card);
  }
}
