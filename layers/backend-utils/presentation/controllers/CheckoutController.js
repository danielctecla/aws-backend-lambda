// Clean imports using package exports
const { CreateCheckoutRequest } = require('/opt/nodejs/application/dtos');
const { CreateCheckoutUseCase, GetCheckoutSessionUseCase } = require('/opt/nodejs/application/use-cases/subscription');
const { StripePaymentGateway, SupabaseSessionValidator, SupabaseSubscriptionRepository } = require('/opt/nodejs/infrastructure/adapters');
const { customResponse } = require('/opt/nodejs/presentation/response');
const { ValidationError, NotFoundError, AuthorizationError, DomainError } = require('/opt/nodejs/domain/errors');

/**
 * Checkout controller handling HTTP requests
 */
class CheckoutController {
  constructor() {
    this.paymentGateway = new StripePaymentGateway();
    this.sessionValidator = new SupabaseSessionValidator();
    this.subscriptionRepository = new SupabaseSubscriptionRepository();
    this.createCheckoutUseCase = new CreateCheckoutUseCase(
      this.sessionValidator,
      this.subscriptionRepository, 
      this.paymentGateway
    );
    this.getCheckoutUseCase = new GetCheckoutSessionUseCase(this.paymentGateway);
  }

  async createCheckoutSession(event) {
    try {
      // Extract authorization token
      const authToken = event.headers?.Authorization || event.headers?.authorization;
      
      if (!authToken) {
        return customResponse(401, 'Authorization token is required', null);
      }

      // Parse request body
      const requestBody = JSON.parse(event.body || '{}');
      
      // Create request DTO
      const createCheckoutRequest = new CreateCheckoutRequest(
        requestBody.price_id,
        requestBody.success_url,
        requestBody.cancel_url,
        requestBody.quantity,
        requestBody.metadata
      );

      // Execute use case
      const result = await this.createCheckoutUseCase.execute(createCheckoutRequest, authToken);

      return customResponse(
        201,
        'Checkout session created successfully',
        {
          session_id: result.sessionId,
          checkout_url: result.checkoutUrl,
          status: result.status,
          customer_id: result.customerId,
          action: result.action
        }
      );

    } catch (error) {
      return this.handleError(error);
    }
  }

  async getCheckoutSession(event) {
    try {
      const sessionId = event.pathParameters?.session_id;
      
      if (!sessionId) {
        return customResponse(400, 'Session ID is required', null);
      }

      const session = await this.getCheckoutUseCase.execute(sessionId);

      return customResponse(
        200,
        'Checkout session retrieved successfully',
        session
      );

    } catch (error) {
      return this.handleError(error);
    }
  }

  handleError(error) {
    console.error('Controller error:', error);

    if (error instanceof ValidationError) {
      return customResponse(400, error.message, { errors: [error.message] });
    }

    if (error instanceof AuthorizationError) {
      return customResponse(401, error.message, null);
    }

    if (error instanceof NotFoundError) {
      return customResponse(404, error.message, null);
    }

    if (error instanceof DomainError) {
      return customResponse(400, error.message, null);
    }

    // Handle specific Stripe errors
    if (error.message.includes('No such price')) {
      return customResponse(400, 'Invalid price ID', null);
    }

    if (error.message.includes('Database') || error.message.includes('Stripe')) {
      return customResponse(500, 'Service temporarily unavailable', null);
    }

    // Generic error
    return customResponse(500, 'Internal server error', null);
  }
}

module.exports = { CheckoutController };