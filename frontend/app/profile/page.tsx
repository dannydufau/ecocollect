"use client";

import Link from "next/link";
import { Alert, Button, Spinner, card, pageTitle, textLink } from "@/components/ui";
import { ApiError, isAuthError } from "@/lib/api";
import { formatPostalCode } from "@/lib/postal-code";
import { formatDate, formatTimestamp } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { useProfile } from "@/lib/use-profile";

const roleNames = { resident: "Resident", volunteer: "Volunteer" };
const cardTitle = "text-[22px]";
const label = "text-[13px] text-neutral-700";

function Row({ name, children }: { name: string; children: React.ReactNode }) {
    return <div className="min-w-0"><dt className={label}>{name}</dt><dd className="break-words">{children}</dd></div>;
}

function AccountCard({ profile }: { profile: Profile }) {
    return (
        <section className={`${card} min-w-0 space-y-3`} aria-labelledby="account-heading">
            <h2 id="account-heading" className={cardTitle}>Account</h2>
            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
                <Row name="Username"><span className="font-mono">{profile.accountId}</span></Row>
                <Row name="Email">{profile.email}</Row>
                <Row name="Name">{profile.firstName} {profile.lastName}</Row>
                <Row name="Date of birth">{formatDate(profile.dateOfBirth)}</Row>
                <Row name="Member since">{formatTimestamp(profile.createdAt)}</Row>
                <Row name="Roles">
                    <span className="flex flex-wrap gap-1.5">
                        {profile.roles.map((role) => (
                            <span key={role} className="rounded-full bg-accent-2-200 px-3 py-0.5 text-xs font-semibold text-accent-2-900">{roleNames[role]}</span>
                        ))}
                    </span>
                </Row>
            </dl>
            <dl><Row name="Public name">{profile.publicName}</Row></dl>
        </section>
    );
}

function AddressCard({ address }: { address: NonNullable<Profile["address"]> }) {
    return (
        <section className={`${card} min-w-0 space-y-3`} aria-labelledby="address-heading">
            <h2 id="address-heading" className={cardTitle}>Address</h2>
            <p className="break-words">{address.street}<br />{address.city}, {formatPostalCode(address.postalCode)}</p>
        </section>
    );
}

function CodesCard({ codes }: { codes: string[] }) {
    return (
        <section className={`${card} min-w-0 space-y-3`} aria-labelledby="codes-heading">
            <h2 id="codes-heading" className={cardTitle}>Preferred postal codes</h2>
            {codes.length > 0
                ? <ul className="flex flex-wrap gap-2">{codes.map((code) => (
                    <li key={code} className="rounded-full bg-neutral-100 px-3.5 py-1.5 text-sm">{formatPostalCode(code)}</li>
                ))}</ul>
                : <p>You have no saved codes. You will not get new-request notifications and the list shows every area.</p>}
        </section>
    );
}

export default function ProfilePage() {
    const { data, isPending, isError, error, refetch, isFetching } = useProfile();

    return (
        <main className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6 p-4 sm:p-8">
            <div>
                <h1 className={pageTitle}>Profile</h1>
                {data && <Link href={`/profiles/${encodeURIComponent(data.accountId)}`} className={textLink}>View my public profile</Link>}
            </div>
            {isPending && <Spinner label="Loading your profile..." />}
            {isError && <div className="space-y-2">
                <Alert variant="error">
                    {isAuthError(error)
                        ? "Please log in to view your profile."
                        : error instanceof ApiError && error.status === 404
                            ? "We could not find your profile."
                            : "We could not load this page. Check your connection and try again."}
                </Alert>
                <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>Try again</Button>
            </div>}
            {data && <AccountCard profile={data} />}
            {data?.roles.includes("resident") && data.address && <AddressCard address={data.address} />}
            {data?.roles.includes("volunteer") && <CodesCard codes={data.preferredPostalCodes} />}
        </main>
    );
}
