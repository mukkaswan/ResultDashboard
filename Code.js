// code.gs
function doGet(e) {
  const userProperties = PropertiesService.getUserProperties();
  const loggedInUser = userProperties.getProperty('loggedInUser');

  if (loggedInUser) {
    // User is already logged in, redirect to dashboard
    return HtmlService.createTemplateFromFile('index').evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } else {
    // User is not logged in, show login form
    return HtmlService.createTemplateFromFile('index').evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
}

function checkLogin(username, password, role, trade, dob) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const loginSheet = ss.getSheetByName("LOGIN");
    const data = loginSheet.getDataRange().getValues();

    // Input validation
    if (!username || !password || !role) {
      Logger.log('Missing required fields');
      return { success: false, message: 'All required fields must be filled' };
    }

    // Convert username to string to handle numeric usernames
    username = username.toString().trim();

    // Log input values for debugging
    Logger.log('Login attempt with:');
    Logger.log('Username: ' + username);
    Logger.log('Role: ' + role);
    Logger.log('Trade: ' + trade);
    Logger.log('DOB: ' + dob);

    // First check if user is already logged in
    const userProperties = PropertiesService.getUserProperties();
    const currentUser = userProperties.getProperty('loggedInUser');
    if (currentUser) {
      logUserLogout();
      userProperties.deleteProperty('loggedInUser');
      userProperties.deleteProperty('userRole');
      userProperties.deleteProperty('userTrade');
    }

    // Rate limiting check (3 attempts per minute)
    const key = 'loginAttempts_' + username;
    const attempts = userProperties.getProperty(key) ? JSON.parse(userProperties.getProperty(key)) : [];
    const now = new Date().getTime();
    const recentAttempts = attempts.filter(time => now - time < 60000);
    
    if (recentAttempts.length >= 3) {
      return { success: false, message: 'Too many login attempts. Please try again in a minute.' };
    }

    // Update login attempts
    recentAttempts.push(now);
    userProperties.setProperty(key, JSON.stringify(recentAttempts));

    for (let i = 1; i < data.length; i++) {
      let sheetUsername = data[i][0];
      
      if (typeof sheetUsername === 'string' && sheetUsername.startsWith("'")) {
        sheetUsername = sheetUsername.substring(1);
      }
      
      sheetUsername = sheetUsername.toString().trim();
      
      // For admin role
      if (role === 'admin') {
        if (sheetUsername === username && data[i][1] === password && data[i][3] === role) {
          userProperties.setProperty('loggedInUser', username);
          userProperties.setProperty('userRole', role);
          userProperties.setProperty('userTrade', '');
          logUserLogin(username);
          return { success: true };
        }
      }
      // For trainee role
      else if (role === 'trainee') {
        let sheetDob = data[i][5];
        let formattedSheetDob = '';
        let formattedInputDob = '';

        // Format sheet date
        if (sheetDob instanceof Date && !isNaN(sheetDob)) {
          formattedSheetDob = Utilities.formatDate(sheetDob, "Asia/Kolkata", "yyyy-MM-dd");
        } else if (typeof sheetDob === 'string') {
          try {
            const parsedDate = new Date(sheetDob);
            if (!isNaN(parsedDate.getTime())) {
              formattedSheetDob = Utilities.formatDate(parsedDate, "Asia/Kolkata", "yyyy-MM-dd");
            } else {
              Logger.log('Invalid date in sheet');
              continue;
            }
          } catch (e) {
            Logger.log('Error parsing sheet date: ' + e);
            continue;
          }
        }

        // Format input date
        try {
          const parsedInputDate = new Date(dob);
          if (!isNaN(parsedInputDate.getTime())) {
            formattedInputDob = Utilities.formatDate(parsedInputDate, "Asia/Kolkata", "yyyy-MM-dd");
          } else {
            return { success: false, message: 'Invalid date format' };
          }
        } catch (e) {
          return { success: false, message: 'Invalid date format' };
        }

        if (sheetUsername === username && 
            data[i][1] === password && 
            data[i][3] === role &&
            data[i][4] === trade &&
            formattedSheetDob === formattedInputDob) {
          userProperties.setProperty('loggedInUser', username);
          userProperties.setProperty('userRole', role);
          userProperties.setProperty('userTrade', trade);
          logUserLogin(username);
          return { success: true };
        }
      }
      // For instructor role
      else if (role === 'instructor') {
        if (sheetUsername === username && 
            data[i][1] === password && 
            data[i][3] === role &&
            data[i][4] === trade) {
          userProperties.setProperty('loggedInUser', username);
          userProperties.setProperty('userRole', role);
          userProperties.setProperty('userTrade', trade);
          logUserLogin(username);
          return { success: true };
        }
      }
    }
    
    return { success: false, message: 'Invalid credentials' };
  } catch (error) {
    Logger.log('Login error: ' + error);
    return { success: false, message: 'An error occurred during login' };
  }
}

