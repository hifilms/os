export class PeerManager {
    constructor() {
        this.peer = null;
        this.connections = {}; // Map of peerId -> connection
        this.pendingQueues = {}; // Map of peerId -> [data]
        this.onMessageCallback = null;
        this.onStatusChangeCallback = null;
        this.myId = null;
        this.checkBlacklistCallback = null;
    }

    init(myId, onOpen, onStatusChange, checkBlacklist) {
        this.myId = myId;
        this.onStatusChangeCallback = onStatusChange;
        this.checkBlacklistCallback = checkBlacklist;
        this.peer = new Peer(myId);

        this.peer.on('open', (id) => {
            console.log('My peer ID is: ' + id);
            if (onOpen) onOpen(id);
        });

        this.peer.on('connection', (conn) => {
            if (this.checkBlacklistCallback && this.checkBlacklistCallback(conn.peer)) {
                console.log('Blocking incoming connection from blacklisted peer:', conn.peer);
                conn.close();
                return;
            }
            this._setupConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
        });

        // Background Heartbeat to check contacts status (faster check: every 4 seconds)
        setInterval(() => this.checkAllContacts(), 4000);

        // Immediate cleanup on window close
        window.addEventListener('beforeunload', () => {
            if (this.peer) this.peer.destroy();
        });
    }

    async checkAllContacts() {
        const now = Date.now();
        Object.keys(this.connections).forEach(peerId => {
            const conn = this.connections[peerId];
            if (!conn) return;

            if (conn.open) {
                try { conn.send({ type: 'ping' }); } catch (e) { }

                if (now - (conn.lastSeen || 0) > 15000) {
                    conn.close();
                    this._handleOffline(peerId);
                }
            } else if (conn.isConnecting) {
                if (now - (conn.startTime || 0) > 20000) {
                    conn.close();
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

        console.log('Connecting to:', peerId);
        const conn = this.peer.connect(peerId, { reliable: true });
        conn.isConnecting = true;
        conn.startTime = Date.now();
        conn.lastSeen = Date.now();
        this._setupConnection(conn);
        return conn;
    }

    sendMessage(peerId, data) {
        const conn = this.connections[peerId];
        if (conn && conn.open) {
            conn.send(data);
            return true;
        } else {
            // Queue for later
            if (!this.pendingQueues[peerId]) this.pendingQueues[peerId] = [];
            this.pendingQueues[peerId].push(data);

            // Try to connect if not already connecting
            this.connect(peerId);
            return false;
        }
    }

    onMessage(callback) {
        this.onMessageCallback = callback;
    }

    _setupConnection(conn) {
        const peerId = conn.peer;
        conn.lastSeen = Date.now();

        conn.on('open', () => {
            console.log('Connected to:', peerId);
            conn.isConnecting = false;
            this.connections[peerId] = conn;
            conn.lastSeen = Date.now();
            if (this.onStatusChangeCallback) this.onStatusChangeCallback(peerId, 'online');

            // Flush pending messages
            if (this.pendingQueues[peerId]) {
                this.pendingQueues[peerId].forEach(msg => conn.send(msg));
                this.pendingQueues[peerId] = [];
            }
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
