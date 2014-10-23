try {
var reds = require('reds');
} catch(e) {
}
var jugglingdb = require('jugglingdb');
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

        if (redisAuth.length === 2) {
            schema.settings.db = redisAuth[0];
            schema.settings.password = redisAuth[1];
        }
    }

    if (schema.settings.socket) {
        schema.client = redis.createClient(
            schema.settings.socket,
            schema.settings.options);
    }
    else {
        schema.client = redis.createClient(
            schema.settings.port,
            schema.settings.host,
            schema.settings.options
        );
    }

    var fts = schema.settings.fulltext;
    if (fts && fts.driver === 'reds' && reds) {

        if (schema.settings.fulltext.socket) {
            reds.client = redis.createClient(
                schema.settings.fulltext.socket,
                schema.settings.fulltext.options
            );
        } else {
            reds.client = redis.createClient(
                schema.settings.fulltext.port,
                schema.settings.fulltext.host,
                schema.settings.fulltext.options
            );
        }
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

    if (!schema.adapter) {
        schema.adapter = new RedisHQ();
        schema.adapter.schema = schema;
    }
    schema.adapter.setConnection(schema.client);

    // load the comparer.lua template
    var zrangemget = fs.readFileSync(__dirname + '/zrange-mget.lua');
    var zrevrangemget = fs.readFileSync(__dirname + '/zrevrange-mget.lua');
    var zrangemgetdel = fs.readFileSync(__dirname + '/zrange-mget-del.lua');
    var zrevrangemgetdel = fs.readFileSync(__dirname + '/zrevrange-mget-del.lua');
    var callbacks = 0;
    if (schema.settings.database) {
        schema.adapter.client.select(schema.settings.database, wait());
    }
    schema.client.on('connect', function () {

        schema.client.lua = {};

        // load the scripts into redis
        schema.client.send_command('script', ['load', zrangemget], wait(function (err, sha) {
            if (err) {
                console.log(err);
            }
            schema.client.lua.zrange = sha;
        }));
        schema.client.send_command('script', ['load', zrevrangemget], wait(function (err, sha) {
            if (err) {
                console.log(err);
            }
            schema.client.lua.zrevrange = sha;
        }));
        schema.client.send_command('script', ['load', zrevrangemgetdel], wait(function (err, sha) {
            if (err) {
                console.log(err);
            }
            schema.client.lua.zrevrangedel = sha;
        }));
        schema.client.send_command('script', ['load', zrangemgetdel], wait(function (err, sha) {
            if (err) {
                console.log(err);
            }
            schema.client.lua.zrangedel = sha;
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
        };
    }


    schema.reconnect = function (cb) {
        if (schema.connected) return cb();
        initializeSchema(schema, function () {
            console.log('connected');
            schema.connected = true;
            cb();
        });
    };
};

