type Status = "Open" | "Assigned" | "Collected" | "Delivered" | "Cancelled" | "Expired" | "Missed";
type Viewer = "resident" | "volunteer";

const resident: Record<Status, string> = {
    Open: "Waiting for a volunteer.",
    Assigned: "A volunteer will collect your items in the selected window.",
    Collected: "Your items were collected and are on their way to a facility.",
    Delivered: "Your items were delivered.",
    Cancelled: "This request was cancelled.",
    Expired: "No volunteer accepted this request before its last window started.",
    Missed: "The pickup was reported as missed.",
};

const volunteer: Record<Status, string> = {
    Open: "Open for pickup.",
    Assigned: "Collect the items in the selected window.",
    Collected: "Take the items to a facility and record the delivery.",
    Delivered: "You delivered these items.",
    Cancelled: "This request was cancelled.",
    Expired: "This request expired.",
    Missed: "The pickup was reported as missed.",
};

export function nextStepText(status: Status, viewer: Viewer): string {
    return (viewer === "resident" ? resident : volunteer)[status];
}
