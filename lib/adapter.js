module.exports = RedisHQ;

/**
 * Module dependencies
 */
var reds = require('reds');
var redis = require('redis');
var Client = require('./client.js');

function RedisHQ() {
    this.name = 'redis-hq';
    this._models = {};
    this.connection = null;
    this.indexes = {};
    this.client = new Client(this);
}

RedisHQ.prototype.setConnection = function (connection) {
    this.connection = connection;
    this.client.__connection = connection;
};

RedisHQ.prototype.modelName = function modelName(model) {
    if (this.schema.settings.prefix) {
        return this.schema.settings.prefix + '/' + model;
    } else {
        return model;
    }
};

RedisHQ.prototype.define = function (descr) {
    var m = descr.model.modelName;
    this._models[m] = descr;
    this.indexes[m] = {id: {indexType: 'sort-only', dataType: Number}};

    descr.settings.defaultSort = descr.settings.defaultSort || 'id ASC';
    var dsk = descr.settings.defaultSort.split(/\s+/)[0];

    Object.keys(descr.properties).forEach(function (prop) {
        var type = descr.properties[prop].index;
        var sort = descr.properties[prop].sort;;
        if (type) {
            this.indexes[m][prop] = {
                dataType: descr.properties[prop].type,
                indexType: typeof type === 'string' ? type : 'z-set'
            };
        }
        if (sort || prop === dsk) {
            if (this.indexes[m][prop]) {
                this.indexes[m][prop].indexType = 'sort';
            } else {
                this.indexes[m][prop] = {
                    dataType: descr.properties[prop].type,
                    indexType: 'sort-only'
                };
            }
        }
    }.bind(this));
};

RedisHQ.prototype.defineForeignKey = function (model, key, foreignClassName, cb) {
    var type = this._models[foreignClassName].properties.id.type || Number;
    this.indexes[model][key] = {
        dataType: type,
        indexType: 'z-set'
    };
    cb(null, type);
};

RedisHQ.prototype.defineProperty = function (model, property, definition) {
    this._models[model].properties[property] = definition;
    if (definition.index) {
        this.indexes[model][property] = [definition.type || Number];
        this.indexes[model][property] = {
            dataType: definition.type,
            indexType: typeof definition.index === 'string' ? definition.index : 'z-set'
        };
    }
};

RedisHQ.prototype.defineFulltextIndex = function (model, property) {
    this._models[model].properties[property].fulltext = true;
};

RedisHQ.prototype.fromDb = function (model, r) {
    // console.log(r.length + " bytes");
    try {
        var data = JSON.parse(r);
    } catch (e) { console.log(e, r); return null; }
    var p = this._models[model].properties;
    for (var i in p) {
        if (p[i].type.name === 'Date') {
            if (data[i]) {
                data[i] = new Date(data[i]);
            }
        }
    }
    return data;
};

RedisHQ.prototype.save = function (model, data, callback, obj) {
    var hq = this;

    if (obj) {
        save(data, obj);
        return;
    }

    hq.find(model, data.id, function (err, initialData) {
        var updatedData = {};
        if (initialData) {
            Object.keys(initialData).forEach(function (key) {
                updatedData[key] = initialData[key];
            });
        }
        Object.keys(data).forEach(function (key) {
            updatedData[key] = data[key];
        });

        save(updatedData, initialData);
    });

    function save(updatedData, initialData) {
        hq.client.set([hq.modelName(model) + ':' + data.id, JSON.stringify(updatedData)], function (err) {
            if (err) return callback(err);
            hq.updateIndexes(model, data.id, updatedData, callback, initialData);
        });
    }
};

