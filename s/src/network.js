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

        // Background Heartbeat to check contacts status
        setInterval(() => this.checkAllContacts(), 15000);
    }

    async checkAllContacts() {
        // This will be called from app.js with contact list
    }

    connect(peerId) {
        if (this.connections[peerId] && this.connections[peerId].open) {
            return this.connections[peerId];
        }
        const conn = this.peer.connect(peerId);
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

        conn.on('open', () => {
            console.log('Connected to:', peerId);
            this.connections[peerId] = conn;
            if (this.onStatusChangeCallback) this.onStatusChangeCallback(peerId, 'online');

            // Flush pending messages
            if (this.pendingQueues[peerId]) {
                this.pendingQueues[peerId].forEach(msg => conn.send(msg));
                this.pendingQueues[peerId] = [];
            }
        });

        conn.on('data', (data) => {
            if (this.onMessageCallback) {
                this.onMessageCallback(data, peerId);
            }
        });

        conn.on('close', () => {
            console.log('Connection closed:', peerId);
            delete this.connections[peerId];
            if (this.onStatusChangeCallback) this.onStatusChangeCallback(peerId, 'offline');
        });

        conn.on('error', (err) => {
            console.error('Connection error with', peerId, err);
            delete this.connections[peerId];
            if (this.onStatusChangeCallback) this.onStatusChangeCallback(peerId, 'offline');
        });

        this.connections[peerId] = conn;
    }
}

export const peerManager = new PeerManager();
