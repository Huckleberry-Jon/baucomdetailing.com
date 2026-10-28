import { writeFile } from "node:fs/promises";
const hostname = process.argv[2];
if (!hostname || !/^[a-z0-9-]+\.onrender\.com$/.test(hostname))
  throw Error(
    "Supply the actual assigned Render hostname, not an invented placeholder",
  );
const result = {
  status: "PROPOSED ONLY — REQUIRES FINAL OWNER APPROVAL",
  domain: "baucomdetailing.com",
  websiteChanges: [
    {
      action: "replace apex parking A records only",
      type: "A",
      name: "",
      content: "216.24.57.1",
      ttl: 600,
    },
    {
      action: "replace current www CNAME only",
      type: "CNAME",
      name: "www",
      content: hostname,
      ttl: 600,
    },
  ],
  preserve:
    "All MX/TXT/SPF/DKIM/DMARC/NS/verification/other records. Export Porkbun zone first. Recheck provider target before approval.",
  notes:
    "Remove an interfering apex/www AAAA only if present in the approved zone export and confirmed unnecessary. No API/DNS update is performed.",
};
await writeFile(
  "deployment/dns-proposed.local.json",
  JSON.stringify(result, null, 2),
  { flag: "wx" },
);
console.log("Wrote a proposed DNS plan; no DNS was changed.");
