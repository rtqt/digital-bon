"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shiftTypeDefs = void 0;
exports.shiftTypeDefs = `
  type Query {
    activeShifts: [Shift!]!
    shortageShifts: [Shift!]!
  }

  type Mutation {
    openShift: Shift!
    initiateReconciliation(waitressId: ID!): Shift!
    submitDualDeclaration(
      shiftId: ID!
      waitressDeclared: Float!
      waitressPin: String!
      cashierDeclared: Float!
      cashierPin: String!
    ): Shift!
    countersignShortage(shiftId: ID!, adminPin: String!): Shift!
  }

  type Shift {
    id: ID!
    waitressId: ID!
    waitress: User
    cashierId: ID
    status: String!
    openedAt: String!
    closedAt: String
    systemExpectedCash: Float
    variance: Float
    declarationGap: Float
    result: String
  }
`;
