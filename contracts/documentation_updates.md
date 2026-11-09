# EcoCollect: Documentation updates after the final contracts (Nov 9)

What has to change in the six source documents so they match `communication_contracts_final.md` (draft 2): Final FRs work, Final NFRs work, Final User Stories work, the ER diagram (with its business rules), the EDA diagram, and Architecture Diagram work (EDA flows). The logical model, physical model, final write-ups and repository are built on top of these and aren't listed. Grouped by document. "Contract §" points to the section in the contract that explains why.

Decisions behind these changes:
- Auth and profile management merged into one **User Service**.
- **Missed** is a final status. Reporting a missed pickup can reschedule it as a new request linked to the missed one.
- Every service **reads** every table; each table has **one writer**.
- Item photos are visible to volunteers; delivery photos stay private; GPS data is removed before upload.
- Notifications can be **expired** and **read**.
- Demo mode runs as a **separate copy** of the real system.
- The Cleanup Service schedules expiry with a **job table** checked every 30 s, and deletes expired notifications through an event.

## 1. Functional requirements (tab "Final FRs work")

| FR | Change | Contract § |
|---|---|---|
| FR04 | Add: "Users can deactivate their account when they own no Open, Assigned or Collected request and have no active assignment." (Deactivation is in the contract and in BR44 but in no FR) | 5.1 U9 |
| FR06 | Add: "Photos are visible to the request owner and to Volunteers; location data is removed from photos before upload." | 6.0, 5.2 Q8 |
| FR10 | "including requests reopened after Volunteer assignment cancellation or missed-pickup reporting" → "including requests reopened after an assignment cancellation" | 12.3, 12.5 |
| FR16 | Replace with: "The system shall allow the Resident to report a missed pickup after the selected pickup window has ended, provided that the request is Assigned. The request becomes Missed. While reporting, the Resident may provide 1 to 3 new pickup windows to reschedule; the system then creates a new pickup request with the same items, linked to the missed one." | 12.5 |
| FR17 | Add: "The delivery photo is visible only to the request owner and the delivering Volunteer." | 5.2 Q8 |
| FR19 | Add: "Users can mark notifications as read. Notifications that no longer reflect a request's current state are marked expired and removed from the user's list and device." | 13.2, 5.4 N4–N5 |
| FR24 | Optional clarification: "Demo Mode runs as a separate copy of the system with its own data, shared by demo visitors and reset daily." | 17 |

## 2. Non-functional requirements (tab "Final NFRs work")

| NFR | Change | Contract § |
|---|---|---|
| NFR01 | Optional: list the components as the services now named: User, Request, Notification, Reward (EcoPoints and statistics), Cleanup | 1 |
| NFR03 | Optional, as acceptance criteria: location metadata removed from uploaded photos; item photos visible only to the owner and Volunteers; delivery photos only to the owner and delivering Volunteer; photo links signed and short-lived; no street address or photo link in events, SSE, push or lists | Conventions, 6 |
| NFR06 | Optional: name the mechanisms (outbox with publisher confirms, processed-event records, one active assignment per request, one award per assignment per role, `Idempotency-Key` on request creation) | 9, 15.4, Q4 |

## 3. User stories (tab "Final User Stories work")

| Story | Change |
|---|---|
| FR10 story | "so that I can correct details or reschedule if a pickup is cancelled or missed" → "… if an assignment is cancelled" |
| FR16 story | "so that my eligible request can be reopened for another Volunteer" → "so that a new pickup request with the same items is created for another Volunteer" |
| FR19 stories | Optional new story: "As a registered user, I want to mark notifications as read, so that I can tell new updates from ones I've seen." |
| FR04 stories | Optional new story: "As a registered user, I want to deactivate my account, so that I can leave EcoCollect while my contribution history is kept." |
| FR06 story | No change: it is now consistent with the photo rules (Volunteers can see item photos) |

## 4. Business rules (note in the ER diagram)

