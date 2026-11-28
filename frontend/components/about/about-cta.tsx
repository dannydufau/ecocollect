"use client";

import Link from "next/link";
import { actionGroup, linkButton, secondaryLinkButton, textLink } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { isDemo } from "@/lib/demo";

function workspaceHref(activeRole: string | null) {
    return activeRole ? `/${activeRole}` : "/choose-role";
}

export function HeroActions() {
    const { user, activeRole, loading } = useAuth();

    if (!loading && user) {
        return (
            <div className="space-y-3">
                <div className={actionGroup}>
                    <Link href={workspaceHref(activeRole)} className={linkButton}>Go to my workspace</Link>
                    <Link href="/stats" className={secondaryLinkButton}>Community stats</Link>
                </div>
            </div>
        );
    }

    if (isDemo) {
        return (
            <div className="space-y-3">
                <div className={actionGroup}>
                    <Link href="/demo" className={linkButton}>Try the interactive demo</Link>
                    <Link href="#how-it-works" className={secondaryLinkButton}>How it works</Link>
                </div>
                <p className="text-caption text-text-muted">
                    Demo mode runs with shared sample data and sample facilities, and resets nightly.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className={actionGroup}>
                <Link href="/register" className={linkButton}>Create an account</Link>
                <Link href="#how-it-works" className={secondaryLinkButton}>How it works</Link>
            </div>
            <p className="text-caption text-text-muted">
                Open to adults 18 and older. This preview uses seeded sample recycling facilities to demonstrate the pickup workflow.
            </p>
        </div>
    );
}

export function ImpactSampleNote() {
    if (!isDemo) return null;
    return (
        <p className="text-small text-text-muted">
            In demo mode, Community Impact totals reflect shared sample data that resets nightly.
        </p>
    );
}

export function ClosingActions() {
    const { user, activeRole, loading } = useAuth();

    if (!loading && user) {
        return (
            <div className={actionGroup}>
                <Link href={workspaceHref(activeRole)} className={linkButton}>Open my workspace</Link>
                <Link href="/stats" className={secondaryLinkButton}>Community stats</Link>
            </div>
        );
    }

    if (isDemo) {
        return (
            <div className={actionGroup}>
                <Link href="/demo" className={linkButton}>Start interactive demo</Link>
                <Link href="/stats" className={secondaryLinkButton}>Community stats</Link>
            </div>
        );
    }

    return (
        <div className={actionGroup}>
            <Link href="/register" className={linkButton}>Create an account</Link>
            <Link href="/login" className={secondaryLinkButton}>Sign in</Link>
        </div>
    );
}

export function FooterAccountLink() {
    const { user, loading } = useAuth();
    if (!loading && user) {
        return <Link href="/profile" className={`${textLink} text-small`}>Profile</Link>;
    }
    return <Link href={isDemo ? "/demo" : "/login"} className={`${textLink} text-small`}>{isDemo ? "Try demo" : "Sign in"}</Link>;
}
