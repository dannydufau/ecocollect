// Not run. `npx tsc --noEmit` fails if the generated types stop matching these.
import type {
    CategoryWithWeight, Facility, PhotoRef, ProfileEdit, RequestDetail, UploadRequest, UploadTicket, WasteTypeStats,
} from "@/lib/types";

export const detail: RequestDetail = {
    requestId: "1b4e28ba-2fa1-11d2-883f-0016d3cca427",
    status: "Open",
    category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Electronics" },
    quantity: 2,
    estimatedWeightKg: 5,
    postalCode: "T2P1J9",
    windows: [{ windowId: "w_1", date: "2026-11-22", startHour: 14 }],
    createdAt: "2026-11-13T18:00:00Z",
    expiresAt: "2026-11-22T21:00:00Z",
    viewer: "volunteer",
    allowedActions: ["accept"],
    refreshAt: null,
};

export const edit: ProfileEdit = { publicName: "Sam B." };

export const category: CategoryWithWeight = { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Electronics", standardWeightKg: 2.5 };

export const upload: UploadRequest = { purpose: "item_photo", fileName: "laptop.jpg", contentType: "image/jpeg", sizeBytes: 120000 };

// Only here so a rename in the contract breaks the build.
export type Others = [WasteTypeStats, Facility, PhotoRef, UploadTicket];