RedisHQ.prototype.updateIndexes = function (model, id, data, callback, prevData) {
    var redis = this;
    var i = this.indexes[model];
    var p = this._models[model].properties;
    var settings = this._models[model].settings;
    var defaultSort = settings.defaultSort;
    var dsk = defaultSort.split(/\s+/)[0];
    var customSort = settings.customSort;

    var delegated = this.get(model, 'delegatedIndexes') || {};

    var schedule = [];

    function getVal(set, name) {
        var val = set && set[name];
        if (p[name].type.name === 'Date') {
            if (val && val.getTime) {
                val = val.getTime();
            } else {
                val = 0;
            }
        }
        if (p[name].type.name == 'JSON') {
            try {
                val = JSON.parse(val);
            } catch(e) {}
        }
        if (p[name].type instanceof Array) {
            try {
                val = JSON.parse(val);
            } catch(e) {}
            if (val) {
                val = val.map(function (x) {
                    return x.id;
                });
            }
        }

        return val;
    }

    // remove indexes
    Object.keys(i).forEach(function (key) {
        var effectiveId = id;
        if (delegated && delegated[key] && prevData) {
            effectiveId = prevData[delegated[key].key];
        }
        var prevVal = getVal(prevData, key);
        var curVal = getVal(data, key);
        var iType = i[key].indexType;
        if ('sort-only' === iType) {
            return;
        }
        if (typeof data[key] === 'undefined' || prevData && prevVal !== curVal) {
            if (!enumerable(prevVal)) {
                prevVal = [prevVal];
            }

            prevVal.forEach(function (v) {
                v = v && v.id || v;

                //check to see if we should be ignoring null values
                if (settings.ignoreNullValues && !v) {
                    return;
                }

                schedule.push([
                    'ZREM',
                    'z:' + redis.modelName(model) + ':' + key + ':' + v,
                    id
                ]);
                if (delegated[key]) {
                    schedule.push([
                        'ZREM',
                        'z:' + redis.modelName(delegated[key].model) + ':' + model + '-' + key + ':' + v,
                        effectiveId
                    ]);
                }
            });

        }
    });

    // add indexes
    Object.keys(data).forEach(function (key) {
        if (i[key]) {
            var effectiveId = id;
            var keyName = key;
            if (delegated && delegated[key]) {
                key = delegated[key].key;
                effectiveId = data[key];
            }
            var val = getVal(data, keyName);
            var iType = i[key].indexType;
            if ('undefined' === typeof val) return;
            if (!enumerable(val, key)) {
                val = [val];
            }

            if ('sort-only' === iType || 'sort' === iType) {
                var score = makeNumber(val[0]);
                schedule.push([
                    'ZADD',
                    'z:' + redis.modelName(model) + '@' + key,
                    score,
                    effectiveId
                ]);
                if (iType === 'sort-only') return;
            }

            val.forEach(function (v) {
                v = v && v.id || v;
                var score = makeNumber(data[dsk]);
                var kv = key + '.' + v;
                if (customSort && kv in customSort) {
                    score = makeNumber(data[customSort[kv].split(' ')[0]]);
                }
                if (delegated && delegated[key] && delegated[key].score && prevData && prevData.__cachedRelations) {
                    score = makeNumber(delegated[key].score(prevData, prevData.__cachedRelations || {}));
                }

                //check to see if we should be ignoring null values
                if (settings.ignoreNullValues && !v) {
                    return;
                }

                schedule.push([
                    'ZADD',
                    'z:' + redis.modelName(model) + ':' + keyName + ':' + v,
                    score,
                    id
                ]);

                if (delegated && delegated[key]) {
                    schedule.push([
                        'ZADD',
                        'z:' + redis.modelName(delegated[key].model) + ':' + model + '-' + key + ':' + effectiveId,
                        score,
                        v
                    ]);
                }
            });

        }
    });

    // fulltext indexes
    var fti = [], atLeastOne = false;
    Object.keys(data).forEach(function (key) {
        if (p[key] && p[key].fulltext) {
            if (data[key]) {
                atLeastOne = true;
            }
            fti.push(data[key]);
        }
    });
    if (this.schema.fulltextSearch) {
        if (atLeastOne) {
            this.schema.fulltextSearch.update(this.modelName(model), id, fti.join(' '));
        } else {
            this.schema.fulltextSearch.remove(this.modelName(model), id);
        }
    }

    function enumerable(v) {
        if (!v) return false;
        return typeof v.forEach === 'function';
    }

    function makeNumber(v) {
        if ('number' === typeof v) {
            return v;
        }
        if (v instanceof Date) {
            return v.getTime();
        }
        if ('boolean' === typeof v) {
            return v ? 1 : 0;
        }
        if ('string' === typeof v) {
            var score = parseInt([
                v.charCodeAt(0).toString(2),
                v.charCodeAt(1).toString(2),
                v.charCodeAt(2).toString(2),
                v.charCodeAt(3).toString(2)
            ].join('').replace(/NaN/g, ''), 2);
            return score;
        }
        return 0;
    }

    if (schedule.length) {
        this.client.multi(schedule, function (err) {
            callback(err, data);
        });
    } else {
        callback(null);
    }
};

