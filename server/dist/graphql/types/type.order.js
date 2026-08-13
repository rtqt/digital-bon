"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderTypeDefs = void 0;
exports.orderTypeDefs = `
  type Query {
    orders(status: String): [Order!]!
    order(id: ID!): Order
  }

  type Mutation {
    createOrder(input: CreateOrderInput!): Order!
    settleOrder(orderId: ID!, paymentMethod: String!): Order!
    setOrderPaymentMethod(orderId: ID!, paymentMethod: String!): Order!
    settleWaitressOrders(waitressName: String!): [Order!]!
    acknowledgeOrder(orderId: ID!): Order!

    requestOrderVoid(orderId: ID!, reason: String!): Order!
    approveOrderVoid(orderId: ID!, pin: String!): Order!
    rejectOrderVoid(orderId: ID!): Order!
    directVoid(orderId: ID!, reason: String!, wasPaymentCollected: Boolean!): Order!
    adminUnlockVoid(orderId: ID!, action: String!): Order!
    resolveCash(orderId: ID!, resolution: String!): Order!

    amendOrder(orderId: ID!, newTableNumber: String, newItems: [OrderItemInput!], adminPin: String): Order!
    requestAmendOrder(orderId: ID!, newTableNumber: String, newItems: [OrderItemInput!], reason: String!): Order!
    approveAmendment(orderId: ID!): Order!
    rejectAmendment(orderId: ID!): Order!
  }

  type Subscription {
    orderCreated: Order!
    orderUpdated: Order!
    adminAlert: AdminAlert!
  }

  type Order {
    id: ID!
    cafeId: ID!
    waitressId: ID!
    waitress: User
    tableNumber: String!
    items: [OrderItem!]!
    totalAmount: Float!
    status: String!
    previousStatus: String
    paymentMethod: String
    reason: String
    wasPaymentCollected: Boolean
    requestedAmendment: RequestedAmendment
    auditLog: [AuditEntry!]!
    createdAt: String!
    updatedAt: String!
  }

  type OrderItem {
    productId: ID!
    productName: String!
    unitPrice: Float!
    quantity: Int!
  }

  type RequestedAmendment {
    tableNumber: String
    items: [OrderItem!]
    reason: String
  }

  type AuditEntry {
    action: String!
    actorId: ID!
    authorizedBy: ID
    timestamp: String!
    metadata: String
  }

  type AdminAlert {
    type: String!
    orderId: ID
    userId: ID
    message: String!
    timestamp: String!
  }

  input CreateOrderInput {
    tableNumber: String!
    items: [OrderItemInput!]!
  }

  input OrderItemInput {
    productId: ID!
    quantity: Int!
  }
`;
