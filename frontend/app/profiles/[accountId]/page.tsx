"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, QueryError, RoleBadge, Spinner, linkButton, mono, pageTitle } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { usePublicStream } from "@/lib/public-stream";
import { queryKeys } from "@/lib/query-keys";
import { calgaryToday, formatDate } from "@/lib/time";
import type { PublicProfile } from "@/lib/types";

const roleNames = { resident: "Resident", volunteer: "Volunteer" };

function initials(name: string) {
    return name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join("").toUpperCase();
}

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
                <EmptyState title="This profile does not exist or is no longer active."
                    action={<Link href="/stats" className={linkButton}>See the community stats</Link>} />
            </div>
        </main>
    );

    const data = profile.data;
    return (
        <main className="p-4 sm:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
                {!data && <h1 className={pageTitle}>Public profile</h1>}
                {profile.isPending && <Spinner label="Loading the profile..." />}
                {profile.isError && <QueryError message="We could not load this profile. Check your connection and try again." onRetry={() => { void profile.refetch(); void stats.refetch(); }} busy={profile.isFetching} />}
                {data && <section aria-label="Profile details" className="overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-rest">
                    <header className="flex min-w-0 items-center gap-4 bg-accent-2-200 p-5">
                        <span aria-hidden="true" className="inline-flex size-16 flex-none items-center justify-center rounded-full bg-accent-2-800 text-2xl font-bold text-on-moss">{initials(data.publicName)}</span>
                        <div className="min-w-0 space-y-1">
                            <h1 className={`break-words ${pageTitle}`}>{data.publicName}</h1>
                            <p className={`break-all text-neutral-800 ${mono}`}>@{data.accountId}</p>
                            <p className="flex flex-wrap gap-2">{data.roles.map(role => <RoleBadge key={role} role={role} />)}</p>
                        </div>
                    </header>
                    <dl className="grid gap-4 p-5 sm:grid-cols-3">
                        <div><dt className="text-[13px] text-text-muted">Roles</dt><dd>{data.roles.map(role => roleNames[role]).join(" and ")}</dd></div>
                        <div><dt className="text-[13px] text-text-muted">Member since</dt><dd>{formatDate(calgaryToday(new Date(data.memberSince)))}</dd></div>
                        <div>
                            <dt className="text-[13px] text-text-muted">EcoPoints</dt>
                            <dd className="whitespace-nowrap text-2xl font-bold tabular-nums">
                                {stats.data ? stats.data.ecopoints.toFixed(2) : stats.isError ? <span className="text-base font-normal">Not available right now</span> : "…"}
                            </dd>
                        </div>
                    </dl>
                </section>}
            </div>
        </main>
    );
}
