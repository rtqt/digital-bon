export const authTypeDefs = /* GraphQL */ `
  type Mutation {
    login(pin: String!, cafeCode: String!): AuthPayload!
    superLogin(pin: String!): AuthPayload!
  }

  type AuthPayload {
    token: String!
    user: User!
  }
`;
