"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authTypeDefs = void 0;
exports.authTypeDefs = `
  type Mutation {
    login(pin: String!, cafeCode: String!): AuthPayload!
    superLogin(pin: String!): AuthPayload!
  }

  type AuthPayload {
    token: String!
    user: User!
  }
`;
