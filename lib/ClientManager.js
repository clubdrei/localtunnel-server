import Client from './Client.js';
import TunnelAgent from './TunnelAgent.js';

// Manage sets of clients
//
// A client is a "user session" established to service a remote localtunnel client
class ClientManager {
    constructor(opt) {
        this.opt = opt || {};

        // id -> client instance
        this.clients = new Map();

        // statistics
        this.stats = {
            tunnels: 0
        };

        // This is totally wrong :facepalm: this needs to be per-client...
        this.graceTimeout = null;
    }

    // create a new tunnel with `id`
    // if the id is already used, close the connection & create a new one
    // if the tunnel could not be created, throws an error
    async newClient(id) {
        const clients = this.clients;
        const stats = this.stats;

        // id is already used, close the connection so a new one can be created
        if (clients[id]) {
            // Inspired by
            // https://github.com/appfolio/localtunnel_server/commit/e8d0f5848cf6dfcd22b6587003b3eb2bc2e4a51f
            // https://medium.com/quark-works/running-your-own-reverse-proxy-with-localtunnel-b1658e239c35
            this.removeClient(id);
            console.debug(`[ClientManager.js][${id}] Removed so new connection can be created`);
        }

        const maxTcpSockets = this.opt.max_tcp_sockets;
        const client_min_port_range = this.opt.client_min_port_range;
        const client_max_port_range = this.opt.client_max_port_range;
        const agent = new TunnelAgent({
            clientId: id,
            maxTcpSockets,
            client_min_port_range: client_min_port_range,
            client_max_port_range: client_max_port_range
        });

        const client = new Client({
            id,
            agent,
        });

        // add to clients map immediately
        // avoiding races with other clients requesting same id
        clients[id] = client;

        client.once('close', () => {
            this.removeClient(id);
        });

        // try/catch used here to remove client id
        try {
            const info = await agent.listen();
            ++stats.tunnels;
            return {
                id: id,
                port: info.port,
                max_conn_count: maxTcpSockets,
            };
        }
        catch (err) {
            this.removeClient(id);
            // rethrow error for upstream to handle
            throw err;
        }
    }

    removeClient(id) {
        console.debug(`[ClientManager.js][${id}] Removing client`);
        const client = this.clients[id];
        if (!client) {
            return;
        }
        --this.stats.tunnels;
        delete this.clients[id];
        client.close();
    }

    hasClient(id) {
        return !!this.clients[id];
    }

    getClient(id) {
        return this.clients[id];
    }
}

export default ClientManager;
