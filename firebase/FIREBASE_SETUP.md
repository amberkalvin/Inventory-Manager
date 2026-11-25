# Firebase Real-Time Sync Setup (5 Minutes)

Inventory Manager works out of the box in **Local Demo Mode** so anyone can test it right away. To turn on **live multi-device sync** across your 4–5 team phones (iPhone + Android):

## 1. Create a Free Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/) and click **Create a project**.
2. Name it `inventory-manager` (Google Analytics optional).

## 2. Enable Authentication
1. In the left menu, open **Build → Authentication → Get started**.
2. Enable **Email/Password** (recommended — works on Web PWA, Android `.APK`, and iOS `.IPA`).
3. *(Optional)* Enable **Google** sign-in for one-tap browser/PWA login.
4. Under **Authentication → Users**, click **Add user** for each of your 4–5 team members (or let them sign up and allowlist their emails below).
5. Under **Authentication → Settings → Authorized domains**, add `<your-github-username>.github.io`.

## 3. Enable Cloud Firestore & Security Rules
1. Open **Build → Firestore Database → Create database** (Production mode, nearest region).
2. Open the **Rules** tab and paste the contents of `firebase/firestore.rules`.
3. Add your team's lowercase email addresses to the `isAllowedTeamMember()` list (or create documents in an `allowedUsers` collection where each Document ID is a lowercase email address) and click **Publish**.

## 4. Connect the App
1. In Firebase Console, go to **Project Settings (gear icon) → Your apps → Add web app (`</>`)**.
2. Copy the `firebaseConfig` values (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
3. You have **two easy ways** to connect:
   - **Option A — Automatic in GitHub Actions (Recommended for Team Rollout):**
     Add the six `VITE_FIREBASE_*` values as **Repository Secrets** in GitHub (`Settings → Secrets and variables → Actions`). Every GitHub Pages deploy, `.APK`, and `.IPA` will automatically come pre-connected to your database!
   - **Option B — In-App Cloud Sync Drawer (Zero Rebuild):**
     Open Inventory Manager → tap **Settings → Cloud Sync** → paste your Firebase config JSON and save.
