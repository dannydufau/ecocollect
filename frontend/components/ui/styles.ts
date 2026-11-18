// The page heading (h1): 30px on a phone, up to 40px on a wide screen
export const pageTitle = "text-[length:clamp(30px,5vw,40px)]";
// A soft block with no border, like the prototype's card
export const card = "rounded-[32px] bg-surface p-[17.6px]";
// A pill with a thin dark border. The fill is lighter than the card so it stands out on one.
const control = "min-h-11 w-full border border-neutral-600 bg-neutral-100 px-[14px] py-2 text-base text-text aria-invalid:border-danger";
export const input = `${control} rounded-full`;
// A multi-line box looks odd as a pill
export const textarea = `${control} rounded-2xl`;
// A link that looks like the primary Button, and a plain text link (accent-700 has enough contrast on the page color)
export const linkButton = "inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 py-2 font-[family-name:var(--font-heading)] text-bg hover:bg-accent-700 active:bg-accent-800";
export const textLink = "inline-flex min-h-11 items-center text-accent-700 underline underline-offset-4";
// A list card that can be opened. Put stretchedLink on its title link so the whole card is tappable.
export const clickableCard = `${card} relative min-w-0 hover:shadow-[0_3px_10px_rgba(46,43,37,0.16)] has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent`;
// The empty ::after stretches the link over the whole card
export const stretchedLink = "min-w-0 break-words font-[family-name:var(--font-heading)] text-[21px] text-text no-underline after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline-none";
