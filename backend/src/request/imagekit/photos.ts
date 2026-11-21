// What the routes need from ImageKit: the file check of contract 6.5, before a
// photo is attached, and deleting a photo no request uses any more (6.7).
// client.ts (to come) asks ImageKit; fake.ts is for tests.
export type PhotoPurpose = 'item_photo' | 'delivery_evidence';

export type PhotoCheck = {
  fileId: string;
  purpose: PhotoPurpose;
  callerId: string;
  requestId: string | null;            // required for 'delivery_evidence' (its folder holds it)
};

export type Photos = {
  // The file's ImageKit path when it passes 6.5 (in the folder 6.2 pins for this
  // caller and purpose, private, an allowed type and size), otherwise null.
  verify(check: PhotoCheck): Promise<string | null>;
  // Deletes the file from ImageKit. Throws when ImageKit refuses; the caller logs it.
  remove(fileId: string): Promise<void>;
};

// Until ImageKit is wired in, no file can be checked, so every photo is refused,
// and there is no file to delete.
export const noPhotos: Photos = {
  verify: async () => null,
  remove: async () => {},
};
