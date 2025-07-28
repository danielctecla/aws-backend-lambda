const { handler } = require('../../lambdas/health.check/src/index');

describe('Health Check Lambda', () => {
  test('should return 200 status code', async () => {
    const event = {};
    const result = await handler(event);
    
    expect(result.statusCode).toBe(200);
  });

  test('should return OK status in response body', async () => {
    const event = {};
    const result = await handler(event);
    const body = JSON.parse(result.body);
    
    expect(body.status).toBe('OK');
  });

  test('should include timestamp in response', async () => {
    const event = {};
    const result = await handler(event);
    const body = JSON.parse(result.body);
    
    expect(body.timestamp).toBeDefined();
    const timestamp = new Date(body.timestamp);
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).not.toBeNaN();
  });
});
