/**
 * Time Utility Functions for IST (India Standard Time)
 * All time operations should use these functions to ensure consistency
 * Note: JavaScript Date objects are always stored in UTC internally
 * These functions help work with IST timezone (Asia/Kolkata, UTC+5:30)
 */

/**
 * Get current date/time (represents IST when formatted)
 * @returns {Date} Current date/time
 */
const getCurrentISTTime = () => {
  return new Date();
};

/**
 * Get current date in IST as YYYY-MM-DD format
 * @returns {string} Current date in YYYY-MM-DD format (IST)
 */
const getCurrentISTDate = () => {
  const now = new Date();
  const istString = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [month, day, year] = istString.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

/**
 * Format date to IST string (YYYY-MM-DD)
 * @param {Date|string} date - Date to format
 * @returns {string} Date string in YYYY-MM-DD format (IST)
 */
const formatISTDateString = (date) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const istString = dateObj.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [month, day, year] = istString.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

/**
 * Parse date string as IST date (for dates coming from client)
 * @param {string} dateString - Date string in YYYY-MM-DD format (assumed to be IST)
 * @returns {Date} Date object (stored as UTC, represents IST date)
 */
const parseISTDate = (dateString) => {
  // If date string is YYYY-MM-DD, create date at midnight IST
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    // Create date string with IST timezone offset (+05:30)
    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T00:00:00+05:30`;
    return new Date(dateStr);
  }
  
  // For ISO strings with timezone, parse normally
  if (dateString.includes('T') || dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
    return new Date(dateString);
  }
  
  // For other formats, parse normally (assume already in correct timezone)
  return new Date(dateString);
};

/**
 * Get current timestamp in ISO format
 * @returns {string} Current timestamp in ISO format
 */
const getISTTimestamp = () => {
  return new Date().toISOString();
};

/**
 * Format date to IST string with custom format
 * @param {Date|string} date - Date to format
 * @param {string} format - Format string ('short', 'long', 'time', 'datetime')
 * @returns {string} Formatted date string in IST
 */
const formatISTDate = (date, format = 'short') => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  switch (format) {
    case 'short':
      return dateObj.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    case 'long':
      return dateObj.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
    case 'time':
      return dateObj.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    case 'datetime':
      return dateObj.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    default:
      return dateObj.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata'
      });
  }
};

/**
 * Get start of day in IST (00:00:00 IST)
 * @param {Date|string} date - Date to get start of day for
 * @returns {Date} Start of day in IST
 */
const getStartOfDayIST = (date) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const istString = dateObj.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [month, day, year] = istString.split('/');
  const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00+05:30`;
  return new Date(dateStr);
};

/**
 * Get end of day in IST (23:59:59 IST)
 * @param {Date|string} date - Date to get end of day for
 * @returns {Date} End of day in IST
 */
const getEndOfDayIST = (date) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const istString = dateObj.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [month, day, year] = istString.split('/');
  const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:59+05:30`;
  return new Date(dateStr);
};

/**
 * Check if a date is today in IST
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is today in IST
 */
const isTodayIST = (date) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const todayStr = getCurrentISTDate();
  const dateStr = formatISTDateString(dateObj);
  return todayStr === dateStr;
};

module.exports = {
  getCurrentISTTime,
  getCurrentISTDate,
  getISTTimestamp,
  formatISTDate,
  formatISTDateString,
  parseISTDate,
  getStartOfDayIST,
  getEndOfDayIST,
  isTodayIST
};