RedisHQ.prototype.create = function (model, data, callback, obj) {
    if (data.id) return create.call(this, data.id, true);

    this.client.incr('id:' + this.modelName(model), function (err, id) {
        create.call(this, id);
    }.bind(this));

    function create(id, upsert) {
        data.id = id;
        this.save(model, data, function (err) {
            if (callback) {
                callback(err, id);
            }
        }, obj);
    }
};

RedisHQ.prototype.updateOrCreate = function (model, data, callback) {
    var r = this;
    if (!data.id) return this.create(model, data, callback);
    this.save(model, data, function (error, obj) {
        var key = 'id:' + r.modelName(model);
        r.client.get(key, function (err, id) {
            if (!id || data.id > parseInt(id, 10)) {
                r.client.set(key, data.id, callback.bind(null, error, obj));
            } else {
                callback(error, obj);
            }
        });
    });
};

RedisHQ.prototype.exists = function (model, id, callback) {
    this.client.exists(this.modelName(model) + ':' + id, callback);
};

RedisHQ.prototype.find = function find(model, id, callback) {
    this.client.get(this.modelName(model) + ':' + id, function (err, data) {
        if (data) {
            data = this.fromDb(model, data);
        }
        if (data) {
            data.id = id;
        }

        callback(err, data);
    }.bind(this));
};

RedisHQ.prototype.destroy = function destroy(model, id, callback) {
    var indexes = this.indexes[model];
    var dataWas = [];
    var foundIndex = false;
    var regularIndex = [];
    var hq = this;

    if (indexes) {
        this.find(model, id, function (err, data) {
            hq.updateIndexes(model, id, {}, done, data);
        });
    } else {
        done();
    }

    function done () {
        hq.client.zrem(['z:' + hq.modelName(model) + hq.calcOrderSuffix(model), id]);
        hq.client.del(hq.modelName(model) + ':' + id, function (err) {
            callback(err);
        });
    }
};

RedisHQ.prototype.get = function(model, key) {
    return this._models[model].settings[key];
};

RedisHQ.prototype.possibleIndexes = function (model, where, orderSuffix) {
    var res = {
        resetIndex: null,
        foundIndex: [],
        luaIndex: [],
        noIndex: [],
        unions: []
    };

    if (!where) return res;

    var gotSort = false;
    var modelKey = this.modelName(model);
    var customSort = this.get(model, 'customSort');
    var defSort = this.get(model, 'defaultSort').split(/\s+/)[0];
    var delegated = this.get(model, 'delegatedIndexes');
    Object.keys(where).forEach(function (key) {
        var val = where[key];
        if ('object' === typeof val) {

            if (val.inq) {
                val.inq.forEach(function(id) {
                    res.unions.push('z:' + modelKey + ':' + key + ':' + id);
                });
                return;
            }

            // push the whole key into the foundIndex so it can be processed by
            // the lua function
            if (val.lua && 'undefined' !== typeof val.value) {
                res.luaIndex.push(val);
                return;
            }

        }

        if (key === 'id') {
            return;
        }

        if (delegated && delegated[key]) {
            res.resetIndex = 'z:' + this.modelName(delegated[key].model) + ':' + model + '-' + key + ':' + val;
        }

        if (this.indexes[model][key]) {
            var index = this.indexes[model][key];
            if (val instanceof Date) {
                val = val.getTime();
            }
            var kv = key + '.' + val;
            if (customSort && kv in customSort ||
                index.indexType === 'sort' || index.indexType === 'sort-only') {
                res.foundIndex.unshift('z:' + modelKey + ':' + key + ':' + val);
            } else {
                res.foundIndex.push('z:' + modelKey + ':' + key + ':' + val);
            }
            return;
        }

        res.noIndex.push(key);
    }.bind(this));

    if (orderSuffix !== '@' + defSort) {
        res.foundIndex.unshift('z:' + modelKey + orderSuffix);
    }

    return res;
};

