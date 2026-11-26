import { describe, expect, it } from "vitest";
import {
    eighteenYearsAgo, normalizePostalCode, normalizeUsername, validateAccount, validateAddress, validateCodes, type AccountValues,
} from "./validate-account";

const today = "2026-11-16";
const resident: AccountValues = {
    username: "riley_1", email: "riley@example.com", password: "secret1", firstName: "Riley", lastName: "Resident",
    publicName: "Riley R.", dateOfBirth: "1995-03-14", role: "resident", street: "101 8 Ave SW", postalCode: "T2P1J9", preferredPostalCodes: [],
};
const volunteer: AccountValues = { ...resident, role: "volunteer", street: "", postalCode: "", preferredPostalCodes: ["T2P1J9"] };
const check = (values: Partial<AccountValues>, base = resident) => validateAccount({ ...base, ...values }, today);

describe("normalizing", () => {
    it("lowercases and trims the username", () => expect(normalizeUsername("  Abc_1 ")).toBe("abc_1"));
    it("uppercases a postal code and removes the spaces", () => expect(normalizePostalCode(" t2p 1j9 ")).toBe("T2P1J9"));
    it("finds the latest birth date eligible for registration", () => expect(eighteenYearsAgo(today)).toBe("2008-11-16"));
    it("finds a real date when today is 29 February", () => expect(eighteenYearsAgo("2028-02-29")).toBe("2010-02-28"));
});

describe("validateAccount", () => {
    it("accepts a resident and a volunteer", () => {
        expect(check({})).toEqual({});
        expect(check({}, volunteer)).toEqual({});
    });

    it.each([["Ab", false], ["abc_1", true], ["a-b", true], ["ab c", false], ["abc!", false], ["a".repeat(50), true], ["a".repeat(51), false]])(
        "username %j is valid: %s", (username, valid) => expect("username" in check({ username })).toBe(!valid));

    it("accepts an uppercase username because it is lowercased before sending", () => {
        expect(check({ username: "Riley_1" })).toEqual({});
    });

    it.each([["", false], ["riley", false], ["riley@", false], ["riley@example", false], ["riley@example.com", true]])(
        "email %j is valid: %s", (email, valid) => expect("email" in check({ email })).toBe(valid === false));

    it("asks for a name, a public name and a password", () => {
        const errors = check({ firstName: " ", lastName: "", publicName: "", password: "" });
        expect(errors).toEqual({ firstName: "Enter your first name.", lastName: "Enter your last name.", publicName: "Enter a public name.", password: "Choose a password." });
    });

    it.each([
        ["2008-11-16", undefined],
        ["2008-11-17", "You must be 18 or older to register."],
        ["2009-11-16", "You must be 18 or older to register."],
        ["2026-11-17", "Birth date can't be in the future."],
        ["2027-01-01", "Birth date can't be in the future."],
        ["", "Enter your date of birth."],
        ["2000-02-30", "Enter your date of birth."],
        ["14/03/1995", "Enter your date of birth."],
    ])("birth date %j gives %j", (dateOfBirth, message) => expect(check({ dateOfBirth }).dateOfBirth).toBe(message));

    it("turns 18 on the day after for a 29 February birth", () => {
        expect(validateAccount({ ...resident, dateOfBirth: "2008-02-29" }, "2026-02-28").dateOfBirth).toBe("You must be 18 or older to register.");
        expect(validateAccount({ ...resident, dateOfBirth: "2008-02-29" }, "2026-03-01").dateOfBirth).toBeUndefined();
    });

    it("applies the same limit on 29 February", () => {
        expect(validateAccount({ ...resident, dateOfBirth: "2010-02-28" }, "2028-02-29").dateOfBirth).toBeUndefined();
        expect(validateAccount({ ...resident, dateOfBirth: "2010-03-01" }, "2028-02-29").dateOfBirth).toBe("You must be 18 or older to register.");
    });

    it("needs a role", () => {
        expect(check({ role: "" })).toEqual({ role: "Choose how you want to use EcoCollect." });
    });

    describe("resident", () => {
        it("needs a street and a Calgary postal code", () => {
            expect(check({ street: " ", postalCode: "" })).toEqual({
                "address.street": "Enter your street address.", "address.postalCode": "Enter a Calgary postal code, for example T2P 1J9.",
            });
        });
        it.each([["t2p 1j9", true], ["T2P1J9", true], ["M5V2T6", false], ["T2P1J", false], ["T2PIJ9", false]])(
            "postal code %j is valid: %s", (postalCode, valid) => expect("address.postalCode" in check({ postalCode })).toBe(!valid));
        it("does not check the volunteer codes", () => {
            expect(check({ preferredPostalCodes: ["nope"] })).toEqual({});
        });
    });

    describe("volunteer", () => {
        it("does not need codes, and does not check the street", () => {
            expect(check({ preferredPostalCodes: [], street: "" }, volunteer)).toEqual({});
        });
        it("accepts spaced lowercase codes and ignores blank rows", () => {
            expect(check({ preferredPostalCodes: ["t2p 1j9", "", "T3A 0B1"] }, volunteer)).toEqual({});
        });
        it("names the row of a malformed code", () => {
            expect(check({ preferredPostalCodes: ["T2P1J9", "M5V2T6"] }, volunteer)).toEqual({ "preferredPostalCodes[1]": "Enter a Calgary postal code, for example T2P 1J9." });
        });
        it("names the row of a duplicate, even when it is written differently", () => {
            expect(check({ preferredPostalCodes: ["T2P1J9", "t2p 1j9"] }, volunteer)).toEqual({ "preferredPostalCodes[1]": "Each code can only be added once." });
        });
        it("allows 3 codes and not 4", () => {
            expect(check({ preferredPostalCodes: ["T2P1J9", "T3A0B1", "T2E5A8"] }, volunteer)).toEqual({});
            expect(check({ preferredPostalCodes: ["T2P1J9", "T3A0B1", "T2E5A8", "T2T4M3"] }, volunteer)).toEqual({ preferredPostalCodes: "You can save up to 3 codes." });
        });
        it("does not check the resident address", () => {
            expect(check({ street: "", postalCode: "bad" }, volunteer)).toEqual({});
        });
    });
});

describe("the address and code checks on their own", () => {
    it("checks the street and the postal code", () => {
        expect(validateAddress("123 4 Ave SW", "t2p 1j9")).toEqual({});
        expect(validateAddress(" ", "T2P1J9")).toEqual({ "address.street": "Enter your street address." });
        expect(validateAddress("123 4 Ave SW", "M5V 2T6")).toHaveProperty(["address.postalCode"]);
    });

    it("checks the preferred codes, ignoring blank rows", () => {
        expect(validateCodes(["T2P1J9", "", "t3a 0b1"])).toEqual({});
        expect(validateCodes(["T2P1J9", "T2P 1J9"])).toHaveProperty(["preferredPostalCodes[1]"]);
        expect(validateCodes(["T2P1J9", "T3A0B1", "T2N4X7", "T1Y1A1"])).toHaveProperty("preferredPostalCodes");
    });
});
