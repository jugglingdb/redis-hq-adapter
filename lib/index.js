var reds = require('reds');
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
    reds.client = schema.client;
    schema.client.auth(schema.settings.password);
    schema.client.on('connect', function () {
        if (schema.settings.database) {
            var cb = callback.called ? function () {} : callback;
            callback.called = true;
            return schema.client.select(schema.settings.database, cb);
        }
        if (callback.called) return;
        callback.called = true;
        callback();

        // load the comparer.lua template
        var zrangemget = fs.readFileSync(__dirname + '/zrange-mget.lua');
        var zrevrangemget = fs.readFileSync(__dirname + '/zrevrange-mget.lua');

        schema.client.lua = {};

        // load the scripts into redis
        schema.client.send_command('script', ['load', zrangemget], function (err, sha) {
            schema.client.lua.zrange = sha;
        });
        schema.client.send_command('script', ['load', zrevrangemget], function (err, sha) {
            schema.client.lua.zrevrange = sha;
        });

        console.log(schema.client.lua)
    });

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

