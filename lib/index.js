try {
var reds = require('reds');
} catch(e) {
}
var redis = require('redis');
var RedisHQ = require('./adapter.js');
// redis.debug_mode = true;
var fs = require('fs');

exports.initialize = function initializeSchema(schema, callback) {

    // comparer sha cache
    schema.comparers = {};

    if (schema.settings.url) {
        var url = require('url');
        var redisUrl = url.parse(schema.settings.url);
        var redisAuth = (redisUrl.auth || '').split(':');
        schema.settings.host = redisUrl.hostname;
        schema.settings.port = redisUrl.port;

        if (redisAuth.length == 2) {
            schema.settings.db = redisAuth[0];
            schema.settings.password = redisAuth[1];
        }
    }

    schema.client = redis.createClient(
        schema.settings.port,
        schema.settings.host,
        schema.settings.options
    );
    if (schema.settings.fulltext && reds) {
        reds.client = redis.createClient(
            schema.settings.fulltext.port,
            schema.settings.fulltext.host,
            schema.settings.fulltext.options
        );
        if (schema.settings.fulltext.password) {
            reds.client.auth(schema.settings.fulltext.password);
        }
        if (schema.settings.fulltext.database) {
            reds.client.on('connect', function () {
                reds.client.select(schema.settings.fulltext.database);
            });
        }
    } else if (reds) {
        reds.client = schema.client;
    }
    schema.client.auth(schema.settings.password);

    // load the comparer.lua template
    var zrangemget = fs.readFileSync(__dirname + '/zrange-mget.lua');
    var zrevrangemget = fs.readFileSync(__dirname + '/zrevrange-mget.lua');
    var callbacks;
    schema.client.on('connect', function () {
        callbacks = 0;
        if (schema.settings.database) {
            schema.client.select(schema.settings.database, wait());
        }

        schema.client.lua = {};

        // load the scripts into redis
        schema.client.send_command('script', ['load', zrangemget], wait(function (err, sha) {
            // console.log('load zrange');
            schema.client.lua.zrange = sha;
        }));
        schema.client.send_command('script', ['load', zrevrangemget], wait(function (err, sha) {
            // console.log('load zrevrange');
            schema.client.lua.zrevrange = sha;
        }));
    });

    function wait(fn) {
        callbacks += 1;
        return function(err, res) {
            if (fn) {
                fn(err, res);
            }
            if (--callbacks === 0 && callback) {
                callback();
                callback = null;
            }
        }
    }

    if (!schema.adapter) {
        schema.adapter = new RedisHQ;
        schema.adapter.schema = schema;
    }
    schema.adapter.setConnection(schema.client);

    schema.reconnect = function (cb) {
        if (schema.connected) return cb();;
        initializeSchema(schema, function () {
            console.log('connected');
            schema.connected = true;
            cb();
        });
    };
};

