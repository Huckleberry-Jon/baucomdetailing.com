// Static SVG artwork only; configured URLs and labels are rendered through DOM properties.
window.BaucomSocial = (() => {
  const platforms = {
    instagram: {
      label: "Instagram",
      hosts: ["instagram.com", "www.instagram.com"],
      paths: [
        "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z",
        "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
        "M17.5 6.5h.01",
      ],
    },
    facebook: {
      label: "Facebook",
      hosts: ["facebook.com", "www.facebook.com"],
      paths: [
        "M14 22V13h3l.5-4H14V6.5c0-1 .3-1.5 1.6-1.5H18V1.4A29 29 0 0 0 14.7 1C11.4 1 9 3 9 6.6V9H6v4h3v9Z",
      ],
    },
    tiktok: {
      label: "TikTok",
      hosts: ["tiktok.com", "www.tiktok.com"],
      paths: [
        "M14 2h3c.3 2.4 1.7 4 4 4.4V10a10 10 0 0 1-4-1.3V16a7 7 0 1 1-6-6.9V13a3 3 0 1 0 3 3Z",
      ],
    },
  };
  function render(settings) {
    for (const root of document.querySelectorAll("[data-social-links]")) {
      root.replaceChildren();
      for (const [key, p] of Object.entries(platforms)) {
        let u;
        try {
          u = new URL(settings.socialLinks?.[key]);
        } catch {
          continue;
        }
        if (
          u.protocol !== "https:" ||
          u.username ||
          u.password ||
          u.port ||
          !p.hosts.includes(u.hostname)
        )
          continue;
        const a = document.createElement("a");
        a.href = u.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.setAttribute("aria-label", p.label + " (opens in a new tab)");
        a.title = p.label + " (opens in a new tab)";
        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        for (const d of p.paths) {
          const path = document.createElementNS(svg.namespaceURI, "path");
          path.setAttribute("d", d);
          path.setAttribute(
            "fill",
            key === "instagram" ? "none" : "currentColor",
          );
          if (key === "instagram") {
            path.setAttribute("stroke", "currentColor");
            path.setAttribute("stroke-width", "2");
            path.setAttribute("stroke-linecap", "round");
          }
          svg.append(path);
        }
        const label = document.createElement("span");
        label.textContent = p.label;
        a.append(svg, label);
        root.append(a);
      }
      root.hidden = !root.childElementCount;
    }
  }
  return { render };
})();
