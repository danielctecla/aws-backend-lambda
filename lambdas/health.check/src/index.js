const { customResponse } = require('/opt/nodejs/utils/response');

exports.handler = async (event) => {
    return customResponse(200, 'Health check successful', {
        status: 'OK',
        timestamp: new Date().toISOString()
    });
};
