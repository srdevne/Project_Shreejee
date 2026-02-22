/**
 * Google Apps Script for Shreejee Trading App Database Setup
 * 
 * Instructions:
 * 1. Go to Google Drive (drive.google.com) and create a new Blank Spreadsheet.
 * 2. Name it "Shreejee Trading DB"
 * 3. Go to Extensions > Apps Script.
 * 4. Paste this entire code into Code.gs, replacing any existing code.
 * 5. Click the "Save" icon.
 * 6. Click the dropdown that says "myFunction" and select "setupDatabase".
 * 7. Click "Run".
 * 8. Grant the necessary permissions when prompted.
 * 9. Once finished, copy the ID of the Spreadsheet from its URL and paste it into your .env.local file.
 */

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Define the schema for our tables (Tabs)
  const schema = {
    'Materials': [
      'ID', 'Material Name', 'Description', 'Current Stock (Bags)', 'Current Stock (KG)', 
      'Default Tax Rate (%)', 'Default Purchase Price', 'Default Selling Price', 'Last Updated'
    ],
    'Parties': [
      'ID', 'Name', 'Type (Customer/Supplier)', 'GSTIN', 'Phone', 'Email', 'Address', 'Status'
    ],
    'Sales': [
      'Invoice No', 'Challan No', 'Invoice Date', 'Order Date', 'Customer ID', 'Customer Name',
      'Total Amount', 'CGST Amount', 'SGST Amount', 'IGST Amount', 'Grand Total',
      'Payment Mode', 'Payment Status', 'Payment Details', 'Payment Confirmation Date'
    ],
    'Sale_Items': [
      'Item ID', 'Invoice No', 'Material ID', 'Material Name', 
      'No of Bags', 'Weight (KG)', 'Rate per KG', 'Tax Rate (%)', 'Amount'
    ],
    'Purchases': [
      'Purchase ID', 'Bill No', 'Bill Date', 'Supplier ID', 'Supplier Name',
      'Total Amount', 'Tax Amount', 'Grand Total', 'Payment Status'
    ],
    'Purchase_Items': [
      'Item ID', 'Purchase ID', 'Material ID', 'Material Name', 
      'No of Bags', 'Weight (KG)', 'Rate per KG', 'Amount'
    ],
    'Expenses': [
      'Expense ID', 'Date', 'Category', 'Amount', 'Description', 'Payment Mode'
    ],
    'Config': [
      'Key', 'Value', 'Description'
    ],
    'Notifications': [
      'Timestamp', 'Type', 'Message', 'By'
    ]
  };

  // Create Tabs and Headers
  for (const [sheetName, headers] of Object.entries(schema)) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    // Clear existing and set headers
    sheet.clear();
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    
    // Formatting headers
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4F46E5'); // Indigo 600
    headerRange.setFontColor('white');
    
    // Freeze top row
    sheet.setFrozenRows(1);
    
    // Auto-resize columns for better visibility
    sheet.autoResizeColumns(1, headers.length);
  }

  // Remove default "Sheet1" if it exists and is empty
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
  
  // Populate initial Config data
  const configSheet = ss.getSheetByName('Config');
  const initialConfig = [
    ['VERSION', '1.0.0', 'Database Schema Version'],
    ['ALLOWED_EMAILS', Session.getActiveUser().getEmail(), 'Comma separated list of emails allowed to login'],
    ['GST_RATES', '0,5,12,18,28', 'Available GST slab percentages']
  ];
  configSheet.getRange(2, 1, initialConfig.length, 3).setValues(initialConfig);
  
  // Format Config column A as bold
  configSheet.getRange('A2:A').setFontWeight('bold');
  
  SpreadsheetApp.getUi().alert('Database Setup Complete! You can now close this tab and copy the Spreadsheet ID.');
}
