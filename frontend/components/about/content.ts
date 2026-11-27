// Verified reference data for the About page.
// Categories and standard weights mirror db/init/011_request_seed.sql (checked by content.test.ts).

export type AcceptedCategory = {
    id: string;
    name: string;
    wasteType: string;
    standardWeightKg: number;
};

export const acceptedCategories: readonly AcceptedCategory[] = [
    { id: "laptops", name: "Computers/Laptops", wasteType: "Computers", standardWeightKg: 2.5 },
    { id: "desktops", name: "Computers/Desktops", wasteType: "Computers", standardWeightKg: 8.0 },
    { id: "monitors", name: "Monitors", wasteType: "Displays", standardWeightKg: 5.0 },
    { id: "tvs", name: "Televisions", wasteType: "Displays", standardWeightKg: 12.0 },
    { id: "phones", name: "Phones", wasteType: "Mobile Devices", standardWeightKg: 0.2 },
    { id: "tablets", name: "Tablets", wasteType: "Mobile Devices", standardWeightKg: 0.5 },
    { id: "printers", name: "Printers", wasteType: "Printers", standardWeightKg: 6.0 },
    { id: "small-appliances", name: "Small Appliances", wasteType: "Small Appliances", standardWeightKg: 3.0 },
    { id: "cables-chargers", name: "Cables and Chargers", wasteType: "Accessories", standardWeightKg: 0.3 },
];

export type JourneyStep = {
    number: string;
    status: "Open" | "Assigned" | "Collected" | "Delivered";
    title: string;
    resident: string;
    volunteer: string;
};

export const journeySteps: readonly JourneyStep[] = [
    {
        number: "01",
        status: "Open",
        title: "Post items and pickup windows",
        resident:
            "Choose one or more e-waste categories—each creates a separate request with an automatically calculated weight—set 1 to 3 non-overlapping one-hour windows in Calgary time (within 30 days), and optionally add a photo. Edit or cancel anytime while Open; requests expire automatically when the last window starts.",
        volunteer:
            "Browse Open requests filtered by up to 3 preferred Calgary postal codes. See the category, quantity, weight, postal code, windows, and optional item photo while the exact street address stays hidden.",
    },
    {
        number: "02",
        status: "Assigned",
        title: "Claim a window and coordinate pickup",
        resident:
            "Your exact Calgary street address is shared only with your assigned volunteer. Cancel the assignment or request before the selected window ends. If the window passes without pickup, report a missed pickup and optionally provide 1 to 3 new windows to reschedule into a new linked request.",
        volunteer:
            "Accept an Open request by selecting one future pickup window. The street address unlocks for your active assignment, and you can cancel your assignment before collection if your plans change (no EcoPoints are awarded when a volunteer cancels).",
    },
    {
        number: "03",
        status: "Collected",
        title: "Confirm handoff in person",
        resident:
            "Confirm that the assigned volunteer collected the listed items. You keep access to your own address, while the volunteer’s access to your street address ends once collection is confirmed.",
        volunteer:
            "Transport the collected electronics to an eligible recycling facility that accepts that waste category.",
    },
    {
        number: "04",
        status: "Delivered",
        title: "Record facility delivery with a photo",
        resident:
            "Review the delivery photo—visible only to you and the delivering volunteer—and receive your Resident EcoPoints automatically.",
        volunteer:
            "Select the eligible recycling facility and record delivery with a photo. Volunteer EcoPoints are calculated and awarded automatically upon delivery.",
    },
];

export type TrustPrinciple = {
    number: string;
    title: string;
    description: string;
};

export const trustPrinciples: readonly TrustPrinciple[] = [
    {
        number: "01",
        title: "Exact street addresses stay hidden until accepted",
        description:
            "Volunteers browse Open requests by Calgary postal code. The request owner always keeps access to their address; the assigned volunteer can see the exact street address only while the assignment is active (Assigned) and loses access after collection.",
    },
    {
        number: "02",
        title: "Location metadata is stripped before upload",
        description:
            "Before any item or delivery photograph leaves your browser, embedded EXIF location data is removed. Photos accept JPEG, PNG, or WEBP up to 10 MB.",
    },
    {
        number: "03",
        title: "Delivery photos stay between participants",
        description:
            "Delivery evidence is visible only to the request owner and the delivering volunteer. Public profiles, notifications, and Community Impact totals never expose street addresses or photo links.",
    },
    {
        number: "04",
        title: "One consistent rulebook for every account",
        description:
            "Every eligible resident and volunteer follows the same discovery, assignment, and EcoPoints rules with no hidden priority. Terms and safety guidelines are acknowledged before registration, role activation, request creation, and pickup acceptance.",
    },
];

// Heading above the category table, counted from acceptedCategories.
export const categoriesHeadingText = `${acceptedCategories.length} accepted categories`;

// EcoPoints formulas, exactly as stored in rewards.ecopoints_award.formula
// (VOLUNTEER_FORMULA and RESIDENT_FORMULA in backend/src/reward/points.js).
export const volunteerFormulaText = "3 * quantity + 4 * estimatedWeightKg";
export const residentFormulaText = "(3 * quantity + 4 * estimatedWeightKg) / 2";

// Worked EcoPoints example for 1 Monitor. Update it when the formulas above
// or the Monitors weight in db/init/011_request_seed.sql change.
export const workedExample = {
    title: "1 × Monitor (5.00 kg)",
    volunteerCalculation: "3 * 1 + 4 * 5.00",
    volunteerPoints: "23.00 pts",
    residentCalculation: "23.00 / 2",
    residentPoints: "11.50 pts",
} as const;
