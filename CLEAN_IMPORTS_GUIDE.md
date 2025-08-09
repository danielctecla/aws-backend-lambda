# Clean Import Patterns Guide

## Overview
We've implemented clean import paths to replace relative imports like `../../domain/entities` with clean paths like `/opt/nodejs/domain/entities`.

## Available Clean Import Paths

### Domain Layer
```javascript
// Entities
const { User, Subscription, Product, Price, CheckoutSession } = require('/opt/nodejs/domain/entities');

// Errors
const { DomainError, ValidationError, NotFoundError, AuthorizationError } = require('/opt/nodejs/domain/errors');

// Value Objects
const { Email, Money } = require('/opt/nodejs/domain/value-objects');
```

### Application Layer
```javascript
// DTOs
const { CreateCheckoutRequest, CheckoutResponse, ProductResponse } = require('/opt/nodejs/application/dtos');

// Auth Use Cases
const { ISessionValidator, ValidateSessionUseCase } = require('/opt/nodejs/application/use-cases/auth');

// Subscription Use Cases
const { 
  IPaymentGateway, 
  ISubscriptionRepository, 
  CreateCheckoutUseCase, 
  GetCheckoutSessionUseCase, 
  HandleSubscriptionUseCase 
} = require('/opt/nodejs/application/use-cases/subscription');

// Catalog Use Cases
const { IProductRepository, GetProductsUseCase } = require('/opt/nodejs/application/use-cases/catalog');
```

### Infrastructure Layer
```javascript
// Adapters
const { 
  StripePaymentGateway, 
  StripeProductRepository, 
  SupabaseSessionValidator, 
  SupabaseSubscriptionRepository 
} = require('/opt/nodejs/infrastructure/adapters');

// Clients
const { getStripe, getSupabase } = require('/opt/nodejs/infrastructure/clients');
```

### Presentation Layer
```javascript
// Controllers
const { CheckoutController, HealthController, ProductController } = require('/opt/nodejs/presentation/controllers');

// Response utilities
const { customResponse } = require('/opt/nodejs/presentation/response');
```

## Benefits

1. **No Relative Paths**: No more `../../` imports
2. **Clear Module Location**: Easy to understand where modules come from
3. **IDE Support**: Better autocomplete and navigation
4. **Consistent**: Same pattern across all files
5. **Maintainable**: Easy to refactor and move files

## Examples

### Before (Relative Imports)
```javascript
const { User } = require('../../domain/entities/User');
const { ValidationError } = require('../../domain/errors/DomainError');
const { CreateCheckoutUseCase } = require('../../application/use-cases/subscription/createCheckout');
const { StripePaymentGateway } = require('../../infrastructure/adapters/StripePaymentGateway');
```

### After (Clean Imports)
```javascript
const { User } = require('/opt/nodejs/domain/entities');
const { ValidationError } = require('/opt/nodejs/domain/errors');
const { CreateCheckoutUseCase } = require('/opt/nodejs/application/use-cases/subscription');
const { StripePaymentGateway } = require('/opt/nodejs/infrastructure/adapters');
```

## Implementation Notes

- Uses Node.js package `exports` field in package.json
- Each folder has an index.js file that re-exports all modules
- Works seamlessly with AWS Lambda layers
- Compatible with Jest testing framework
- Supports ESLint and other development tools