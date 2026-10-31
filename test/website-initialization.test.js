import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("gallery outage cannot stop booking initialization or package selection", async () => {
  const nodes = new Map();
  const node = () => ({
    value: "basic",
    textContent: "",
    dataset: {},
    options: [],
    append(...items) {
      this.options.push(...items);
    },
    replaceChildren(...items) {
      this.options = items;
      this.value = items[0]?.value ?? "";
    },
    addEventListener() {},
  });
  const $ = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, node());
    return nodes.get(selector);
  };
  let ready,
    galleryCalled = false;
  const document = {
    querySelector: $,
    querySelectorAll: () => [],
    createElement: node,
    createTextNode: (text) => ({ textContent: text }),
    addEventListener: (event, handler) => {
      if (event === "DOMContentLoaded") ready = handler;
    },
  };
  const context = vm.createContext({
    document,
    crypto: { randomUUID: () => "synthetic-id" },
    Option: function (text, value) {
      this.textContent = text;
      this.value = value;
      this.disabled = false;
    },
    Intl,
    URLSearchParams,
    location: { hash: "" },
    fetch: async () => ({
      ok: true,
      json: async () => ({
        settings: {
          serviceArea: "Synthetic area",
          timezone: "America/Chicago",
          workingDays: ["Sat", "Sun"],
          closedDates: [],
          scheduleConfirmed: true,
        },
        services: [
          {
            id: "basic",
            kind: "package",
            name: "Basic",
            items: [],
            min: 100,
            max: 200,
          },
        ],
        notice: "Synthetic notice",
      }),
    }),
    loadWebsitePhotos: async () => {
      galleryCalled = true;
      throw Error("Gallery unavailable");
    },
  });
  $("#availability-day").value = "";
  vm.runInContext(
    readFileSync(new URL("../public/app.js", import.meta.url), "utf8"),
    context,
  );
  ready();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(galleryCalled, true);
  assert.equal(typeof $("#package-select").onchange, "function");
  assert.match($("#estimate").textContent, /Estimated package/);
  assert.equal($("#booking-status").textContent, "");
  const monday = $("#availability-day").options.find(
    (o) => o.value && new Date(o.value + "T12:00:00Z").getUTCDay() === 1,
  );
  assert.ok(
    monday.disabled,
    "Closed Mondays must be disabled in the day dropdown",
  );
  $("#availability-day").value = monday.value;
  await $("#availability-day").onchange();
  assert.equal($("[name=requestedAt]").disabled, true);
  assert.match($("#availability-status").textContent, /unavailable/);
});