function logUserLogin(username) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userLogsSheet = ss.getSheetByName("userLogs");
    const loginSheet = ss.getSheetByName("LOGIN");
    
    if (!userLogsSheet || !loginSheet) {
      Logger.log('Required sheets not found');
      return;
    }
    
    // Get current date and time in IST
    const now = new Date();
    const date = Utilities.formatDate(now, "Asia/Kolkata", "dd-MM-yyyy");
    const time = Utilities.formatDate(now, "Asia/Kolkata", "HH:mm:ss");
    
    // Get mobile number from LOGIN sheet
    const loginData = loginSheet.getDataRange().getValues();
    let mobileNumber = '';
    for (let i = 1; i < loginData.length; i++) {
      if (loginData[i][0].toString() === username.toString()) {
        mobileNumber = loginData[i][2];
        break;
      }
    }
    
    // Append the login details
    userLogsSheet.appendRow([
      username,           // Username
      date,              // Login Date
      time,              // Login Time
      mobileNumber,      // Mobile Number
      '',                // Logout Date (empty initially)
      ''                 // Logout Time (empty initially)
    ]);
    
  } catch (error) {
    Logger.log('Error logging user login: ' + error);
  }
}

function logUserLogout() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userLogsSheet = ss.getSheetByName("userLogs");
    
    if (!userLogsSheet) {
      Logger.log('userLogs sheet not found');
      return;
    }
    
    // Get the username of the logged-in user
    const userProperties = PropertiesService.getUserProperties();
    const username = userProperties.getProperty('loggedInUser');
    
    if (!username) {
      Logger.log('No logged-in user found');
      return;
    }
    
    // Get current date and time in IST
    const now = new Date();
    const date = Utilities.formatDate(now, "Asia/Kolkata", "dd-MM-yyyy");
    const time = Utilities.formatDate(now, "Asia/Kolkata", "HH:mm:ss");
    
    // Find the most recent login entry for this user that doesn't have a logout time
    const data = userLogsSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === username && !data[i][4] && !data[i][5]) {
        // Update the logout date and time
        userLogsSheet.getRange(i + 1, 5).setValue(date);  // Logout Date
        userLogsSheet.getRange(i + 1, 6).setValue(time);  // Logout Time
        break;
      }
    }
    
  } catch (error) {
    Logger.log('Error logging user logout: ' + error);
  }
}

function logout() {
  try {
    // Log the logout first
    logUserLogout();
    
    // Then clear the user properties
    const userProperties = PropertiesService.getUserProperties();
    userProperties.deleteProperty('loggedInUser');
    userProperties.deleteProperty('userRole');
    userProperties.deleteProperty('userTrade');
    return true;
  } catch (error) {
    console.error('Error in logout:', error);
    return false;
  }
}

