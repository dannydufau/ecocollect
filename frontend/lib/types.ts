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
export type WasteTypeStats = Schemas["WasteTypeStats"];
export type CategoryWithWeight = Schemas["CategoryWithWeight"];
export type Facility = Schemas["Facility"];
export type PhotoRef = Schemas["PhotoRef"];
export type UploadRequest = Schemas["UploadRequest"];
export type UploadTicket = Schemas["UploadTicket"];

export type RequestStatus = Schemas["RequestStatus"];
export type Role = Schemas["Role"];
export type AllowedAction = RequestDetail["allowedActions"][number];

// The window shape the pages and time helpers use
export type PickupWindow = {
    date: string; // Calgary calendar date, YYYY-MM-DD
    startHour: number; // 0 to 23, Calgary time
};
