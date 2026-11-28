# User stories

## Functional requirements

#### FR01 - Account Registration

As a new user aged 18 or older, I want to register as a Resident or Volunteer with my personal and account details, so that I can participate in EcoCollect.

As a Resident, I want to provide my Calgary address during registration, so that my pickup requests use the correct collection address.

As a Volunteer, I want to save up to three preferred postal codes, so that I can receive notifications about pickups in those areas.

#### FR02 - User Login, Logout, and Role Selection

As a registered user, I want to log in with my email and password and choose one of my activated roles, so that I can access the appropriate Resident or Volunteer features.

As a user with both roles, I want to switch between them, so that I can use both sets of features through the same account.

As a registered user, I want to log out and end my session, so that my account is protected when I finish using EcoCollect.

#### FR03 - Additional Role Activation

As a registered user, I want to activate the other role on my existing account, so that I can participate as both a Resident and a Volunteer without creating another account.

#### FR04 - Profile Management

As a registered user, I want to view my profile and update permitted settings, including my public name, so that my information stays current.

As a Volunteer, I want to update my preferred postal codes, so that pickup notifications reflect the areas I can serve.

As a Resident, I want to update my profile address when I have no Open or Assigned requests, so that new requests use my new address without affecting ongoing pickups.

As a registered user, I want to deactivate my account when I own no Open, Assigned or Collected requests and have no Assigned or Collected volunteer pickups, so that I can stop using EcoCollect without leaving unfinished pickups.

#### FR05 - Public User Profiles

As a public visitor, I want to view a user's participation information without seeing private account or pickup details, so that I can learn about their EcoCollect contributions while respecting their privacy.

#### FR06 - Create Pickup Requests

As a Resident, I want to select distinct electronic waste categories and enter their quantities, so that I can create a separate request for each category using the same pickup information.

As a Resident, I want the system to calculate each request's estimated weight from its category and quantity, so that I do not have to estimate the weight myself.

As a Resident, I want to optionally attach a JPEG, PNG or WEBP photo of up to 10 MB for each selected category, so that Volunteers can assess the items before accepting a pickup.

#### FR07 - Pickup Scheduling

As a Resident, I want to offer one to three non-overlapping, one-hour pickup windows in Calgary time that start in the future and end within 30 days of request creation, so that a Volunteer can choose a suitable collection time.

As a Resident, I want my requests to use the address in my profile, so that I do not need to enter the collection address for every request.

#### FR08 - Review and Confirm Pickup Requests

As a Resident, I want to review and correct my pickup information before confirming submission, so that I can fix mistakes before creating requests.

#### FR09 - View Resident Pickup Requests

As a Resident, I want to view my own requests, filter them by status and open their details, so that I can track their progress and see what action is needed.

#### FR10 - Edit Open Pickup Requests

As a Resident, I want to edit the item details of my Open requests, including requests reopened after an assignment cancellation, so that I can correct information before another Volunteer accepts them.

As a Resident, I want the estimated weight recalculated when I change a category or quantity, so that the request continues to show the correct estimate.

As a Resident, I want to replace an Open request's pickup windows with valid future windows within its original 30-day period, so that I can update my availability.

As a Resident, I want to end my Open or Assigned requests before changing my profile address and creating new requests, so that ongoing pickups keep their agreed collection address.

#### FR11 - Cancel Pickup Requests

As a Resident, I want to cancel my Open request or my Assigned request before its selected pickup window ends, so that I can stop a pickup I no longer need.

As a Resident, I want to cancel only an active assignment before collection is confirmed and before the selected window ends, with the option to provide new pickup windows, so that my request can reopen if valid future windows remain or expire otherwise.

As an assigned Volunteer, I want to be notified when the Resident cancels my request or assignment, so that I do not make an unnecessary trip.

As an assigned Volunteer, I want eligible late cancellations by the Resident to award cancellation EcoPoints under FR18, so that my reserved time is recognized.

#### FR12 - Volunteer Request Discovery

As a Volunteer, I want to browse Open requests with my preferred postal codes applied by default, or without a default filter when I have none, so that I can find suitable pickups.

As a Volunteer, I want to see the category, quantity, estimated weight, postal code, pickup windows and optional photo while the street address stays hidden, so that I can assess a request without exposing the Resident's exact location.

#### FR13 - Accept Pickup Requests

As a Volunteer, I want to accept an Open request by choosing an offered window that has not started, so that I can commit to an available pickup time.

As a user with both roles, I want to accept a request created by my own account, so that I can record handling my own e-waste as a Volunteer.

#### FR14 - Cancel Volunteer Assignment