function registerUser(username, password, mobile, role, trade, dob) {
  try {
    // Input validation
    const validationErrors = validateRegistrationInput(username, password, mobile, role, trade, dob);
    if (validationErrors.length > 0) {
      return { success: false, message: validationErrors.join('. ') };
    }

    // Check username and mobile existence AFTER role-specific validation
    // This is because we want to allow registration if the mobile exists in DATA but not in LOGIN
    
    // Mobile number validation based on role
    if (role === 'admin') {
      const validAdmin = validateAdminMobile(mobile);
      if (!validAdmin.success) {
        return validAdmin;
      }
    } else if (role === 'instructor') {
      if (!trade) {
        return { success: false, message: 'Trade is required for instructor registration' };
      }
      const validInstructor = validateInstructorMobile(username, mobile, trade);
      if (!validInstructor.success) {
        return validInstructor;
      }
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const loginSheet = ss.getSheetByName("LOGIN");
    const data = loginSheet.getDataRange().getValues();

    // Check if username already exists
    const existingUser = data.find(row => row[0].toString().trim() === username.toString().trim());
    if (existingUser) {
      return { success: false, message: 'Username already exists' };
    }

    // Check if mobile number already exists in LOGIN sheet
    if (checkMobileExists(mobile)) {
      return { success: false, message: 'Mobile number already registered in the system' };
    }

    // Format date for trainee and instructor
    let formattedDob = '';
    if (role === 'trainee' || role === 'instructor' || role === 'admin') {
      try {
        const dobDate = new Date(dob);
        if (isNaN(dobDate.getTime())) {
          return { success: false, message: 'Invalid date format for DOB' };
        }
        formattedDob = Utilities.formatDate(dobDate, "Asia/Kolkata", "yyyy-MM-dd");
      } catch (e) {
        return { success: false, message: 'Invalid date format for DOB' };
      }
    }

    // Add new user
    const newRow = [
      username,
      password,
      mobile,
      role,
      role === 'admin' ? 'all' : (trade || ''),
      formattedDob || '',
      new Date() // registration date
    ];

    loginSheet.appendRow(newRow);
    return { success: true, message: 'Registration successful' };
  } catch (error) {
    Logger.log('Registration error: ' + error);
    return { success: false, message: 'An error occurred during registration' };
  }
}

function validateRegistrationInput(username, password, mobile, role, trade, dob) {
  const errors = [];
  
  if (!username || !isValidUsername(username)) {
    errors.push('Invalid username format');
  }
  
  if (!password || password.length < 3) {
    errors.push('Password must be at least 3 characters');
  }
  
  if (!mobile || !/^\d{10}$/.test(mobile)) {
    errors.push('Mobile number must be 10 digits');
  }
  
  if (!role || !['admin', 'trainee', 'instructor'].includes(role)) {
    errors.push('Invalid role selected');
  }
  
  if ((role === 'trainee' || role === 'instructor') && !trade) {
    errors.push('Trade selection is required');
  }
  
  if ((role === 'trainee' || role === 'instructor' || role === 'admin') && !dob) {
    errors.push('Date of birth is required');
  } else if ((role === 'trainee' || role === 'instructor' || role === 'admin') && dob) {
    try {
      const dobDate = new Date(dob);
      if (isNaN(dobDate.getTime())) {
        errors.push('Invalid date of birth');
      }
    } catch (e) {
      errors.push('Invalid date format');
    }
  }
  
  return errors;
}

function validateAdminMobile(mobile) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("DATA");
    if (!sheet) {
      return { success: false, message: 'Required DATA sheet not found' };
    }

    const data = sheet.getDataRange().getValues();
    
    // Get header row to find correct column indices
    const headers = data[0];
    const nameIndex = headers.findIndex(header => header.toString().toLowerCase() === 'name');
    const mobileIndex = headers.findIndex(header => header.toString().toLowerCase() === 'mobile number');

    if (nameIndex === -1 || mobileIndex === -1) {
      Logger.log('Required columns not found in DATA sheet');
      return { success: false, message: 'Required columns not found in DATA sheet' };
    }
    
    // Skip header row
    for (let i = 1; i < data.length; i++) {
      let rowName = data[i][nameIndex] ? data[i][nameIndex].toString().trim() : '';
      let rowMobile = data[i][mobileIndex] ? data[i][mobileIndex].toString().trim() : '';
      
      // Check if name is 'admin' and mobile matches
      if (rowName.toLowerCase() === 'admin' && rowMobile === mobile) {
        Logger.log('Found matching admin record in DATA sheet');
        return { success: true };
      }
    }
    
    Logger.log('No matching admin record found in DATA sheet');
    return { success: false, message: 'Mobile number does not match admin records in DATA sheet' };
  } catch (error) {
    Logger.log('Error in validateAdminMobile: ' + error);
    return { success: false, message: 'Error validating admin mobile number' };
  }
}

