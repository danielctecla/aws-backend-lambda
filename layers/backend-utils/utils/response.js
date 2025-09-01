/**
 * Creates a standardized HTTP response for Lambda
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Descriptive message
 * @param {Object} [data] - Optional data to include in response
 * @param {Object} [headers] - Optional additional headers
 * @returns {Object} Formatted response for API Gateway
 */
const customResponse = (statusCode, message, data = null, headers = {}) => {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };

  const responseBody = {
    statusCode: statusCode,
    message: message
  };

  if (data !== null) {
    responseBody.data = data;
  }

  return {
    statusCode: statusCode,
    headers: { ...defaultHeaders, ...headers },
    body: JSON.stringify(responseBody)
  };
};

module.exports = { customResponse };