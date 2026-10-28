import { openDatabase } from "../src/db.js";
import { BookingService } from "../src/bookings.js";
export function future(offset = 7) {
  const d = new Date(Date.now() + offset * 86400000);
  d.setUTCHours(17, 0, 0, 0);
  return d.toISOString();
}
export function requestInput() {
  return {
    packageId: "dustoff",
    addonIds: [],
    firstName: "Synthetic",
    lastName: "Customer",
    phone: "8065550100",
    email: "test@example.invalid",
    address: "Synthetic test address",
    year: 2020,
    make: "Test",
    model: "Car",
    color: "Blue",
    bodyType: "Sedan",
    requestedAt: future(),
    concerns: "",
    acceptNotice: true,
    website: "",
  };
}
export function fixture(path) {
  const db = openDatabase(path),
    s = new BookingService(db);
  s.updateSettings({
    ...s.settings(),
    scheduleConfirmed: true,
    serviceAreaConfirmed: true,
    workingDays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    openMinute: 0,
    closeMinute: 1440,
    maxDaily: 8,
    bufferMinutes: 30,
  });
  return { db, s };
}
