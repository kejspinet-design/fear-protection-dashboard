/**
 * Vercel Serverless Function for CORS Proxy
 * Handles requests to Fear Project API and Steam API
 */

const https = require('https');

// Target APIs
const FEAR_API = 'https://api.fearproject.ru';
const STEAM_API = 'https://api.steampowered.com';

// Access token for Fear API
const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRfaWQiOiI3NjU2MTE5OTUyNDc4MDMyNyIsImlhdCI6MTc3NjAxNjQ5NSwiZXhwIjoxNzc4NjA4NDk1fQ.yv6jyYlSW_BvFCoLgbGGuEWUpe3C4yffW-oXTxqOg_k';

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { url: requestUrl } = req;
    
    console.log(`[Proxy] ${req.method} ${requestUrl}`);

    // Determine target URL
    let targetUrl;
    if (requestUrl.startsWith('/api/fear/')) {
        targetUrl = FEAR_API + requestUrl.replace('/api/fear', '');
    } else if (requestUrl.startsWith('/api/steam/')) {
        targetUrl = STEAM_API + requestUrl.replace('/api/steam', '');
    } else {
        res.status(404).json({ error: 'Not found' });
        return;
    }

    console.log(`[Proxy] Forwarding to: ${targetUrl}`);

    try {
        const data = await makeRequest(targetUrl, requestUrl.startsWith('/api/fear/'));
        res.status(200).json(data);
    } catch (error) {
        console.error(`[Proxy] Error:`, error.message);
        res.status(500).json({ error: 'Proxy error', message: error.message });
    }
};

/**
 * Make HTTPS request
 */
function makeRequest(targetUrl, isFearApi) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(targetUrl);
        
        const headers = {
            'User-Agent': 'Fear-Protection-Dashboard/1.0',
            'Accept': 'application/json'
        };
        
        // Add Authorization header for Fear API
        if (isFearApi) {
            headers['Authorization'] = `Bearer ${ACCESS_TOKEN}`;
        }
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: headers
        };

        const proxyReq = https.request(options, (proxyRes) => {
            let body = '';
            
            proxyRes.on('data', (chunk) => {
                body += chunk;
            });
            
            proxyRes.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    resolve(data);
                } catch (error) {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });

        proxyReq.on('error', (error) => {
            reject(error);
        });

        proxyReq.end();
    });
}