| BR | Change |
|---|---|
| BR18 | Status list: add **Missed** → "Open, Assigned, Collected, Delivered, Cancelled, Expired, Missed" |
| BR22 | Replace with: "An ASSIGNMENT can be cancelled or reported missed only before Collected_At is set. A missed pickup can be reported only after the selected window ends. Reporting a missed pickup marks the PICKUP_REQUEST Missed, a final status." (Drop the sentence about missed pickups after Expires_At becoming Expired) |
| BR32 | "before Expires_At" is circular now that Expires_At depends on the windows → "each window starts in the future and ends no later than Created_At + 30 days" |
| BR33 | Last clause: "Reopening after a missed pickup doesn't reset it" → "Reopening after an assignment cancellation doesn't reset it." Keep your FR20 update (Expires_At = the earlier of Created_At + 30 days and the end of the last active window) |
| BR35 | Keep the reference to BR47 |
| BR41, BR42 | Remove (CLEANUP_RECORD is gone). Decide whether to renumber or leave the gap |
| BR43 | Add: "Points are stored with 2 decimals." |
| New | **Rescheduling:** "A Missed PICKUP_REQUEST can be rescheduled once, while reporting the miss, by creating a new PICKUP_REQUEST that references it. The new request copies the category, quantity, notes and photo; takes the address from the profile; records a new terms acceptance; and has its own Created_At and Expires_At." |
| New | **Photo visibility:** "An item photo is visible to the request owner and to Volunteers while the request is Open, then to the owner and the assigned Volunteer. A delivery photo is visible only to the owner and the delivering Volunteer. Location metadata is removed before upload. A photo file is deleted only when no request references it." |
| New | **Notification expiry:** "A NOTIFICATION about a request is expired when that request moves past the state it describes. Expired notifications are hidden and deleted daily. EcoPoints notifications never expire." |
| New | **Read status:** "Is_Read is set by the user (one notification or all)." (Replaces the red note "Set by client on the front-end") |
| New | **Deactivation guard:** "An account can't be deactivated while it owns an Open, Assigned or Collected request or has an active assignment." |
| New | **Terms version:** "A TERMS_ACCEPTANCE must reference the current TERMS_DOCUMENT at the time of acceptance." |
| Red notes | Most are already covered by BR3–BR9, BR20, BR31, BR32, BR36, BR46, BR48. Rewrite or drop these: NOTIFICATION "A flag to track the sent status isn't reliable…" (replaced by the outbox and the new Pushed_At attribute); ECOPOINTS_AWARD "Formula, Role keep points traceable" → "Formula and the EARNS_AS relationship keep points traceable"; NOTIFICATION metadata note (see section 5) |

## 5. ER diagram (conceptual)

| Item | Change | Contract § |
|---|---|---|
| Red items | Remove as planned: CLEANUP_RECORD and OPERATES_ON, ECOPOINTS_AWARD.Role, the red relationships | – |
| Entity count | After removing CLEANUP_RECORD there are exactly 15 entities (ACCOUNT, RESIDENT, VOLUNTEER, TERMS_DOCUMENT, TERMS_ACCEPTANCE, ITEM_CATEGORY, RECYCLING_FACILITY, PICKUP_REQUEST, PICKUP_WINDOW, STATUS_CHANGE, ASSIGNMENT, DELIVERY, ECOPOINTS_AWARD, NOTIFICATION, PUSH_SUBSCRIPTION). That is the minimum, so none more can be removed. The Cleanup job table, outboxes and processed-event tables are infrastructure, not entities | – |
| PICKUP_REQUEST | New relationship from PICKUP_REQUEST to itself: RESCHEDULED_AS, 0..1 to 0..1 | 12.5 |
| PICKUP_REQUEST | Photo_URL → a photo reference (File_ID, File_Path). Links are signed per view, so a URL can't be stored | 6.5–6.6 |
| PICKUP_REQUEST | Expires_At note: derived = the earlier of Created_At + 30 days and the end of the last active window | 12.2 |
| STATUS_CHANGE | Status domain: add Missed | 12.1 |
| DELIVERY | Evidence_Photo → a photo reference (File_ID, File_Path), required (FR17) | 6, Q15 |
| NOTIFICATION | Keep Is_Expired; add Pushed_At (nullable timestamp): when a push for this notification was actually sent. Whether to push is decided by the notification type, not stored. Used to decide whether an expired notification needs a quiet replacement push | 13.2 |
| NOTIFICATION | Type values: add REQUEST_UPDATED_RESIDENT, ASSIGNMENT_MISSED_RESIDENT, ASSIGNMENT_MISSED_VOLUNTEER; drop REQUEST_CANCELLED_VOLUNTEER | 13.1 |
| NOTIFICATION | Metadata note: "Holds only facts stored nowhere else (event sequence, action id, edit reason). Title and Body are derived from the related request, assignment or award." | 13.1 |
| NOTIFICATION | Exactly one source: a PICKUP_REQUEST or an ECOPOINTS_AWARD (BR50). For award notifications the request is derived through the award, so it isn't stored twice | 3NF |
| ECOPOINTS_AWARD | Points: decimal. No copies of quantity, weight, category or waste type (statistics are computed through ASSIGNMENT → PICKUP_REQUEST → ITEM_CATEGORY) | 8, 15 |

