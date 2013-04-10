var reds = require('reds');
var redis = require('redis');
var RedisHQ = require('./adapter.js');
// redis.debug_mode = true;
var fs = require('fs');

exports.initialize = function initializeSchema(schema, callback) {

    //load the comparer.lua template
    schema.comparerTemplate = fs.readFileSync(__dirname + '/comparer.lua');

    //comparer sha cache
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

