import express from 'express';
import http from 'http';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { typeDefs } from './graphql/types';
import { resolvers } from './graphql/resolvers';
import { buildContext } from './middleware/auth';
import { ensureReplicaSet, connectDB } from './startup';

async function main() {
  // Step 1: Replica set health gate
  await ensureReplicaSet();

  // Step 2: Connect to MongoDB
  await connectDB();

  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json());

  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const httpServer = http.createServer(app);

  // Step 3: WebSocket server for subscriptions
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx) => {
        const token = ctx.connectionParams?.authorization as string | undefined;
        if (!token) return {};
        const fakeReq = { headers: { authorization: token } };
        const context = await buildContext(fakeReq);
        return context || {};
      },
    },
    wsServer
  );

  // Step 4: Apollo Server
  const apollo = new ApolloServer({
    schema,
    plugins: [
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await apollo.start();

  app.use(
    '/graphql',
    expressMiddleware(apollo as any, {
      context: async ({ req }) => {
        const ctx = await buildContext(req);
        return ctx || ({} as any);
      },
    })
  );

  app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`\n🚀 DigitalBon Edge API running at http://localhost:${PORT}/graphql`);
    console.log(`📡 WebSocket subscriptions at ws://localhost:${PORT}/graphql`);
  });
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
