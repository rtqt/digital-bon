"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logTypeDefs = void 0;
exports.logTypeDefs = `
  extend type Query {
    systemLogs(limit: Int): [SystemLog!]!
  }

  type SystemLog {
    id: ID!
    action: String!
    description: String!
    userId: ID
    cafeId: ID
    user: User
    cafe: Cafe
    createdAt: String!
  }
`;
