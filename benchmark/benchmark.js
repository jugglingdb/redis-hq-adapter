var start = Date.now();
var client = require('redis').createClient(10875, 'pub-redis-10875.eu-west-1-1.2.ec2.garantiadata.com'), j= 0;
var limit = parseInt(process.env.LIMIT, 10);

var multi = process.argv[2] === 'bravo';

run();

function run() {
    var time = Date.now();
    benchmark(function() {
        console.log(++j, Date.now() - time, Math.round(process.memoryUsage().heapUsed / 1024 / 1024), Math.round(process.memoryUsage().heapTotal / 1024 / 1024));
        if (Date.now() - start < limit) {
            (process.setImmediate || process.nextTick)(run);
        } else {
            process.exit(0);
        }
    });
}

function benchmark(next) {
    var i = 1000;
    var c = multi ? client.multi() : client;
    while(--i >= 0) {
        (function(i) {
            c.set('value' + i, i, function() {
                if (i === 0) {
                    next();
                }
            });
        })(i);
        if (multi && i % 10 === 0) {
            c.exec();
            if (i !== 0) {
                c = client.multi();
            }
        }
    }
}

