export type AccountValues = {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    publicName: string;
    dateOfBirth: string;
    role: "resident" | "volunteer" | "";
    street: string;
    postalCode: string;
    preferredPostalCodes: string[];
};

const USERNAME = /^[a-z0-9_-]{3,50}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL_CODE = /^T\d[A-Z]\d[A-Z]\d$/;

export const normalizeUsername = (value: string) => value.trim().toLowerCase();
// README Conventions: the frontend uppercases and removes spaces, the services only accept that form
export const normalizePostalCode = (value: string) => value.replace(/\s+/g, "").toUpperCase();

// Latest eligible birth date for the date picker's maximum.
export function eighteenYearsAgo(today: string): string {
    // 29 February has no match 18 years back unless that year is a leap year too. Someone born on 28 February is 18 that day.
    const monthDay = today.endsWith("-02-29") ? "-02-28" : today.slice(4);
    return `${Number(today.slice(0, 4)) - 18}${monthDay}`;
}

function isRealDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Returns the messages by field. The keys are the ones the server uses in details.fields, so both can share the form.
export function validateAccount(values: AccountValues, today: string): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!values.firstName.trim()) errors.firstName = "Enter your first name.";
    else if (values.firstName.trim().length > 80) errors.firstName = "Use 80 characters or fewer.";
    if (!values.lastName.trim()) errors.lastName = "Enter your last name.";
    else if (values.lastName.trim().length > 80) errors.lastName = "Use 80 characters or fewer.";
    if (!values.publicName.trim()) errors.publicName = "Enter a public name.";
    else if (values.publicName.trim().length > 80) errors.publicName = "Use 80 characters or fewer.";

    if (!isRealDate(values.dateOfBirth)) errors.dateOfBirth = "Enter your date of birth.";
    else if (values.dateOfBirth > today) errors.dateOfBirth = "Birth date can't be in the future.";
    else if (values.dateOfBirth > eighteenYearsAgo(today)) errors.dateOfBirth = "You must be 18 or older to register.";

    if (!USERNAME.test(normalizeUsername(values.username))) errors.username = "Use 3 to 50 characters: a to z, 0 to 9, _ and -.";
    if (!EMAIL.test(values.email.trim())) errors.email = "Enter a valid email.";
    if (!values.password) errors.password = "Choose a password.";
    else if (values.password.length < 6) errors.password = "Use at least 6 characters.";

    if (!values.role) errors.role = "Choose how you want to use EcoCollect.";
    if (values.role === "resident") Object.assign(errors, validateAddress(values.street, values.postalCode));
    if (values.role === "volunteer") Object.assign(errors, validateCodes(values.preferredPostalCodes));
    return errors;
}

// Used on its own by the profile page too
export function validateAddress(street: string, postalCode: string): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!street.trim()) errors["address.street"] = "Enter your street address.";
    else if (street.trim().length > 255) errors["address.street"] = "Use 255 characters or fewer.";
    if (!POSTAL_CODE.test(normalizePostalCode(postalCode))) errors["address.postalCode"] = "Enter a Calgary postal code, for example T2P 1J9.";
    return errors;
}

// Blank rows are ignored, so an unused "Add postal code" row does not block the form
export function validateCodes(codes: string[]): Record<string, string> {
    const errors: Record<string, string> = {};
    const seen = new Set<string>();
    codes.forEach((code, index) => {
        const normalized = normalizePostalCode(code);
        if (!normalized) return;
        if (!POSTAL_CODE.test(normalized)) errors[`preferredPostalCodes[${index}]`] = "Enter a Calgary postal code, for example T2P 1J9.";
        else if (seen.has(normalized)) errors[`preferredPostalCodes[${index}]`] = "Each code can only be added once.";
        seen.add(normalized);
    });
    if (seen.size > 3) errors.preferredPostalCodes = "You can save up to 3 codes.";
    return errors;
}
