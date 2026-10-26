# secrets/

Local credentials for development. Nothing in this folder except this README is committed (see `.gitignore`).

## firebase-admin.json

Firebase Admin SDK key, used by the request service and the seed script.

1. Firebase console → Project settings → Service accounts → **Generate new private key**
   https://console.firebase.google.com/project/ecocollect-uofc/settings/serviceaccounts/adminsdk
2. Save the downloaded file here as `secrets/firebase-admin.json`.

Each developer generates their own key. Never share or commit it. If a key leaks, delete it in the Google Cloud console (IAM & Admin → Service accounts → Keys) and generate a new one.