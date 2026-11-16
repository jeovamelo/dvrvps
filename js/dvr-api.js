class BandwidthTracker {
    constructor() {
        this.bytesWindow = [];
        this.currentBps = 0;
        this.start();
    }
    addBytes(n) {
        if (!n || n <= 0) return;
        this.bytesWindow.push({ t: Date.now(), b: n });
    }
    start() {
        var self = this;
        setInterval(function() {
            var now = Date.now();
            var cutoff = now - 1000;
            self.bytesWindow = self.bytesWindow.filter(function(item) { return item.t >= cutoff; });
            var sum = self.bytesWindow.reduce(function(acc, item) { return acc + item.b; }, 0);
            self.currentBps = sum;
            self.render();
        }, 1000);
    }
    render() {
        var speedStr = '0 KB/s';
        if (this.currentBps > 0) {
            var kb = this.currentBps / 1024;
            if (kb >= 1024) {
                speedStr = (kb / 1024).toFixed(1) + ' Mbps';
            } else {
                speedStr = Math.round(kb) + ' KB/s';
            }
        }
        var el = document.getElementById('bandwidth-meter');
        if (el) {
            el.style.display = 'inline-block';
            el.textContent = '• ' + speedStr;
        }
        var fsSpeed = document.getElementById('fs-bandwidth-text');
        if (fsSpeed) {
            fsSpeed.textContent = ' • ' + speedStr;
        }
    }
}
window.bandwidthTracker = new BandwidthTracker();


function getNodeText(parent, selector, defaultValue) {
    if (!parent) return defaultValue || '';
    var el = parent.querySelector(selector);
    return (el && el.textContent) ? el.textContent : (defaultValue || '');
}

class DvrApiClient {
    constructor(config) {
        config = config || {};
        this.ip = (config.ip || '192.168.100.2').trim();
        this.httpPort = parseInt(config.httpPort || '80', 10);
        this.rtspPort = parseInt(config.rtspPort || '554', 10);
        this.username = (config.username || 'admin').trim();
        this.password = (typeof config.password !== 'undefined') ? config.password : 'jr130182';

        this.sessionTag = null;
        this.sessionID = null;
        this.isAuthenticated = false;
        this.heartbeatTimer = null;
        this.deviceInfo = null;
        this.channels = [];
    }

    get baseUrl() {
        if (window.location && window.location.protocol && window.location.protocol.indexOf('http') === 0) {
            return window.location.origin + '/dvr';
        }
        var portStr = (this.httpPort === 80) ? '' : (':' + this.httpPort);
        return 'http://' + this.ip + portStr;
    }

    /**
     * Atualiza credenciais e endereÃ§o dinamicamente
     */
    updateConfig(newConfig) {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        newConfig = newConfig || {};
        if (newConfig.ip) this.ip = newConfig.ip.trim();
        if (newConfig.httpPort) this.httpPort = parseInt(newConfig.httpPort, 10);
        if (newConfig.rtspPort) this.rtspPort = parseInt(newConfig.rtspPort, 10);
        if (newConfig.username) this.username = newConfig.username.trim();
        if (typeof newConfig.password !== 'undefined') this.password = newConfig.password;

        this.sessionTag = null;
        this.sessionID = null;
        this.isAuthenticated = false;
        this.deviceInfo = null;
        this.channels = [];
    }

    /**
     * Headers padronizados com suporte a proxy PC dinÃ¢mico
     */
    getRequestHeaders(customHeaders) {
        var headers = { 'If-Modified-Since': '0' };
        if (this.sessionTag) {
            headers['SessionTag'] = this.sessionTag;
        }
        // Quando testando no PC, envia o IP e porta destino para o proxy do server.js
        if (window.location && window.location.protocol && window.location.protocol.indexOf('http') === 0) {
            headers['x-dvr-ip'] = this.ip;
            headers['x-dvr-port'] = String(this.httpPort);
            try {
                var authToken = sessionStorage.getItem('dvr_token');
                if (authToken) headers['x-auth-token'] = authToken;
            } catch(e) {}
        }
        if (customHeaders) {
            for (var k in customHeaders) {
                if (customHeaders.hasOwnProperty(k)) {
                    headers[k] = customHeaders[k];
                }
            }
        }
        return headers;
    }

