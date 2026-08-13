"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const server_1 = require("@apollo/server");
const express4_1 = require("@apollo/server/express4");
const schema_1 = require("@graphql-tools/schema");
const ws_1 = require("ws");
const ws_2 = require("graphql-ws/lib/use/ws");
const types_1 = require("./graphql/types");
const resolvers_1 = require("./graphql/resolvers");
const auth_1 = require("./middleware/auth");
const startup_1 = require("./startup");
const express_rate_limit_1 = require("express-rate-limit");
const rate_limit_redis_1 = require("rate-limit-redis");
const redis_service_1 = require("./services/redis.service");
async function main() {
    // Step 1: Replica set health gate
    await (0, startup_1.ensureReplicaSet)();
    // Step 2: Connect to MongoDB
    await (0, startup_1.connectDB)();
    const app = (0, express_1.default)();
    app.set('trust proxy', 1);
    // General DOS protection using express-rate-limit backed by Redis
    const limiter = (0, express_rate_limit_1.rateLimit)({
        store: new rate_limit_redis_1.RedisStore({
            sendCommand: (...args) => (0, redis_service_1.getRedis)().call(args[0], ...args.slice(1)),
        }),
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 500, // limit each IP to 500 requests per windowMs
        message: 'Too many requests from this IP, please try again after a minute',
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use((0, cors_1.default)({ origin: '*' }));
    app.use(express_1.default.json());
    app.use(limiter);
    const schema = (0, schema_1.makeExecutableSchema)({ typeDefs: types_1.typeDefs, resolvers: resolvers_1.resolvers });
    const httpServer = http_1.default.createServer(app);
    // Step 3: WebSocket server for subscriptions
    const wsServer = new ws_1.WebSocketServer({ server: httpServer, path: '/graphql' });
    const serverCleanup = (0, ws_2.useServer)({
        schema,
        context: async (ctx) => {
            const token = ctx.connectionParams?.authorization;
            if (!token)
                return {};
            const fakeReq = { headers: { authorization: token } };
            const context = await (0, auth_1.buildContext)(fakeReq);
            return context || {};
        },
    }, wsServer);
    // Step 4: Apollo Server
    const apollo = new server_1.ApolloServer({
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
    app.use('/graphql', (0, express4_1.expressMiddleware)(apollo, {
        context: async ({ req }) => {
            const ctx = await (0, auth_1.buildContext)(req);
            // Inject IP address into context for resolvers to use (e.g. auth brute-force checking)
            return ctx ? { ...ctx, ip: req.ip } : { ip: req.ip };
        },
    }));
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
