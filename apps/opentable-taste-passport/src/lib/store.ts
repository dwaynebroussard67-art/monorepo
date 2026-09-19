/** In-memory data store. Production target: PostgreSQL+PostGIS + encrypted profile store (see prisma/schema.prisma). */

export interface Restaurant { id: string; name: string; cuisineTags: string[] }
export interface Diner { id: string; name: string }
export interface PreferenceVector {
  dietaryFlags: string[]; allergies: string[];
  flavorAxes: { umami: number; spice: number; sweet: number; acid: number; rich: number };
  servicePrefs: string[];
}
export type ConsentScope = "allergies" | "dietary" | "flavor" | "sodium" | "occasion" | "visits" | "service";
export interface TastePassport {
  dinerId: string;
  vector: PreferenceVector;
  consent: { granted: ConsentScope[] }; // reservation-scoped reveal policy
  updatedAt: number;
}
export interface VisitRecord { id: string; dinerId: string; dishes: string[]; feedbackNotes: string[]; spendCents: number; at: number }
export interface Reservation { id: string; restaurantId: string; dinerId: string; startsAt: number; partySize: number; occasion?: string; status: "requested" | "confirmed" | "cancelled" }
export interface BriefToken { id: string; reservationId: string; expiresAt: number; consumedAt?: number; scope: "host_console" }

export const db = {
  restaurants: new Map<string, Restaurant>(),
  diners: new Map<string, Diner>(),
  passports: new Map<string, TastePassport>(), // key: dinerId
  visits: new Map<string, VisitRecord[]>(), // key: dinerId
  reservations: new Map<string, Reservation>(),
  briefTokens: new Map<string, BriefToken>(),
  briefs: new Map<string, { reservationId: string; summaryText: string; traits: unknown; generatedAt: number }>()
};

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

let seeded = false;
export function seed() {
  if (seeded) return;
  seeded = true;
  const now = Date.now();
  const DAY = 24 * 60 * 60_000;

  db.restaurants.set("rest_lumen", { id: "rest_lumen", name: "Lumen", cuisineTags: ["japanese", "tasting-menu"] });
  db.diners.set("diner_noa", { id: "diner_noa", name: "Noa Ito" });

  db.passports.set("diner_noa", {
    dinerId: "diner_noa",
    vector: {
      dietaryFlags: ["vegetarian"],
      allergies: ["shellfish"],
      flavorAxes: { umami: 0.85, spice: 0.5, sweet: 0.3, acid: 0.6, rich: 0.4 },
      servicePrefs: ["quiet-corner", "counter-seating-ok"]
    },
    consent: { granted: ["allergies", "dietary", "flavor", "sodium", "occasion", "visits", "service"] },
    updatedAt: now
  });

  db.visits.set("diner_noa", [
    { id: nextId("visit"), dinerId: "diner_noa", dishes: ["miso eggplant", "tofu katsu"], feedbackNotes: ["loved the broth", "a bit too salty"], spendCents: 8600, at: now - 40 * DAY },
    { id: nextId("visit"), dinerId: "diner_noa", dishes: ["agedashi tofu", "seaweed salad"], feedbackNotes: ["too salty for me"], spendCents: 7200, at: now - 20 * DAY },
    { id: nextId("visit"), dinerId: "diner_noa", dishes: ["vegetable tempura"], feedbackNotes: ["perfect"], spendCents: 6400, at: now - 7 * DAY }
  ]);

  db.reservations.set("res_anniv", {
    id: "res_anniv", restaurantId: "rest_lumen", dinerId: "diner_noa",
    startsAt: now + 3 * 60 * 60_000, partySize: 2, occasion: "anniversary", status: "requested"
  });
}
