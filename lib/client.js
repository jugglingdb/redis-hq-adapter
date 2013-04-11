/**
 * Module exports
 */
module.exports = Client;

/**
 * Module deps
 */
var redis = require('redis');

/**
 * Client proxy object contains all redis methods wrapped for logging and
 * transaction handling
 *
 * @constructor
 * @param {RedisHQ} adapter.
 */
function Client(adapter) {
    this.__adapter = adapter;
    this.__connection = adapter && adapter.connection;
    this.__step = null;
    this.__failureCallbacks = null;
    this.__successCallbacks = null;
}

Client.prototype.__startStep = function startStep(callback) {
    var c = this;
    if (!c.__step) {
        c.__step = [];
        c.__failureCallbacks = [];
        c.__successCallbacks = [];
        process.nextTick(function() {
            c.__endStep();
        });
    }
    c.__failureCallbacks.push(callback);
    return c;
};

Client.prototype.__endStep = function endStep() {
    var c = this;
    var schedule = c.__step;
    var fail = c.__failureCallbacks;
    var success = c.__successCallbacks;
    c.__successCallbacks = null;
    c.__step = null;
    c.__failureCallbacks = null;
    c.multi(schedule, function(err, replies) {
        if (err) {
            return fail.forEach(function(cb) {
                if (typeof cb === 'function') {
                    cb(err);
                }
            });
        }
        if (replies) {
            replies.forEach(function (r, i) {
                if (typeof success[i] === 'function') {
                    success[i](err, r);
                }
            });
        }
    });
};

/**
 * Wrap redis command for logging and transaction handling.
 *
 * @param {String} cmd - redis command name.
 * @return wrapped method.
 */
Client.wrap = function wrap(cmd) {
    return function (args, callback, nostep) {

        var c = this.__connection, log;

        if (typeof args === 'string') {
            args = [args];
        }

        if (!args) args = [];

        log = this.__adapter.logger(
            [cmd.toUpperCase()].concat(args.map(function (a) {
                if (typeof a === 'object') return JSON.stringify(a);
                return a;
            })).join(' '));

        if (!this.__step && !nostep) {
            this.__startStep(callback);
        }

        if (this.__step) {
            args.unshift(cmd);
            this.__step.push(args);
            this.__successCallbacks.push(callback);
        } else {
            args.push(function (err, res) {
                if (err) console.log(err);
                log();
                if (callback) {
                    callback(err, res);
                }
            });
            c[cmd].apply(c, args);
        }
    };
};

var commands = Object.keys(redis.Multi.prototype).filter(function (n) {
    return n.match(/^[a-z]/);
});

commands.forEach(function (cmd) {
    Client.prototype[cmd] = Client.wrap(cmd);
});

/**
 * Wrap multi in specific way. It should handle case when commands blank or
 * doesn't require multi at all (one command).
 */
Client.prototype.multi = function (commands, callback) {
    if (commands.length === 0) return callback && callback();
    if (commands.length === 1) {
        var cmd = commands[0];
        return this[cmd.shift().toLowerCase()].call(
            this,
            cmd,
            callback && function (e, r) { callback(e, [r]) }, true);
    }
    var log = this.__adapter.logger('MULTI\n  ' + commands.map(function (x) {
        return x.join(' ');
    }).join('\n  ') + '\nEXEC');
    this.__connection.multi(commands).exec(function (err, replies) {
        if (err) console.log(err);
        log();
        callback && callback(err, replies);
    });
};
