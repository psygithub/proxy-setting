const fs = require('fs');
const path = require('path');

const MAPPINGS_FILE = path.join(__dirname, '../data/mappings.json');
const GENERATED_CONFIG_FILE = path.join(__dirname, '../data/generated_config.json');

const ensureDataFile = () => {
    const dir = path.dirname(MAPPINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(MAPPINGS_FILE)) {
        fs.writeFileSync(MAPPINGS_FILE, JSON.stringify([], null, 2));
    }
};

ensureDataFile();

const loadMappings = () => {
    try {
        return JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf8')) || [];
    } catch (e) {
        return [];
    }
};

const saveMappings = (mappings) => {
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
    generateConfig(mappings);
};

// --- Config Generation Logic ---

const getBaseConfig = () => ({
    log: { loglevel: "info" },
    dns: {
        hosts: { "dns.google": "8.8.8.8", "proxy.example.com": "127.0.0.1" },
        servers: [
            { "address": "1.1.1.1", "domains": ["geosite:geolocation-!cn"], "expectIPs": ["geoip:!cn"] },
            { "address": "223.5.5.5", "domains": ["geosite:cn"], "expectIPs": ["geoip:cn"] },
            "8.8.8.8",
            "https://dns.google/dns-query",
            { "address": "223.5.5.5", "domains": ["xxfa85toflprzb7rt7-id.xxfnode.com"] }
        ]
    },
    inbounds: [],
    outbounds: [
        { protocol: "freedom", tag: "direct" },
        { protocol: "blackhole", tag: "block" }
    ],
    routing: {
        domainStrategy: "IPIfNonMatch",
        rules: []
    }
});

const getStaticRules = () => [
    { type: "field", domain: ["geosite:private", "geosite:cn"], outboundTag: "direct" },
    { type: "field", ip: ["geoip:private", "geoip:cn"], outboundTag: "direct" },
    { type: "field", ip: ["0.0.0.0/0", "::/0"], outboundTag: "block" }
];

const getOptimizationRules = () => [
    { type: "field", protocol: ["quic"], outboundTag: "block" },
    { type: "field", protocol: ["dns"], outboundTag: "direct" },
    { type: "field", port: "123", network: "udp", outboundTag: "direct" }
];

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
    const finalConfig = getBaseConfig();
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
            // Deduplicate outbound
            // Simple stringify check (could be improved)
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

    const optRules = getOptimizationRules();
    const staticRules = getStaticRules();

    finalConfig.inbounds = newInbounds;
    finalConfig.outbounds = [...newOutbounds, ...finalConfig.outbounds];
    finalConfig.routing.rules = [optRules[0], ...newRules, ...optRules.slice(1), ...staticRules]; // Block QUIC -> New Rules -> Other Opt -> Static

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

module.exports = {
    loadMappings,
    saveMappings,
    generateConfig,
    getGeneratedConfig,
    getGeneratedConfigString
};
