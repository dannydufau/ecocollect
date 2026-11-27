| Case ID | Scenario | Setup and steps | Expected result | Verification | Result |
| --- | --- | --- | --- | --- | --- |
| FR18-P | Award points for a delivery | Note EcoPoints awarded on the Community impact page, record the delivery of one laptop (2.50 kg), then refresh. | EcoPoints awarded goes up by 19.50, the total for this delivery (13 for the volunteer and 6.50 for the resident; the page shows only the total). | Manual — team run, [FR20–23 cases](../results/manual/fr20-23.pdf), TC007. | Pass |
| FR18-N | No points without a delivery | Note EcoPoints awarded. Create a request and cancel it, confirm collection of another request, then refresh. | EcoPoints awarded does not change. | Manual — team run, [FR20–23 cases](../results/manual/fr20-23.pdf), TC008. | Pass |
| FR20-P | Expire when the last window starts | Create a request with one window at the next full hour. Wait until it starts and refresh. Then check Available requests as a volunteer. | The request changes from Open to Expired without any user action, and volunteers no longer see it. | Manual — team run, [FR20–23 cases](../results/manual/fr20-23.pdf), TC001. | Pass |
| FR20-N | Stay Open while a later window remains | Create a request with two windows an hour apart. Wait until the first one starts, then open it as a volunteer. | The request is still Open, and only the later window is offered. | Manual — team run, [FR20–23 cases](../results/manual/fr20-23.pdf), TC002. | Pass |
| FR23-P | Count a new delivery | Note the Community impact values, record the delivery of one laptop (2.50 kg), then refresh the page. | Deliveries and items go up by 1, weight by 2.50 kg and EcoPoints awarded by 19.50. The Computers row includes it. | Manual — team run, [FR20–23 cases](../results/manual/fr20-23.pdf), TC007. | Pass |
| FR23-N | Leave out requests that were not delivered | Note the Community impact values. Cancel a new request, confirm collection of another, then refresh the page. | The values do not change. | Manual — team run, [FR20–23 cases](../results/manual/fr20-23.pdf), TC008. | Pass |

## Verification results

All cases are checked by hand. Rows marked as a team run link to a document in [results/manual/](../results/manual/); the tested commit was not recorded. See the [results summary](../README.md#results).
