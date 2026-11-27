INSERT INTO users.terms_document (terms_document_id, content, published_at) VALUES
('00000001-0000-4000-8000-000000000002', 'EcoCollect terms version 2', '2026-11-01T00:00:00Z'),
('00000001-0000-4000-8000-000000000003', $terms$ECOCOLLECT TERMS OF USE, SAFETY GUIDELINES, AND PRIVACY NOTICE
Version 3 (Published November 27, 2026)

1. TERMS OF USE

About EcoCollect
EcoCollect is a Calgary community e-waste courier web application that coordinates household electronics pickups between residents and local volunteers.

Eligibility
You must be at least 18 years old to register or use EcoCollect. By creating an account or activating a role, you confirm that you meet this requirement and that your account information is accurate.

Resident responsibilities
- List only household electronics matching the selected category and quantity.
- Provide an accurate Calgary pickup address in your profile and select pickup windows when you can hand off the items.
- Wipe personal data, sign out of accounts, and remove SIM or memory cards from devices before handoff.
- Confirm collection in EcoCollect once the assigned volunteer picks up the items.
- Cancel early if your plans change. If you cancel an assignment or Assigned request after the 24-hour cutoff before the selected pickup window starts and before that window ends, the assigned volunteer still receives the delivery EcoPoints, except when the volunteer is also the request's resident.

Volunteer responsibilities
- Claim pickup windows you intend to complete and arrive during the agreed one-hour Calgary window.
- Deliver collected items to an eligible recycling facility listed in the app for that category and record delivery with a photo at the facility.
- Never record an item as delivered if a facility refuses it.
- Cancel your assignment before collection if you cannot complete it. No EcoPoints are awarded when a volunteer cancels their own assignment.

Availability and updates
EcoCollect does not guarantee that every Open request will be claimed before its last pickup window starts; Open requests expire automatically when their last active window starts. When a new version of these terms is published, you will be prompted to review and accept the updated version when an action requires acceptance (registration, role activation, creating or rescheduling a pickup request, or accepting a pickup).


2. SAFETY GUIDELINES

Safe handoffs
- Agree on a clear, accessible handoff spot (such as a front porch, building lobby, or driveway) using the request notes. Neither party is expected to enter a private home.
- Keep house numbers, faces, mail, and personal documents out of uploaded photos.

Permitted items and loads
- Only household electronics in the accepted categories listed in the app may be requested.
- Volunteers may decline any item that does not match the request, cannot be safely lifted or transported in their vehicle, or poses a hazard.
- Commercial bulk loads and large office copiers are not permitted.

Damaged or swollen batteries are excluded
- Do not request or accept pickup of any device with a damaged, punctured, leaking, overheating, or swollen lithium-ion battery.
- Follow City of Calgary Fire Department battery safety guidance (calgary.ca/safety/lithium-battery.html) for damaged or swollen batteries.

If a facility refuses a drop-off
- Do not record the request as delivered.
- Keep the item safe and coordinate returning it to the resident or routing it to an approved municipal drop-off location.


3. PRIVACY NOTICE

Information stored
- Account details: name, date of birth (to verify 18+ eligibility), public name, unique username, email address, Calgary address (Residents), and up to 3 preferred Calgary postal codes (Volunteers).
- Pickup records: request details, pickup windows, optional item photos, delivery photos, status history, EcoPoints awards, and the specific terms version accepted for each action.

How addresses and photos are protected
- Exact street addresses stay hidden while a request is Open. The request owner always keeps access to their address; the assigned volunteer can see the exact street address only while the assignment is active (Assigned) and loses access after collection.
- Embedded EXIF location metadata is stripped from photos in your browser before upload.
- Item photos are visible to the request owner and volunteers while Open, then only to the owner and the assigned volunteer.
- Delivery photos are visible only to the request owner and the delivering volunteer.
- Public profiles and Community Impact totals never expose exact street addresses, private account details, or photo links.

Storage and account deactivation
- Accounts authenticate through Firebase Authentication, operational records are stored in PostgreSQL, and uploaded photos are stored in ImageKit.
- You can deactivate your account in Profile settings when you have no Open, Assigned, or Collected requests and no active or collected volunteer assignments. Historical completed records and terms acceptances are retained for system integrity.$terms$, '2026-11-27T00:00:00Z')
ON CONFLICT (terms_document_id) DO NOTHING;
