// =============================================================================
// Shreejee Enterprises — Google Sheets Backup Script
// =============================================================================
// HOW TO SET UP:
//  1. Open your Google Sheet
//  2. Extensions → Apps Script
//  3. Paste this entire file (replace any existing code)
//  4. Save (Ctrl+S)
//  5. Run setupWeeklyBackupTrigger() ONCE to enable automatic weekly backups
//  6. For a manual backup at any time, run manualBackupNow()
//  7. To create the immutable FY archive, run createFYArchive()
// =============================================================================

// ── CONFIG — update these ────────────────────────────────────────────────────
var BACKUP_FOLDER_NAME = 'Shreejee_Backups';          // Google Drive folder name
var ARCHIVE_FOLDER_NAME = 'Shreejee_Archives';         // Immutable FY archives
var SHEET_EMAIL_NOTIFY = 'shreejeeenterprises279@gmail.com'; // email for alerts
// ─────────────────────────────────────────────────────────────────────────────


/**
 * Creates a timestamped backup copy of the entire spreadsheet.
 * Called automatically by the weekly trigger, or manually via manualBackupNow().
 */
function createWeeklyBackup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceId = ss.getId();
  var now = new Date();

  // Format: Shreejee_Backup_2025-03-01_Sat
  var dateStr = Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM-dd_EEE');
  var backupName = 'Shreejee_Backup_' + dateStr;

  // Get or create the Backups folder in Drive
  var folder = getOrCreateFolder(BACKUP_FOLDER_NAME);

  // Make the copy
  var sourceFile = DriveApp.getFileById(sourceId);
  var backupFile = sourceFile.makeCopy(backupName, folder);

  // Keep only the last 8 backups (2 months) — delete older ones
  pruneOldBackups(folder, 8);

  Logger.log('✅ Backup created: ' + backupName + ' | ID: ' + backupFile.getId());

  // Optional email notification
  try {
    MailApp.sendEmail({
      to: SHEET_EMAIL_NOTIFY,
      subject: '✅ Shreejee Weekly Backup — ' + dateStr,
      body: 'Weekly backup created successfully.\n\nFile: ' + backupName +
            '\nFolder: ' + BACKUP_FOLDER_NAME +
            '\nDrive link: https://drive.google.com/file/d/' + backupFile.getId(),
    });
  } catch (e) {
    Logger.log('Email notify skipped: ' + e.message);
  }

  return backupFile;
}


/**
 * Run this from the Apps Script editor at any time for an immediate backup.
 */
function manualBackupNow() {
  var f = createWeeklyBackup();
  SpreadsheetApp.getUi().alert('✅ Backup created!\n\n' + f.getName());
}


/**
 * Creates a READ-ONLY, IMMUTABLE end-of-financial-year archive.
 * Run this once at the end of each FY (31 March).
 * The archived file is set to VIEW ONLY so it cannot be accidentally edited.
 */
function createFYArchive() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceId = ss.getId();
  var now = new Date();

  // Determine current FY label (Apr–Mar)
  var month = now.getMonth(); // 0-indexed; March = 2, April = 3
  var fyStart = month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  var fyEnd = fyStart + 1;
  var fyLabel = 'FY_' + fyStart + '-' + String(fyEnd).slice(2);

  var archiveName = 'Shreejee_ARCHIVE_' + fyLabel + '_READONLY';

  var archiveFolder = getOrCreateFolder(ARCHIVE_FOLDER_NAME);

  // Copy and make read-only
  var sourceFile = DriveApp.getFileById(sourceId);
  var archiveFile = sourceFile.makeCopy(archiveName, archiveFolder);

  // Remove write access — set to "anyone with link can VIEW"
  archiveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Also open the archive spreadsheet and protect all sheets
  var archiveSS = SpreadsheetApp.openById(archiveFile.getId());
  archiveSS.getSheets().forEach(function(sheet) {
    var protection = sheet.protect();
    protection.setDescription(fyLabel + ' Archive — DO NOT EDIT');
    // Remove all editors except owner
    protection.removeEditors(protection.getEditors());
  });

  Logger.log('✅ FY Archive created: ' + archiveName);

  SpreadsheetApp.getUi().alert(
    '✅ FY Archive Created!\n\n' +
    'File: ' + archiveName + '\n' +
    'All sheets are now protected (View only).\n\n' +
    'Drive link: https://drive.google.com/file/d/' + archiveFile.getId()
  );
}


/**
 * ONE-TIME SETUP: Creates a weekly trigger that runs every Sunday at midnight IST.
 * Run this function ONCE from the Apps Script editor.
 */
function setupWeeklyBackupTrigger() {
  // Remove any existing backup triggers first (avoid duplicates)
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'createWeeklyBackup') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Create new weekly trigger: every Sunday between 1–2 AM IST
  ScriptApp.newTrigger('createWeeklyBackup')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(1)
    .inTimezone('Asia/Kolkata')
    .create();

  Logger.log('✅ Weekly backup trigger set for every Sunday at ~1 AM IST.');
  SpreadsheetApp.getUi().alert(
    '✅ Weekly Backup Trigger Activated!\n\n' +
    'A backup will be created automatically every Sunday at ~1 AM.\n' +
    'Backups are stored in Google Drive → ' + BACKUP_FOLDER_NAME + '\n' +
    'Only the last 8 backups (2 months) are kept.'
  );
}


/**
 * Removes oldest backups, keeping only `keepCount` most recent files.
 */
function pruneOldBackups(folder, keepCount) {
  var files = [];
  var iter = folder.getFiles();
  while (iter.hasNext()) {
    var f = iter.next();
    files.push({ file: f, date: f.getDateCreated() });
  }

  // Sort by date descending (newest first)
  files.sort(function(a, b) { return b.date - a.date; });

  // Delete files beyond keepCount
  for (var i = keepCount; i < files.length; i++) {
    Logger.log('🗑 Deleting old backup: ' + files[i].file.getName());
    files[i].file.setTrashed(true);
  }
}


/**
 * Utility: get or create a Google Drive folder by name.
 */
function getOrCreateFolder(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}


// ── Optional: add a custom menu to the sheet ─────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔒 Shreejee Backup')
    .addItem('📦 Backup Now', 'manualBackupNow')
    .addItem('📁 Create FY Archive (End of Year)', 'createFYArchive')
    .addSeparator()
    .addItem('⚙ Setup Weekly Auto-Backup', 'setupWeeklyBackupTrigger')
    .addToUi();
}
