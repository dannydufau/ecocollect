import { fixtureAccounts, fixtureRequests } from "../mock/fixtures.mjs";

export type BrowserRoute = {
    name: string;
    path: string;
    account: string | null;
    heading: string;
    title: string;
    destination?: string;
};

const { resident, volunteer, both } = fixtureAccounts;
const { Open, Collected } = fixtureRequests;

export const routes: BrowserRoute[] = [
    { name: "home", path: "/", account: null, heading: "Sign in to EcoCollect", title: "Sign in · EcoCollect", destination: "/login" },
    { name: "sign-in", path: "/login", account: null, heading: "Sign in to EcoCollect", title: "Sign in · EcoCollect" },
    { name: "registration", path: "/register", account: null, heading: "Create your account", title: "Create account · EcoCollect" },
    { name: "forgot-password", path: "/forgot-password", account: null, heading: "Reset your password", title: "Reset password · EcoCollect" },
    { name: "choose-role", path: "/choose-role", account: both, heading: "Continue as", title: "Choose role · EcoCollect" },
    { name: "my-requests", path: "/resident", account: resident, heading: "My requests", title: "My requests · EcoCollect" },
    { name: "new-request", path: "/resident/requests/new", account: resident, heading: "New pickup request", title: "New pickup request · EcoCollect" },
    { name: "edit-request", path: `/resident/requests/${Open}/edit`, account: resident, heading: "Edit request", title: "Edit request · EcoCollect" },
    { name: "resident-request", path: `/resident/requests/${Open}`, account: resident, heading: "2 × Computers/Laptops", title: "Pickup request · EcoCollect" },
    { name: "available-requests", path: "/volunteer", account: volunteer, heading: "Available requests", title: "Available requests · EcoCollect" },
    { name: "assignments", path: "/volunteer/history", account: volunteer, heading: "My assignments", title: "My assignments · EcoCollect" },
    { name: "volunteer-request", path: `/volunteer/requests/${Collected}`, account: volunteer, heading: "2 × Computers/Laptops", title: "Pickup request · EcoCollect" },
    { name: "profile", path: "/profile", account: resident, heading: "Profile", title: "Profile · EcoCollect" },
    { name: "public-profile", path: `/profiles/${resident}`, account: null, heading: "Riley R.", title: "Public profile · EcoCollect" },
    { name: "notifications", path: "/notifications", account: resident, heading: "Notifications", title: "Notifications · EcoCollect" },
    { name: "ecopoints", path: "/ecopoints", account: resident, heading: "EcoPoints", title: "EcoPoints · EcoCollect" },
    { name: "community-stats", path: "/stats", account: null, heading: "Community impact", title: "Community stats · EcoCollect" },
    { name: "about", path: "/about", account: null, heading: "Old electronics shouldn’t live in your closet.", title: "About · EcoCollect" },
];
