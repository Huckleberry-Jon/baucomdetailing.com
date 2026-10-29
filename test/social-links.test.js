import test from "node:test";
import assert from "node:assert/strict";
import { socialLinks } from "../src/social-links.js";
test("social URLs accept supplied official links, support removal and reject executable/spoofed URLs", () => {
  const links = {
    instagram: "https://www.instagram.com/baucomdetailingllc/",
    facebook: "https://www.facebook.com/share/1BRoekry1L/?mibextid=wwXIfr",
    tiktok: "https://www.tiktok.com/@baucomdetaling",
  };
  assert.deepEqual(socialLinks(links), links);
  assert.deepEqual(socialLinks({ instagram: "" }), {
    instagram: null,
    facebook: null,
    tiktok: null,
  });
  for (const url of [
    "javascript:alert(1)",
    "http://instagram.com/example",
    "https://instagram.com.evil.invalid/test",
    "https://www.instagram.com@evil.invalid/test",
    "https://user:pass@instagram.com/test",
    "https://instagram.com:8443/test",
  ])
    assert.throws(() => socialLinks({ instagram: url }));
  assert.throws(() => socialLinks({ youtube: "https://youtube.com/example" }));
});
