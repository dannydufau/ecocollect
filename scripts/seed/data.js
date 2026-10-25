const PASSWORD = 'Demo1234!';

const users = [
  // Residents
  { uid: 'demo-resident-1', email: 'riley@demo.ecocollect.test', firstName: 'Riley', lastName: 'Resident', displayName: 'Riley R.', dateOfBirth: '1995-03-14', roles: ['resident'], street: '101 8 Ave SW', postalCode: 'T2P1J9' },
  { uid: 'demo-resident-2', email: 'rosa@demo.ecocollect.test', firstName: 'Rosa', lastName: 'Resident', displayName: 'Rosa R.', dateOfBirth: '1992-07-22', roles: ['resident'], street: '2210 17 Ave SW', postalCode: 'T3A0B1' },
  { uid: 'demo-resident-3', email: 'ravi@demo.ecocollect.test', firstName: 'Ravi', lastName: 'Resident', displayName: 'Ravi R.', dateOfBirth: '1990-11-05', roles: ['resident'], street: '845 4 St NW', postalCode: 'T2Y3K5' },
  { uid: 'demo-resident-4', email: 'rena@demo.ecocollect.test', firstName: 'Rena', lastName: 'Resident', displayName: 'Rena R.', dateOfBirth: '1998-01-30', roles: ['resident'], street: '310 12 Ave NE', postalCode: 'T2N1N4' },
  { uid: 'demo-resident-5', email: 'rory@demo.ecocollect.test', firstName: 'Rory', lastName: 'Resident', displayName: 'Rory R.', dateOfBirth: '1988-09-18', roles: ['resident'], street: '57 Country Hills Rd NW', postalCode: 'T3K2L7' },
  // Volunteers (preferredPostalCodes = areas they want to see requests from)
  { uid: 'demo-volunteer-1', email: 'vera@demo.ecocollect.test', firstName: 'Vera', lastName: 'Volunteer', displayName: 'Vera V.', dateOfBirth: '1996-05-09', roles: ['volunteer'], street: '120 9 Ave SW', postalCode: 'T2P1J9', preferredPostalCodes: ['T2P1J9'] },
  { uid: 'demo-volunteer-2', email: 'victor@demo.ecocollect.test', firstName: 'Victor', lastName: 'Volunteer', displayName: 'Victor V.', dateOfBirth: '1993-12-02', roles: ['volunteer'], street: '2240 17 Ave SW', postalCode: 'T3A0B1', preferredPostalCodes: ['T3A0B1'] },
  { uid: 'demo-volunteer-3', email: 'vince@demo.ecocollect.test', firstName: 'Vince', lastName: 'Volunteer', displayName: 'Vince V.', dateOfBirth: '1991-04-27', roles: ['volunteer'], street: '88 Macleod Trail SE', postalCode: 'T2E5A8', preferredPostalCodes: ['T2E5A8'] },
  { uid: 'demo-volunteer-4', email: 'violet@demo.ecocollect.test', firstName: 'Violet', lastName: 'Volunteer', displayName: 'Violet V.', dateOfBirth: '1999-08-15', roles: ['volunteer'], street: '640 Edmonton Trail NE', postalCode: 'T2T4M3', preferredPostalCodes: ['T2T4M3'] },
  { uid: 'demo-volunteer-5', email: 'vikram@demo.ecocollect.test', firstName: 'Vikram', lastName: 'Volunteer', displayName: 'Vikram V.', dateOfBirth: '1994-02-11', roles: ['volunteer'], street: '15 Panorama Hills Way NW', postalCode: 'T3G1H6', preferredPostalCodes: ['T3G1H6'] },
];

const categories = [
  { id: 'laptops', name: 'Computers/Laptops', standardWeightKg: 2.5 },
  { id: 'desktops', name: 'Computers/Desktops', standardWeightKg: 8.0 },
  { id: 'monitors', name: 'Monitors', standardWeightKg: 5.0 },
  { id: 'tvs', name: 'Televisions', standardWeightKg: 12.0 },
  { id: 'phones', name: 'Phones', standardWeightKg: 0.2 },
  { id: 'tablets', name: 'Tablets', standardWeightKg: 0.5 },
  { id: 'printers', name: 'Printers', standardWeightKg: 6.0 },
  { id: 'small-appliances', name: 'Small Appliances', standardWeightKg: 3.0 },
  { id: 'cables-chargers', name: 'Cables and Chargers', standardWeightKg: 0.3 },
  { id: 'other-electronics', name: 'Other Electronics', standardWeightKg: 1.0 },
];

module.exports = { PASSWORD, users, categories };