    /**
     * AutenticaÃ§Ã£o via ISAPI sessionLogin (SHA-256)
     */
    async login() {
        try {
            console.log('[DVR] Conectando a ' + this.baseUrl + ' (' + this.ip + ':' + this.httpPort + ')');
            
            // Passo 1: Obter capacidades e desafio
            var capUrl = this.baseUrl + '/ISAPI/Security/sessionLogin/capabilities?username=' + encodeURIComponent(this.username) + '&_=' + Date.now();
            var capRes = await fetch(capUrl, {
                method: 'GET',
                headers: this.getRequestHeaders(),
                credentials: 'include'
            });

            if (!capRes.ok) {
                throw new Error('Falha HTTP ' + capRes.status + ' ao obter capacidades');
            }

            var capXmlText = await capRes.text();
            var parser = new DOMParser();
            var capDoc = parser.parseFromString(capXmlText, 'text/xml');

            this.sessionID = getNodeText(capDoc, 'sessionID', '');
            var challenge = getNodeText(capDoc, 'challenge', '');
            var iterations = parseInt(getNodeText(capDoc, 'iterations', '100'), 10);
            var isIrreversible = (getNodeText(capDoc, 'isIrreversible', 'false') === 'true');
            var salt = getNodeText(capDoc, 'salt', '');

            if (!challenge) {
                throw new Error('Desafio de autenticaÃ§Ã£o nÃ£o retornado pelo DVR');
            }

            // Passo 2: Calcular Hash SHA-256 da senha
            var passwordHash = '';
            if (isIrreversible) {
                var h = window.SHA256(this.username + salt + this.password);
                h = window.SHA256(h + challenge);
                for (var i = 2; i < iterations; i++) {
                    h = window.SHA256(h);
                }
                passwordHash = h;
            } else {
                var h2 = window.SHA256(this.password) + challenge;
                for (var j = 1; j < iterations; j++) {
                    h2 = window.SHA256(h2);
                }
                passwordHash = h2;
            }

            // Passo 3: Enviar requisiÃ§Ã£o POST com XML de SessionLogin
            var loginPayload = 
                '<?xml version="1.0" encoding="UTF-8"?>' +
                '<SessionLogin>' +
                '<userName>' + this.username + '</userName>' +
                '<password>' + passwordHash + '</password>' +
                '<sessionID>' + this.sessionID + '</sessionID>' +
                '</SessionLogin>';

            var loginUrl = this.baseUrl + '/ISAPI/Security/sessionLogin?timeStamp=' + Date.now();
            var loginRes = await fetch(loginUrl, {
                method: 'POST',
                headers: this.getRequestHeaders({
                    'Content-Type': 'application/xml'
                }),
                credentials: 'include',
                body: loginPayload
            });

            var loginXmlText = await loginRes.text();
            var loginDoc = parser.parseFromString(loginXmlText, 'text/xml');
            var statusVal = getNodeText(loginDoc, 'statusValue', '');
            var sessionTagVal = getNodeText(loginDoc, 'sessionTag', '');

            if (loginRes.ok && (statusVal === '200' || statusVal === '1')) {
                this.sessionTag = sessionTagVal;
                this.isAuthenticated = true;
                console.log('[DVR] Login realizado com sucesso! SessionTag:', this.sessionTag || 'Cookie ativo');
                this.startHeartbeat();
                return true;
            } else {
                var statusStr = getNodeText(loginDoc, 'statusString', 'Erro de autenticaÃ§Ã£o');
                throw new Error(statusStr || 'Senha ou usuÃ¡rio incorretos no DVR');
            }
        } catch (e) {
            console.error('[DVR] Erro no login:', e);
            this.isAuthenticated = false;
            throw e;
        }
    }
    /**
     * MantÃ©m a sessÃ£o ativa enviando heartbeat a cada 30 segundos
     */
    startHeartbeat() {
        var self = this;
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(async function() {
            if (!self.isAuthenticated) return;
            try {
                await fetch(self.baseUrl + '/ISAPI/Security/sessionHeartbeat', {
                    method: 'PUT',
                    headers: self.getRequestHeaders(),
                    credentials: 'include'
                });
            } catch (e) {
                console.warn('[DVR] Erro no heartbeat:', e);
            }
        }, 30000);
    }

