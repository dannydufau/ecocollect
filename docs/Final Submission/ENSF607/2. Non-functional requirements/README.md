#### NFR01 — Maintainability

The system shall use a modular design that separates user interfaces, user management, pickup request management, notification processing, EcoPoints management and data cleanup operations into clearly defined components. Changes to one component shall not require unnecessary modifications to unrelated components.

#### NFR02 — Usability

The system shall provide a consistent and understandable user interface that allows Residents and Volunteers to complete their principal activities through clearly labelled controls, visible request statuses, appropriate instructions, and understandable validation messages. 

#### NFR03 — Privacy

The system shall protect private user information, exact pickup addresses, and delivery evidence by restricting access to authorized participants and excluding sensitive information from public interfaces, event messages, and user-submitted content such as photos of the requested items and delivery confirmation. 

#### NFR04 — Security

The system shall protect user accounts, sensitive information, and protected operations through secure password storage, authenticated access, server-side authorization, input validation, controlled file uploads, and encrypted communication in deployment. 

#### NFR05 — Fairness

The system shall apply consistent request discovery, pickup acceptance, assignment, and EcoPoints rules to all eligible users.  
Delivery EcoPoints and cancellation EcoPoints shall be calculated according to the same approved rules for every eligible user, without hidden priority or additional rewards based on account identity or saved pickup-region preferences. 

#### NFR06 — Reliability

The system shall maintain consistent request statuses, Volunteer assignments, delivery records, notifications, and EcoPoints when operations are repeated, performed concurrently, or retried following processing failures.  
The system shall prevent duplicate Volunteer assignments, duplicate delivery records, and duplicate EcoPoints awards.

#### NFR07 — Portability

(Can be removed if needs additional testing) The application shall support the latest Chrome browser versions on iOS, Android, macOS, and Windows devices.  