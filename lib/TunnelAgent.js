import { Agent } from 'http';
import net from 'net';
import { getPort } from 'portfinder';

const DEFAULT_MAX_SOCKETS = 10;

// Implements an http.Agent interface to a pool of tunnel sockets
// A tunnel socket is a connection _from_ a client that will
// service http requests. This agent is usable wherever one can use an http.Agent
class TunnelAgent extends Agent {
    constructor(options = {}) {
        super({
            keepAlive: true,
            // only allow keepalive to hold on to one socket
            // this prevents it from holding on to all the sockets so they can be used for upgrades
            maxFreeSockets: 1,
        });

        this.clientId = options.clientId;

        // sockets we can hand out via createConnection
        this.availableSockets = [];

        // when a createConnection cannot return a socket, it goes into a queue
        // once a socket is available it is handed out to the next callback
        this.waitingCreateConn = [];

        // track maximum allowed sockets
        this.connectedSockets = 0;
        this.maxTcpSockets = options.maxTcpSockets || DEFAULT_MAX_SOCKETS;

        this.client_min_port_range = options.client_min_port_range;
        this.client_max_port_range = options.client_max_port_range;
        // new tcp server to service requests for this client
        this.server = net.createServer();

        // flag to avoid double starts
        this.started = false;
        this.closed = false;
    }

    stats() {
        return {
            connectedSockets: this.connectedSockets,
        };
    }

    listen() {
        const server = this.server;
        if (this.started) {
            throw new Error('already started');
        }
        this.started = true;

        server.on('close', this._onClose.bind(this));
        server.on('connection', this._onConnection.bind(this));
        server.on('error', (err) => {
            // These errors happen from killed connections, we don't worry about them
            if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') {
                return;
            }
            console.error(err);
        });

        return new Promise((resolve) => {
            getPort({ port: this.client_min_port_range, stopPort: this.client_max_port_range }, (err,port) => {
              server.listen(port,() => {
                  const port = server.address().port;
                  console.debug(`[TunnelAgent.js][${this.clientId}] TCP server listening on port: ${port}`);

                  resolve({
                      // port for lt client tcp connections
                      port: port,
                  });
              });
            });
        });
    }

    _onClose() {
        this.closed = true;
        console.debug(`[TunnelAgent.js][${this.clientId}] Closed TCP socket`);
        // flush any waiting connections
        for (const conn of this.waitingCreateConn) {
            conn(new Error('closed'), null);
        }
        this.waitingCreateConn = [];
        this.emit('end');
    }

    // new socket connection from client for tunneling requests to client
    _onConnection(socket) {
        // no more socket connections allowed
        if (this.connectedSockets >= this.maxTcpSockets) {
            console.error(`[TunnelAgent.js][${this.clientId}] No more sockets allowed`, this.connectedSockets, this.maxTcpSockets);
            socket.destroy();
            return false;
        }

        socket.once('close', (hadError) => {
            console.debug(`[TunnelAgent.js][${this.clientId}] Closed socket (hadError: ${hadError})`);
            this.connectedSockets -= 1;
            // remove the socket from available list
            const idx = this.availableSockets.indexOf(socket);
            if (idx >= 0) {
                this.availableSockets.splice(idx, 1);
            }

            console.debug(`[TunnelAgent.js][${this.clientId}] Connected sockets: ${this.connectedSockets}`);
            if (this.connectedSockets <= 0) {
                console.debug(`[TunnelAgent.js][${this.clientId}] All sockets disconnected`);
                this.emit('offline');
            }
        });

        // close will be emitted after this
        socket.once('error', (err) => {
            // we do not log these errors, sessions can drop from clients for many reasons
            // these are not actionable errors for our server
            socket.destroy();
        });

        if (this.connectedSockets === 0) {
            this.emit('online');
        }

        this.connectedSockets += 1;
        console.debug(`[TunnelAgent.js][${this.clientId}] New connection from ${socket.address().address}:${socket.address().port}`);
        console.error(`[TunnelAgent.js][${this.clientId}] Socket usage: ${this.connectedSockets} of ${this.maxTcpSockets}`);

        // if there are queued callbacks, give this socket now and don't queue into available
        const fn = this.waitingCreateConn.shift();
        if (fn) {
            console.debug(`[TunnelAgent.js][${this.clientId}] Giving socket to queued conn request`);
            setTimeout(() => {
                fn(null, socket);
            }, 0);
            return;
        }

        // make socket available for those waiting on sockets
        this.availableSockets.push(socket);
    }

    // fetch a socket from the available socket pool for the agent
    // if no socket is available, queue
    // cb(err, socket)
    createConnection(options, cb) {
        if (this.closed) {
            cb(new Error('closed'));
            return;
        }

        console.debug(`[TunnelAgent.js][${this.clientId}] Create connection`);

        // socket is a tcp connection back to the user hosting the site
        const sock = this.availableSockets.shift();

        // no available sockets
        // wait until we have one
        if (!sock) {
            this.waitingCreateConn.push(cb);
            console.debug(`[TunnelAgent.js][${this.clientId}] Waiting connected: ${this.connectedSockets}`);
            console.debug(`[TunnelAgent.js][${this.clientId}] Waiting available: ${this.availableSockets.length}`);
            return;
        }

        console.debug(`[TunnelAgent.js][${this.clientId}] Socket given`);
        cb(null, sock);
    }

    destroy() {
        this.server.close();
        super.destroy();
    }
}

export default TunnelAgent;
