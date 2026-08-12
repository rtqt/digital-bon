export const menuTypeDefs = /* GraphQL */ `
  type Query {
    categories: [Category!]!
    products: [Product!]!
  }

  type Mutation {
    createCategory(name: String!, order: Int): Category!
    updateCategory(id: ID!, name: String, order: Int): Category!
    deleteCategory(id: ID!): Boolean!
    createProduct(categoryId: ID!, name: String!, price: Float!, cost: Float!, isAvailable: Boolean): Product!
    updateProduct(id: ID!, name: String, price: Float, cost: Float): Product!
    deleteProduct(id: ID!): Boolean!
    toggleProductAvailability(id: ID!, isAvailable: Boolean!): Product!
  }

  type Subscription {
    menuUpdated: String!
  }

  type Category {
    id: ID!
    name: String!
    order: Int!
  }

  type Product {
    id: ID!
    categoryId: ID!
    category: Category
    name: String!
    price: Float!
    cost: Float!
    isAvailable: Boolean!
  }
`;
