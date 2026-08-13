"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userTypeDefs = void 0;
exports.userTypeDefs = `
  type Query {
    me: User
    users: [User!]!
    roles: [Role!]!
  }

  type Mutation {
    createUser(name: String!, roleId: ID!, pin: String!): User!
    updateUser(id: ID!, name: String, pin: String, status: String): User!
    updateUserRole(id: ID!, roleId: ID!): User!
    resetUserPin(id: ID!, newPin: String!): User!
    createRole(name: String!, permissions: [String!]!, scope: String): Role!
    updateRolePermissions(id: ID!, permissions: [String!]!): Role!
  }

  type User {
    id: ID!
    cafeId: ID
    name: String!
    roleId: ID!
    role: Role
    status: String!
    currentLiability: Float!
  }

  type Role {
    id: ID!
    name: String!
    permissions: [String!]!
    scope: String!
  }
`;
