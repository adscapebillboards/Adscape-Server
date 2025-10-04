/**
 * Time Utility Functions for IST (India Standard Time)
 * All time operations should use these functions to ensure consistency
 */

// IST timezone offset: UTC+5:30
const IST_OFFSET = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds

/**
 * Get current date/time in IST
 * @returns {Date} Current date/time in IST
 */
const getCurrentISTTime = () => {
  const utcTime = new Date();
  return new Date(utcTime.getTime() + IST_OFFSET);
};

/**
 * Convert UTC date to IST
 * @param {Date|string} utcDate - UTC date or date string
 * @returns {Date} Date in IST
 */
const convertUTCToIST = (utcDate) => {
  const date = new Date(utcDate);
  return new Date(date.getTime() + IST_OFFSET);
};

/**
 * Convert IST date to UTC
 * @param {Date|string} istDate - IST date or date string
 * @returns {Date} Date in UTC
 */
const convertISTToUTC = (istDate) => {
  const date = new Date(istDate);
  return new Date(date.getTime() - IST_OFFSET);
};

/**
 * Get current date in IST as YYYY-MM-DD format
 * @returns {string} Current date in YYYY-MM-DD format (IST)
 */
const getCurrentISTDate = () => {
  const istTime = getCurrentISTTime();
  return istTime.toISOString().slice(0, 10);
};

/**
 * Get current timestamp in IST ISO format
 * @returns {string} Current timestamp in ISO format (IST)
 */
const getISTTimestamp = () => {
  const istTime = getCurrentISTTime();
  return istTime.toISOString();
};

/**
 * Format date to IST string with custom format
 * @param {Date|string} date - Date to format
 * @param {string} format - Format string ('short', 'long', 'time', 'datetime')
 * @returns {string} Formatted date string in IST
 */
const formatISTDate = (date, format = 'short') => {
  const istDate = convertUTCToIST(date);
  
  switch (format) {
    case 'short':
      return istDate.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    case 'long':
      return istDate.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
    case 'time':
      return istDate.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    case 'datetime':
      return istDate.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    default:
      return istDate.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata'
      });
  }
};

/**
 * Create IST date from components
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {number} day - Day (1-31)
 * @param {number} hour - Hour (0-23, optional)
 * @param {number} minute - Minute (0-59, optional)
 * @param {number} second - Second (0-59, optional)
 * @returns {Date} Date in IST
 */
const createISTDate = (year, month, day, hour = 0, minute = 0, second = 0) => {
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return convertUTCToIST(utcDate);
};

/**
 * Get start of day in IST
 * @param {Date|string} date - Date to get start of day for
 * @returns {Date} Start of day in IST
 */
const getStartOfDayIST = (date) => {
  const istDate = convertUTCToIST(date);
  return new Date(istDate.getFullYear(), istDate.getMonth(), istDate.getDate());
};

/**
 * Get end of day in IST
 * @param {Date|string} date - Date to get end of day for
 * @returns {Date} End of day in IST
 */
const getEndOfDayIST = (date) => {
  const istDate = convertUTCToIST(date);
  return new Date(istDate.getFullYear(), istDate.getMonth(), istDate.getDate(), 23, 59, 59, 999);
};

/**
 * Check if a date is today in IST
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is today in IST
 */
const isTodayIST = (date) => {
  const istDate = convertUTCToIST(date);
  const today = getCurrentISTTime();
  return istDate.toDateString() === today.toDateString();
};

/**
 * Get relative time string in IST (e.g., "2 hours ago", "yesterday")
 * @param {Date|string} date - Date to get relative time for
 * @returns {string} Relative time string
 */
const getRelativeTimeIST = (date) => {
  const istDate = convertUTCToIST(date);
  const now = getCurrentISTTime();
  const diffMs = now - istDate;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return formatISTDate(date, 'short');
};

/**
 * Get date range for a specific period in IST
 * @param {string} period - Period ('today', 'yesterday', 'thisWeek', 'thisMonth', 'lastMonth')
 * @returns {Object} Object with start and end dates in IST
 */
const getDateRangeIST = (period) => {
  const now = getCurrentISTTime();
  
  switch (period) {
    case 'today':
      return {
        start: getStartOfDayIST(now),
        end: getEndOfDayIST(now)
      };
    case 'yesterday':
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return {
        start: getStartOfDayIST(yesterday),
        end: getEndOfDayIST(yesterday)
      };
    case 'thisWeek':
      const startOfWeek = new Date(now.getTime() - now.getDay() * 24 * 60 * 60 * 1000);
      return {
        start: getStartOfDayIST(startOfWeek),
        end: getEndOfDayIST(now)
      };
    case 'thisMonth':
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        start: getStartOfDayIST(startOfMonth),
        end: getEndOfDayIST(now)
      };
    case 'lastMonth':
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        start: getStartOfDayIST(startOfLastMonth),
        end: getEndOfDayIST(endOfLastMonth)
      };
    default:
      return {
        start: getStartOfDayIST(now),
        end: getEndOfDayIST(now)
      };
  }
};

module.exports = {
  getCurrentISTTime,
  convertUTCToIST,
  convertISTToUTC,
  getCurrentISTDate,
  getISTTimestamp,
  formatISTDate,
  createISTDate,
  getStartOfDayIST,
  getEndOfDayIST,
  isTodayIST,
  getRelativeTimeIST,
  getDateRangeIST
};

