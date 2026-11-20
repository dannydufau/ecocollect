import { HttpError } from '../http/errors.ts';

type Role = 'resident' | 'volunteer';
type AccountInput = { username: string; email: string; password: string; displayName: string; role: Role };
type FirebaseUser = { uid: string; metadata?: { creationTime?: string } };
type FirebaseAuth = {
  createUser(input: { uid: string; email: string; password: string; displayName: string }): Promise<FirebaseUser>;
  getUser(uid: string): Promise<FirebaseUser>;
  getUserByEmail(email: string): Promise<FirebaseUser>;
  setCustomUserClaims(uid: string, claims: { roles: Role[] }): Promise<void>;
  deleteUser(uid: string): Promise<void>;
  updateUser(uid: string, changes: { disabled: boolean }): Promise<unknown>;
  revokeRefreshTokens(uid: string): Promise<void>;
};
type CreateAuth = Pick<FirebaseAuth, 'createUser' | 'getUser' | 'getUserByEmail' | 'setCustomUserClaims' | 'deleteUser'>;

export class UsernameTaken extends HttpError {
  constructor() {
    super(409, 'username_taken', 'This username is already taken.');
    this.name = 'UsernameTaken';
  }
}

export class EmailTaken extends HttpError {
  constructor() {
    super(409, 'email_taken', 'This email is already registered.');
    this.name = 'EmailTaken';
  }
}

function conflictFor(error: unknown): UsernameTaken | EmailTaken | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    if (error.code === 'auth/uid-already-exists') return new UsernameTaken();
    if (error.code === 'auth/email-already-exists') return new EmailTaken();
  }
}

function checkRoles(roles: readonly Role[]): void {
  if (!Array.isArray(roles) || roles.length < 1 || roles.length > 2 || new Set(roles).size !== roles.length ||
      roles.some(role => role !== 'resident' && role !== 'volunteer')) {
    throw new TypeError('Choose one or both account roles without duplicates.');
  }
}

export async function setRoles(auth: Pick<FirebaseAuth, 'setCustomUserClaims'>, uid: string, roles: readonly Role[]): Promise<void> {
  checkRoles(roles);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await auth.setCustomUserClaims(uid, { roles: [...roles] });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

export async function createAccountUser(
  auth: CreateAuth,
  accountExists: (uid: string) => Promise<boolean>,
  input: AccountInput,
  now: Date,
): Promise<FirebaseUser> {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new RangeError('A valid database time is required.');
  const nowMs = now.getTime();
  checkRoles([input.role]);
  const request = { uid: input.username, email: input.email, password: input.password, displayName: input.displayName };
  let user: FirebaseUser;
  try {
    user = await auth.createUser(request);
  } catch (error) {
    const conflict = conflictFor(error);
    if (!conflict) throw error;
    const existing = conflict instanceof UsernameTaken
      ? await auth.getUser(input.username)
      : await auth.getUserByEmail(input.email);
    const createdAt = Date.parse(existing.metadata?.creationTime ?? '');
    if (!Number.isFinite(createdAt) || nowMs - createdAt <= 10 * 60 * 1000) {
      throw conflict;
    }
    if (await accountExists(existing.uid) !== false) throw conflict;
    await auth.deleteUser(existing.uid);
    try {
      user = await auth.createUser(request);
    } catch (retryError) {
      throw conflictFor(retryError) ?? retryError;
    }
  }

  try {
    await setRoles(auth, user.uid, [input.role]);
  } catch (claimsError) {
    try {
      await auth.deleteUser(user.uid);
    } catch (cleanupError) {
      throw new AggregateError([claimsError, cleanupError], 'Could not set account roles or remove the new Firebase account.');
    }
    throw claimsError;
  }
  return user;
}

export async function disableUser(auth: Pick<FirebaseAuth, 'updateUser' | 'revokeRefreshTokens'>, uid: string): Promise<void> {
  await auth.updateUser(uid, { disabled: true });
  await auth.revokeRefreshTokens(uid);
}

export async function enableUser(auth: Pick<FirebaseAuth, 'updateUser'>, uid: string): Promise<void> {
  await auth.updateUser(uid, { disabled: false });
}