As a Volunteer, I want to cancel my assignment before collection is confirmed, so that I can step back when I am unavailable without receiving cancellation EcoPoints.

As a Resident, I want my request to reopen after a Volunteer cancels if valid future windows remain, or expire otherwise, so that its status reflects whether another pickup is possible.

#### FR15 - Confirm Item Collection

As the Resident who owns an Assigned request, I want to confirm that the Volunteer collected my items, so that the request is recorded as Collected.

#### FR16 - Report Missed Pickup

As the Resident who owns an Assigned request, I want to report a missed pickup after the selected window ends, so that the request is recorded as Missed.

As a Resident, I want the option to provide one to three new pickup windows while reporting a missed pickup, so that I can create a replacement request with the same items linked to the missed request.

#### FR17 - Record Facility Delivery

As the assigned Volunteer, I want to record delivery of a Collected request to an eligible predefined recycling facility and submit a required evidence photo, so that the completed delivery is recorded.

#### FR18 - EcoPoints Calculation and Awarding

As a Resident or Volunteer, I want delivery EcoPoints awarded using the request's quantity and estimated weight, with Resident points equal to half the Volunteer points, so that my contribution is recognized consistently.

As an assigned Volunteer, I want to receive the same points as delivery when the Resident cancels my assignment or Assigned request after the cancellation window closes and before the pickup window ends, so that my reserved time is recognized.

As a user handling my own request as a Volunteer, I want cancellation points excluded when I am also the Resident, so that cancelling my own pickup does not earn rewards.

#### FR19 - In-App Notifications and Push Notifications

As a registered user, I want to receive relevant in-app and push notifications about pickup updates and EcoPoints awards, so that I can stay informed about my activity.

As a Volunteer, I want notifications for new requests in my preferred postal codes, so that I can find pickups in the areas I serve.

As a registered user, I want to mark notifications as read, so that I can distinguish new updates from ones I have seen.

As a registered user, I want outdated request notifications removed from my list and device, so that I do not act on information that is no longer current.

#### FR20 - Automatic Request Expiration

As a Resident, I want my Open request to expire when its last active pickup window starts, so that Volunteers cannot accept pickup times that have already started.

#### FR21 - Volunteer Pickup History

As a Volunteer, I want to view my Assigned, Collected and Delivered requests and their history, so that I can manage my commitments and review previous pickups.

#### FR22 - Terms and Conditions, including Safety Guidelines

As a Resident or Volunteer, I want to review and accept the applicable terms and safety guidelines during registration, role activation, request creation and pickup acceptance, so that I understand the rules before participating.

#### FR23 - Public Community Impact Statistics

As a public visitor, I want to view community impact statistics based on delivered requests for which EcoPoints were awarded, so that I can understand EcoCollect's recorded contribution to e-waste disposal.


## Non-functional requirements

#### NFR01 - Maintainability

As a developer, I want clear responsibilities and interfaces between the user interface, user management, pickup requests, notifications, EcoPoints and cleanup components, so that I can update one part without unnecessarily changing unrelated parts.

#### NFR02 - Usability

As a Resident or Volunteer, I want consistent navigation, clearly labelled controls and visible request statuses, so that I can understand and complete my tasks easily.

As a Resident or Volunteer, I want clear instructions and validation messages, so that I know how to correct mistakes.

#### NFR03 - Privacy

As a Resident, I want my exact pickup address visible only to me and the Volunteer whose assignment is accepted but not yet collected, so that my location is protected.

As a Resident or Volunteer, I want item photos and delivery evidence visible only to permitted users, so that private images are not exposed to others.

As a Resident or Volunteer, I want location metadata removed from uploaded photos and sensitive addresses and photo links kept out of public interfaces, events and notifications, so that private information is not shared unintentionally.

#### NFR04 - Security

As a registered user, I want my credentials and communication protected, so that other people cannot access my account or intercept private information.

As a Resident or Volunteer, I want the system to check my identity, permissions, submitted data and uploaded files, so that unauthorized or invalid actions are rejected.

#### NFR05 - Fairness

As a Resident or Volunteer, I want the same discovery, acceptance and EcoPoints rules applied to all eligible users, so that account identity or preferred postal codes do not give anyone hidden priority or extra rewards.

#### NFR06 - Reliability

As a Resident or Volunteer, I want requests, assignments, deliveries, notifications and EcoPoints to remain consistent when actions are repeated, retried or performed at the same time, so that I can trust my records.

As a Resident or Volunteer, I want duplicate assignments, deliveries and EcoPoints awards prevented, so that repeated actions or processing failures do not create incorrect results.
