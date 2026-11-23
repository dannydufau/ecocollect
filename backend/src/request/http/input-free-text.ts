// The optional free text a user sends: the `reason` of Q10 cancel, Q12 cancel
// assignment and Q14 report missed, and the `notes` of Q4 and Q9. The one place
// that knows their length limit and their blank rule. The database stores what
// blankToNull returns and has no limit of its own.
import * as v from 'valibot';

// The contract gives reason and notes the same maxLength. If they ever differ,
// split this into one limit per field.
export const FREE_TEXT_MAX_CHARS = 500;

// Counted in code points ([...s].length), as JSON Schema's maxLength and
// Postgres's char_length count. Not v.maxLength: it counts UTF-16 units, so an
// emoji would count twice. Checked on the string as sent, before trimming.
export const fitsFreeTextLimit = v.check((s: string) => [...s].length <= FREE_TEXT_MAX_CHARS,
  `must be at most ${FREE_TEXT_MAX_CHARS} characters`);

export const Reason = v.pipe(v.string('must be text'), fitsFreeTextLimit);

// Not sent, null, empty or only whitespace -> null; anything else is kept as sent.
export function blankToNull(text: string | null | undefined): string | null {
  if (text === undefined || text === null || text.trim() === '') return null;
  return text;
}
