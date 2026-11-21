"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button, Spinner, card, pageTitle, textLink } from "@/components/ui";
import { ApiError, isAuthError } from "@/lib/api";
import { formatDate, formatTimestamp } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { useProfile } from "@/lib/use-profile";
import { DeactivateAccount } from "./deactivate-account";
import { AddressEditor, CodesEditor, PublicNameEditor } from "./editors";
import type { Notice } from "./notice";
import { SecondRole } from "./second-role";

const roleNames = { resident: "Resident", volunteer: "Volunteer" };
const cardTitle = "text-[22px]";
const cardStyle = `${card} min-w-0 space-y-3`;

type Card = "name" | "address" | "codes";

function Row({ name, children }: { name: string; children: React.ReactNode }) {
    return <div className="min-w-0"><dt className="text-[13px] text-text-muted">{name}</dt><dd className="break-words">{children}</dd></div>;
}

export default function ProfilePage() {
    const { data, isPending, isError, error, refetch, isFetching } = useProfile();
    // Only one card is edited at a time
    const [editing, setEditing] = useState<Card | null>(null);
    // The result of the last change, kept here because a card can disappear after it (the role card does)
    const [notice, setNotice] = useState<Notice | null>(null);
    const profile: Profile | undefined = data;

    function editor(card: Card) {
        return {
            open: editing === card,
            onOpen: () => { setNotice(null); setEditing(card); },
            onClose: () => setEditing(null),
            onSaved: () => { setNotice({ variant: "success", text: "Profile saved." }); setEditing(null); },
        };
    }

    return (
        <main className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6 p-4 sm:p-8">
            <div>
                <h1 className={pageTitle}>Profile</h1>
                {profile && <Link href={`/profiles/${encodeURIComponent(profile.accountId)}`} className={textLink}>View my public profile</Link>}
            </div>
            {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
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
            {profile && <section className={cardStyle} aria-labelledby="account-heading">
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
                <PublicNameEditor profile={profile} {...editor("name")} />
            </section>}
            {profile?.roles.includes("resident") && profile.address && <section className={cardStyle} aria-labelledby="address-heading">
                <h2 id="address-heading" className={cardTitle}>Address</h2>
                <AddressEditor profile={profile} {...editor("address")} />
            </section>}
            {profile?.roles.includes("volunteer") && <section className={cardStyle} aria-labelledby="codes-heading">
                <h2 id="codes-heading" className={cardTitle}>Preferred postal codes</h2>
                <CodesEditor profile={profile} {...editor("codes")} />
            </section>}
            {profile && <SecondRole profile={profile} onDone={setNotice} />}
            {profile && <DeactivateAccount />}
        </main>
    );
}