RedisHQ.prototype.fulltext = function fulltext(model, filter, callback) {
    var redis = this;
    filter = filter || {};

    this.schema.fulltextSearch.queryNS(this.modelName(model), filter.fulltext, function (err, ids) {
        if (err) {
            callback(err);
        } else if (!ids || ids.length === 0) {
            callback(err, []);
        } else {
            if (!filter.where) {
                filter.where = {};
            }
            delete filter.fulltext;
            filter.where.id = {inq: ids};
            redis.all(model, filter, callback);
        }
    });
};

RedisHQ.prototype.query = function query(model, conditions, orderSuffix) {
    var modelKey = this.modelName(model);
    var dest = 'temp' + modelKey + Math.round((Math.random() * Date.now()));
    var pi = this.possibleIndexes(model, conditions, orderSuffix);

    var ixs = pi.foundIndex;

    if (pi.noIndex.length) {
        throw new Error('No indexes for ' + pi.noIndex.join(', '));
    }

    if (conditions.id && typeof conditions.id !== 'object') {
        conditions.id = {inq: [conditions.id]};
    }

    if (!(ixs.length || pi.unions.length || conditions.id && conditions.id.inq)) {
        return 'z:' + modelKey + orderSuffix;
    }


    if (conditions.id && conditions.id.inq) {
        var keys = [];
        conditions.id.inq.forEach(function(id) {
            keys.push(id);
            keys.push(id);
        });
        this.client.zadd([dest].concat(keys));
        ixs.push(dest);
    }

    if (pi.unions.length) {
        this.client.zunionstore([
            dest, pi.unions.length + 1, dest
        ].concat(pi.unions));
        ixs.push(dest);
    }

    if (ixs.length) {
        if (ixs.length === 1) return ixs[0];
        var weights = ['WEIGHTS', 1];
        for (var keyIndex = 1; keyIndex < ixs.length; keyIndex += 1) {
            weights.push(0);
        }
        this.client.zinterstore([
            dest, ixs.length
        ].concat(ixs, weights));
        this.client.expire([dest, 7]); // TODO: replace with DEL dest
    }

    // TODO: test lua logic
    // process any lua indexes
    if (pi.luaIndex.length) {
        //check to see if the script exists
        pi.luaIndex.forEach(function(index) {
            var scriptSha = schema.comparers[index.lua];
            var key = 'luaTemp' + Math.round((Math.random() * Date.now()));

            if(!scriptSha) {
                //generate the full script
                var script = schema.comparerTemplate.toString().replace('--SCRIPT--', index.lua).replace('--TYPE--', modelKey);
                this.client.eval([script, 4, key, dest, index.value, index.limit || 0]);

                // meanwhile, cache the script sha so we can use it later
                // redis.script(['load', script], function(result) { schema.comparers[script] = result; });
            }
            else {
                this.client.evalsha([scriptSha, 4, key, dest, index.value, index.limit || 0]);
            }

            // we now have a new destination key - remember it
            dest = key;
        }.bind(this));
    }

    return dest;
};

RedisHQ.prototype.calcOrderSuffix = function(model, orderBy) {
    var defaultSortKey = this.get(model, 'defaultSort').split(/\s+/)[0];

    if (orderBy) {
        var o = orderBy.split(/\s+/);
        var propIndex = this.indexes[model][o[0]];
        if (propIndex && propIndex.indexType.substr(0, 4) === 'sort') {
            return '@' + o[0];
        } else {
            return '@' + defaultSortKey;
        }
    } else {
        return '@' + defaultSortKey;
    }
};

RedisHQ.prototype.getRangeCmd = function(model, orderBy) {
    if (orderBy) {
        var o = orderBy.split(/\s+/);
        var propIndex = this.indexes[model][o[0]];
        if (propIndex && propIndex.indexType.substr(0, 4) === 'sort') {
            if (o[1] && o[1].toLowerCase() === 'desc') {
                return 'zrevrange';
            } else {
                return 'zrange';
            }
        }
    }
    var ds = this.get(model, 'defaultSort').split(/\s+/);
    return ds[1] && ds[1].match(/desc/i) ? 'zrevrange' : 'zrange';
};

