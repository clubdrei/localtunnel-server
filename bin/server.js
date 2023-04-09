#!/usr/bin/env node
import util from 'node:util';
import CreateServer from '../server.js';

// Force console.* output into one line. This makes searching in Grafana a lot easier.
util.inspect.defaultOptions.breakLength = Infinity;
util.inspect.defaultOptions.compact = true;

const argv = {
    domain: process.env.LOCALTUNNEL_DOMAIN,
    secure: isTrue(getEnvironmentValue('LOCALTUNNEL_SECURE', false)),
    port: Number.parseInt(getEnvironmentValue('LOCALTUNNEL_PORT', 80), 10),
    address: getEnvironmentValue('LOCALTUNNEL_ADDRESS', '0.0.0.0'),
    'max-sockets': Number.parseInt(getEnvironmentValue('LOCALTUNNEL_MAX_SOCKETS', 10), 10),
    'client-min-port-range': Number.parseInt(getEnvironmentValue('LOCALTUNNEL_CLIENT_MIN_PORT_RANGE', 1024), 10),
    'client-max-port-range': Number.parseInt(getEnvironmentValue('LOCALTUNNEL_CLIENT_MAX_PORT_RANGE', 65535), 10),
};

console.debug('Create server with the following options:', argv);

const server = CreateServer({
    max_tcp_sockets: argv['max-sockets'],
    secure: argv.secure,
    domain: argv.domain,
    client_min_port_range: argv['client-min-port-range'],
    client_max_port_range: argv['client-max-port-range']
});

server.listen(argv.port, argv.address, () => {
    console.debug(`Server listening on port: ${server.address().port}`);
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

/**
 * Returns true for 1, "1" and "true" and false for every other value
 * @param {String|Number} value
 * @return {boolean}
 */
function isTrue(value) {
    if (value === 1 || value === '1' || value === 'true') {
        return true;
    }
    return false;
}
