/**
 * Optional Apps Script for true last-write-wins: stamps column O ("Sheet edited at")
 * whenever Status, Deliverable link or Notes change. Without it, a sheet edit counts
 * as happening when the sync notices it.
 */
export function appsScriptFor(tabNames: string[]): string {
  const tabs = JSON.stringify(tabNames.length ? tabNames : ['Tasks']);
  return `// CrewBoard edit stamp — Extensions › Apps Script, paste, save. No other setup needed.
var CREWBOARD_TABS = ${tabs};

function onEdit(e) {
  var sheet = e.range.getSheet();
  if (CREWBOARD_TABS.indexOf(sheet.getName()) === -1) return;
  var first = e.range.getColumn(), last = first + e.range.getNumColumns() - 1;
  if (last < 9 || first > 11 || e.range.getRow() < 2) return; // only Status, Deliverable link, Notes
  var stamp = new Date().toISOString();
  for (var r = 0; r < e.range.getNumRows(); r++) {
    sheet.getRange(e.range.getRow() + r, 15).setValue(stamp); // column O
  }
}
`;
}
