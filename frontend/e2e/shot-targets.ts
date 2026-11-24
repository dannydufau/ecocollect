import { fixtureAccounts, fixtureRequests } from "../mock/fixtures.mjs";
import { routes } from "./routes";

export type ShotTarget = { name: string; path: string; account: string | null };

const { resident, volunteer, empty, long } = fixtureAccounts;
const statuses = ["Open", "Assigned", "Collected", "Delivered", "Missed", "Cancelled", "Expired"] as const;

// Every route, every request status as the resident and as the volunteer, and the pages the routes do not show:
// the empty account, the long-data account, the demo page and a page that does not exist.
export const shotTargets: ShotTarget[] = [
    ...routes.map(({ name, path, account }) => ({ name, path, account })),
    ...statuses.map(status => ({ name: `resident-request-${status}`, path: `/resident/requests/${fixtureRequests[status]}`, account: resident })),
    ...statuses.map(status => ({ name: `volunteer-request-${status}`, path: `/volunteer/requests/${fixtureRequests[status]}`, account: volunteer })),
    { name: "demo", path: "/demo", account: null },
    { name: "not-found", path: "/does-not-exist", account: null },
    { name: "empty-my-requests", path: "/resident", account: empty },
    { name: "empty-available-requests", path: "/volunteer", account: empty },
    { name: "empty-assignments", path: "/volunteer/history", account: empty },
    { name: "empty-notifications", path: "/notifications", account: empty },
    { name: "empty-ecopoints", path: "/ecopoints", account: empty },
    { name: "empty-profile", path: "/profile", account: empty },
    { name: "long-my-requests", path: "/resident", account: long },
    { name: "long-available-requests", path: "/volunteer", account: long },
    { name: "long-profile", path: "/profile", account: long },
];
