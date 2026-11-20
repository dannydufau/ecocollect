type Fields = Record<string, unknown>;

const required = ['username', 'email', 'password', 'firstName', 'lastName', 'publicName', 'dateOfBirth', 'role', 'termsDocumentId'];
const allowed = new Set([...required, 'address', 'preferredPostalCodes']);
const calgaryDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit',
});
const emailPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

function isObject(value: unknown): value is Fields {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isCalgaryPostalCode(code: unknown): code is string {
  return typeof code === 'string' && code.length === 6 && /^T[0-9][A-Z][0-9][A-Z][0-9]$/.test(code);
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function validateAccount(body: unknown, now: Date): Record<string, string> {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new RangeError('A valid current time is required.');
  if (!isObject(body)) return { body: 'Send an account object.' };
  const errors = new Map<string, string>();
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) errors.set(key, 'This field is not allowed.');
  }
  for (const key of required) {
    if (!Object.hasOwn(body, key)) errors.set(key, 'This field is required.');
    else if (typeof body[key] !== 'string') errors.set(key, 'Enter a string.');
    else if (body[key] === '') errors.set(key, 'This field is required.');
  }
  const validString = (key: string): boolean => typeof body[key] === 'string' && !errors.has(key);

  if (validString('username')) {
    const username = body.username as string;
    if (username.length < 3 || username.length > 50 || /[^a-z0-9_-]/.test(username)) {
      errors.set('username', 'Use 3 to 50 lowercase letters, numbers, underscores or hyphens.');
    }
  }
  if (validString('email')) {
    const email = body.email as string;
    if (email.trim() !== email || !emailPattern.test(email)) errors.set('email', 'Enter a valid email address.');
  }
  if (validString('password') && [...body.password as string].length < 6) errors.set('password', 'Use at least 6 characters.');
  for (const key of ['firstName', 'lastName', 'publicName']) {
    if (validString(key) && !(body[key] as string).trim()) errors.set(key, 'Enter a name.');
  }
  if (validString('role') && body.role !== 'resident' && body.role !== 'volunteer') errors.set('role', 'Choose resident or volunteer.');

  if (validString('dateOfBirth')) {
    if (!isDate(body.dateOfBirth)) errors.set('dateOfBirth', 'Enter a real date in YYYY-MM-DD format.');
    else {
      const parts = Object.fromEntries(calgaryDate.formatToParts(now).map(part => [part.type, part.value]));
      const today = `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
      const birth = body.dateOfBirth;
      let age = Number(parts.year) - Number(birth.slice(0, 4));
      if (today.slice(5) < birth.slice(5)) age--;
      if (birth > today) errors.set('dateOfBirth', 'Date of birth cannot be in the future.');
      else if (age < 18) errors.set('dateOfBirth', 'You must be at least 18 years old.');
    }
  }

  if (Object.hasOwn(body, 'address')) {
    if (!isObject(body.address)) errors.set('address', 'Enter a street and postal code.');
    else {
      const address = body.address;
      for (const key of Object.keys(address)) {
        if (!['street', 'postalCode', 'city'].includes(key)) errors.set(`address.${key}`, 'This field is not allowed.');
      }
      if (!Object.hasOwn(address, 'street') || typeof address.street !== 'string' || !address.street.trim()) errors.set('address.street', 'Enter a street.');
      if (!Object.hasOwn(address, 'postalCode') || !isCalgaryPostalCode(address.postalCode)) errors.set('address.postalCode', 'Enter a six-character Calgary postal code, such as T2P1J9.');
      if (Object.hasOwn(address, 'city') && address.city !== 'Calgary') errors.set('address.city', 'The city must be Calgary.');
    }
  } else if (body.role === 'resident') errors.set('address', 'An address is required for a resident.');

  if (Object.hasOwn(body, 'preferredPostalCodes')) {
    if (!Array.isArray(body.preferredPostalCodes)) errors.set('preferredPostalCodes', 'Send a list of postal codes.');
    else {
      if (body.preferredPostalCodes.length > 3) errors.set('preferredPostalCodes', 'Choose at most 3 postal codes.');
      const seen = new Set<string>();
      body.preferredPostalCodes.forEach((code, index) => {
        const key = `preferredPostalCodes[${index}]`;
        if (!isCalgaryPostalCode(code)) errors.set(key, 'Enter a six-character Calgary postal code, such as T2P1J9.');
        else if (seen.has(code)) errors.set(key, 'This postal code is already selected.');
        else seen.add(code);
      });
    }
  }
  return Object.fromEntries(errors);
}