RedisHQ.prototype.all = function all(model, filter, callback) {
    filter = filter || {};
    filter.where = filter.where || {};
    var redis = this;

    // fulltext
    if (filter.fulltext) {
        return redis.fulltext(model, filter, callback);
    }

    // when query by id only
    if (filter.where && filter.where.id &&
        typeof filter.where.id !== 'object' &&
        Object.keys(filter.where).length === 1) {
        return handleKeys(null, [filter.where.id]);
    }

    var delegated = redis.get(model, 'delegatedIndexes');
    var firstKey = Object.keys(filter.where)[0];
    var orderSuffix = this.calcOrderSuffix(model, filter.order);
    var orderedSetName = null;
    var throughModel = delegated && filter.collect &&
        filter.collect === filter.include && filter.where && delegated[firstKey];
    if (throughModel) {
        var pi = this.possibleIndexes(model, filter.where, orderSuffix);
        orderedSetName = pi.resetIndex;
    }

    // query ids into named ordered set
    orderedSetName = orderedSetName || this.query(model, filter.where, orderSuffix);
    // when limit specified - retrieve count of records before limit applied
    var countBeforeLimit, from = 0, to = -1;
    if (filter.limit && (filter.limit > 1 || filter.offset)){
        this.client.zcard(orderedSetName, function (err, count) {
            countBeforeLimit = count;
        });
    }
    if (filter.offset) {
        from = filter.offset;
    }
    if (filter.limit) {
        to = from + filter.limit - 1;
    }

    var rangeCmd;
    if ('reverse' in filter) {
        rangeCmd = filter.reverse ? 'zrevrange' : 'zrange';
    } else {
        rangeCmd = this.getRangeCmd(model, filter.order);
    }

    // use the lua command to retrieve the results at the same time as z(rev)range
    if (!filter.onlyKeys && !throughModel) {
        rangeCmd = this.schema.client.lua[rangeCmd];
        this.client.evalsha([rangeCmd, 0, orderedSetName, from, to, redis.modelName(model)], handleReplies);
    } else {
        this.client[rangeCmd]([orderedSetName, from, to], handleKeys);
    }

    function handleKeys(err, keys) {
        if (err || !keys || !keys.length) return callback(err, []);

        if (filter.onlyKeys) {
            return callback(err, keys);
        }

        if (throughModel) {
            redis._models[model].model.include(keys.map(function(k) {
                var obj = {};
                obj[delegated[firstKey].key] = k;
                return obj;
            }), filter.include, callback);
            return;
        }

        var query = keys.map(function (key) {
            if (key.toString().indexOf(':') === -1) {
                key = redis.modelName(model) + ':' + key;
            }
            return key;
        });

        redis.client.mget(query, handleReplies);
    }

    function handleReplies(err, replies) {
        if (err || !replies) return callback(err, []);

        replies = replies.map(function (r) {
            return redis.fromDb(model, r);
        });
        replies.countBeforeLimit = countBeforeLimit || replies.length;

        if (filter && filter.include) {
            redis._models[model].model.include(replies, filter.include, callback);
        } else {
            callback(err, replies);
        }
    }

};

RedisHQ.prototype.step = function(cb) {
    return this.client.__startStep(cb);
};

RedisHQ.prototype.destroyAll = function destroyAll(model, callback) {
    var redis = this;
    var keysQuery = [
        ['keys', this.modelName(model) + ':*'],
        ['keys', 'z:' + this.modelName(model) + '@*'],
        ['keys', '*:' + this.modelName(model) + ':*']
    ], redis = this;
    redis.client.multi(keysQuery, function (err, replies) {
        if (err) {
            return callback(err, []);
        }
        var query = [];
        replies.forEach(function(keys) {
            keys.forEach(function (key) {
                query.push(['del', key]);
            });
        });
        redis.client.multi(query, function (err, replies) {
            redis.client.del('z:' + redis.modelName(model), function () {
                callback(err);
            });
        });
    });
};

RedisHQ.prototype.count = function count(model, callback, where) {
    var t1 = Date.now();
    if (where && Object.keys(where).length) {
        this.all(model, {where: where, onlyKeys: true}, function (err, data) {
            callback(err, err ? null : data.length);
        });
    } else {
        this.client.zcard('z:' + this.modelName(model) + '@id', function (err, count) {
            callback(err, err ? null : count);
        });
    }
};

RedisHQ.prototype.updateAttributes = function updateAttrs(model, id, data, cb) {
    data.id = id;
    this.save(model, data, cb);
};

RedisHQ.prototype.disconnect = function disconnect() {
    this.log('QUIT', Date.now());
    this.client.quit();
};
