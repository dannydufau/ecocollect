'use strict';

const { notificationUuid } = require('./ids');

/*
 * Event handlers for the notification service: turn a domain event into deliveries,
 * one per recipient: the SSE signal, the notification, and whether to also push it.
 * Plain data, no I/O; the caller delivers them.
 */

const SIGNAL = Object.freeze({
  REQUEST_CREATED: 'REQUEST_CREATED',
  NEW_MATCHING_REQUEST: 'NEW_MATCHING_REQUEST',
});

/*
 * Per notification type: its title, the page its url opens, and whether it also goes by Web Push.
 * endedAs: only on a volunteer's notification about an assignment that ended without delivery.
 * The volunteer can no longer open that request, so the url is the history page with no id,
 * and the body names only the window: "Your pickup on Nov 22, 14:00–15:00 was <endedAs>".
 */
const NOTIFICATION_TYPES = Object.freeze({
  REQUEST_CREATED: {
    title: 'Request posted', path: '/resident/requests/', push: false,
  },
  NEW_MATCHING_REQUEST: {
    title: 'New pickup near you', path: '/volunteer/requests/', push: true,
  },
  REQUEST_UPDATED_RESIDENT: {
    title: 'Request updated', path: '/resident/requests/', push: false,
  },
  REQUEST_ASSIGNED_RESIDENT: {
    title: 'Pickup accepted', path: '/resident/requests/', push: true,
  },
  REQUEST_ASSIGNED_VOLUNTEER: {
    title: 'You accepted a pickup', path: '/volunteer/requests/', push: false,
  },
  REQUEST_COLLECTED_RESIDENT: {
    title: 'You confirmed the pickup', path: '/resident/requests/', push: false,
  },
  REQUEST_COLLECTED_VOLUNTEER: {
    title: 'Pickup confirmed', path: '/volunteer/requests/', push: true,
  },
  REQUEST_DELIVERED_RESIDENT: {
    title: 'Items delivered', path: '/resident/requests/', push: true,
  },
  REQUEST_DELIVERED_VOLUNTEER: {
    title: 'You recorded a delivery', path: '/volunteer/requests/', push: false,
  },
  ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT: {
    title: 'You cancelled the pickup', path: '/resident/requests/', push: false,
  },
  ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER: {
    title: 'Pickup cancelled', path: '/volunteer/history', push: true, endedAs: 'cancelled',
  },
  ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT: {
    title: 'Volunteer cancelled the pickup', path: '/resident/requests/', push: true,
  },
  ASSIGNMENT_CANCELLED_BY_VOLUNTEER_VOLUNTEER: {
    title: 'You cancelled a pickup', path: '/volunteer/history', push: false, endedAs: 'cancelled',
  },
  ASSIGNMENT_MISSED_RESIDENT: {
    title: 'You reported a missed pickup', path: '/resident/requests/', push: false,
  },
  ASSIGNMENT_MISSED_VOLUNTEER: {
    title: 'Pickup missed', path: '/volunteer/history', push: true, endedAs: 'marked as missed',
  },
  // Award types: always pushed, and they open the EcoPoints page (no id). See awardsEarned().
  ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT: {
    title: 'EcoPoints earned', path: '/ecopoints', push: true,
  },
  ECOPOINTS_AWARDED_ON_DELIVERY_VOLUNTEER: {
    title: 'EcoPoints earned', path: '/ecopoints', push: true,
  },
  ECOPOINTS_AWARDED_ON_ASSIGNMENT_CANCELLATION_VOLUNTEER: {
    title: 'EcoPoints earned', path: '/ecopoints', push: true,
  },
  REQUEST_CANCELLED_RESIDENT: {
    title: 'Request cancelled', path: '/resident/requests/', push: false,
  },
  REQUEST_EXPIRED_RESIDENT: {
    title: 'Request expired', path: '/resident/requests/', push: true,
  },
});

/*
 * The only shape a signal may have: type + requestId. Built from scratch,
 * never by copying event data, so nothing else (e.g. a street address) can
 * leak to the browser even if the event carries it.
 */
function signal(type, requestId) {
  return { type, requestId };
}

