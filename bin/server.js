#!/usr/bin/env node
import util from 'node:util';
import CreateServer from '../server.js';

// Force console.* output into one line. This makes searching in Grafana a lot easier.
util.inspect.defaultOptions.breakLength = Infinity;
util.inspect.defaultOptions.compact = true;

const argv = {
    domain: process.env.LOCALTUNNEL_DOMAIN,
    secure: Boolean(getEnvironmentValue('LOCALTUNNEL_SECURE', false)),
    port: getEnvironmentValue('LOCALTUNNEL_PORT', 80),
    address: getEnvironmentValue('LOCALTUNNEL_ADDRESS', '0.0.0.0'),
    'max-sockets': getEnvironmentValue('LOCALTUNNEL_MAX_SOCKETS', 10),
    'client-min-port-range': getEnvironmentValue('LOCALTUNNEL_CLIENT_MIN_PORT_RANGE', 1024),
    'client-max-port-range': getEnvironmentValue('LOCALTUNNEL_CLIENT_MAX_PORT_RANGE', 65535),
}

console.debug('Create server with the following options:', argv);

const server = CreateServer({
    max_tcp_sockets: argv['max-sockets'],
    secure: argv.secure,
    domain: argv.domain,
    client_min_port_range: argv['client-min-port-range'],
    client_max_port_range: argv['client-max-port-range']
});

server.listen(argv.port, argv.address, () => {
    console.debug('server listening on port: %d', server.address().port);
});

process.on('SIGINT', () => {
    process.exit();
});

process.on('SIGTERM', () => {
    process.exit();
});

process.on('uncaughtException', (err) => {
    console.error(err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason);
});

function getEnvironmentValue(name, defaultValue) {
    if (process.env.hasOwnProperty(name)) {
        return process.env[name];
    }

    return defaultValue;
}
