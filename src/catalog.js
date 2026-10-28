export const BUSINESS = "baucom";
export const notice =
  "Package prices are starting estimates and may vary depending on vehicle size, interior condition, and the level of cleaning required. Excessive stains, embedded pet hair, chewing gum, spilled food or drinks, heavy dirt, excessive odors, and other difficult-to-remove substances may require additional cleaning charges. Any additional charges will be discussed with the customer and approved before work begins. No surprise charges.";
const essential = [
  "Full interior vacuum, including seats, carpets, and mats",
  "Dashboard, console, door panels, and cupholders wiped down",
  "Air-compressed vents and crevices",
  "Interior windows and mirrors cleaned",
  "Light interior shine",
  "Final inspection",
];
const premium = [
  "Steam cleaning of suitable hard surfaces",
  "Detailed carpet and seat spot cleaning",
  "Leather or vinyl cleaning",
  "Detailed door jambs and trim",
  "Interior dressing or protectant where appropriate",
];
export const packages = [
  {
    id: "route66",
    kind: "package",
    name: "Route 66 Revival",
    subtitle: "Essential — Clean & Refresh",
    min: 7900,
    max: 11900,
    items: essential,
    durationMinutes: null,
    enabled: true,
  },
  {
    id: "dustoff",
    kind: "package",
    name: "The Dust Off",
    subtitle: "Premium — Deep Clean & Protect",
    min: 11900,
    max: 16900,
    items: [...essential, ...premium],
    featured: true,
    durationMinutes: null,
    enabled: true,
  },
  {
    id: "finalmile",
    kind: "package",
    name: "The Final Mile",
    subtitle: "Ultimate — Interior Reset",
    min: 16900,
    max: 22900,
    items: [
      ...essential,
      ...premium,
      "Carpet and fabric seat extraction",
      "Targeted stain treatment",
      "Detailed hard-to-reach areas",
      "Additional odor treatment as needed",
      "Final detailing and quality inspection",
    ],
    durationMinutes: null,
    enabled: true,
  },
];
export const addons = [
  "Excessive pet hair removal",
  "Chewing gum removal",
  "Severe stain treatment",
  "Heavy odor treatment",
  "Excessive dirt/mud removal",
  "Additional upholstery extraction",
  "Specialty interior cleaning",
].map((name, i) => ({
  id: `addon${i}`,
  kind: "addon",
  name,
  description:
    "Specialized cleaning beyond routine package treatment. Quoted after condition review.",
  min: null,
  max: null,
  durationMinutes: null,
  taxable: null,
  enabled: true,
  packageIds: packages.map((p) => p.id),
}));
export const settings = {
  name: "Baucom’s Mobile Detailing",
  timezone: "America/Chicago",
  serviceArea:
    "Amarillo and the surrounding Texas Panhandle — pending confirmation",
  contact: null,
  googleReviewUrl: null,
  scheduleConfirmed: false,
  serviceAreaConfirmed: false,
  workingDays: [],
  openMinute: null,
  closeMinute: null,
  closedDates: [],
  bufferMinutes: 0,
  maxDaily: null,
};
