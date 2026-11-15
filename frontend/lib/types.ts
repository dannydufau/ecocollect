import type { components } from "@/lib/api-types";

type Schemas = components["schemas"];

// Types from contracts/openapi.yaml (run "npm run types" after the contract changes).
export type RequestDetail = Schemas["RequestDetail"];
export type MyRequest = Schemas["MyRequest"];
export type AvailableRequest = Schemas["AvailableRequest"];
export type VolunteerAssignment = Schemas["VolunteerAssignment"];
export type CreateRequests = Schemas["CreateRequests"];
export type CreatedRequest = Schemas["CreatedRequest"];
export type EditRequest = Schemas["EditRequest"];
export type AcceptRequest = Schemas["AcceptRequest"];
export type CancelRequest = Schemas["CancelRequest"];
export type CancelAssignment = Schemas["CancelAssignment"];
export type ReportMissed = Schemas["ReportMissed"];
export type RecordDelivery = Schemas["RecordDelivery"];
export type Profile = Schemas["Profile"];
export type ProfileEdit = Schemas["ProfileEdit"];
export type CreateAccount = Schemas["CreateAccount"];
export type ActivateRole = Schemas["ActivateRole"];
export type PublicProfile = Schemas["PublicProfile"];
export type TermsDocument = Schemas["TermsDocument"];
export type Notification = Schemas["Notification"];
export type PushSubscription = Schemas["PushSubscription"];
export type Award = Schemas["Award"];

export type RequestStatus = Schemas["RequestStatus"];
export type Role = Schemas["Role"];
export type AllowedAction = RequestDetail["allowedActions"][number];

// Old shapes. Current pages still use them. The cleanup ticket removes them.
export type PickupWindow = {
    date: string; // Calgary calendar date, YYYY-MM-DD
    startHour: number; // 0 to 23, Calgary time
};

export type CreateRequestsBody = {
    items: { categoryId: string; quantity: number; description?: string }[];
    windows: PickupWindow[];
    notes?: string;
    safetyAcknowledged: true;
};

export type OldCreatedRequest = {
    requestId: string;
    categoryId: string;
    quantity: number;
    estimatedWeightKg: number;
    status: "Open";
    createdAt: string;
    expiresAt: string;
};

export type OldMyRequest = {
    requestId: string;
    category: string;
    quantity: number;
    estimatedWeightKg: number;
    status: RequestStatus;
    createdAt: string;
    expiresAt: string;
};

export type OldAvailableRequest = {
    requestId: string;
    category: string;
    quantity: number;
    estimatedWeightKg: number;
    postalCode: string;
    windows: PickupWindow[];
    expiresAt: string;
};

export type SseSignal = {
    type: "NEW_MATCHING_REQUEST" | "REQUEST_CREATED";
    requestId: string;
};
