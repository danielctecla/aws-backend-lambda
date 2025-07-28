exports.handler = async (event) => {
    const response = {
        statusCode: 200,
        body: JSON.stringify({
            status: 'OK',
            timestamp: new Date().toISOString()
        })
    };

    return response;
};
