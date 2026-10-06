import jsonServer from 'json-server';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.JSON_SERVER_DB_PATH || path.join(__dirname, 'db.json');
const SEED_PATH = path.join(__dirname, 'db.seed.json');

if (!fs.existsSync(DB_PATH)) {
    if (fs.existsSync(SEED_PATH)) fs.copyFileSync(SEED_PATH, DB_PATH);
    else fs.writeFileSync(DB_PATH, JSON.stringify({ organizations: [], users: [] }, null, 2));
}
console.log('>> Using DB:', DB_PATH);

const server = jsonServer.create();
const router = jsonServer.router(DB_PATH);
const middlewares = jsonServer.defaults();

server.use(cors());
server.use(middlewares);
server.use(jsonServer.bodyParser);

server.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── Authentication (IAM) ──────────────────────────────────────────────────────
const toUserResource = ({ password, ...user }) => user;

server.post('/api/v1/authentication/sign-in', (req, res) => {
    const { email, password } = req.body || {};
    const user = router.db.get('users').find({ email, password }).value();
    if (!user) return res.status(401).json({ message: 'invalid-credentials' });
    return res.json({ ...toUserResource(user), token: `dev-token-${user.id}-${Date.now()}` });
});

server.post('/api/v1/authentication/sign-up', (req, res) => {
    const body = req.body || {};
    if (!body.email || !body.password) return res.status(400).json({ message: 'email-and-password-required' });
    const users = router.db.get('users');
    if (users.find({ email: body.email }).value()) {
        return res.status(409).json({ message: 'email-already-registered' });
    }
    const user = { id: `u-${Date.now()}`, ...body };
    users.push(user).write();
    return res.status(201).json(toUserResource(user));
});

// ── Prefixed string ids on POST (readable ids instead of json-server's random ones) ──
const ID_PREFIXES = {
    organizations: 'org', users: 'u', subscriptions: 'sub', trips: 'trip',
    profiles: 'profile', parents: 'p', children: 'c', vehicles: 'v',
    incidents: 'i', notifications: 'n', routes: 'route',
};
server.use((req, _res, next) => {
    if (req.method === 'POST' && req.body && !req.body.id) {
        const collection = req.path.replace(/^\/api\/v1\//, '').split('/')[0];
        if (ID_PREFIXES[collection]) req.body.id = `${ID_PREFIXES[collection]}-${Date.now()}`;
    }
    next();
});

server.use(jsonServer.rewriter({
    '/api/v1/*': '/$1',
    '/api/v1': '/'
}));

server.get('/', (_req, res) => {
    const state = typeof router.db.getState === 'function'
        ? router.db.getState()
        : router.db.data; // compat
    res.json({ resources: Object.keys(state || {}) });
});

server.use(router);

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Mock API running on http://localhost:${port}/api/v1`));
