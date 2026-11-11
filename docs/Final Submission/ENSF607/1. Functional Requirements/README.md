### Account and Role Management

#### FR01 - Account Registration

The system shall allow individuals aged 18 or older to register as a Resident or Volunteer, providing their personal information (first name, last name, date of birth), a public name, a unique username, a unique email address, a password, a Calgary address (street and postal code, Residents only), and up to 3 preferred postal codes (for notifications, Volunteers only).

#### FR02 - User Login, Logout, and Role Selection

The system shall authenticate registered users using their email address and password and display Resident and Volunteer role choices after every successful login. The system shall also provide a logout function that terminates the user's authenticated session.

#### FR03 - Additional Role Activation

The system shall allow registered users to activate an additional Resident or Volunteer role (different from their current role) for their account.

#### FR04 - Profile Management

The system shall provide a profile management page where authenticated users can view their information and modify permitted account settings. Residents cannot change their address if they have any uncollected (Open or Assigned) pickup requests. Users can deactivate their account when they own no Open, Assigned or Collected requests and have no active assignment.

### Public User Information

#### FR05 - Public User Profiles

The system shall provide publicly accessible user profiles displaying a user’s participation information without exposing private account or pickup details.

### Resident Pickup Request Management

#### FR06 - Create Pickup Requests

The system shall allow Residents to create pickup requests by selecting one or more predefined electronic waste categories, specifying a quantity for each selected category, and optionally uploading a photograph for each selected category. Photos are visible to the request owner and to Volunteers while the request is Open, then to the owner and the assigned Volunteer. Location data is removed from photos before upload.  
The system shall automatically calculate the estimated total weight for each category by multiplying the category's predefined standard weight by the entered quantity. Residents shall not be allowed to enter or manually modify the calculated weight.
Each selected category shall generate a separate pickup request using the common pickup information provided during submission.
The system shall accept the optional photographs in JPEG, PNG, and WEBP formats, with a maximum file size of 10 MB per photograph.

#### FR07 - Pickup Scheduling

When creating a pickup request, the system shall allow the Resident to specify one to three non-overlapping pickup windows in Calgary local time. Each window shall last one hour, start after the request is created, and end no later than 30 days after request creation (expiration period). The system shall use the address in the Resident’s profile as the pickup address.

#### FR08 - Review and Confirm Pickup Requests

The system shall allow Residents to review and correct their pickup request before confirming submission.

#### FR09 - View Resident Pickup Requests

The system shall allow Residents to view their own pickup requests, filter them by status, and access each request’s details.

#### FR10 - Edit Open Pickup Requests

The system shall allow Residents to edit pickup requests they own while those requests remain Open, including requests reopened after an assignment cancellation.  
When a Resident changes the item category or quantity of an Open request, the system shall automatically recalculate its estimated total weight using the category's predefined standard weight.  
A Resident cannot change the address of their pickup requests directly because the address is linked to their profile. To change the address, they must cancel any existing uncollected (Open or Assigned) pickup requests they own, update their profile address and create new pickup requests.
The system shall allow Residents to replace the active pickup windows of an Open request with future valid new windows as per FR07. The request's expiration deadline shall be recalculated based on the updated windows and the original creation date as per FR20.

#### FR11 - Cancel Pickup Requests

The system shall allow Residents to cancel their own Open or Assigned pickup requests. Cancelling an Open request shall change its status to Cancelled. Cancelling an Assigned request shall revoke the active Volunteer assignment and change the request’s status to Cancelled.
The system shall also allow Residents to cancel an active Volunteer assignment before collection is confirmed, without cancelling the pickup request. The Resident can give future valid new windows as per FR07 when cancelling an assignment. After the assignment is cancelled, the request shall return to Open if valid future pickup windows remain. Otherwise, it shall become Expired.
To recognize the Volunteer’s preparation, the cancellation window is the period ending 24 hours before the selected pickup window starts. If either Resident cancellation action ends an active assignment during this window, no cancellation EcoPoints shall be awarded. If the assignment is cancelled after the window ends, the Volunteer shall receive cancellation EcoPoints in accordance with FR18.

