"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Spinner, card, pageTitle, textLink } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { usePublicStream } from "@/lib/public-stream";
import { queryKeys } from "@/lib/query-keys";
import { formatTimestamp } from "@/lib/time";
import type { PublicProfile } from "@/lib/types";

const roleNames = { resident: "Resident", volunteer: "Volunteer" };

// Public routes need no login, so a plain fetch without the Authorization header that api.get adds
async function getPublic<T>(path: string): Promise<T> {
    const res = await fetch(path);
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
    return res.json();
}

export default function PublicProfilePage() {
    const { accountId } = useParams<{ accountId: string }>();
    const path = `/api/public/profiles/${encodeURIComponent(accountId)}`;
    const profile = useQuery({
        queryKey: queryKeys.publicProfile(accountId),
        queryFn: () => getPublic<PublicProfile>(path),
    });
    const stats = useQuery({
        queryKey: [...queryKeys.publicProfile(accountId), "stats"],
        queryFn: () => getPublic<{ accountId: string; ecopoints: number }>(`${path}/stats`),
    });
    usePublicStream({ profile: accountId }, () => {
        void profile.refetch();
        void stats.refetch();
    });

    if (profile.error instanceof ApiError && profile.error.status === 404) return (
        <main className="p-4 sm:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
                <h1 className={pageTitle}>Profile not found</h1>
                <p>This profile does not exist or is no longer active.</p>
                <Link href="/" className={textLink}>Go to the home page</Link>
            </div>
        </main>
    );

    const data = profile.data;
    return (
        <main className="p-4 sm:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
                <h1 className={`break-words ${pageTitle}`}>{data ? data.publicName : "Public profile"}</h1>
                {profile.isPending && <Spinner label="Loading the profile..." />}
                {profile.isError && <div className="space-y-2">
                    <Alert variant="error">We could not load this profile. Check your connection and try again.</Alert>
                    <Button variant="secondary" onClick={() => { void profile.refetch(); void stats.refetch(); }} disabled={profile.isFetching}>Try again</Button>
                </div>}
                {data && <section className={card} aria-label="Profile details">
                    <dl className="grid gap-3 sm:grid-cols-3">
                        <div><dt className="text-neutral-700">Roles</dt><dd>{data.roles.map(role => roleNames[role]).join(" and ")}</dd></div>
                        <div><dt className="text-neutral-700">Member since</dt><dd>{formatTimestamp(data.memberSince)}</dd></div>
                        <div>
                            <dt className="text-neutral-700">EcoPoints</dt>
                            <dd className="font-[family-name:var(--font-heading)] text-[26px] tabular-nums">
                                {stats.data ? stats.data.ecopoints.toFixed(2) : stats.isError ? <span className="font-[family-name:var(--font-body)] text-base">Not available right now</span> : "…"}
                            </dd>
                        </div>
                    </dl>
                </section>}
            </div>
        </main>
    );
}