// The text of a request notification: only quantity, category and postal code, never an address.
function describe(request) {
  const { quantity, categoryName, postalCode } = request;
  if (!quantity || !categoryName || !postalCode) return 'Pickup request';
  return `${quantity} * ${categoryName} in ${postalCode}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A one-hour pickup window as text: { date: '2026-11-22', startHour: 14 } -> 'Nov 22, 14:00–15:00'.
// The date and hour are already local (contract), so no time zone is applied.
function describeWindow({ date, startHour }) {
  const [, month, day] = date.split('-').map(Number);
  const hour = (h) => `${String(h).padStart(2, '0')}:00`;
  return `${MONTHS[month - 1]} ${day}, ${hour(startHour)}–${hour(startHour + 1)}`;
}

/*
 * The body of a type with endedAs. The stored list has no window (pass none) and says
 * only "Your pickup was cancelled"; either way it names no request details.
 */
function describeEnded(endedAs, window) {
  return window ? `Your pickup on ${describeWindow(window)} was ${endedAs}` : `Your pickup was ${endedAs}`;
}

/*
 * One notification, in the shape of the SSE notification message.
 * The id comes from the event and recipient, so a redelivered event gives the same id.
 */
function notification(envelope, uid, type, request) {
  const { title, path, push, endedAs } = NOTIFICATION_TYPES[type];
  return {
    notification: {
      notificationId: notificationUuid(envelope.eventId, uid, type),
      type,
      requestId: request.requestId,
      awardId: null,
      title,
      body: endedAs ? describeEnded(endedAs, envelope.data.assignment.window) : describe(request),
      url: endedAs ? path : `${path}${request.requestId}`,
      createdAt: envelope.occurredAt,
    },
    push,
  };
}

/**
 * RequestCreated: a delivery to the resident who made the request, and one
 * to each matched volunteer.
 *
 * @param {object} envelope  { eventId, type: 'RequestCreated', occurredAt, data }
 * @returns {Array<{ uid: string, signal: object, notification: object, push: boolean }>}
 */
function requestCreated(envelope) {
  const data = (envelope && envelope.data) || {};
  // v2 moved the request fields into data.request; v1 had them directly in data.
  const request = data.request ?? data;
  const { requestId, residentUid } = request;

  // Without a requestId the frontend can't refetch anything; throw so the
  // subscriber logs it and rejects it, so RabbitMQ retries it.
  if (typeof requestId !== 'string' || requestId === '') {
    throw new Error('RequestCreated without a requestId');
  }
  // The notification id is built from it.
  if (typeof envelope.eventId !== 'string' || envelope.eventId === '') {
    throw new Error('RequestCreated without an eventId');
  }

  const out = [];

  if (residentUid) {
    out.push({
      uid: residentUid,
      signal: signal(SIGNAL.REQUEST_CREATED, requestId),
      ...notification(envelope, residentUid, SIGNAL.REQUEST_CREATED, request),
    });
  }

  // Tolerates a missing list; the Set gives each volunteer one delivery even if listed twice.
  const volunteers = new Set(Array.isArray(data.matchedVolunteerUids) ? data.matchedVolunteerUids : []);
  for (const uid of volunteers) {
    if (!uid) continue;
    out.push({
      uid,
      signal: signal(SIGNAL.NEW_MATCHING_REQUEST, requestId),
      ...notification(envelope, uid, SIGNAL.NEW_MATCHING_REQUEST, request),
    });
  }

  return out;
}

/*
 * The request snapshot that every later request event carries in data.request.
 * Throws without the ids, step or action the notifications are built from, so the
 * subscriber retries the event and, if it never gets better, dead-letters it.
 */
function snapshotOf(envelope, eventName) {
  const request = envelope?.data?.request;
  if (typeof request?.requestId !== 'string' || request.requestId === '') {
    throw new Error(`${eventName} without a requestId`);
  }
  if (typeof envelope.eventId !== 'string' || envelope.eventId === '') {
    throw new Error(`${eventName} without an eventId`);
  }
  if (!Number.isInteger(request.requestSeq) || request.requestSeq < 1) {
    throw new Error(`${eventName} without a requestSeq`);
  }
  if (typeof request.transitionId !== 'string' || request.transitionId === '') {
    throw new Error(`${eventName} without a transitionId`);
  }
  return request;
}

// One delivery with no Oct 28 signal (the frontend's signal only knows the two creation types).
function delivery(envelope, uid, type, request) {
  return { uid, signal: null, ...notification(envelope, uid, type, request) };
}

// REQUEST_UPDATED_RESIDENT's title, by the update's reason (stored in request_update_event).
const UPDATE_TITLES = Object.freeze({ edited: 'Request updated', reopened: 'Request reopened' });

/*
 * RequestUpdated (E2): the resident's own edit, or a reopen after an assignment was cancelled.
 * The resident gets a record, no push (on a reopen the E6/E7 just before it carries the push).
 * Each matched volunteer gets a fresh NEW_MATCHING_REQUEST with a push, like on E1.
 */
function requestUpdated(envelope) {
  const request = snapshotOf(envelope, 'RequestUpdated');
  const { reason } = envelope.data;
  if (!(reason in UPDATE_TITLES)) {
    throw new Error(`RequestUpdated with an unknown reason: ${reason}`);
  }

  const resident = delivery(envelope, request.residentUid, 'REQUEST_UPDATED_RESIDENT', request);
  resident.notification.title = UPDATE_TITLES[reason];
  const out = [resident];

  // Same as E1: a missing list means nobody, and each volunteer gets one delivery.
  const volunteers = new Set(Array.isArray(envelope.data.matchedVolunteerUids) ? envelope.data.matchedVolunteerUids : []);
  for (const uid of volunteers) {
    if (!uid) continue;
    out.push(delivery(envelope, uid, 'NEW_MATCHING_REQUEST', request));
  }
  return out;
}

// RequestAssigned (E3): the resident hears a volunteer accepted (push); the volunteer gets a record.
function requestAssigned(envelope) {
  const request = snapshotOf(envelope, 'RequestAssigned');
  const out = [delivery(envelope, request.residentUid, 'REQUEST_ASSIGNED_RESIDENT', request)];
  const volunteerUid = envelope.data.assignment?.volunteerUid;
  if (volunteerUid) out.push(delivery(envelope, volunteerUid, 'REQUEST_ASSIGNED_VOLUNTEER', request));
  return out;
}

/*
 * The assignment snapshot an assignment event carries in data.assignment. Throws without the
 * volunteer or the window, which the volunteer's notification needs, so the subscriber retries.
 */
function assignmentOf(envelope, eventName) {
  const assignment = envelope.data.assignment;
  if (typeof assignment?.volunteerUid !== 'string' || assignment.volunteerUid === '') {
    throw new Error(`${eventName} without a volunteerUid`);
  }
  if (typeof assignment.window?.date !== 'string' || !Number.isInteger(assignment.window.startHour)) {
    throw new Error(`${eventName} without a window`);
  }
  return assignment;
}

/*
 * A handler for an assignment event: one notification for the resident and one for the
 * assignment's volunteer. Who is pushed is set per type in NOTIFICATION_TYPES.
 */
function bothSides(eventName, residentType, volunteerType) {
  return (envelope) => {
    const request = snapshotOf(envelope, eventName);
    const { volunteerUid } = assignmentOf(envelope, eventName);
    return [
      delivery(envelope, request.residentUid, residentType, request),
      delivery(envelope, volunteerUid, volunteerType, request),
    ];
  };
}

// E4: the resident confirmed the collection, so the volunteer is pushed.
const assignmentCollected = bothSides(
  'RequestAssignmentCollected', 'REQUEST_COLLECTED_RESIDENT', 'REQUEST_COLLECTED_VOLUNTEER');
// E5: the volunteer recorded the delivery, so the resident is pushed.
const assignmentDelivered = bothSides(
  'RequestAssignmentDelivered', 'REQUEST_DELIVERED_RESIDENT', 'REQUEST_DELIVERED_VOLUNTEER');
// E6: the resident cancelled, so the volunteer is pushed.
const assignmentCancelledByResident = bothSides(
  'RequestAssignmentCancelledResident', 'ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT', 'ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER');
// E7: the volunteer cancelled, so the resident is pushed.
const assignmentCancelledByVolunteer = bothSides(
  'RequestAssignmentCancelledVolunteer', 'ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT', 'ASSIGNMENT_CANCELLED_BY_VOLUNTEER_VOLUNTEER');
// E8: the resident reported the pickup missed, so the volunteer is pushed.
const assignmentMissed = bothSides(
  'RequestAssignmentMissed', 'ASSIGNMENT_MISSED_RESIDENT', 'ASSIGNMENT_MISSED_VOLUNTEER');

// Award notification type, by the event's kind and the award's earnedAs.
const AWARD_TYPES = Object.freeze({
  delivery: {
    resident: 'ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT',
    volunteer: 'ECOPOINTS_AWARDED_ON_DELIVERY_VOLUNTEER',
  },
  cancellation: {
    volunteer: 'ECOPOINTS_AWARDED_ON_ASSIGNMENT_CANCELLATION_VOLUNTEER',
  },
});

// Points as text: 26.00 -> '26', 13.50 -> '13.5' (NUMERIC(23,2) in the database).
function formatPoints(points) {
  return String(Number(Number(points).toFixed(2)));
}

/*
 * The title and body of an award notification. A cancellation award names no request
 * details: the volunteer's assignment ended, so they can no longer open the request (Q8).
 */
function describeAward(type, points, request) {
  const text = formatPoints(points);
  const title = `You earned ${text} ${text === '1' ? 'EcoPoint' : 'EcoPoints'}`;
  if (type === AWARD_TYPES.cancellation.volunteer) return { title, body: 'For a pickup cancelled late' };
  const { quantity, categoryName } = request;
  return { title, body: quantity && categoryName ? `For ${quantity} * ${categoryName} delivered` : 'For a delivery' };
}

/*
 * PointsAwardedDelivery (E11, kind 'delivery') and PointsAwardedCancellation (E12, kind
 * 'cancellation'): one pushed notification per award, to the award's account.
 * Throws without the ids or awards, or for an award the kind doesn't have, so the subscriber retries.
 */
function awardsEarned(kind) {
  const eventName = kind === 'delivery' ? 'PointsAwardedDelivery' : 'PointsAwardedCancellation';
  return (envelope) => {
    const data = envelope?.data ?? {};
    if (typeof envelope.eventId !== 'string' || envelope.eventId === '') throw new Error(`${eventName} without an eventId`);
    if (typeof data.requestId !== 'string' || data.requestId === '') throw new Error(`${eventName} without a requestId`);
    if (!Array.isArray(data.awards) || data.awards.length === 0) throw new Error(`${eventName} without awards`);

    return data.awards.map((award) => {
      const type = AWARD_TYPES[kind][award?.earnedAs];
      if (!type) throw new Error(`${eventName} with an award earned as ${award?.earnedAs}`);
      if (typeof award.awardId !== 'string' || award.awardId === '' || typeof award.accountId !== 'string' || award.accountId === '') {
        throw new Error(`${eventName} with an award without its awardId or accountId`);
      }
      const { title, body } = describeAward(type, award.points, data);
      return {
        uid: award.accountId,
        awardId: award.awardId,
        signal: null,
        notification: {
          // One notification per award (award_notification_uq1), so its id comes from the award.
          notificationId: notificationUuid(award.awardId, award.accountId, type),
          type,
          requestId: data.requestId,
          awardId: award.awardId,
          title,
          body,
          url: NOTIFICATION_TYPES[type].path,
          createdAt: envelope.occurredAt,
        },
        push: NOTIFICATION_TYPES[type].push,
      };
    });
  };
}

// RequestCancelled (E9): the resident cancelled, so they get a record and no push.
function requestCancelled(envelope) {
  const request = snapshotOf(envelope, 'RequestCancelled');
  return [delivery(envelope, request.residentUid, 'REQUEST_CANCELLED_RESIDENT', request)];
}

// RequestExpired (E10): nobody acted, so the resident is pushed.
function requestExpired(envelope) {
  const request = snapshotOf(envelope, 'RequestExpired');
  return [delivery(envelope, request.residentUid, 'REQUEST_EXPIRED_RESIDENT', request)];
}

/*
 * What to push silently over phone notifications this event made stale (contract 13.2): the
 * same tag replaces them. One per account, and none for an account this event already pushes.
 * An account with its own notification from this event sees that; other volunteers are told
 * the pickup is gone.
 */
function replacements(request, deliveries, expired) {
  const pushedNow = new Set(deliveries.filter((d) => d.push).map((d) => d.uid));
  const byUid = new Map();
  for (const { accountId, notificationId, replace } of expired) {
    if (!replace || pushedNow.has(accountId)) continue;
    const own = deliveries.find((d) => d.uid === accountId)?.notification;
    byUid.set(accountId, own ?? {
      notificationId,
      requestId: request.requestId,
      awardId: null,
      title: 'This pickup is no longer available',
      body: describe(request),
      url: `${NOTIFICATION_TYPES.NEW_MATCHING_REQUEST.path}${request.requestId}`,
    });
  }
  return [...byUid].map(([uid, notification]) => ({ uid, notification }));
}

module.exports = {
  requestCreated, requestUpdated, requestAssigned, assignmentCollected, assignmentDelivered,
  assignmentCancelledByResident, assignmentCancelledByVolunteer, assignmentMissed, requestCancelled, requestExpired,
  awardsEarned, describeAward, replacements, describe, describeEnded, SIGNAL, NOTIFICATION_TYPES, UPDATE_TITLES,
};
