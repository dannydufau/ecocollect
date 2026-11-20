// Q5-Q7 GET /api/requests query checks (listRequests in openapi.yaml), before
// any database call. One path, three views: view decides the role and which
// filter parameter is allowed.
import type { Request } from 'express';
import { validationFailed } from './errors.ts';
import type { Role } from './gateway-user.ts';

// common.yaml RequestStatus.
export const REQUEST_STATUSES: readonly string[] =
  ['Open', 'Assigned', 'Collected', 'Delivered', 'Cancelled', 'Expired', 'Missed'];

export type View = 'mine' | 'available' | 'volunteer';

// The role each view needs and the one filter it accepts.
const VIEWS: Record<View, { role: Role; filter: string }> = {
  mine:      { role: 'resident',  filter: 'status' },
  available: { role: 'volunteer', filter: 'postalCodes' },
  volunteer: { role: 'volunteer', filter: 'assignmentStatus' },
};

// One value or none. Express gives a repeated parameter (?a=1&a=2) as an
// array; the contract has one value (comma-separated for the filters).
function single(req: Request, name: string): string | undefined {
  const value = req.query[name];
  if (value === undefined || typeof value === 'string') return value;
  throw validationFailed({ [name]: 'must be given only once' });
}

// Called first by the GET handler: the view and the role it needs. Missing or
// unknown view -> 400.
export function parseView(req: Request): { view: View; role: Role } {
  const view = single(req, 'view');
  if (view !== 'mine' && view !== 'available' && view !== 'volunteer') {
    throw validationFailed({ view: 'must be one of mine, available, volunteer' });
  }
  return { view, role: VIEWS[view].role };
}

// Another view's filter is an error, not silently ignored, so a client bug
// shows up. Every such parameter is reported.
function refuseOtherFilters(req: Request, view: View): void {
  const fields: Record<string, string> = {};
  for (const [other, { filter }] of Object.entries(VIEWS)) {
    if (other !== view && req.query[filter] !== undefined) {
      fields[filter] = `only allowed with view=${other}`;
    }
  }
  if (Object.keys(fields).length > 0) throw validationFailed(fields);
}

// view=mine: the status filter, null = all. Each name must be a RequestStatus;
// spaces around a name are ignored, an empty name (status= or Open,,) is not.
// Called after the role check, so a caller without the role gets 403, not 400.
export function parseMineQuery(req: Request): { statuses: string[] | null } {
  refuseOtherFilters(req, 'mine');
  const status = single(req, 'status');
  if (status === undefined) return { statuses: null };
  const statuses = status.split(',').map((s) => s.trim());
  if (statuses.some((s) => !REQUEST_STATUSES.includes(s))) {
    throw validationFailed({ status: `each must be one of ${REQUEST_STATUSES.join(', ')}` });
  }
  return { statuses };
}
