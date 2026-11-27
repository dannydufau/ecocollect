# EcoCollect use case diagram

Open the [use case diagram](<EcoCollect Use Case Diagram.drawio>) in diagrams.net. The FR numbers refer to the [functional requirements](<../1. Functional Requirements/README.md>).

| Actor | Main interactions |
| --- | --- |
| Visitor | Register, read public profiles and community impact statistics, or open the interactive demo. |
| Registered User | Sign in, choose or add a role, manage the profile, view EcoPoints and notifications, and sign out. |
| Resident | Create, schedule, review, view, edit, and cancel pickup requests. The Resident can also cancel a volunteer assignment, confirm collection, report a missed pickup, and optionally reschedule it. |
| Volunteer | Browse and accept requests, cancel an assignment, record a delivery, and view pickup history. |
| Account with both roles | Uses the interactions of both the Resident and Volunteer roles. |
| Firebase Authentication | Supports registration and sign-in. |
| Web Push service | Delivers push notifications. |
| ImageKit | Stores item photos and delivery evidence photos. |

Accepting the current terms and safety guidelines is part of registration, role activation, request creation, and pickup acceptance. EcoCollect automatically expires Open requests when their last active pickup window starts.
