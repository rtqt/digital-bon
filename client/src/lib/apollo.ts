'use client';

import { ApolloClient, InMemoryCache, split, HttpLink, ApolloLink } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { onError } from '@apollo/client/link/error';

const GRAPHQL_HTTP = process.env.NEXT_PUBLIC_GRAPHQL_HTTP || 'http://localhost:4000/graphql';
const GRAPHQL_WS = process.env.NEXT_PUBLIC_GRAPHQL_WS || 'ws://localhost:4000/graphql';

function getTokenKey(): string {
  if (typeof window === 'undefined') return 'db_token';
  const path = window.location.pathname;
  if (path.startsWith('/admin')) return 'db_admin_token';
  if (path.startsWith('/cashier')) return 'db_cashier_token';
  if (path.startsWith('/barista')) return 'db_barista_token';
  if (path.startsWith('/mobile')) return 'db_mobile_token';
  return 'db_token';
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(getTokenKey()) || '';
}

function getCafeId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('db_cafeId') || '';
}

const httpLink = new HttpLink({
  uri: GRAPHQL_HTTP,
  headers: {
    get authorization() {
      const token = getToken();
      return token ? `Bearer ${token}` : '';
    },
  },
});

const wsLink = new GraphQLWsLink(
  createClient({
    url: GRAPHQL_WS,
    connectionParams: () => ({
      authorization: `Bearer ${getToken()}`,
    }),
  })
);

const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === 'OperationDefinition' && def.operation === 'subscription';
  },
  wsLink,
  httpLink
);

const errorLink = onError(({ graphQLErrors }: any) => {
  if (graphQLErrors) {
    for (const err of graphQLErrors) {
      if (err.extensions?.code === 'UNAUTHENTICATED' || err.message === 'UNAUTHENTICATED') {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(getTokenKey());
          localStorage.removeItem('db_mobile_userId');
          window.location.reload();
        }
      }
    }
  }
});

export const apolloClient = new ApolloClient({
  link: ApolloLink.from([errorLink, splitLink]),
  cache: new InMemoryCache({
    typePolicies: {
      Product: { keyFields: ['id'] },
      Order: { keyFields: ['id'] },
    },
  }),
});

export { getToken, getCafeId, getTokenKey };