function validateInstructorMobile(username, mobile, trade) {
  try {
    if (!trade) {
      return { success: false, message: 'Trade is required for instructor registration' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = ss.getSheetByName("DATA");
    if (!dataSheet) {
      Logger.log('DATA sheet not found');
      return { success: false, message: 'Required data sheet not found' };
    }

    const data = dataSheet.getDataRange().getValues();
    let mobileFound = false;
    
    // Skip header row
    for (let i = 1; i < data.length; i++) {
      let rowTrade = data[i][1] ? data[i][1].toString().trim() : ''; // Trade Name is in 2nd column (index 1)
      let rowMobile = data[i][2] ? data[i][2].toString().trim() : ''; // Mobile is in 3rd column (index 2)
      
      Logger.log(`Checking row ${i + 1}: Trade=${rowTrade}, Mobile=${rowMobile}`);
      
      // Check if this mobile number exists with any trade
      if (rowMobile === mobile) {
        mobileFound = true;
        
        // If mobile exists and trade matches, allow registration
        if (rowTrade.toLowerCase() === trade.toLowerCase()) {
          Logger.log('Found matching record with correct trade and mobile');
          return { success: true };
        }
      }
    }
    
    if (mobileFound) {
      // If we found the mobile but trade didn't match
      Logger.log('Found mobile but with wrong trade');
      return { 
        success: false, 
        message: 'This mobile number is registered for a different trade. Please select the correct trade as shown in the DATA sheet.' 
      };
    } else {
      // If mobile number wasn't found at all
      Logger.log('Mobile number not found in DATA sheet');
      return { 
        success: false, 
        message: 'Mobile number not found in DATA sheet. Please ensure you are using the mobile number registered in the system.' 
      };
    }
  } catch (error) {
    Logger.log('Error in validateInstructorMobile: ' + error);
    return { success: false, message: 'Error validating mobile number' };
  }
}

function getLoggedInUser() {
  const userProperties = PropertiesService.getUserProperties();
  return userProperties.getProperty('loggedInUser');
}

function getReportHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = ss.getSheetByName("REPORT");
  return reportSheet.getRange(1, 1, 1, reportSheet.getLastColumn()).getValues()[0];
}

function getReport2Headers() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const resultSheet = ss.getSheetByName("RESULT");
    if (!resultSheet) {
      Logger.log("RESULT sheet not found");
      return [];
    }
    const headers = resultSheet.getRange(1, 1, 1, resultSheet.getLastColumn()).getValues()[0];
    Logger.log("Retrieved headers from RESULT sheet: " + JSON.stringify(headers));
    return headers;
  } catch (error) {
    Logger.log("Error in getReport2Headers: " + error.toString());
    return [];
  }
}

function getUserData(username) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = ss.getSheetByName("REPORT");
  const userProperties = PropertiesService.getUserProperties();
  const userRole = userProperties.getProperty('userRole');
  const userTrade = userProperties.getProperty('userTrade');
  
  const userRange = reportSheet.getRange(2, 1, reportSheet.getLastRow() - 1, reportSheet.getLastColumn());
  const userData = userRange.getValues();
  
  if (userRole === 'admin') {
    // For admin, return all data
    return userData;
  } else if (userRole === 'instructor') {
    // For instructors, return all data for their trade
    return userData.filter(row => row[1] === userTrade);
  } else {
    // For trainees, return only their own data
    return userData.filter(row => row[0] === username);
  }
}

