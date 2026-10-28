// Shapes from contracts/openapi.yaml and asyncapi.yaml.

export type PickupWindow = {
    date: string; // Calgary calendar date, YYYY-MM-DD
    startHour: number; // 0 to 23, Calgary time
};

export type RequestStatus = "Open" | "Assigned" | "Collected" | "Delivered" | "Cancelled" | "Expired";

export type CreateRequestsBody = {
    items: { categoryId: string; quantity: number; description?: string }[];
    windows: PickupWindow[];
    notes?: string;
    safetyAcknowledged: true;
};

export type CreatedRequest = {
    requestId: string;
    categoryId: string;
    quantity: number;
    estimatedWeightKg: number;
    status: "Open";
    createdAt: string;
    expiresAt: string;
};

export type MyRequest = {
    requestId: string;
    category: string;
    quantity: number;
    estimatedWeightKg: number;
    status: RequestStatus;
    createdAt: string;
    expiresAt: string;
};

export type AvailableRequest = {
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