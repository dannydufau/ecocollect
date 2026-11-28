import Image from "next/image";
import Link from "next/link";
import { RoleBadge, StatusBadge, card, pageWidth, secondaryLinkButton, textLink } from "@/components/ui";
import { ClosingActions, FooterAccountLink, HeroActions, ImpactSampleNote } from "@/components/about/about-cta";
import {
    acceptedCategories,
    categoriesHeadingText,
    journeySteps,
    residentFormulaText,
    trustPrinciples,
    volunteerFormulaText,
    workedExample,
} from "@/components/about/content";
import RouteIllustration from "@/components/about/route-illustration";

const sectionHeading = "text-[length:clamp(1.625rem,3vw,2.25rem)] font-bold leading-[1.18] tracking-[-0.01em]";
const eyebrow = "text-caption font-semibold uppercase tracking-[0.08em] text-text-muted";
const container = `${pageWidth} px-4 sm:px-8`;

export default function AboutPage() {
    return (
        <main className="flex w-full flex-1 flex-col">
            {/* Band 1: Hero */}
            <section aria-labelledby="about-hero-title" className="w-full bg-bg pt-10 pb-14 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24">
                <div className={`${container} grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12`}>
                    <div className="space-y-6 lg:col-span-7">
                        <p className={eyebrow}>Calgary’s community e-waste courier</p>
                        <h1
                            id="about-hero-title"
                            className="max-w-[18ch] text-[length:clamp(2.375rem,5.5vw,3.75rem)] leading-[1.08] tracking-[-0.01em]"
                        >
                            Old electronics shouldn’t live in your closet.
                        </h1>
                        <p className="max-w-[56ch] text-lg leading-relaxed text-text-muted">
                            EcoCollect connects Calgary residents with local volunteers who pick up unwanted electronics
                            and record delivery to an eligible recycling facility with a photo.
                        </p>
                        <HeroActions />
                    </div>
                    <div className="flex justify-center lg:col-span-5 lg:justify-end">
                        <RouteIllustration />
                    </div>
                </div>
            </section>

            {/* Band 2: The Last-Mile Gap */}
            <section aria-labelledby="about-why-title" className="w-full border-y border-divider bg-surface py-12 sm:py-16 lg:py-20">
                <div className={`${container} space-y-6`}>
                    <p className={eyebrow}>01 · Why we exist</p>
                    <div className="grid gap-8 md:grid-cols-12 md:gap-10">
                        <div className="space-y-5 md:col-span-5">
                            <h2 id="about-why-title" className={sectionHeading}>
                                Recycling facilities exist. Getting there is the hard part.
                            </h2>
                            <div className="flex flex-wrap items-center gap-2">
                                <RoleBadge role="resident" />
                                <RoleBadge role="volunteer" />
                            </div>
                        </div>
                        <div className="max-w-[60ch] space-y-4 leading-relaxed md:col-span-7">
                            <p>
                                Most households have a drawer of old phones, tangled chargers, or a laptop that no longer
                                turns on. Getting them to an eligible recycling facility means matching each item to a
                                drop-off location, having transportation, and finding time for the trip.
                            </p>
                            <p>
                                EcoCollect bridges that last mile through neighbor-to-neighbor pickups scheduled in
                                Calgary local time. Anyone 18 or older can register as a Resident, a Volunteer, or
                                activate both roles on a single account.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Band 3: Four-Step Pickup Journey (all 4 steps in initial SSR HTML) */}
            <section id="how-it-works" aria-labelledby="about-journey-title" className="w-full bg-bg py-12 sm:py-16 lg:py-20">
                <div className={`${container} space-y-8`}>
                    <div className="space-y-3">
                        <p className={eyebrow}>02 · How it works</p>
                        <h2 id="about-journey-title" className={sectionHeading}>
                            Four clear steps from doorstep to facility.
                        </h2>
                        <p className="max-w-[60ch] text-text-muted">
                            A completed pickup moves through four statuses, so residents and volunteers always know what
                            happens next and what information is shared at each stage. Requests can also be cancelled,
                            expire if no window is claimed, or be reported missed.
                        </p>
                    </div>

                    <ol className="divide-y divide-divider border-y border-divider">
                        {journeySteps.map((step) => (
                            <li key={step.status} className="grid gap-6 py-7 md:grid-cols-12 md:gap-8">
                                <div className="space-y-2 md:col-span-4">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <span className="text-small font-semibold tabular-nums text-text-muted">{step.number}</span>
                                        <StatusBadge status={step.status} />
                                    </div>
                                    <h3 className="text-lg font-semibold leading-snug">{step.title}</h3>
                                </div>
                                <div className="grid gap-5 sm:grid-cols-2 md:col-span-8">
                                    <div className="space-y-2">
                                        <RoleBadge role="resident" />
                                        <p className="text-small leading-relaxed text-text">{step.resident}</p>
                                    </div>
                                    <div className="space-y-2">
                                        <RoleBadge role="volunteer" />
                                        <p className="text-small leading-relaxed text-text">{step.volunteer}</p>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* Band 4: Built for Trust & Privacy (Deep Moss anchor band, non-interactive) */}
            <section aria-labelledby="about-principles-title" className="w-full bg-accent-2-900 py-14 text-on-moss sm:py-20">
                <div className={`${container} space-y-8`}>
                    <div className="space-y-3">
                        <p className="text-caption font-semibold uppercase tracking-[0.08em] text-accent-2-200">
                            03 · Privacy, safety & fairness
                        </p>
                        <h2 id="about-principles-title" className={`${sectionHeading} max-w-[26ch]`}>
                            Trust is built into the architecture, not just the policy.
                        </h2>
                    </div>

                    <ol className="divide-y divide-accent-2-700/60 border-y border-accent-2-700/60">
                        {trustPrinciples.map((principle) => (
                            <li key={principle.number} className="grid gap-3 py-6 md:grid-cols-12 md:gap-8">
                                <div className="flex items-baseline gap-3 md:col-span-5">
                                    <span className="text-small font-semibold tabular-nums text-accent-2-200">
                                        {principle.number}
                                    </span>
                                    <h3 className="text-lg font-semibold leading-snug text-on-moss">
                                        {principle.title}
                                    </h3>
                                </div>
                                <p className="max-w-[58ch] text-small leading-relaxed text-accent-2-200 md:col-span-7">
                                    {principle.description}
                                </p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* Band 5: Accepted Categories & Worked EcoPoints Example */}
            <section aria-labelledby="about-ecopoints-title" className="w-full bg-bg py-12 sm:py-16 lg:py-20">
                <div className={`${container} space-y-8`}>
                    <div className="space-y-3">
                        <p className={eyebrow}>04 · Accepted items & EcoPoints</p>
                        <h2 id="about-ecopoints-title" className={sectionHeading}>
                            Standard weights. Clear EcoPoints.
                        </h2>
                    </div>

                    <div className="grid gap-8 lg:grid-cols-12 lg:items-start lg:gap-10">
                        {/* Category standard-weight ledger */}
                        <div className="space-y-4 lg:col-span-6">
                            <h3 className="text-lg font-semibold">{categoriesHeadingText}</h3>
                            <div className="overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-rest">
                                <table className="w-full text-left text-small">
                                    <caption className="sr-only">Accepted e-waste categories and standard weights</caption>
                                    <thead className="bg-surface text-text-muted">
                                        <tr>
                                            <th scope="col" className="px-4 py-3 font-semibold">Category</th>
                                            <th scope="col" className="px-4 py-3 text-right font-semibold">Standard weight</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {acceptedCategories.map((category) => (
                                            <tr key={category.id} className="border-t border-border">
                                                <th scope="row" className="px-4 py-2.5 font-medium text-text">
                                                    {category.name}
                                                </th>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
                                                    {category.standardWeightKg.toFixed(2)} kg
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-caption text-text-muted">
                                Estimated total weight is calculated automatically as quantity × standard weight and
                                cannot be modified manually.
                            </p>
                        </div>

                        {/* Static worked EcoPoints example */}
                        <div className={`${card} space-y-5 lg:col-span-6`}>
                            <div className="space-y-1">
                                <p className={eyebrow}>Worked example</p>
                                <h3 className="text-title font-bold">
                                    {workedExample.title}
                                </h3>
                            </div>

                            <p className="text-small leading-relaxed text-text-muted">
                                On successful delivery, Volunteer EcoPoints equal{" "}
                                <strong className="font-semibold text-text">{volunteerFormulaText}</strong> and Resident
                                EcoPoints equal <strong className="font-semibold text-text">{residentFormulaText}</strong>,
                                with no rounding.
                            </p>

                            <dl className="divide-y divide-divider border-y border-divider">
                                <div className="flex flex-wrap items-center justify-between gap-2 py-3.5">
                                    <dt className="flex items-center gap-2 text-small">
                                        <RoleBadge role="volunteer" />
                                        <span className="text-text-muted">{workedExample.volunteerCalculation}</span>
                                    </dt>
                                    <dd className="text-title font-bold tabular-nums text-text">
                                        {workedExample.volunteerPoints}
                                    </dd>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 py-3.5">
                                    <dt className="flex items-center gap-2 text-small">
                                        <RoleBadge role="resident" />
                                        <span className="text-text-muted">{workedExample.residentCalculation}</span>
                                    </dt>
                                    <dd className="text-title font-bold tabular-nums text-text">
                                        {workedExample.residentPoints}
                                    </dd>
                                </div>
                            </dl>

                            <p className="text-small leading-relaxed text-text-muted">
                                <strong className="font-semibold text-text">Late-cancellation protection:</strong> If a
                                resident cancels an assignment or Assigned request after the 24-hour cutoff before the
                                selected pickup window starts and before that window ends, the assigned volunteer still
                                receives the delivery EcoPoints—except when the volunteer is also the request’s resident.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Band 6: Community Impact */}
            <section aria-labelledby="about-impact-title" className="w-full border-y border-divider bg-surface py-12 sm:py-16">
                <div className={`${container} flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between`}>
                    <div className="max-w-[56ch] space-y-3">
                        <p className={eyebrow}>05 · Community impact</p>
                        <h2 id="about-impact-title" className={sectionHeading}>
                            See what Calgary has recorded so far.
                        </h2>
                        <p className="leading-relaxed text-text-muted">
                            The public Community Impact page summarizes recorded deliveries, item counts, estimated
                            weight, and EcoPoints awarded across EcoCollect.
                        </p>
                        <ImpactSampleNote />
                    </div>
                    <div className="shrink-0">
                        <Link href="/stats" className={secondaryLinkButton}>View Community stats</Link>
                    </div>
                </div>
            </section>

            {/* Band 7: Closing Invitation & Compact Footer */}
            <section aria-labelledby="about-closing-title" className="w-full bg-surface-elevated pt-12 pb-10 sm:pt-16 sm:pb-12">
                <div className={`${container} space-y-6`}>
                    <div className="max-w-[56ch] space-y-3">
                        <h2 id="about-closing-title" className={sectionHeading}>
                            Explore the resident and volunteer workflows.
                        </h2>
                        <p className="leading-relaxed text-text-muted">
                            Create an account (open to adults 18 and older) or sign in to try creating requests,
                            claiming pickup windows, and recording deliveries. This preview uses seeded sample recycling
                            facilities until live local depots are configured.
                        </p>
                    </div>
                    <ClosingActions />

                    <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-6">
                        <div className="inline-flex items-center gap-2 text-small font-medium text-text-muted">
                            <Image src="/ecocollect-mark.png" alt="" width={24} height={25} />
                            <span>EcoCollect · Calgary, AB</span>
                        </div>
                        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-1">
                            <Link href="/about" aria-current="page" className={`${textLink} text-small`}>About</Link>
                            <Link href="/stats" className={`${textLink} text-small`}>Community stats</Link>
                            <FooterAccountLink />
                        </nav>
                    </footer>
                </div>
            </section>
        </main>
    );
}
