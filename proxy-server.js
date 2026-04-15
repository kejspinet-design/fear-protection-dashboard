/**
 * Simple CORS Proxy Server for Fear Protection Dashboard
 * Run with: node proxy-server.js
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3000;

// Allowed origins
const ALLOWED_ORIGINS = [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'null' // For file:// protocol
];

// Target APIs
const FEAR_API = 'https://api.fearproject.ru';
const STEAM_API = 'https://api.steampowered.com';

const server = http.createServer((req, res) => {
    // Handle CORS preflight
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;

    console.log(`[Proxy] ${req.method} ${path}`);

    // Route requests
    let targetUrl;
    if (path.startsWith('/api/fear/')) {
        // Fear Project API
        targetUrl = FEAR_API + path.replace('/api/fear', '');
        // Add query parameters for Fear API
        if (parsedUrl.search) {
            targetUrl += parsedUrl.search;
        }
    } else if (path.startsWith('/api/steam/')) {
        // Steam API
        targetUrl = STEAM_API + path.replace('/api/steam', '');
        // Add query parameters
        if (parsedUrl.search) {
            targetUrl += parsedUrl.search;
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
    }

    console.log(`[Proxy] Forwarding to: ${targetUrl}`);

    // Make request to target API
    const targetParsed = url.parse(targetUrl);
    
    // Prepare headers - forward Authorization if present, or use access token for Fear API
    const headers = {
        'User-Agent': 'Fear-Protection-Dashboard/1.0',
        'Accept': 'application/json'
    };
    
    // For Fear API, add Authorization header with access token
    if (path.startsWith('/api/fear/')) {
        const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRfaWQiOiI3NjU2MTE5OTUyNDc4MDMyNyIsImlhdCI6MTc3NjAxNjQ5NSwiZXhwIjoxNzc4NjA4NDk1fQ.yv6jyYlSW_BvFCoLgbGGuEWUpe3C4yffW-oXTxqOg_k';
        headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    const options = {
        hostname: targetParsed.hostname,
        port: targetParsed.port || 443,
        path: targetParsed.path,
        method: req.method,
        headers: headers
    };

    const proxyReq = https.request(options, (proxyRes) => {
        console.log(`[Proxy] Response status: ${proxyRes.statusCode}`);

        // Collect response body for logging
        let body = '';
        proxyRes.on('data', (chunk) => {
            body += chunk;
        });
        
        proxyRes.on('end', () => {
            // Log first 500 chars of response for debugging
            if (path.startsWith('/api/fear/servers')) {
                console.log(`[Proxy] Response preview:`, body.substring(0, 500));
            }
        });

        // Forward response headers
        res.writeHead(proxyRes.statusCode, {
            'Content-Type': proxyRes.headers['content-type'] || 'application/json',
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Credentials': 'true'
        });

        // Forward response body
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (error) => {
        console.error(`[Proxy] Error:`, error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
    });

    // Forward request body if present
    if (req.method === 'POST' || req.method === 'PUT') {
        req.pipe(proxyReq);
    } else {
        proxyReq.end();
    }
});

server.listen(PORT, () => {
    console.log(`\n=== Fear Protection CORS Proxy Server ===`);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`\nAPI Routes:`);
    console.log(`  Fear API: http://localhost:${PORT}/api/fear/*`);
    console.log(`  Steam API: http://localhost:${PORT}/api/steam/*`);
    console.log(`\nExample:`);
    console.log(`  http://localhost:${PORT}/api/fear/servers/`);
    console.log(`  http://localhost:${PORT}/api/steam/ISteamUser/GetPlayerSummaries/v2/?key=...&steamids=...`);
    console.log(`\n`);
});
