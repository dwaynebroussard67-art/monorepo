/** In-memory data store. Production target: Prisma repositories (see prisma/schema.prisma). */

export interface Freelancer { id: string; name: string; skills: string[]; rating: number; timezoneOffset: number; availabilityHrsPerWeek: number }
export interface Client { id: string; companyName: string }
export interface Project { id: string; clientId: string; title: string; scope: string; budgetCents: number; status: "open" | "contracted" }
export interface SquadMember { freelancerId: string; roleTitle: string; splitPercent: number }
export interface Squad { id: string; projectId: string; leadFreelancerId: string; members: SquadMember[]; status: "forming" | "proposed" | "contracted" }
export interface ProposalVersion { id: string; squadId: string; version: number; content: string; createdAt: number }
export interface Milestone { id: string; contractId: string; title: string; amountCents: number; ownerFreelancerId: string; status: "pending" | "approved" }
export interface Contract { id: string; projectId: string; squadId: string; terms: unknown; escrowStatus: "open" | "partially_released" | "released"; createdAt: number }
export interface PayoutSplit { id: string; contractId: string; milestoneId: string; freelancerId: string; amountCents: number; status: "released" }

export const db = {
  freelancers: new Map<string, Freelancer>(),
  clients: new Map<string, Client>(),
  projects: new Map<string, Project>(),
  squads: new Map<string, Squad>(),
  proposals: new Map<string, ProposalVersion[]>(), // key: squadId
  contracts: new Map<string, Contract>(),
  milestones: new Map<string, Milestone>(),
  payouts: [] as PayoutSplit[]
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
  for (const f of [
    { id: "fl_rhea", name: "Rhea Voss", skills: ["react", "design"], rating: 4.9, timezoneOffset: -5, availabilityHrsPerWeek: 25 },
    { id: "fl_noor", name: "Noor Haddad", skills: ["node", "typescript"], rating: 4.8, timezoneOffset: 1, availabilityHrsPerWeek: 30 },
    { id: "fl_malik", name: "Malik Osei", skills: ["devops", "node"], rating: 4.7, timezoneOffset: 5.5, availabilityHrsPerWeek: 20 },
    { id: "fl_june", name: "June Park", skills: ["qa", "react"], rating: 4.6, timezoneOffset: -8, availabilityHrsPerWeek: 15 },
    { id: "fl_ivan", name: "Ivan Petrov", skills: ["python", "ml"], rating: 4.5, timezoneOffset: 3, availabilityHrsPerWeek: 10 }
  ]) db.freelancers.set(f.id, f);

  db.clients.set("client_bright", { id: "client_bright", companyName: "Brightline Co" });
  db.projects.set("proj_platform", {
    id: "proj_platform", clientId: "client_bright", title: "Customer portal rebuild",
    scope: "Rebuild the customer portal with react frontend, node backend, and a proper devops pipeline.",
    budgetCents: 4_000_000, status: "open"
  });
}
