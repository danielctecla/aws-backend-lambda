/**
 * Crea una respuesta HTTP estandarizada para Lambda
 * @param {number} statusCode - Código de estado HTTP
 * @param {string} message - Mensaje descriptivo
 * @param {Object} [data] - Datos opcionales para incluir en la respuesta
 * @param {Object} [headers] - Headers adicionales opcionales
 * @returns {Object} Respuesta formateada para API Gateway
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