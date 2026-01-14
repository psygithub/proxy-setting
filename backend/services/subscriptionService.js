const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { URL } = require('url');

const DATA_FILE = path.join(__dirname, '../data/subscriptions.json');

// Ensure data file exists
const ensureDataFile = () => {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
    }
};

ensureDataFile();

const loadData = () => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data) || [];
    } catch (e) {
        return [];
    }
};

const saveData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

const getSubscriptions = () => {
    return loadData().map(sub => ({
        name: sub.name,
        url: sub.url,
        count: (sub.nodes || []).length
    }));
};

const addSubscription = (name, url) => {
    const data = loadData();
    const existing = data.find(s => s.name === name);
    if (existing) {
        existing.url = url;
    } else {
        data.push({ name, url, nodes: [] });
    }
    saveData(data);
    return true;
};

const deleteSubscription = (name) => {
    let data = loadData();
    data = data.filter(s => s.name !== name);
    saveData(data);
    return true;
};

const getAllNodes = () => {
    const data = loadData();
    let allNodes = [];
    data.forEach(sub => {
        const nodes = sub.nodes || [];
        nodes.forEach(n => n.source = sub.name);
        allNodes = allNodes.concat(nodes);
    });
    return allNodes;
};

// --- Parsing Logic ---

const safeBase64Decode = (str) => {
    try {
        // Fix padding
        let padding = str.length % 4;
        if (padding > 0) {
            str += '='.repeat(4 - padding);
        }
        return Buffer.from(str, 'base64').toString('utf-8');
    } catch (e) {
        return str;
    }
};

const parseVmess = (link) => {
    try {
        const b64 = link.substring(8);
        const jsonStr = safeBase64Decode(b64);
        const data = JSON.parse(jsonStr);
        return {
            type: 'vmess',
            name: data.ps || 'vmess',
            address: data.add,
            port: parseInt(data.port),
            uuid: data.id,
            alterId: parseInt(data.aid || 0),
            security: data.scy || 'auto',
            network: data.net || 'tcp',
            type_header: data.type || 'none',
            host: data.host || '',
            path: data.path || '',
            tls: data.tls || '',
            sni: data.sni || '',
            alpn: data.alpn || '',
            raw: link
        };
    } catch (e) {
        console.error('Parse VMess Error:', e);
        return null;
    }
};

const parseVless = (link) => {
    try {
        const u = new URL(link);
        const params = new URLSearchParams(u.search);
        return {
            type: 'vless',
            name: decodeURIComponent(u.hash.slice(1)) || 'vless',
            address: u.hostname,
            port: parseInt(u.port),
            uuid: u.username,
            network: params.get('type') || 'tcp',
            security: params.get('security') || 'none',
            flow: params.get('flow') || '',
            host: params.get('host') || '',
            sni: params.get('sni') || '',
            path: params.get('path') || '',
            headerType: params.get('headerType') || 'none',
            raw: link
        };
    } catch (e) {
        return null;
    }
};

const parseTrojan = (link) => {
    try {
        const u = new URL(link);
        const params = new URLSearchParams(u.search);
        return {
            type: 'trojan',
            name: decodeURIComponent(u.hash.slice(1)) || 'trojan',
            address: u.hostname,
            port: parseInt(u.port),
            password: u.username,
            sni: params.get('sni') || '',
            security: 'tls',
            raw: link
        };
    } catch (e) {
        return null;
    }
};

const parseSS = (link) => {
    try {
        const u = new URL(link);
        let userinfo = u.username;
        let method = 'aes-256-gcm';
        let password = 'password';

        if (userinfo.includes(':')) {
            [method, password] = userinfo.split(':');
        } else {
            try {
                const decoded = safeBase64Decode(userinfo);
                if (decoded.includes(':')) {
                    [method, password] = decoded.split(':');
                }
            } catch (e) {}
        }
        
        // Plugin parsing omitted for brevity/complexity, keeping basic SS
        return {
            type: 'shadowsocks',
            name: decodeURIComponent(u.hash.slice(1)) || 'ss',
            address: u.hostname,
            port: parseInt(u.port),
            method,
            password,
            raw: link
        };
    } catch (e) {
        return null;
    }
};

const parseContent = (content) => {
    const decoded = safeBase64Decode(content);
    const lines = decoded.split(/\r?\n/);
    const nodes = [];

    for (const line of lines) {
        const l = line.trim();
        if (!l) continue;

        let node = null;
        if (l.startsWith('vmess://')) node = parseVmess(l);
        else if (l.startsWith('vless://')) node = parseVless(l);
        else if (l.startsWith('trojan://')) node = parseTrojan(l);
        else if (l.startsWith('ss://')) node = parseSS(l);

        if (node) nodes.push(node);
    }
    return nodes;
};

const updateSubscription = async (name) => {
    const data = loadData();
    const sub = data.find(s => s.name === name);
    if (!sub) throw new Error('Subscription not found');

    try {
        const response = await axios.get(sub.url, {
            headers: { 'User-Agent': 'v2rayNG/1.8.5' },
            timeout: 10000
        });
        
        const nodes = parseContent(response.data);
        sub.nodes = nodes;
        saveData(data);
        return nodes.length;
    } catch (e) {
        console.error(`Error updating subscription ${name}:`, e.message);
        throw e;
    }
};

module.exports = {
    getSubscriptions,
    addSubscription,
    deleteSubscription,
    getAllNodes,
    updateSubscription
};
