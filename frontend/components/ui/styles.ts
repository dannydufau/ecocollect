// The page heading (h1): 30px on a phone, up to 40px on a wide screen
export const pageTitle = "text-[length:clamp(1.875rem,5vw,2.5rem)]";
// The card shape without colours, for a card with its own background and border
export const panel = "rounded-2xl border p-5 shadow-rest";
export const card = `${panel} border-border bg-surface-elevated`;
const control = "min-h-11 w-full rounded-xl border border-border-strong bg-neutral-100 px-3.5 py-2 text-base text-text aria-invalid:border-danger";
export const input = control;
export const textarea = control;
// A link that looks like the primary Button, and a plain text link (accent-700 has enough contrast on the page color)
export const linkButton = "soft-transition inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-700 active:bg-accent-800";
export const secondaryLinkButton = "soft-transition inline-flex min-h-11 items-center rounded-full border border-neutral-600 px-5 py-2 font-semibold text-text hover:bg-text/10";
// Postal codes and @handles
export const mono = "font-mono text-sm font-semibold";
export const textLink = "inline-flex min-h-11 items-center text-accent-700 underline underline-offset-4";
// A list card that can be opened. Put stretchedLink on its title link so the whole card is tappable.
export const clickableCard = `${card} soft-transition relative min-w-0 hover:shadow-hover has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent-700`;
// The empty ::after stretches the link over the whole card
export const stretchedLink = "min-w-0 break-words text-lg font-bold text-text no-underline after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline-none";
