// Card: the prototype's .card, a beige-surface block with soft corners and no border
export const card = "rounded-[32px] bg-surface p-[17.6px]";
// Input: the prototype's .input, a pill with a 1px darker border (3 to 1 against the page) on the surface color
const control = "min-h-11 w-full border border-neutral-600 bg-surface px-[14px] py-2 text-base text-text aria-invalid:border-danger";
export const input = `${control} rounded-full`;
// A multi-line box would look odd as a pill, the prototype keeps it at the medium radius
export const textarea = `${control} rounded-2xl`;
