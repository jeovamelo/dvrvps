const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8080', 10);
const DEFAULT_DVR_HOST = process.env.DVR_HOST || '192.168.100.2';
const DEFAULT_DVR_PORT = parseInt(process.env.DVR_PORT || '80', 10);

const AUTH_USER = process.env.SITE_USER || 'jeovamelo@gmail.com';
const AUTH_PASS = process.env.SITE_PASS || 'tk90xz39@';

// Pool de Conexões Persistentes (HTTP Keep-Alive) para máxima fluidez e latência mínima
const dvrKeepAliveAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 60,
    maxFreeSockets: 30,
    timeout: 10000
});

// Sessões em memória
const activeSessions = new Set();

function parseCookies(req) {
    const list = {};
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach(cookie => {
        let [name, ...rest] = cookie.split('=');
        name = name.trim();
        if (!name) return;
        const value = rest.join('=').trim();
        list[name] = decodeURIComponent(value);
    });
    return list;
}

function isAuthenticated(req) {
    const cookies = parseCookies(req);
    const token = req.headers['x-auth-token'] || cookies['dvr_auth'];
    if (token && activeSessions.has(token)) {
        return true;
    }
    return false;
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // 1. Endpoint de Login (Compatível com Google Chrome)
    if (req.url === '/api/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            let user = '', pass = '';
            try {
                if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
                    const data = JSON.parse(body);
                    user = (data.username || '').trim();
                    pass = data.password || '';
                } else {
                    const params = new URLSearchParams(body);
                    user = (params.get('username') || '').trim();
                    pass = params.get('password') || '';
                }
            } catch (e) {}

            if (user.toLowerCase() === AUTH_USER.toLowerCase() && pass === AUTH_PASS) {
                const token = crypto.randomBytes(24).toString('hex');
                activeSessions.add(token);
                console.log(`[Auth] Login com sucesso para ${user}`);
                res.setHeader('Set-Cookie', `dvr_auth=${token}; Path=/; SameSite=Lax`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, token: token, user: AUTH_USER }));
            } else {
                console.warn(`[Auth] Falha no login para ${user}`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Usuário ou senha incorretos' }));
            }
        });
        return;
    }

    // 2. Endpoint de Verificação de Autenticação
    if (req.url === '/api/auth-status' && req.method === 'GET') {
        if (isAuthenticated(req)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ authenticated: true, user: AUTH_USER }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ authenticated: false }));
        }
        return;
    }

    // 3. Endpoint de Logout
    if (req.url === '/api/logout' && req.method === 'POST') {
        const cookies = parseCookies(req);
        const token = req.headers['x-auth-token'] || cookies['dvr_auth'];
        if (token) activeSessions.delete(token);
        res.setHeader('Set-Cookie', 'dvr_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // 4. Proxy para o DVR Hikvision (Com Pool Keep-Alive e Autenticação)
    if (req.url.startsWith('/dvr/')) {
        if (!isAuthenticated(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Não autorizado. Faça login primeiro.' }));
            return;
        }

        const dvrPath = req.url.substring(4);
        
        // Se houver DVR_HOST definido no ambiente (ex: VPS apontando para o MikroTik), tem prioridade.
        const targetHost = process.env.DVR_HOST || req.headers['x-dvr-ip'] || DEFAULT_DVR_HOST;
        const targetPort = process.env.DVR_PORT ? parseInt(process.env.DVR_PORT, 10) : parseInt(req.headers['x-dvr-port'] || DEFAULT_DVR_PORT, 10);

        const headers = { ...req.headers };
        headers.host = (targetPort === 80) ? targetHost : (targetHost + ':' + targetPort);
        delete headers.origin;
        delete headers.referer;
        delete headers['x-dvr-ip'];
        delete headers['x-dvr-port'];
        delete headers['x-auth-token'];

        const options = {
            hostname: targetHost,
            port: targetPort,
            path: dvrPath,
            method: req.method,
            headers: headers,
            agent: dvrKeepAliveAgent // Reutiliza sockets TCP existentes
        };

        const dvrReq = http.request(options, (dvrRes) => {
            const outHeaders = { ...dvrRes.headers };
            outHeaders['Access-Control-Allow-Origin'] = '*';
            outHeaders['Access-Control-Allow-Headers'] = '*';
            
            if (!res.headersSent) {
                res.writeHead(dvrRes.statusCode, outHeaders);
            }
            dvrRes.pipe(res);
        });

        dvrReq.on('error', (err) => {
            console.error(`[DVR Proxy Error] (${targetHost}:${targetPort}):`, err.message);
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
                res.end(`DVR Gateway Error (${targetHost}:${targetPort}): ` + err.message);
            } else {
                res.destroy();
            }
        });

        req.pipe(dvrReq);
        return;
    }

    // 5. Servir arquivos estáticos locais
    let cleanUrl = req.url.split('?')[0];
    let filePath = path.join(__dirname, cleanUrl === '/' ? 'index.html' : cleanUrl);

    const extname = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.jpeg': 'image/jpeg',
        '.xml': 'text/xml'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[DVR TV] Servidor rodando na porta ${PORT}`);
    console.log(`[DVR TV] Destino do DVR configurado: ${process.env.DVR_HOST || DEFAULT_DVR_HOST}:${process.env.DVR_PORT || DEFAULT_DVR_PORT}`);
    console.log(`[DVR TV] Pool Keep-Alive ativado para máxima velocidade`);
});
