export const cafeTypeDefs = /* GraphQL */ `
  type Query {
    cafe: Cafe
    cafes: [Cafe!]!
    tableOccupancy: [TableStatus!]!
  }

  type Mutation {
    createCafe(name: String!, code: String!, adminPin: String!): Cafe!
    updateCafe(id: ID!, name: String, code: String, shortageAlertThreshold: Float, declarationGapAlertThreshold: Float): Cafe!
    updateCafeTables(tables: [String!]!): Cafe!
  }

  type Cafe {
    id: ID!
    name: String!
    code: String!
    tables: [String!]!
    shortageAlertThreshold: Float!
    declarationGapAlertThreshold: Float!
  }

  type TableStatus {
    tableNumber: String!
    isOccupied: Boolean!
    orderId: ID
    waitressName: String
  }
`;
