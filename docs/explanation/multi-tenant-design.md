# Multi-Tenant Design

DigitalBon is built as a multi-tenant application from day one, allowing a single franchise owner (Super Admin) to manage dozens of cafes from a single deployment.

## The `cafeCode` Partitioning Strategy

Rather than deploying separate instances of the database and backend for every new cafe, DigitalBon uses a logical partitioning model based on a unique `cafeCode`.

### How it Works

1.  **Creation:** When the Super Admin creates a new branch, a 4-character alphanumeric string (e.g., `A9F2`) is generated and assigned to that `Cafe` document.
2.  **Context Injection:** When a staff member logs in, they must provide the `cafeCode` along with their PIN. The authentication resolver verifies the code, finds the corresponding Cafe ObjectId, and signs a JWT containing `userId`, `role`, and `cafeId`.
3.  **Request Scoping:** Every incoming GraphQL request passes through an authentication middleware. The `cafeId` extracted from the JWT is injected into the GraphQL `context`.
4.  **Database Queries:** All resolvers *must* append the `cafeId` from context to their Mongoose queries. 

**Example Resolver (Bad - Data Leak):**
```javascript
// This would return ALL products from ALL cafes
const products = await Product.find();
```

**Example Resolver (Good - Tenant Isolated):**
```javascript
// This returns only products for the logged-in user's cafe
const products = await Product.find({ cafe: context.user.cafeId });
```

### Security Benefits
- **No Accidental Data Bleed:** Because the `cafeId` is securely locked inside the JWT, a malicious user cannot easily query data from another branch by simply changing a URL parameter.
- **Simplified Scaling:** Adding a new branch requires zero infrastructure changes. It is a single database record.

### The Super Admin Exception
The Super Admin account does not belong to any specific `cafeCode`. Their JWT lacks a `cafeId`. Resolvers that serve the Super Admin dashboard verify the `isSuperAdmin` boolean in the context and execute cross-tenant queries (e.g., fetching `SystemLogs` from all branches).
