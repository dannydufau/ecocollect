import { now } from "../store.mjs";

// A fresh mock with no delivery still shows some numbers
const sample = [
  { wasteType: "Electronics", deliveries: 3, itemsDelivered: 5, estimatedWeightKgDelivered: 12.5 },
  { wasteType: "Displays", deliveries: 1, itemsDelivered: 1, estimatedWeightKgDelivered: 5 },
];

const round = (value) => Math.round(value * 100) / 100;

// R2: community totals, no login. One delivered request is one delivery.
export function register(route, store) {
  route("GET", "/api/public/stats", (req, res) => {
    const byType = new Map();
    for (const request of store.requests.filter((item) => item.status === "Delivered")) {
      const wasteType = store.categories.find((category) => category.categoryId === request.categoryId)?.wasteType ?? "Other";
      const row = byType.get(wasteType) ?? { wasteType, deliveries: 0, itemsDelivered: 0, estimatedWeightKgDelivered: 0 };
      row.deliveries += 1;
      row.itemsDelivered += request.quantity;
      row.estimatedWeightKgDelivered = round(row.estimatedWeightKgDelivered + request.estimatedWeightKg);
      byType.set(wasteType, row);
    }
    const byWasteType = byType.size ? [...byType.values()] : sample;
    const total = (key) => round(byWasteType.reduce((sum, row) => sum + row[key], 0));
    const body = {
      deliveries: total("deliveries"),
      itemsDelivered: total("itemsDelivered"),
      estimatedWeightKgDelivered: total("estimatedWeightKgDelivered"),
      ecopointsAwarded: round(store.awards.reduce((sum, award) => sum + award.points, 0)),
      byWasteType,
      updatedAt: now().toISOString(),
    };
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  });
}