function getUserData2(username) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const resultSheet = ss.getSheetByName("RESULT");
    if (!resultSheet) {
      throw new Error("RESULT sheet not found");
    }
    const userProperties = PropertiesService.getUserProperties();
    const userRole = userProperties.getProperty('userRole');
    const userTrade = userProperties.getProperty('userTrade');
    
    const userRange2 = resultSheet.getRange(2, 1, resultSheet.getLastRow() - 1, resultSheet.getLastColumn());
    const userData2 = userRange2.getValues();
    
    if (userRole === 'admin') {
      // For admin, return all data
      return userData2;
    } else if (userRole === 'instructor') {
      // For instructors, return all data for their trade
      return userData2.filter(row => row[1] === userTrade);
    } else {
      // For trainees, return only their own data
      return userData2.filter(row => row[0] === username);
    }
  } catch (error) {
    console.error('Error in getUserData2:', error);
    throw error;
  }
}

function getClassNames() {
  return getTradeNamesFromReport2();
}

function getTradeNamesFromReport2() {  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const resultSheet = ss.getSheetByName("RESULT");
    
    if (!resultSheet) {
      Logger.log("RESULT sheet not found");
      return [];
    }
    
    const lastRow = resultSheet.getLastRow();
    if (lastRow < 2) {
      Logger.log("No data found in RESULT sheet");
      return [];
    }
    
    // Get all trade names from column B (second column)
    const tradeNames = resultSheet.getRange(2, 2, lastRow - 1, 1).getValues();
    
    // Filter and clean the data
    const filteredNames = tradeNames
      .flat()
      .filter(name => name && typeof name === 'string' && name.trim() !== '')
      .map(name => name.trim());  // Trim all trade names
    
    Logger.log("Found trade names: " + JSON.stringify(filteredNames));
    return filteredNames;
    
  } catch (error) {
    Logger.log("Error in getTradeNamesFromReport2: " + error.toString());
    return [];
  }
}

function getUsernameByMobile(mobile) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const loginSheet = ss.getSheetByName("LOGIN");
  const data = loginSheet.getDataRange().getValues();
  const users = [];

  // Debug logging
  Logger.log('Searching for mobile number:', mobile);

  // Basic mobile number validation (10 digits)
  if (!/^\d{10}$/.test(mobile)) {
    Logger.log('Invalid mobile number format');
    return [];
  }

  // Convert mobile to string for comparison
  mobile = String(mobile).trim();

  for (let i = 1; i < data.length; i++) {
    // Convert sheet mobile number to string and trim
    let sheetMobile = String(data[i][2]).trim();
    
    // Debug logging
    Logger.log(`Row ${i}: Comparing sheet mobile "${sheetMobile}" with input mobile "${mobile}"`);
    
    if (sheetMobile === mobile) {
      Logger.log(`Match found! Username: ${data[i][0]}`);
      users.push({
        username: data[i][0],
        role: data[i][3] || '',
        trade: data[i][4] || '',
        registrationDate: data[i][6] ? Utilities.formatDate(new Date(data[i][6]), "Asia/Kolkata", "dd-MM-yyyy") : ''
      });
    }
  }

  Logger.log(`Found ${users.length} users for mobile ${mobile}`);
  return users;
}

