// Mock the layer dependencies before requiring the handler
jest.doMock('/opt/nodejs/presentation/response', () => ({
  customResponse: (statusCode, message, data = null, headers = {}) => {
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
  }
}), { virtual: true });

jest.doMock('/opt/nodejs/presentation/controllers', () => ({
  HealthController: jest.fn().mockImplementation(() => ({
    healthCheck: jest.fn().mockResolvedValue({
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        statusCode: 200,
        message: 'Health check successful',
        data: {
          status: 'OK',
          timestamp: new Date().toISOString()
        }
      })
    })
  })),
  CheckoutController: jest.fn(),
  ProductController: jest.fn()
}), { virtual: true });

const { handler } = require('../../lambdas/health.check/src/index');

describe('Health Check Lambda', () => {
  test('should return 200 status code', async () => {
    const event = {};
    const result = await handler(event);
    
    expect(result.statusCode).toBe(200);
  });

  test('should return success message', async () => {
    const event = {};
    const result = await handler(event);
    const body = JSON.parse(result.body);
    
    expect(body.message).toBe('Health check successful');
  });

  test('should return OK status in response data', async () => {
    const event = {};
    const result = await handler(event);
    const body = JSON.parse(result.body);
    
    expect(body.data.status).toBe('OK');
  });

  test('should include timestamp in response data', async () => {
    const event = {};
    const result = await handler(event);
    const body = JSON.parse(result.body);
    
    expect(body.data.timestamp).toBeDefined();
    const timestamp = new Date(body.data.timestamp);
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).not.toBeNaN();
  });

  test('should include proper CORS headers', async () => {
    const event = {};
    const result = await handler(event);
    
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(result.headers['Content-Type']).toBe('application/json');
  });
});
