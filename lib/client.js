/**
 * Module exports
 */
module.exports = Client;

/**
 * Module deps
 */
var redis = require('redis');
var async = require('async');

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
    this.__stepCallbacks = null;
}

Client.prototype.__startStep = function startStep(callback) {
    var c = this;
    if (!c.__step) {
        var step = c.__step = [];
        c.__failureCallbacks = [];
        c.__successCallbacks = [];
        c.__stepCallbacks = [];
        process.nextTick(function() {
            if (c.__step && c.__step === step) {
                c.__endStep();
            }
        });
    }
    c.__failureCallbacks.push(callback);
    return c;
};

Client.prototype.__endStep = function endStep() {
    var c = this;
    var schedule = c.__step;
    var fail = c.__failureCallbacks;
    var success = [];
    var cbs = c.__stepCallbacks;
    c.__successCallbacks = null;
    c.__step = null;
    c.__failureCallbacks = null;
    c.__stepCallbacks = null;
    c.multiMap(schedule, function(err, replies) {
        if (cbs) {
            cbs.forEach(function(fn) {
                fn(err, replies);
            });
        }
    });
};

Client.prototype.__afterStep = function afterStep(cb) {
    if (this.__stepCallbacks) {
        this.__stepCallbacks.push(cb);
    }
};

Client.prototype.multiMap = function(schedule, cb) {
    var client = this;
    if (!schedule || schedule.length === 0) {
        cb && cb();
        return this;
    }
    if (schedule.length === 1) {
        var cmd = schedule[0].args;
        if (cmd[0] !== 'EXEC') {
            this[cmd.shift().toLowerCase()].call(
                this,
                cmd,
                schedule[0].callback && function (e, r) {
                    cb(e, [r]);
                    schedule[0].callback.forEach(function(fn) {
                        if (fn && typeof fn === 'function') {
                            fn(e, r)
                        }
                    });
                }, true);
        }
        return this;
    }
    var log = this.__adapter.logger ? this.__adapter.logger('MULTI\n  ' + fixLuaLog(client, schedule.map(function (q) {
        return q.args[0].toUpperCase() + ' ' + q.args.slice(1).join(' ');
    }).join('\n  ')) + '\nEXEC') : function() {};

    var m = this.__connection.multi();
    schedule.forEach(function(q) {
        m[q.cmd].apply(m, q.args.slice(1).concat(function(err, data) {
            q.callback.forEach(function(fn) {
                if (typeof fn === 'function') {
                    if (err) {
                        q.errorCaught = true;
                    }
                    fn(err, data);
                }
            });
        }));
    });

    m.exec(function(err, replies) {
        log();

        // if the MULTI was aborted, re-run each of the commands without MULTI
        if (err && err.toString().indexOf('EXECABORT') > -1) {
            var replies = [];
            async.forEach(schedule, function (q) {
                client[q.cmd].apply(client, q.args.slice(1).concat(function(err, data) {
                    q.callback.forEach(function(fn) {
                        if (q.errorCaught) {
                            return;
                        }
                        if (typeof fn === 'function') {
                            fn(err, data);
                        }
                        replies.push(data);
                    });
                }, true));
            }, function (err) {
                cb(err, replies);
            });
        } else {
            if (cb) {
                cb(err, replies);
            }
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

        if (typeof args !== 'object') {
            var notFnYet = true;
            args = Array.prototype.filter.call(arguments, function(a) {
                if (typeof a === 'function') {
                    notFnYet = false;
                    callback = a;
                }
                return notFnYet;
            });
        }

        if (!args) args = [];

        log = this.__adapter.logger ? this.__adapter.logger(fixLuaLog(this,
            [cmd.toUpperCase()].concat(args.map(function (a) {
                if (typeof a === 'object') return JSON.stringify(a);
                return a;
            })).join(' '))) : function(){};

        if (!this.__step && !nostep) {
            this.__startStep(callback);
        }

        if (cmd.toLowerCase() === 'exec') {
            callback && callback(this.latestErr, this.latestResult);
            return this;
        }

        if (this.__step) {
            args.unshift(cmd);
            var handle = args.join(' ');

            var foundQuery;
            if (commandIsSafeForMerging(cmd)) {
                this.__step.forEach(function(q) {
                    if (q.cmd === cmd && q.handle === handle) {
                        foundQuery = q;
                    }
                });
            }
            if (foundQuery) {
                foundQuery.callback.push(callback);
            } else {

                // if we hit the max batch size, immediately execute the multi
                if (this.__step && this.__step.length >= (this.__adapter.schema.settings.maxMultiBatchSize || 10)) {
                    this.__endStep();
                    this.__startStep(callback);
                }

                this.__step.push({
                    cmd: cmd,
                    handle: handle,
                    args: args,
                    callback: [callback]
                });
            }
            this.__successCallbacks.push(callback);
        } else {
            args.push(function (err, res) {
                log();
                if (callback) {
                    callback(err, res);
                }
            });
            c[cmd].apply(c, args);
        }

        return this;
    };
};

function commandIsSafeForMerging(cmd) {
    return ['incr', 'rpop', 'lpop', 'lrem', 'linsert', 'lpush', 'rpush', 'lpushx', 'ltrim', 'rpoplpush', 'brpoplpush', 'blpop', 'brpush', 'rpushx'].indexOf(cmd.toLowerCase()) === -1;
}

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
    var client = this;
    if (!commands || commands.length === 0) {
        callback && callback();
        return this;
    }
    if (commands.length === 1) {
        var cmd = commands[0];
        if (cmd[0] !== 'EXEC') {
            this[cmd.shift().toLowerCase()].call(
                this,
                cmd,
                callback && function (e, r) { callback(e, [r]) }, true);
        }
        return this;
    }
    var log = this.__adapter.logger ? this.__adapter.logger('MULTI\n  ' + fixLuaLog(client, commands.map(function (x) {
        return x[0].toUpperCase() + ' ' + x.slice(1).join(' ');
    }).join('\n  ')) + '\nEXEC') : function() {};

    this.__connection.multi(commands).exec(function (err, replies) {
        if (err) console.log(err);
        log();
        client.latestErr = err;
        client.latestResult = replies;
        callback && callback(err, replies);
    });
    return this;
};

function fixLuaLog(client, str) {
    var lua = client.__connection.lua;
    Object.keys(lua).forEach(function(key) {
        str = str.replace(new RegExp('EVALSHA ' + lua[key], 'ig'), 'EVALSHA [Lua: ' + key.toUpperCase() + '+MGET]');
    });
    return str;
};
