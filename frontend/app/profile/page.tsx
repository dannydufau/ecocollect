"use client";

import Link from "next/link";
import { useState } from "react";
import EnableNotifications from "@/components/enable-notifications";
import { Alert, BellIcon, LoadingRegion, QueryError, RoleBadge, card, identifier, pageTitle, textLink } from "@/components/ui";
import { ApiError, isAuthError } from "@/lib/api";
import { formatDate, formatTimestamp } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { useProfile } from "@/lib/use-profile";
import { DeactivateAccount } from "./deactivate-account";
import { AddressEditor, CodesEditor, PublicNameEditor } from "./editors";
import type { Notice } from "./notice";
import { SecondRole } from "./second-role";

const cardStyle = `${card} min-w-0 space-y-3`;

type Card = "name" | "address" | "codes";

function Row({ name, children }: { name: string; children: React.ReactNode }) {
    return <div className="min-w-0"><dt className="text-caption text-text-muted">{name}</dt><dd className="break-words">{children}</dd></div>;
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
            onClose: () => setEditing((current) => (current === card ? null : current)),
            onSaved: () => {
                setNotice({ variant: "success", text: "Profile saved." });
                setEditing((current) => (current === card ? null : current));
            },
        };
    }
    const section = (card: Card) => `${cardStyle} ${editing === card ? "ring-2 ring-accent-700" : ""}`;

    return (
        <main className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6 p-4 sm:p-8">
            <div>
                <h1 className={pageTitle}>Profile</h1>
                {profile && <Link href={`/profiles/${encodeURIComponent(profile.accountId)}`} className={textLink}>View my public profile</Link>}
            </div>
            {notice && <Alert variant={notice.variant} onDismiss={() => setNotice(null)}>{notice.text}</Alert>}
            {isPending && <LoadingRegion label="Loading your profile..." />}
            {isError && <QueryError message={isAuthError(error)
                        ? "Please log in to view your profile."
                        : error instanceof ApiError && error.status === 404
                            ? "We could not find your profile."
                            : "We could not load this page. Check your connection and try again."} onRetry={() => refetch()} busy={isFetching} />}
            {profile && <section className={section("name")} aria-labelledby="account-heading">
                <h2 id="account-heading">Account</h2>
                <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
                    <Row name="Username"><span className={identifier}>{profile.accountId}</span></Row>
                    <Row name="Email">{profile.email}</Row>
                    <Row name="Name">{profile.firstName} {profile.lastName}</Row>
                    <Row name="Date of birth">{formatDate(profile.dateOfBirth)}</Row>
                    <Row name="Member since">{formatTimestamp(profile.createdAt)}</Row>
                    <Row name="Roles">
                        <span className="flex flex-wrap gap-1.5">
                            {profile.roles.map((role) => (
                                <RoleBadge key={role} role={role} />
                            ))}
                        </span>
                    </Row>
                </dl>
                <hr className="border-border" />
                <PublicNameEditor profile={profile} {...editor("name")} />
            </section>}
            {profile?.roles.includes("resident") && profile.address && <section className={section("address")} aria-labelledby="address-heading">
                <h2 id="address-heading">Address</h2>
                <AddressEditor profile={profile} {...editor("address")} />
            </section>}
            {profile?.roles.includes("volunteer") && <section className={section("codes")} aria-labelledby="codes-heading">
                <h2 id="codes-heading">Preferred postal codes</h2>
                <CodesEditor profile={profile} {...editor("codes")} />
            </section>}
            {profile && <section className={cardStyle} aria-labelledby="notifications-heading">
                <h2 id="notifications-heading" className="flex items-center gap-2"><BellIcon className="size-5" />Notifications</h2>
                <p>Get a device notification when something changes on your requests.</p>
                <EnableNotifications />
            </section>}
            {profile && <SecondRole profile={profile} onDone={setNotice} />}
            {profile && <DeactivateAccount />}
        </main>
    );
}
