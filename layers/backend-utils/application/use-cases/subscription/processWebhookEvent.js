class ProcessWebhookEvent {
  constructor(subscriptionRepository) {
    this.subscriptionRepository = subscriptionRepository;
  }

  async execute(event) {
    try {
      console.log(`Processing webhook event: ${event.type}`);
      
      switch (event.type) {
        case 'customer.subscription.created':
          return await this.handleSubscriptionCreated(event.data.object);
        
        case 'customer.subscription.updated':
          return await this.handleSubscriptionUpdated(event.data.object);
        
        case 'customer.subscription.deleted':
          return await this.handleSubscriptionDeleted(event.data.object);
        
        case 'invoice.payment_succeeded':
          return await this.handlePaymentSucceeded(event.data.object);
        
        case 'invoice.payment_failed':
          return await this.handlePaymentFailed(event.data.object);
        
        default:
          console.log(`Unhandled event type: ${event.type}`);
          return { success: true, message: `Event ${event.type} received but not processed` };
      }
    } catch (error) {
      console.error('Error processing webhook event:', error);
      throw error;
    }
  }

  async handleSubscriptionCreated(stripeSubscription) {
    try {
      console.log('Handling subscription created for customer:', JSON.stringify(stripeSubscription.customer));

      if (!stripeSubscription.customer) {
        console.error('Missing customer ID in subscription created event');
        return { success: false, message: 'Invalid subscription data: missing customer' };
      }

      // Extraer user_id de la metadata
      const userId = stripeSubscription.metadata?.user_id;
      if (!userId) {
        console.error('Missing user_id in subscription metadata');
        return { 
          success: true, 
          message: 'Subscription created but user_id not found in metadata',
          requiresManualReview: true,
          customerId: stripeSubscription.customer
        };
      }

      // Buscar si ya existe una suscripción para este customer
      const existingSubscription = await this.subscriptionRepository.findByCustomerId(stripeSubscription.customer);
      
      const planSnapshot = this.extractPlanSnapshot(stripeSubscription);
      const isActive = stripeSubscription.status === 'active';

      if (existingSubscription) {
        // Actualizar la suscripción existente
        const updateResult = await this.subscriptionRepository.updateByCustomerId(stripeSubscription.customer, {
          plan_snapshot: planSnapshot,
          is_active: isActive,
        });

        if (!updateResult.updated) {
          return { success: false, message: `Update failed: ${updateResult.reason}` };
        }
        
        console.log('Subscription updated for existing customer:', stripeSubscription.customer);
        return { success: true, message: 'Existing subscription updated', data: updateResult.data };
      } else {
        // Crear nueva suscripción usando user_id de metadata
        console.log(`Creating new subscription for user: ${userId}, customer: ${stripeSubscription.customer}`);
        
        const { Subscription } = require('../../../domain/entities/Subscription');
        const newSubscription = new Subscription(
          userId,
          stripeSubscription.customer,
          planSnapshot,
          isActive
        );

        const createResult = await this.subscriptionRepository.create(newSubscription);
        
        if (!createResult.created) {
          if (createResult.reason === 'already_exists') {
            console.log('Subscription already exists, updating instead');
            const updateResult = await this.subscriptionRepository.updateByCustomerId(stripeSubscription.customer, {
              plan_snapshot: planSnapshot,
              is_active: isActive
            });
            return { success: true, message: 'Subscription updated (was duplicate)', data: updateResult.data };
          }
          return { success: false, message: `Creation failed: ${createResult.reason}` };
        }

        console.log(`New subscription created successfully for user: ${userId}`);
        return { 
          success: true, 
          message: 'New subscription created successfully',
          data: createResult.data
        };
      }
    } catch (error) {
      console.error('Error handling subscription created:', error);
      throw error;
    }
  }

  async handleSubscriptionUpdated(stripeSubscription) {
    try {
      console.log('Handling subscription updated for customer:', stripeSubscription.customer);
      
      if (!stripeSubscription.customer) {
        console.error('Missing customer ID in subscription updated event');
        return { success: false, message: 'Invalid subscription data: missing customer' };
      }

      const planSnapshot = this.extractPlanSnapshot(stripeSubscription);
      const isActive = stripeSubscription.status === 'active';
      
      const updateResult = await this.subscriptionRepository.updateByCustomerId(stripeSubscription.customer, {
        plan_snapshot: planSnapshot,
        is_active: isActive
      });

      if (!updateResult.updated) {
        if (updateResult.reason === 'subscription_not_found') {
          console.log(`Subscription not found for customer: ${stripeSubscription.customer}. This may be a new customer.`);
          return { 
            success: true, 
            message: 'Subscription not found but this may be expected for new customers',
            requiresManualReview: true 
          };
        }
        
        if (updateResult.reason === 'duplicate_update') {
          console.log(`Duplicate update ignored for customer: ${stripeSubscription.customer}`);
          return { success: true, message: 'Duplicate update ignored' };
        }

        return { success: false, message: `Update failed: ${updateResult.reason}` };
      }
      
      console.log(`Subscription updated - Status: ${stripeSubscription.status}, Active: ${isActive}`);
      return { success: true, message: 'Subscription updated successfully', data: updateResult.data };
    } catch (error) {
      console.error('Error handling subscription updated:', error);
      throw error;
    }
  }

  async handleSubscriptionDeleted(stripeSubscription) {
    try {
      console.log('Handling subscription deleted for customer:', stripeSubscription.customer);
      
      if (!stripeSubscription.customer) {
        console.error('Missing customer ID in subscription deleted event');
        return { success: false, message: 'Invalid subscription data: missing customer' };
      }

      const updateResult = await this.subscriptionRepository.updateByCustomerId(stripeSubscription.customer, {
        is_active: false
      });

      if (!updateResult.updated) {
        if (updateResult.reason === 'subscription_not_found') {
          console.log(`Subscription not found for customer: ${stripeSubscription.customer}. May have been already deleted.`);
          return { success: true, message: 'Subscription was already deleted or not found' };
        }

        if (updateResult.reason === 'duplicate_update') {
          console.log(`Duplicate deletion ignored for customer: ${stripeSubscription.customer}`);
          return { success: true, message: 'Duplicate deletion ignored' };
        }

        return { success: false, message: `Deactivation failed: ${updateResult.reason}` };
      }
      
      console.log('Subscription deactivated');
      return { success: true, message: 'Subscription deactivated successfully', data: updateResult.data };
    } catch (error) {
      console.error('Error handling subscription deleted:', error);
      throw error;
    }
  }

  async handlePaymentSucceeded(invoice) {
    try {
      if (!invoice.customer) {
        console.error('Missing customer ID in payment succeeded event');
        return { success: false, message: 'Invalid invoice data: missing customer' };
      }

      if (invoice.subscription && invoice.customer) {
        console.log('Handling payment succeeded for customer:', invoice.customer);
        
        const updateResult = await this.subscriptionRepository.updateByCustomerId(invoice.customer, {
          is_active: true
        });

        if (!updateResult.updated) {
          if (updateResult.reason === 'subscription_not_found') {
            console.log(`No subscription found for customer: ${invoice.customer} during payment success`);
            return { 
              success: true, 
              message: 'Payment succeeded but no subscription found',
              requiresManualReview: true 
            };
          }

          if (updateResult.reason === 'duplicate_update') {
            console.log(`Duplicate payment success ignored for customer: ${invoice.customer}`);
            return { success: true, message: 'Duplicate payment success ignored' };
          }

          return { success: false, message: `Payment activation failed: ${updateResult.reason}` };
        }
        
        console.log('Subscription activated after successful payment');
        return { success: true, message: 'Subscription activated after payment', data: updateResult.data };
      }
      
      return { success: true, message: 'Payment processed (no subscription)' };
    } catch (error) {
      console.error('Error handling payment succeeded:', error);
      throw error;
    }
  }

  async handlePaymentFailed(invoice) {
    try {
      if (!invoice.customer) {
        console.error('Missing customer ID in payment failed event');
        return { success: false, message: 'Invalid invoice data: missing customer' };
      }

      if (invoice.subscription && invoice.customer) {
        console.log('Handling payment failed for customer:', invoice.customer);
        
        const updateResult = await this.subscriptionRepository.updateByCustomerId(invoice.customer, {
          is_active: false
        });

        if (!updateResult.updated) {
          if (updateResult.reason === 'subscription_not_found') {
            console.log(`No subscription found for customer: ${invoice.customer} during payment failure`);
            return { 
              success: true, 
              message: 'Payment failed but no subscription found',
              requiresManualReview: true 
            };
          }

          if (updateResult.reason === 'duplicate_update') {
            console.log(`Duplicate payment failure ignored for customer: ${invoice.customer}`);
            return { success: true, message: 'Duplicate payment failure ignored' };
          }

          return { success: false, message: `Payment deactivation failed: ${updateResult.reason}` };
        }
        
        console.log('Subscription deactivated after failed payment');
        return { success: true, message: 'Subscription deactivated after payment failure', data: updateResult.data };
      }
      
      return { success: true, message: 'Payment failure processed (no subscription)' };
    } catch (error) {
      console.error('Error handling payment failed:', error);
      throw error;
    }
  }

  // Helper para extraer información del plan de Stripe
  extractPlanSnapshot(stripeSubscription) {
    try {
      if (!stripeSubscription?.items?.data || stripeSubscription.items.data.length === 0) {
        console.warn('No subscription items found in Stripe subscription');
        return {};
      }

      const priceItem = stripeSubscription.items.data[0];
      if (!priceItem?.price) {
        console.warn('No price information found in subscription item');
        return {};
      }
      
      return {
        price_id: priceItem.price.id || null,
        product_id: priceItem.price.product || null,
        unit_amount: priceItem.price.unit_amount || 0,
        currency: priceItem.price.currency || 'usd',
        interval: priceItem.price.recurring?.interval || null,
        interval_count: priceItem.price.recurring?.interval_count || 1,
        nickname: priceItem.price.nickname || null,
        subscription_id: stripeSubscription.id || null,
        customer_id: stripeSubscription.customer || null,
        status: stripeSubscription.status || null,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error extracting plan snapshot:', error);
      return {
        error: 'Failed to extract plan information',
        created_at: new Date().toISOString()
      };
    }
  }
  
}