export class PeerManager {
    constructor() {
        this.peer = null;
        this.connections = {}; // Map of peerId -> connection
        this.onMessageCallback = null;
        this.onStatusChangeCallback = null;
        this.myId = null;
        this.checkBlacklistCallback = null;
        this.failedConnections = {}; // peerId -> timestamp
    }

    _toNetworkId(mobile) {
        if (!mobile || typeof mobile !== 'string' || mobile.length < 6) return mobile;

        // 1. Reverse first 3 and last 3 characters
        let arr = mobile.split('');
        let first3 = arr.slice(0, 3).reverse();
        let last3 = arr.slice(-3).reverse();
        let middle = arr.slice(3, -3);
        let sequence = [...first3, ...middle, ...last3].join('');

        // 2. Custom Mapping
        // 0:a, 1:v, 2:z, 3:b, 4:y, 5:c, 6:x, 7:d, 8:w, 9:e (1=v inferred from z,y,x,w sequence)
        const map = {
            '0': 'a', '1': 'v', '2': 'z', '3': 'b', '4': 'y',
            '5': 'c', '6': 'x', '7': 'd', '8': 'w', '9': 'e'
        };

        // 3. Pattern: Digit - Alphabet - Digit...
        let result = '';
        for (let i = 0; i < sequence.length; i++) {
            if (i % 2 === 0) {
                result += sequence[i]; // Even index: Keep as Digit
            } else {
                result += map[sequence[i]] || sequence[i]; // Odd index: Map to Alphabet
            }
        }

        return result;
    }

    _fromNetworkId(networkId) {
        if (!networkId || typeof networkId !== 'string') return networkId;

        const reverseMap = {
            'a': '0', 'v': '1', 'z': '2', 'b': '3', 'y': '4',
            'c': '5', 'x': '6', 'd': '7', 'w': '8', 'e': '9'
        };

        // 1. Reverse the Digit-Alphabet mapping back to digits
        let sequence = '';
        for (let i = 0; i < networkId.length; i++) {
            if (i % 2 === 0) {
                sequence += networkId[i];
            } else {
                sequence += reverseMap[networkId[i]] || networkId[i];
            }
        }

        // 2. Reverse back the first 3 and last 3 positions
        let arr = sequence.split('');
        let first3 = arr.slice(0, 3).reverse();
        let last3 = arr.slice(-3).reverse();
        let middle = arr.slice(3, -3);
        return [...first3, ...middle, ...last3].join('');
    }