### Volunteer Pickup Management

#### FR12 - Volunteer Request Discovery

The system shall allow Volunteers to browse Open pickup requests filtered by their preferred postal codes by default. If they don’t have any preferred postal codes, then there is no default filter. A volunteer can see the waste category, quantity, weight, postal code, pickup windows and optional photograph for Open pickup requests, but the street address stays hidden.

#### FR13 - Accept Pickup Requests

The system shall allow a Volunteer to accept an Open request by selecting one of the Resident's offered future pickup windows. A Volunteer can accept a request created by their own account.

#### FR14 - Cancel Volunteer Assignment

The system shall allow a Volunteer to cancel any of their existing assignments before collection has been confirmed. After the assignment is cancelled, the request goes to the next state according to FR11. No EcoPoints are awarded if the Volunteer cancels their own assignment.

### Collection and Delivery Management

#### FR15 - Confirm Item Collection

The system shall allow only the Resident who owns an Assigned request to confirm that the assigned Volunteer has collected the listed electronic items.

#### FR16 - Report Missed Pickup

The system shall allow the Resident to report a missed pickup after the selected pickup window has ended, provided that the request is Assigned. The request becomes Missed. While reporting, the Resident may provide 1 to 3 new pickup windows to reschedule. The system then creates a new pickup request with the same items and links it to the missed one.

#### FR17 - Record Facility Delivery

The system shall allow the assigned Volunteer to record delivery of a Collected request to an eligible predefined recycling facility. Volunteer must submit a photo as delivery evidence. The delivery photo is visible only to the request owner and the delivering Volunteer.

### EcoPoints and Notifications

#### FR18 - EcoPoints Calculation and Awarding

The system shall calculate and award EcoPoints to the assigned Volunteer and the request-owning Resident when a pickup request is successfully delivered.
Volunteer Points = (3 × Quantity) + (4 × Estimated_Weight_Kg). Resident Points = Volunteer Points ÷ 2, with no rounding. 
The system shall award EcoPoints only to the assigned Volunteer if the Resident cancels a volunteer assignment or the whole Assigned request outside the cancellation window as per FR11. A cancellation awards the same points to the Volunteer as delivery. No cancellation EcoPoints are awarded when the Volunteer is also the request's Resident.

#### FR19 - In-App Notifications and Push Notifications

The system shall generate and display in-app and push notifications for relevant pickup request updates and EcoPoints awards. The system shall also notify Volunteers for new pickup requests posted in their preferred postal codes. Users can mark notifications as read. Notifications that no longer reflect a request's current state are marked expired and removed from the user's list and device.

### Request Lifecycle and Authorization

#### FR20 - Automatic Request Expiration

The system shall automatically mark an Open request as Expired when either its expiration period (as per FR07) elapses or its final scheduled pickup window ends, whichever occurs first.

#### FR21 - Volunteer Pickup History

The system shall allow Volunteers to view their Assigned, Collected, and Delivered pickup requests and relevant historical information.

#### FR22 - Terms and Conditions, including Safety Guidelines

The system shall display terms and conditions, including safety guidelines, and require user acknowledgment during registration, role activation, pickup request creation (Resident), and pickup acceptance (Volunteer).

### Community Impact Statistics

#### FR23 - Public Community Impact Statistics

The system shall display community impact statistics on a publicly accessible page calculated from successfully recorded Delivered requests for which EcoPoints were awarded.

### Interactive Demo Mode

#### FR24 - Interactive Demo Mode

The system shall provide a publicly accessible Demo Mode that demonstrates the principal Resident and Volunteer workflows using predefined sample data without requiring account registration or login. Demo Mode shall operate in an isolated environment, and actions performed within it shall not create, modify, or delete production data.