function getPasswordByUsernameDobMobile(username, dob, mobile) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const loginSheet = ss.getSheetByName("LOGIN");
    const data = loginSheet.getDataRange().getValues();
    
    // Format the input date
    let formattedInputDob = '';
    try {
      const dobDate = new Date(dob);
      if (!isNaN(dobDate.getTime())) {
        formattedInputDob = Utilities.formatDate(dobDate, "Asia/Kolkata", "yyyy-MM-dd");
      }
    } catch (e) {
      return { success: false, message: 'Invalid date format' };
    }
    
    for (let i = 1; i < data.length; i++) {
      let sheetUsername = data[i][0].toString().trim();
      let sheetDob = data[i][5];
      let sheetMobile = data[i][2].toString().trim();
      let userRole = data[i][3].toString().trim();
      
      // Skip admin users - don't allow password retrieval
      if (userRole === 'admin') {
        continue;
      }
      
      // Format sheet date
      let formattedSheetDob = '';
      if (sheetDob instanceof Date && !isNaN(sheetDob)) {
        formattedSheetDob = Utilities.formatDate(sheetDob, "Asia/Kolkata", "yyyy-MM-dd");
      } else if (typeof sheetDob === 'string') {
        try {
          const parsedDate = new Date(sheetDob);
          if (!isNaN(parsedDate.getTime())) {
            formattedSheetDob = Utilities.formatDate(parsedDate, "Asia/Kolkata", "yyyy-MM-dd");
          }
        } catch (e) {
          continue;
        }
      }
      
      if (sheetUsername === username && 
          formattedSheetDob === formattedInputDob && 
          sheetMobile === mobile) {
        return { 
          success: true, 
          password: data[i][1],
          message: 'Password found successfully' 
        };
      }
    }
    
    return { success: false, message: 'No matching record found' };
  } catch (error) {
    Logger.log('Error retrieving password: ' + error);
    return { success: false, message: 'An error occurred while retrieving the password' };
  }
}

function exportTableAsCSV(sheetName) {
  const userProperties = PropertiesService.getUserProperties();
  const username = userProperties.getProperty('loggedInUser');
  const role = userProperties.getProperty('userRole');
  const trade = userProperties.getProperty('userTrade');

  // Check if user is logged in and has admin role
  if (!username || role !== 'admin') {
    throw new Error('Access denied. Only administrators can export data.');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    return null;
  }

  const values = sheet.getDataRange().getValues();
  let csvContent = [];

  // Process headers (first row) - remove newlines and properly escape
  if (values.length > 0) {
    const headers = values[0].map(header => {
      // Convert to string and clean up header
      let cleanHeader = header.toString()
        .replace(/\r?\n|\r/g, ' ') // Replace newlines with spaces
        .replace(/\s+/g, ' ')      // Replace multiple spaces with single space
        .trim();                   // Remove leading/trailing spaces
      
      // Escape quotes and wrap in quotes if contains comma, quotes, or spaces
      if (cleanHeader.includes('"') || cleanHeader.includes(',') || cleanHeader.includes(' ')) {
        return `"${cleanHeader.replace(/"/g, '""')}"`;
      }
      return cleanHeader;
    });
    csvContent.push(headers);
  }

  // Process data rows
  values.slice(1).forEach(row => {
    if (role === 'admin' || 
        (role === 'instructor' && row[1].toString() === trade) || 
        (role === 'trainee' && row[0].toString() === username.toString())) {
      
      const processedRow = row.map(cell => {
        // Convert to string and clean up cell content
        let cleanCell = cell.toString()
          .replace(/\r?\n|\r/g, ' ') // Replace newlines with spaces
          .replace(/\s+/g, ' ')      // Replace multiple spaces with single space
          .trim();                   // Remove leading/trailing spaces

        // Escape quotes and wrap in quotes if contains comma, quotes, or spaces
        if (cleanCell.includes('"') || cleanCell.includes(',') || cleanCell.includes(' ')) {
          return `"${cleanCell.replace(/"/g, '""')}"`;
        }
        return cleanCell;
      });
      csvContent.push(processedRow);
    }
  });

  // Join rows with newlines and ensure proper line endings
  return csvContent.map(row => row.join(',')).join('\r\n');
}

