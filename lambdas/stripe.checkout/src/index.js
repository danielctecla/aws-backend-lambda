const { CheckoutController } = require('/opt/nodejs/presentation/controllers');
const { customResponse } = require('/opt/nodejs/presentation/response');

const checkoutController = new CheckoutController();

const METHOD_NOT_ALLOWED = 405;
const INTERNAL_SERVER_ERROR = 500;

exports.handler = async (event) => {
  try {
    const method = event.httpMethod;

    switch (method) {
      case 'POST':
        return await checkoutController.createCheckoutSession(event);
      case 'GET':
        return await checkoutController.getCheckoutSession(event);
      default:
        return customResponse(METHOD_NOT_ALLOWED, 'Method not allowed', null);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Checkout handler error:', error);
    return customResponse(INTERNAL_SERVER_ERROR, 'Internal server error', null);
  }
};