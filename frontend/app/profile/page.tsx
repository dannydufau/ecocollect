"use client";

import Link from "next/link";
import { Alert, Button, Spinner, card, pageTitle, textLink } from "@/components/ui";
import { ApiError, isAuthError } from "@/lib/api";
import { formatTimestamp } from "@/lib/time";
import { useProfile } from "@/lib/use-profile";
import { EditProfile } from "./edit-profile";
import { SecondRole } from "./second-role";

const roleNames = { resident: "Resident", volunteer: "Volunteer" };

export default function ProfilePage() {
    const { data, isPending, isError, error, refetch, isFetching } = useProfile();

    const details = data && [
        { label: "Account id", value: data.accountId },
        { label: "Name", value: `${data.firstName} ${data.lastName}` },
        { label: "Public name", value: data.publicName },
        { label: "Birth date", value: data.dateOfBirth },
        { label: "Roles", value: data.roles.map((role) => roleNames[role]).join(" and ") },
        ...(data.roles.includes("resident") && data.address
            ? [{ label: "Address", value: `${data.address.street}, ${data.address.city} ${data.address.postalCode}` }]
            : []),
        ...(data.roles.includes("volunteer")
            ? [{ label: "Preferred postal codes", value: data.preferredPostalCodes.join(", ") || "None" }]
            : []),
        { label: "Member since", value: formatTimestamp(data.createdAt) },
    ];

    return (
        <main className="p-4 sm:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
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
                {details && <section className={card} aria-labelledby="profile-details">
                    <h2 id="profile-details" className="text-2xl">Your details</h2>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        {details.map(({ label, value }) => (
                            <div key={label} className="min-w-0">
                                <dt className="text-neutral-700">{label}</dt>
                                <dd className="break-words">{value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>}
                {data && <EditProfile profile={data} />}
                {data && <SecondRole profile={data} />}
            </div>
        </main>
    );
}
