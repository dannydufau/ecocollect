// The Request Service words a field error as a fragment that follows the field name,
// for example { "photo.fileId": "photo check failed" }. These turn the fragments into
// sentences for people. A message that already is a sentence (the User Service's) is
// kept as it is, so a new server message still shows, only less polished.

const sentences: Record<string, string> = {
    // Photos (Q4 items, Q9, Q15)
    "photo check failed": "We couldn't use this photo. Please remove it and add it again.",
    "already used": "This photo is already attached to another request. Please add a different photo.",
    // Categories (repeated: Q4; unknown: Q4, Q9)
    "already selected": "This category is already selected. Please choose a different category.",
    "unknown category": "This category is no longer available. Please choose another one.",
    // Quantity (Q4)
    "must be at least 1": "Please enter a whole number, 1 or more.",
    // Pickup windows (Q4, Q9, Q12 and Q14 with new windows)
    "must have 1 to 3 windows": "Please choose 1 to 3 pickup windows.",
    "must start in the future": "This pickup window has already started. Please choose a later one.",
    "must end within 30 days of the request's creation": "Pickup windows must end within 30 days of when the request was created. Please choose an earlier time.",
    // Accept (Q11)
    "must be an active window of this request that has not started": "This pickup window has started or is no longer offered. Please choose another one.",
    // Delivery (Q15)
    "does not accept this category": "This facility doesn't accept this category. Please choose another facility.",
    "unknown facility": "This facility is no longer available. Please choose another one.",
};

// Fragments with a number or a field name in them
const patterns: [RegExp, string][] = [
    [/^must be a whole number from 1 to \d+$/, "Please enter a whole number, 1 or more."],
    [/^must be at most (\d+) characters$/, "Please use $1 characters or fewer."],
    [/^same slot as .+$/, "This pickup window is the same as another one. Please choose a different time."],
];

// The rest are shape errors our own code would have to cause, like an unknown field
const FALLBACK = "This wasn't accepted. Please check it and try again.";

export function readableFieldError(field: string, text: string): string {
    // Already a sentence
    if (/^[A-Z]/.test(text)) return text;
    // Q12 by an account that is both the owner and the volunteer, without "as"
    if (field === "as" && text === "is required") return "Please choose whether you are cancelling as the resident or as the volunteer.";
    // Own property only, so a text like "toString" can't pick up a function
    if (Object.hasOwn(sentences, text)) return sentences[text];
    for (const [pattern, sentence] of patterns) {
        if (pattern.test(text)) return text.replace(pattern, sentence);
    }
    return FALLBACK;
}
