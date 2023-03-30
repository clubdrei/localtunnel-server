import { hri } from 'human-readable-ids';
import Debug from 'debug';

import Client from './Client';
import TunnelAgent from './TunnelAgent';

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

        this.debug = Debug('lt:ClientManager');

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
            this.debug = this.debug('id %s removed so new connection can be created', id);
        }

        const maxSockets = this.opt.max_tcp_sockets;
        const agent = new TunnelAgent({
            clientId: id,
            maxSockets: 10,
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
                max_conn_count: maxSockets,
            };
        }
        catch (err) {
            this.removeClient(id);
            // rethrow error for upstream to handle
            throw err;
        }
    }

    removeClient(id) {
        this.debug('removing client: %s', id);
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