    /**
     * Consulta informaÃ§Ãµes de hardware do DVR
     */
    async getDeviceInfo() {
        try {
            var res = await fetch(this.baseUrl + '/ISAPI/System/deviceInfo', {
                headers: this.getRequestHeaders(),
                credentials: 'include'
            });

            if (!res.ok) return null;
            var xmlText = await res.text();
            var doc = new DOMParser().parseFromString(xmlText, 'text/xml');

            this.deviceInfo = {
                deviceName: getNodeText(doc, 'deviceName', 'DVR'),
                model: getNodeText(doc, 'model', 'iDS-7216HQHI-M1/XT'),
                serialNumber: getNodeText(doc, 'serialNumber', ''),
                firmwareVersion: getNodeText(doc, 'firmwareVersion', ''),
                manufacturer: getNodeText(doc, 'manufacturer', 'Hikvision')
            };
            return this.deviceInfo;
        } catch (e) {
            console.error('[DVR] Erro ao obter deviceInfo:', e);
            return null;
        }
    }

    /**
     * Lista todos os canais de vÃ­deo disponÃ­veis e o status de sinal
     */
    async getChannels() {
        try {
            var res = await fetch(this.baseUrl + '/ISAPI/System/Video/inputs/channels', {
                headers: this.getRequestHeaders(),
                credentials: 'include'
            });

            if (!res.ok) throw new Error('HTTP ' + res.status);
            var xmlText = await res.text();
            var doc = new DOMParser().parseFromString(xmlText, 'text/xml');
            var nodes = doc.querySelectorAll('VideoInputChannel');

            var channels = [];
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var id = parseInt(getNodeText(node, 'id', '0'), 10);
                var inputPort = parseInt(getNodeText(node, 'inputPort', '0'), 10);
                var defaultName = 'Camera ' + (id < 10 ? '0' + id : id);
                var name = getNodeText(node, 'name', defaultName);
                var resDesc = getNodeText(node, 'resDesc', '').trim();
                var isOnline = (resDesc.indexOf('NO VIDEO') === -1 && resDesc.length > 0);

                channels.push({
                    id: id,
                    inputPort: inputPort,
                    name: name,
                    resDesc: resDesc,
                    isOnline: isOnline,
                    mainStreamChannelId: id * 100 + 1, // Ex: 101, 201
                    subStreamChannelId: id * 100 + 2   // Ex: 102, 202
                });
            }

            this.channels = channels;
            return channels;
        } catch (e) {
            console.error('[DVR] Erro ao obter canais:', e);
            throw e;
        }
    }

    /**
     * Retorna a URL de Snapshot (JPEG) para um canal
     */
    getSnapshotUrl(channelId, streamType) {
        streamType = streamType || 2;
        var chId = channelId * 100 + streamType;
        return this.baseUrl + '/ISAPI/Streaming/channels/' + chId + '/picture?t=' + Date.now();
    }

    /**
     * Busca o snapshot como Blob com os headers de autenticaÃ§Ã£o
     */
    async fetchSnapshotBlob(channelId, streamType) {
        streamType = streamType || 2;
        var url = this.getSnapshotUrl(channelId, streamType);

        var res = await fetch(url, {
            headers: this.getRequestHeaders(),
            credentials: 'include'
        });

        if (!res.ok) throw new Error('Snapshot error HTTP ' + res.status);
        var blob = await res.blob();
        if (window.bandwidthTracker) {
            window.bandwidthTracker.addBytes(blob.size);
        }
        return URL.createObjectURL(blob);
    }

    /**
     * Gera URL RTSP para reproduÃ§Ã£o via Samsung AVPlay
     */
    getRtspUrl(channelId, streamType) {
        streamType = streamType || 1;
        var chId = channelId * 100 + streamType;
        return 'rtsp://' + encodeURIComponent(this.username) + ':' + encodeURIComponent(this.password) + '@' + this.ip + ':' + this.rtspPort + '/Streaming/Channels/' + chId;
    }
}

window.DvrApiClient = DvrApiClient;


