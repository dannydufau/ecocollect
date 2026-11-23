import { fixtureAccounts, fixtureRequests } from "../mock/fixtures.mjs";

export type BrowserRoute = {
    name: string;
    path: string;
    account: string | null;
    heading: string;
    destination?: string;
};

const { resident, volunteer, both } = fixtureAccounts;
const { Open, Collected } = fixtureRequests;

export const routes: BrowserRoute[] = [
    { name: "home", path: "/", account: null, heading: "Sign in to EcoCollect", destination: "/login" },
    { name: "sign-in", path: "/login", account: null, heading: "Sign in to EcoCollect" },
    { name: "registration", path: "/register", account: null, heading: "Create your account" },
    { name: "forgot-password", path: "/forgot-password", account: null, heading: "Reset your password" },
    { name: "choose-role", path: "/choose-role", account: both, heading: "Continue as" },
    { name: "my-requests", path: "/resident", account: resident, heading: "My requests" },
    { name: "new-request", path: "/resident/requests/new", account: resident, heading: "New pickup request" },
    { name: "edit-request", path: `/resident/requests/${Open}/edit`, account: resident, heading: "Edit request" },
    { name: "resident-request", path: `/resident/requests/${Open}`, account: resident, heading: "2 × Computers/Laptops" },
    { name: "available-requests", path: "/volunteer", account: volunteer, heading: "Available requests" },
    { name: "assignments", path: "/volunteer/history", account: volunteer, heading: "My assignments" },
    { name: "volunteer-request", path: `/volunteer/requests/${Collected}`, account: volunteer, heading: "2 × Computers/Laptops" },
    { name: "profile", path: "/profile", account: resident, heading: "Profile" },
    { name: "public-profile", path: `/profiles/${resident}`, account: null, heading: "Riley R." },
    { name: "notifications", path: "/notifications", account: resident, heading: "Notifications" },
    { name: "ecopoints", path: "/ecopoints", account: resident, heading: "EcoPoints" },
    { name: "community-stats", path: "/stats", account: null, heading: "Community impact" },
];