    init(myId, onOpen, onStatusChange, checkBlacklist) {
        this.myId = myId;
        this.onStatusChangeCallback = onStatusChange;
        this.checkBlacklistCallback = checkBlacklist;
        this.peer = new Peer(this._toNetworkId(myId), {
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' }
                ]
            }
        });

        this.peer.on('open', (id) => {
            const realId = this._fromNetworkId(id);
            console.log('My real peer ID is: ' + realId);
            if (onOpen) onOpen(realId);
        });

        this.peer.on('connection', (conn) => {
            const realId = this._fromNetworkId(conn.peer);
            if (this.checkBlacklistCallback && this.checkBlacklistCallback(realId)) {
                console.log('Enforcing block for incoming connection:', realId);
                // Briefly open to send notification, then close
                conn.on('open', () => {
                    conn.send({ type: 'blocked_notification' });
                    setTimeout(() => conn.close(), 1000);
                });
                return;
            }
            this._setupConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
        });

        // Background Heartbeat to check contacts status (faster check: every 2 seconds)
        setInterval(() => this.checkAllContacts(), 2000);

        // Immediate cleanup on window close
        window.addEventListener('beforeunload', () => {
            if (this.peer) this.peer.destroy();
        });

        // Trigger check when internet returns
        window.addEventListener('online', () => {
            console.log('Internet is back, restoring signaling connection...');

            if (this.peer) {
                if (this.peer.destroyed) {
                    console.log('Peer object was destroyed, re-initializing...');
                    this.init(this.myId, null, this.onStatusChangeCallback, this.checkBlacklistCallback);
                } else if (this.peer.disconnected) {
                    console.log('Peer was disconnected, reconnecting...');
                    this.peer.reconnect();
                }
            } else if (this.myId) {
                console.log('Peer was null, re-initializing...');
                this.init(this.myId, null, this.onStatusChangeCallback, this.checkBlacklistCallback);
            }

            // Re-check all contacts
            this.checkAllContacts();
        });

        // Automatically handle disconnection from signaling server
        this.peer.on('disconnected', () => {
            console.log('Disconnected from signaling server. Retrying...');
            // More aggressive retry for weak networks
            setTimeout(() => {
                if (window.navigator.onLine && this.peer && this.peer.disconnected) {
                    this.peer.reconnect();
                }
            }, 2000);
        });

        // Trigger when internet is lost
        window.addEventListener('offline', () => {
            console.log('Internet lost, marking all as offline...');
            Object.keys(this.connections).forEach(peerId => {
                const conn = this.connections[peerId];
                if (conn) conn.close();
                this._handleOffline(peerId);
            });
        });
    }

    async checkAllContacts() {
        const now = Date.now();
        Object.keys(this.connections).forEach(peerId => {
            const conn = this.connections[peerId];
            if (!conn) return;

            if (conn.open) {
                try { conn.send({ type: 'ping' }); } catch (e) { }

                if (now - (conn.lastSeen || 0) > 4000) { // Reduced to 4s for faster detection
                    console.log('Heartbeat timeout for:', peerId);
                    conn.close();
                    this._handleOffline(peerId);
                }
            } else if (conn.isConnecting) {
                if (now - (conn.startTime || 0) > 15000) { // Increased to 15s for slow 2G/3G networks
                    console.log('Connection timeout for:', peerId);
                    conn.close();
                    this.failedConnections[peerId] = Date.now();
                    this._handleOffline(peerId);
                }
            } else {
                this._handleOffline(peerId);
            }
        });
    }

    _handleOffline(peerId) {
        delete this.connections[peerId];
        if (this.onStatusChangeCallback) this.onStatusChangeCallback(peerId, 'offline');
    }

    connect(peerId) {
        if (this.connections[peerId]) {
            if (this.connections[peerId].open) return this.connections[peerId];
            if (this.connections[peerId].isConnecting) return this.connections[peerId];
        }

        // Avoid retrying too fast (wait 4s between retries)
        const now = Date.now();
        if (this.failedConnections[peerId] && now - this.failedConnections[peerId] < 4000) {
            return null;
        }

        console.log('Connecting to:', peerId);
        const conn = this.peer.connect(this._toNetworkId(peerId), { reliable: true });
        conn.isConnecting = true;
        conn.startTime = now;
        conn.lastSeen = now;
        this._setupConnection(conn);
        return conn;
    }

    sendMessage(peerId, data) {
        const conn = this.connections[peerId];
        if (conn && conn.open) {
            conn.send(data);
            return true;
        } else {
            // Try to connect if not already connecting
            this.connect(peerId);
            return false;
        }
    }

    onMessage(callback) {
        this.onMessageCallback = callback;
    }

    _setupConnection(conn) {
        const networkId = conn.peer;
        const peerId = this._fromNetworkId(networkId);
        conn.lastSeen = Date.now();

        conn.on('open', () => {
            console.log('Connected to:', peerId);
            conn.isConnecting = false;
            delete this.failedConnections[peerId];

            this.connections[peerId] = conn;
            conn.lastSeen = Date.now();
            if (this.onStatusChangeCallback) this.onStatusChangeCallback(peerId, 'online');
        });

        conn.on('data', (data) => {
            conn.lastSeen = Date.now();

            // Handle internal heartbeat
            if (data && data.type === 'ping') {
                conn.send({ type: 'pong' });
                return;
            }
            if (data && data.type === 'pong') {
                return;
            }

            if (this.onMessageCallback) {
                this.onMessageCallback(data, peerId);
            }
        });

        conn.on('close', () => {
            console.log('Connection closed:', peerId);
            if (this.connections[peerId] === conn) {
                delete this.connections[peerId];
            }
            if (this.onStatusChangeCallback) this.onStatusChangeCallback(peerId, 'offline');
        });

        conn.on('error', (err) => {
            console.error('Connection error with', peerId, err);
            if (this.connections[peerId] === conn) {
                delete this.connections[peerId];
            }
            if (this.onStatusChangeCallback) this.onStatusChangeCallback(peerId, 'offline');
        });

        this.connections[peerId] = conn;
    }
}

export const peerManager = new PeerManager();
