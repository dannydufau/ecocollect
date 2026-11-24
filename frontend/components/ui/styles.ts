import { buttonClass } from "./button";

// The page heading (h1): 30px on a phone, up to 40px on a wide screen
export const pageTitle = "text-[length:clamp(1.875rem,5vw,2.5rem)]";
// One width for the header and every page, so their left edges line up. A narrow page puts its own max width on a child.
export const pageWidth = "mx-auto w-full max-w-4xl min-w-0";
// The card shape without colours, for a card with its own background and border
export const panel = "rounded-2xl border p-4 shadow-rest sm:p-5";
export const card = `${panel} border-border bg-surface-elevated`;
// Raised fill with a strong border. Invalid adds a ring, not width, so the field does not change size. Disabled and read-only are on the inset surface.
const control = "min-h-11 w-full rounded-xl border border-border-strong bg-surface-elevated px-3.5 py-2 text-base text-text focus:border-accent-700 aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-muted [&[readonly]]:bg-surface";
export const input = control;
export const textarea = control;
export const select = `${control} select-chevron`;
// The shared base of the status and role badges, so they line up when shown together
export const badge = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-caption font-semibold";
// A link that looks like the primary Button, and a plain text link (accent-700 has enough contrast on the page color)
export const linkButton = `inline-flex items-center justify-center ${buttonClass()}`;
export const secondaryLinkButton = `inline-flex items-center justify-center ${buttonClass("secondary")}`;
// The buttons of a request page, in order. Full width and stacked below 640 px, side by side from there.
export const actionGroup = "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start [&>a]:w-full [&>button]:w-full sm:[&>a]:w-auto sm:[&>button]:w-auto";
// Postal codes and @handles
export const identifier = "text-small font-semibold tabular-nums tracking-wide";
export const textLink = "inline-flex min-h-11 items-center text-accent-700 underline underline-offset-4";
// A list card that can be opened. Put stretchedLink on its title link so the whole card is tappable.
export const clickableCard = `${card} soft-transition relative min-w-0 hover:shadow-hover active:shadow-rest has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent-700`;
// The empty ::after stretches the link over the whole card
export const stretchedLink = "min-w-0 break-words text-lg font-bold text-text no-underline after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline-none";