function getDataForUser() {
  const userProperties = PropertiesService.getUserProperties();
  const username = userProperties.getProperty('loggedInUser');
  const role = userProperties.getProperty('userRole');
  const trade = userProperties.getProperty('userTrade');

  if (!username) {
    return null;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = ss.getSheetByName('REPORT');
  const resultSheet = ss.getSheetByName('RESULT');
  
  let reportData = [];
  let resultData = [];

  // Get data from REPORT sheet
  if (reportSheet) {
    const reportValues = reportSheet.getDataRange().getValues();
    const reportHeaders = reportValues[0];
    const dataRows = reportValues.slice(1).map((row, rowIndex) => {
      // For admin, get all rows. For instructor, get all rows of their trade. For trainee, filter by username.
      if (role === 'admin' || (role === 'instructor' && row[1].toString() === trade) || (role === 'trainee' && row[0].toString() === username.toString())) {
        const rowNumber = rowIndex + 2; // Add 2 because we sliced off header and arrays are 0-based
        const formattedRow = row.map((cell, colIndex) => {
          const range = reportSheet.getRange(rowNumber, colIndex + 1);
          const textStyle = range.getTextStyle();
          return {
            value: cell,
            background: range.getBackground(),
            foreground: range.getFontColor(),
            bold: range.getFontWeight() === 'bold',
            italic: range.getFontStyle() === 'italic',
            underline: textStyle.isUnderline(),
            strikethrough: textStyle.isStrikethrough()
          };
        });
        return formattedRow;
      }
      return null;
    }).filter(row => row !== null);

    reportData = {
      headers: reportHeaders.map((header, index) => {
        const range = reportSheet.getRange(1, index + 1);
        const textStyle = range.getTextStyle();
        return {
          value: header,
          background: range.getBackground(),
          foreground: range.getFontColor(),
          bold: range.getFontWeight() === 'bold',
          italic: range.getFontStyle() === 'italic',
          underline: textStyle.isUnderline(),
          strikethrough: textStyle.isStrikethrough()
        };
      }),
      data: dataRows
    };
  }

  // Get data from RESULT sheet
  if (resultSheet) {
    const resultValues = resultSheet.getDataRange().getValues();
    const resultHeaders = resultValues[0];
    const dataRows = resultValues.slice(1).map((row, rowIndex) => {
      // For admin, get all rows. For instructor, get all rows of their trade. For trainee, filter by username.
      if (role === 'admin' || (role === 'instructor' && row[1].toString() === trade) || (role === 'trainee' && row[0].toString() === username.toString())) {
        const rowNumber = rowIndex + 2; // Add 2 because we sliced off header and arrays are 0-based
        const formattedRow = row.map((cell, colIndex) => {
          const range = resultSheet.getRange(rowNumber, colIndex + 1);
          const textStyle = range.getTextStyle();
          return {
            value: cell,
            background: range.getBackground(),
            foreground: range.getFontColor(),
            bold: range.getFontWeight() === 'bold',
            italic: range.getFontStyle() === 'italic',
            underline: textStyle.isUnderline(),
            strikethrough: textStyle.isStrikethrough()
          };
        });
        return formattedRow;
      }
      return null;
    }).filter(row => row !== null);

    resultData = {
      headers: resultHeaders.map((header, index) => {
        const range = resultSheet.getRange(1, index + 1);
        const textStyle = range.getTextStyle();
        return {
          value: header,
          background: range.getBackground(),
          foreground: range.getFontColor(),
          bold: range.getFontWeight() === 'bold',
          italic: range.getFontStyle() === 'italic',
          underline: textStyle.isUnderline(),
          strikethrough: textStyle.isStrikethrough()
        };
      }),
      data: dataRows
    };
  }
  
  return {
    username: username,
    role: role,
    trade: trade,
    reportData: reportData,
    resultData: resultData
  };
}

function isValidUsername(username) {
  // Username must contain at least one letter and can include numbers
  return /^(?=.*[a-zA-Z])[a-zA-Z0-9]+$/.test(username);
}

function checkMobileExists(mobile) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const loginSheet = ss.getSheetByName("LOGIN");
    const data = loginSheet.getDataRange().getValues();
    
    // Skip header row and check if mobile exists
    for (let i = 1; i < data.length; i++) {
      if (data[i][2] && data[i][2].toString().trim() === mobile.toString().trim()) {
        return true;
      }
    }
    return false;
  } catch (error) {
    Logger.log('Error checking mobile existence: ' + error);
    throw new Error('Error checking mobile number');
  }
}