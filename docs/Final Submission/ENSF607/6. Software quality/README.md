# Software quality

## Functional requirement coverage

The [functional requirements](../1.%20Functional%20Requirements/README.md) define the behavior under test. Each row below points to the file where the positive and negative cases belong. The last two columns are the results of the [manual testing](#results).

| ID | Functional requirement | Case file | Positive | Negative |
| --- | --- | --- | --- | --- |
| FR01 | Account Registration | [accounts.md](cases/accounts.md) | Pass | Pass |
| FR02 | User Login, Logout, and Role Selection | [accounts.md](cases/accounts.md) | Pass | Pass |
| FR03 | Additional Role Activation | [accounts.md](cases/accounts.md) | Pass | Pass |
| FR04 | Profile Management | [accounts.md](cases/accounts.md) | Pass | Pass |
| FR05 | Public User Profiles | [accounts.md](cases/accounts.md) | Pass | Pass |
| FR06 | Create Pickup Requests | [resident-requests.md](cases/resident-requests.md) | Pass | Pass |
| FR07 | Pickup Scheduling | [resident-requests.md](cases/resident-requests.md) | Pass | Pass |
| FR08 | Review and Confirm Pickup Requests | [resident-requests.md](cases/resident-requests.md) | Pass | Pass |
| FR09 | View Resident Pickup Requests | [resident-requests.md](cases/resident-requests.md) | Pass | Pass |
| FR10 | Edit Open Pickup Requests | [resident-requests.md](cases/resident-requests.md) | Pass | Pass |
| FR11 | Cancel Pickup Requests | [resident-requests.md](cases/resident-requests.md) | Pass | Fail |
| FR12 | Volunteer Request Discovery | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR13 | Accept Pickup Requests | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR14 | Cancel Volunteer Assignment | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR15 | Confirm Item Collection | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR16 | Report Missed Pickup | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR17 | Record Facility Delivery | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR18 | EcoPoints Calculation and Awarding | [points-expiry-stats.md](cases/points-expiry-stats.md) | Pass | Pass |
| FR19 | In-App Notifications and Push Notifications | [notifications-demo.md](cases/notifications-demo.md) | Pass | Pass |
| FR20 | Automatic Request Expiration | [points-expiry-stats.md](cases/points-expiry-stats.md) | Pass | Pass |
| FR21 | Volunteer Pickup History | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR22 | Terms and Conditions, including Safety Guidelines | [accounts.md](cases/accounts.md) | Pass | Pass |
| FR23 | Public Community Impact Statistics | [points-expiry-stats.md](cases/points-expiry-stats.md) | Pass | Pass |

## Case format

Use two IDs per requirement. For example, `FR01-P` is a positive case that checks the expected result of valid use, and `FR01-N` is a negative case that checks the expected rejection or constraint. Add more cases with a numeric suffix such as `FR01-N2` if needed.

Record the setup, input, and steps for each case. State the expected result, including the status code, displayed message, or persistent state when relevant. All cases are run by hand. In the **Verification** column, say how the case was run and link its evidence. Keep observed results with the run evidence so a planned case is never counted as a pass.

The five files in `cases/` share the same columns, ending with **Result**: Pass, Fail with the reason, or Not run with the reason. Add case rows to the file listed in the coverage index.

## Results

All testing is manual. The 23 requirements have a positive and a negative case, 46 in total: **45 pass and 1 fails**. Every case has been run.

| How the case was run | Passed |
| --- | --- |
| Team manual runs | 34 |
| Browser runs on the local Compose stack (FR02-P, FR03-N, FR08-P, FR13-N, FR14-N, FR16-P, FR16-N, FR17-N, FR19-P, FR19-N and FR22-P) | 11 |

**Failed:**

- **FR11-N:** after the pickup window ended, the resident page still showed Cancel assignment. The app refused the cancellation and the request did not change. This run used one account as both resident and volunteer.

### Database and event flows

These cases check behaviour that depends on events between the services and on stored data:

- **FR20-P and FR20-N:** a request expires, or stays Open, with no user action.
- **FR18-P and FR23-P:** after a delivery, the EcoPoints awarded and the community statistics change.
- **FR19-P:** a request event creates an in-app notification and a push.
- **FR19-N:** checks, with the notification tables, that a deactivated volunteer gets nothing and that cancelling a request expires the old notification.

### Team manual runs

The team ran 38 manual cases and marked all of them as passed. Their documents are saved as PDFs. Each one numbers its cases from TC001, so a case is named by its document and number.

| Document | Cases | Screenshots |
| --- | --- | --- |
| [FR01–05 and FR11–15](results/manual/fr01-05-fr11-15.pdf), dated November 26 | 20 | Yes |
| [FR06–10](results/manual/fr06-10.pdf) | 10 | Yes |
| [FR20–23](results/manual/fr20-23.pdf) | 8 | No |

The tested commit was not recorded for these runs or for FR02-P and FR08-P. The other local Compose runs, on 2026-11-27 in Chrome (including the failed one), used app code from `main` at `73700f2`; FR22-P also relies on two team cases. None of the local runs has saved screenshots. The case tables use some of the team cases; the rest are extra checks. A password visible in the TC001 screenshot of the first document is blacked out in the saved copy.

## Run the cases

1. Start the app with Docker Compose as in the [project README](../../../../README.md), using Firebase test accounts.
2. Follow **Setup and steps** and compare what happens with **Expected result**.
3. Set **Result** to Pass, or Fail with the reason. Note the date and commit, and save screenshots.

For FR11-N and FR16, accept a request before its window starts. Check FR16-N before the window ends, then FR11-N and FR16-P after it ends, in that order.

For FR19, set the Web Push keys in `.env` (see `.env.example`), use a certificate the browser trusts, and use normal Chrome profiles. Push does not work in Incognito.
