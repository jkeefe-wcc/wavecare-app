# Sheet lockdown checklist (production DataScaffold)

Do these in Google Sheets/Drive as the owner. The app writes as the service account, so it must stay allowed.

## 1. Protected ranges (each tab)
Data -> Protect sheets and ranges -> Add. For each tab protect:
- Rows 1-3 (title rows + header row): "Restrict who can edit this range" -> Only you (+ service account).
- ID columns (NurseID, PatientID, EngagementID, ShiftID, DocumentID, ServiceID, AvailID, VerifID).
- Any formula columns (e.g. Compliance Docs "Days to Expiry").
Add `wavecare-drive-automation@wavecare-operations.iam.gserviceaccount.com` to the allowed editors on each range
(it only needs the ID columns allowed if it appends rows; header rows can stay owner-only because the app never edits them).
If the service account can't be added to a range, use "Show a warning when editing this range" instead.

## 2. Access
- Share with owner + service account only unless someone genuinely needs access; use Viewer where editing isn't needed.
- Link sharing off (currently private).
- Backup folder private (owner only).
- 2-step verification on both admin Google accounts.

## 3. Staging
- Staging copy: WaveCare_Data_Scaffold_v1_STAGING. Share it with the service account (Editor).
- Local dev: `.env.local` SHEET_ID = staging ID. Vercel: set SHEET_ID for the *Preview* environment to the staging ID; Production keeps the real ID.

## 4. Backups
Install `ops/backup-sheet.gs` (instructions in the file). Restore = open the dated copy, copy the tab(s) needed back.

## 5. Before real data
Rotate the service account key (new key -> Vercel GOOGLE_PRIVATE_KEY -> delete old key).
