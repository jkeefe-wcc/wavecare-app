/**
 * Nightly backup of the WaveCare data sheet (Google Apps Script).
 *
 * Setup (once): open the production sheet -> Extensions -> Apps Script -> paste this file ->
 * set BACKUP_FOLDER_ID below -> run installTrigger() once (approve the permission prompt).
 * The backup folder must be PRIVATE (owner only): backups contain everything in the sheet.
 * Only files in that folder whose names start with PREFIX are ever trashed (after KEEP_DAYS).
 */
const BACKUP_FOLDER_ID = 'PASTE_PRIVATE_FOLDER_ID_HERE';
const KEEP_DAYS = 30;
const PREFIX = 'WaveCare_Data_Scaffold_v1_BACKUP_';
const TZ = 'America/New_York';

function nightlyBackup() {
  if (BACKUP_FOLDER_ID.indexOf('PASTE') === 0) throw new Error('Set BACKUP_FOLDER_ID first.');
  const source = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd_HHmm');
  source.makeCopy(PREFIX + stamp, folder);

  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getName().indexOf(PREFIX) === 0 && f.getDateCreated().getTime() < cutoff) f.setTrashed(true);
  }
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'nightlyBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('nightlyBackup').timeBased().everyDays(1).atHour(2).nearMinute(15).inTimezone(TZ).create();
}