## 6. EDA diagram (draw.io)

| Box | Change |
|---|---|
| Triggers | Resident: add "Reports a missed pickup (optionally reschedules)". New trigger box "User (web app)": updates profile, activates a role, deactivates account. Scheduled: add "Daily notification cleanup" |
| Producers | Add **User Service** (ProfileUpdated, AccountDeactivated). Cleanup Service: add NotificationCleanupRequested. Request Service: add RequestAssignmentMissed to its event list |
| All Events | 12 → 16: add RequestAssignmentMissed, ProfileUpdated (User), AccountDeactivated (User), NotificationCleanupRequested (Cleanup) |
| Broker → Notification | "All events except CleanupRequest (11)" → "All events except CleanupRequest (15)" |
| Notification consumer | "a silent push when no push is needed" → "replaces it with a quiet notification (`silent: true`) with the same tag". Add: live public profile and statistics pages (public SSE); deletes expired notifications (NotificationCleanupRequested); deletes notifications and push subscriptions of deactivated accounts |
| Cleanup consumer | Add: "Keeps one job per Open request (job table checked every 30 s)" |
| Reward | Add (not an event action): "Serves EcoPoints and community statistics" |
| Caddy | "checks auth" → "checks auth with the User Service" |
| Database box | "All services read and write the same relational database" → "One PostgreSQL instance, one schema per service. Every service reads all tables; each table has one writer" |

## 7. EDA flows table (tab "Architecture Diagram work")

| Flow | Change |
|---|---|
| New: missed pickup | Trigger: resident reports a missed pickup. Events: RequestAssignmentMissed (+ RequestCreated for the new request if rescheduled). Notification: resident (SSE, no push), volunteer (SSE + push); the new request notifies matched volunteers as in RequestCreated. Cleanup: schedules the new request's job |
| New: profile updated | Trigger: profile change or role activation. Event: ProfileUpdated. Notification: `profile-updated` to the user's tabs; `public-profile-updated` on the public stream if the public name or roles changed |
| New: account deactivated | Event: AccountDeactivated. Notification: deletes the account's notifications and push subscriptions, signs out its open tabs |
| New: notification cleanup | Trigger: daily schedule. Event: NotificationCleanupRequested. Notification: deletes expired notifications |
| PointsAwardedDelivery / Cancellation | Add: `stats-updated` and `public-profile-updated` on the public stream |
| RequestCreated / Updated / Assigned / Cancelled / Expired | "Notifies other volunteers … identified by pickup_request_id" → "expires every volunteer's matching notification for the request, and sends `available-requests-changed` to every connected volunteer so their lists refresh" |
| RequestUpdated after a volunteer cancellation | The resident gets no separate push for RequestUpdated; the cancellation notification carries it |
| Volunteer / resident cancels assignment | "RequestUpdated (if not expired) / RequestExpired (if expired)" stays; add that the resident may give new windows when cancelling |
| All rows | "silent push" → "quiet replacement notification (`silent: true`, same tag)" |
