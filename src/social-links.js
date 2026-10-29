import { requireThat } from "./security.js";
const hosts = {
  instagram: ["instagram.com", "www.instagram.com"],
  facebook: ["facebook.com", "www.facebook.com"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
};
export function socialLinks(value) {
  if (value === undefined || value === null)
    return { instagram: null, facebook: null, tiktok: null };
  requireThat(
    typeof value === "object" && !Array.isArray(value),
    "Invalid social links",
  );
  requireThat(
    Object.keys(value).every((k) => Object.hasOwn(hosts, k)),
    "Unknown social platform",
  );
  return Object.fromEntries(
    Object.entries(hosts).map(([platform, allowed]) => {
      const raw = value[platform];
      if (raw === undefined || raw === null || raw === "")
        return [platform, null];
      requireThat(
        typeof raw === "string" && raw.length <= 1000,
        "Invalid " + platform + " URL",
      );
      let u;
      try {
        u = new URL(raw.trim());
      } catch {
        requireThat(false, "Enter a valid " + platform + " URL");
      }
      requireThat(
        u.protocol === "https:" &&
          !u.username &&
          !u.password &&
          !u.port &&
          allowed.includes(u.hostname) &&
          u.pathname !== "/",
        "Use an official HTTPS " + platform + " profile or page link",
      );
      return [platform, u.href];
    }),
  );
}
