const { getStripe } = require('/opt/nodejs/utils/stripe');
const { customResponse } = require('/opt/nodejs/utils/response');

exports.handler = async () => {
  try {
    const stripe = getStripe();
    
    const products = await stripe.products.list({
      active: true,
      limit: 50
    });

    const productsWithPrices = await Promise.all(
      products.data.map(async (product) => {
        const prices = await stripe.prices.list({
          product: product.id,
          active: true
        });

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          prices: prices.data.map(price => ({
            id: price.id,
            amount: price.unit_amount / 100, // Convert to mxn
            currency: price.currency,
            recurring: {
              interval: price.recurring.interval,
              interval_count: price.recurring.interval_count,
              trial_period_days: price.recurring.trial_period_days
            }
          }))
        };
      })
    );

    return customResponse(
      200,
      'Products retrieved successfully',
      productsWithPrices
    );

  } catch (error) {
    console.error(error);
    return customResponse(
      500,
      'Error retrieving products',
      null
    );
  }
};
