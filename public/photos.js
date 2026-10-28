async function readPhotos(files) {
  if (files.length > 6) throw Error("Upload at most 6 photographs.");
  let total = 0;
  const result = [];
  for (const file of files) {
    total += file.size;
    if (file.size > 4 * 1024 * 1024 || total > 16 * 1024 * 1024)
      throw Error(
        "Each photo must be under 4 MB; combined photos under 16 MB.",
      );
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(Error("Could not read photograph"));
      reader.readAsDataURL(file);
    });
    result.push({ name: file.name, base64 });
  }
  return result;
}
async function photoPanel(booking, root) {
  const panel = el("details"),
    summary = el("summary", "Private photos & invoice selections");
  panel.append(summary);
  const list = el("div", null, "photo-grid");
  panel.append(list);
  const load = async () => {
    list.replaceChildren();
    for (const photo of await api("photos?booking=" + booking.id)) {
      const card = el("figure"),
        img = el("img");
      img.src = "/api/owner/photo?id=" + photo.id;
      img.alt = photo.kind + " photograph";
      img.loading = "lazy";
      card.append(img, el("figcaption", `${photo.kind} · ${photo.filename}`));
      const original = el("a", "Download original");
      original.href = "/api/owner/photo?id=" + photo.id + "&original=1";
      card.append(original);
      const label = el("label", null, "check"),
        check = el("input");
      check.type = "checkbox";
      check.checked = !!photo.include_on_invoice;
      check.onchange = safe(async () => {
        await api("invoice-photo", "PUT", {
          id: photo.id,
          include: check.checked,
        });
      });
      label.append(check, document.createTextNode("Include on future invoice"));
      card.append(label);
      list.append(card);
    }
  };
  let loaded = false;
  panel.ontoggle = safe(async () => {
    if (panel.open && !loaded) {
      await load();
      loaded = true;
    }
  });
  const form = el("form");
  const kind = el("select");
  kind.setAttribute("aria-label", "Photo type");
  for (const k of ["intake", "before", "after"]) {
    const option = el("option", k);
    option.value = k;
    kind.append(option);
  }
  const file = el("input");
  file.type = "file";
  file.multiple = true;
  file.accept =
    "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
  file.setAttribute("aria-label", "Job photographs");
  form.append(kind, file, el("button", "Upload private photos"));
  form.onsubmit = safe(async (e) => {
    e.preventDefault();
    if (!file.files.length) throw Error("Choose photographs first");
    await api("photos", "POST", {
      bookingId: booking.id,
      kind: kind.value,
      photos: await readPhotos(file.files),
    });
    file.value = "";
    await load();
    loaded = true;
  });
  panel.append(
    form,
    el(
      "small",
      "JPEG, PNG, WebP or HEIC/HEIF. Maximum 6 files per upload, 4 MB each. Private photos are never published to the website.",
    ),
  );
  root.append(panel);
}
