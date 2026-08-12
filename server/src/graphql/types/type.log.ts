export const logTypeDefs = /* GraphQL */ `
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
