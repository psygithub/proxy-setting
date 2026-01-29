const fs = require('fs');
const path = require('path');

const MAPPINGS_FILE = path.join(__dirname, '../data/mappings.json');
const GENERATED_CONFIG_FILE = path.join(__dirname, '../data/generated_config.json');
const TEMPLATE_CONFIG_FILE = path.join(__dirname, '../config/templates.json');

const ensureDataFile = () => {
    const dir = path.dirname(MAPPINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    if (!fs.existsSync(MAPPINGS_FILE)) {
        fs.writeFileSync(MAPPINGS_FILE, JSON.stringify([], null, 2));
    }
    // template_config.json is now expected to be provided by deployment (git), not generated.
};

ensureDataFile();

const loadMappings = () => {
    try {
        return JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf8')) || [];
    } catch (e) {
        return [];
    }
};

const loadTemplateConfig = () => {
    try {
        if (fs.existsSync(TEMPLATE_CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(TEMPLATE_CONFIG_FILE, 'utf8'));
        }
    } catch (e) {
        console.error("Failed to load template config:", e);
    }
    // Minimal fallback to prevent crash, but logic relies on external file now
    return {
        base: { 
            log: { loglevel: "info" },
            inbounds: [], 
            outbounds: [], 
            routing: { rules: [] } 
        },
        staticRules: [],
        optimizationRules: []
    };
};

const saveMappings = (mappings) => {
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
    generateConfig(mappings);
};

// --- Config Generation Logic ---

const convertNodeToOutbound = (node) => {
    const ntype = node.type;
    const out = { protocol: ntype };
    const stream = {};
    const net = node.network || 'tcp';

    // Security
    let security = node.security || 'none';
    if (ntype === 'vmess') {
        security = (node.tls === 'tls') ? 'tls' : 'none';
    }

    stream.network = net;
    stream.security = security;

    // TLS Settings
    if (security === 'tls') {
        const tls = {
            serverName: node.sni || node.host || node.address,
            allowInsecure: true
        };
        if (node.alpn) tls.alpn = node.alpn.split(',');
        stream.tlsSettings = tls;
    } else if (security === 'xtls') {
        const xtls = {
            serverName: node.sni || node.host || node.address,
            allowInsecure: true
        };
        if (node.flow) xtls.flow = node.flow;
        stream.xtlsSettings = xtls;
    }

    // Transport Settings
    if (net === 'ws') {
        const ws = {};
        if (node.path) ws.path = node.path;
        if (node.host) ws.headers = { Host: node.host };
        stream.wsSettings = ws;
    } else if (net === 'grpc') {
        if (node.serviceName) stream.grpcSettings = { serviceName: node.serviceName };
    } else if (net === 'tcp') {
        if (ntype === 'shadowsocks' && node.plugin_opts) {
            const p_opts = node.plugin_opts;
            if (p_opts.type === 'simple-obfs' && p_opts.obfs === 'http') {
                const tcp = { header: { type: 'http' } };
                const req = { headers: {} };
                if (p_opts['obfs-host']) req.headers.Host = [p_opts['obfs-host']];
                tcp.header.request = req;
                stream.tcpSettings = tcp;
            }
        } else if (node.type_header === 'http') {
            const tcp = { header: { type: 'http' } };
            if (node.host) tcp.header.request = { headers: { Host: [node.host] } };
            stream.tcpSettings = tcp;
        }
    }

    out.streamSettings = stream;
    out.mux = { enabled: false, concurrency: -1 };

    // Protocol Specific Settings
    if (ntype === 'vmess') {
        out.settings = {
            vnext: [{
                address: node.address,
                port: parseInt(node.port),
                users: [{
                    id: node.uuid,
                    alterId: parseInt(node.alterId || 0),
                    security: node.security || 'auto'
                }]
            }]
        };
    } else if (ntype === 'vless') {
        const user = { id: node.uuid, encryption: "none" };
        if (node.flow) user.flow = node.flow;
        out.settings = {
            vnext: [{
                address: node.address,
                port: parseInt(node.port),
                users: [user]
            }]
        };
    } else if (ntype === 'trojan') {
        out.settings = {
            servers: [{
                address: node.address,
                port: parseInt(node.port),
                password: node.password,
                level: 1
            }]
        };
    } else if (ntype === 'shadowsocks') {
        out.settings = {
            servers: [{
                address: node.address,
                port: parseInt(node.port),
                method: node.method || 'aes-256-gcm',
                password: node.password || '',
                level: 1
            }]
        };
    }

    return out;
};

const generateConfig = (mappings) => {
    // Load template from file
    const template = loadTemplateConfig();
    
    // Deep copy base config to avoid mutation
    const finalConfig = JSON.parse(JSON.stringify(template.base || {}));
    
    // Ensure essential arrays exist
    if (!finalConfig.outbounds) finalConfig.outbounds = [];
    if (!finalConfig.inbounds) finalConfig.inbounds = [];
    if (!finalConfig.routing) finalConfig.routing = { rules: [] };
    if (!finalConfig.routing.rules) finalConfig.routing.rules = [];

    const newInbounds = [];
    const newOutbounds = [];
    const newRules = [];
    
    const existingTags = new Set(finalConfig.outbounds.map(o => o.tag).filter(t => t));
    const addedOutboundContent = {}; // To avoid duplicates

    const getUniqueTag = (baseTag) => {
        if (!existingTags.has(baseTag)) return baseTag;
        let i = 1;
        while (existingTags.has(`${baseTag}_${i}`)) i++;
        return `${baseTag}_${i}`;
    };

    mappings.forEach(m => {
        newInbounds.push(m.inbound);

        let ob = null;
        if (m.outbound) {
            ob = m.outbound;
        } else if (m.outbound_node) {
            ob = convertNodeToOutbound(m.outbound_node);
            ob.tag = m.outbound_node.name;
        }

        if (ob) {
            const contentStr = JSON.stringify(ob);
            let finalTag;

            if (addedOutboundContent[contentStr]) {
                finalTag = addedOutboundContent[contentStr];
            } else {
                const originalTag = ob.tag || 'proxy';
                finalTag = getUniqueTag(originalTag);
                ob.tag = finalTag;
                
                newOutbounds.push(ob);
                existingTags.add(finalTag);
                addedOutboundContent[contentStr] = finalTag;
            }

            if (m.routing) {
                const rule = { ...m.routing, outboundTag: finalTag };
                newRules.push(rule);
            }
        } else {
            if (m.routing) newRules.push(m.routing);
        }
    });

    const optRules = template.optimizationRules || [];
    const staticRules = template.staticRules || [];

    finalConfig.inbounds = newInbounds;
    finalConfig.outbounds = [...newOutbounds, ...finalConfig.outbounds];
    // Rules Priority: Opt Rules (QUIC block etc) -> User Rules -> Static Rules (GeoIP etc)
    finalConfig.routing.rules = [...optRules, ...newRules, ...staticRules]; 

    // Save generated config
    const formatted = formatConfig(finalConfig);
    fs.writeFileSync(GENERATED_CONFIG_FILE, formatted);
    
    return finalConfig;
};

const stringifyWithSpaces = (obj) => {
    // Generate multi-line json then collapse to single line with spaces
    return JSON.stringify(obj, null, 1).replace(/\n\s*/g, ' ');
};

const formatConfig = (config) => {
    const lines = ["{"];
    const keys = ["log", "dns", "inbounds", "outbounds", "routing"].filter(k => config[k]);
    
    keys.forEach((key, idx) => {
        const isLast = idx === keys.length - 1;
        const suffix = isLast ? "" : ",";
        
        if (key === "inbounds" || key === "outbounds") {
            lines.push(`  "${key}": [`);
            const items = config[key];
            items.forEach((item, i) => {
                const c = i < items.length - 1 ? "," : "";
                lines.push(`    ${stringifyWithSpaces(item)}${c}`);
            });
            lines.push(`  ]${suffix}`);
        } else if (key === "routing") {
            lines.push(`  "${key}": {`);
            lines.push(`    "domainStrategy": "${config.routing.domainStrategy || 'AsIs'}",`);
            lines.push('    "rules": [');
            const rules = config.routing.rules || [];
            rules.forEach((r, i) => {
                const c = i < rules.length - 1 ? "," : "";
                lines.push(`      ${stringifyWithSpaces(r)}${c}`);
            });
            lines.push('    ]');
            lines.push(`  }${suffix}`);
        } else {
            lines.push(`  "${key}": ${stringifyWithSpaces(config[key])}${suffix}`);
        }
    });
    
    lines.push("}");
    return lines.join('\n');
};

const getGeneratedConfig = () => {
    try {
        if (fs.existsSync(GENERATED_CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(GENERATED_CONFIG_FILE, 'utf8'));
        }
    } catch (e) {}
    return generateConfig(loadMappings());
};

const getGeneratedConfigString = () => {
    try {
        if (fs.existsSync(GENERATED_CONFIG_FILE)) {
            return fs.readFileSync(GENERATED_CONFIG_FILE, 'utf8');
        }
    } catch (e) {}
    // If not exists, generate it first
    const config = generateConfig(loadMappings());
    return formatConfig(config);
};

const convertToUri = (node) => {
    const ps = node.name || 'node';
    const add = node.address;
    const port = node.port;
    const type = node.type;

    if (type === 'vmess') {
        const config = {
            v: "2",
            ps: ps,
            add: add,
            port: port,
            id: node.uuid,
            aid: node.alterId || 0,
            scy: node.security || 'auto',
            net: node.network || 'tcp',
            type: node.type_header || 'none',
            host: node.host || '',
            path: node.path || '',
            tls: node.tls === 'tls' ? 'tls' : '',
            sni: node.sni || node.host || '',
            alpn: node.alpn || ''
        };
        return 'vmess://' + Buffer.from(JSON.stringify(config)).toString('base64');
    } else if (type === 'vless') {
        let uri = `vless://${node.uuid}@${add}:${port}?encryption=none&security=${node.security||'none'}&type=${node.network||'tcp'}`;
        if (node.host) uri += `&host=${encodeURIComponent(node.host)}`;
        if (node.path) uri += `&path=${encodeURIComponent(node.path)}`;
        if (node.sni) uri += `&sni=${encodeURIComponent(node.sni)}`;
        if (node.flow) uri += `&flow=${encodeURIComponent(node.flow)}`;
        if (node.alpn) uri += `&alpn=${encodeURIComponent(node.alpn)}`;
        uri += `#${encodeURIComponent(ps)}`;
        return uri;
    } else if (type === 'trojan') {
        let uri = `trojan://${node.password}@${add}:${port}?security=${node.security||'tls'}&type=${node.network||'tcp'}`;
        if (node.sni) uri += `&sni=${encodeURIComponent(node.sni)}`;
        if (node.alpn) uri += `&alpn=${encodeURIComponent(node.alpn)}`;
        uri += `#${encodeURIComponent(ps)}`;
        return uri;
    } else if (type === 'shadowsocks') {
        const cred = `${node.method}:${node.password}`;
        const b64Cred = Buffer.from(cred).toString('base64');
        return `ss://${b64Cred}@${add}:${port}#${encodeURIComponent(ps)}`;
    }
    return '';
};

const convertInboundToUri = (inbound, host) => {
    const protocol = inbound.protocol;
    const port = inbound.port;
    const tag = inbound.tag || `in-${port}`;
    const name = `VPS-${port}-${protocol}`;
    
    if (protocol === 'socks') {
        // Handle auth if exists
        let authPart = '';
        if (inbound.settings && inbound.settings.accounts && inbound.settings.accounts.length > 0) {
            const acc = inbound.settings.accounts[0];
            const cred = `${acc.user}:${acc.pass}`;
            authPart = Buffer.from(cred).toString('base64') + '@';
        }
        return `socks://${authPart}${host}:${port}#${encodeURIComponent(name)}`;
    } else if (protocol === 'http') {
        let authPart = '';
        if (inbound.settings && inbound.settings.accounts && inbound.settings.accounts.length > 0) {
            const acc = inbound.settings.accounts[0];
            authPart = `${acc.user}:${acc.pass}@`;
        }
        return `http://${authPart}${host}:${port}#${encodeURIComponent(name)}`;
    } else if (protocol === 'vmess') {
        if (inbound.settings && inbound.settings.clients && inbound.settings.clients.length > 0) {
            const client = inbound.settings.clients[0];
            const config = {
                v: "2",
                ps: name,
                add: host,
                port: port,
                id: client.id,
                aid: client.alterId || 0,
                scy: "auto",
                net: "tcp",
                type: "none",
                tls: ""
            };
            return 'vmess://' + Buffer.from(JSON.stringify(config)).toString('base64');
        }
    }
    return null;
};

const generatePasswallSubscription = (host) => {
    const mappings = loadMappings();
    const links = [];
    
    // Add Outbound Nodes
    mappings.forEach(m => {
        if (m.outbound_node) {
            const link = convertToUri(m.outbound_node);
            if (link) links.push(link);
        }
    });

    // Add Inbound Proxies
    // Removed as per user request (User will configure ports manually on router)
    /* 
    if (host) {
        mappings.forEach(m => {
            if (m.inbound) {
                // ...
            }
        });
    }
    */

    return Buffer.from(links.join('\n')).toString('base64');
};

module.exports = {
    loadMappings,
    saveMappings,
    generateConfig,
    getGeneratedConfig,
    getGeneratedConfigString,
    generatePasswallSubscription
};
