# Normalization: PUSH_SUBSCRIPTION, CLEANUP_RECORD, OUTBOX (#76)

## PUSH_SUBSCRIPTION (Endpoint, Account_ID#, P256dh, Auth, Expiration_Time, User_Agent, Updated_At)
FD: Endpoint → Account_ID, P256dh, Auth, Expiration_Time, User_Agent, Updated_At
- 1NF: all values atomic; the composite Keys (ER) was flattened into P256dh and Auth.
- 2NF: single-column key, so no partial dependencies.
- 3NF: no non-key column depends on another non-key column.

## CLEANUP_RECORD (Request_ID#, Cleaned_Up_At)
FD: Request_ID → Cleaned_Up_At
- 1NF/2NF/3NF: one key column and one other column. Request_Status and Expires_At are
  derived from PICKUP_REQUEST and not stored, which avoids duplicating request data.

## OUTBOX (Event_ID, Event_Type, Event_Version, Routing_Key, Aggregate_ID, Payload, Created_At, Published_At)
FD: Event_ID → all other columns
- 3NF on its columns. Payload is JSON by design: it is the event message sent as one unit
  to RabbitMQ, not data the database queries by field. Infrastructure, not an ER entity.