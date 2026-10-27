'use strict';

// Manual smoke test: run the real subscriber against the Compose RabbitMQ
// and log every RequestCreated it receives.
//
//   RABBITMQ_URL=amqp://<user>:<pass>@localhost:5672 node scripts/try-subscriber.js
//
// Then in the management UI (http://localhost:15672):
//   Exchanges -> ecocollect.events -> Publish message
//   Routing key: request.created
//   Payload:
//     {"type":"RequestCreated","version":1,"data":{"requestId":"0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11","residentUid":"r1","matchedVolunteerUids":["v1","v2"]}}

const { startSubscriber } = require('../src/messaging/subscriber');

const sub = startSubscriber({
  handlers: {
    RequestCreated: (envelope, fields) => {
      const d = envelope.data || {};
      console.log(
        `[try] got ${envelope.type} via ${fields.routingKey}: request=${d.requestId} ` +
        `resident=${d.residentUid} volunteers=${JSON.stringify(d.matchedVolunteerUids)}`,
      );
    },
  },
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`[try] ${sig}: stopping`);
    await sub.stop();
    process.exit(0);
  });
}