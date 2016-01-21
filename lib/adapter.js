module.exports = RedisHQ;

var EXPIRE_DEF = 3600;

/**
 * Module dependencies
 */
try {
var reds = require('reds');
} catch(e) {}
var redis = require('redis');
var uuid = require('node-uuid');
var Client = require('./client.js');
var postpone = require('./postpone.js');

function RedisHQ() {
    this.name = 'redis-hq';
    this._models = {};
    this.connection = null;
    this.indexes = {};
    this.client = new Client(this);
    this.__defineGetter__('backyard', function() {
        return this.schema.backyard;
    });
}

RedisHQ.prototype.setConnection = function (connection) {
    this.connection = connection;
    this.client.__connection = connection;
};

RedisHQ.prototype.modelName = function modelName(model) {
    var table = this._models[model].model.tableName;
    if (this.schema.settings.prefix) {
        return this.schema.settings.prefix + '/' + table;
    } else {
        return table;
    }
};

RedisHQ.prototype.define = function (descr) {
    var m = descr.model.modelName;
    this._models[m] = descr;
    this.indexes[m] = descr.settings.indexes || {};
    this.indexes[m].id = {indexType: 'sort-only', dataType: String};

    descr.settings.defaultSort = descr.settings.defaultSort || 'id ASC';
    var dsk = descr.settings.defaultSort.split(/\s+/)[0];

    Object.keys(descr.properties).forEach(function (prop) {
        var p = descr.properties[prop];
        var type = p.index;
        var sort = p.sort;
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
        if (p.postpone) {
            descr.model[p.postpone.method] = postpone(descr.model, prop, p.postpone);
        }
    }.bind(this));

    // override some methods

    descr.model.count = function(/*where:obj, range:arr, callback:fun*/) {
        var where = get('object', arguments);
        var range = get('array', arguments);
        var callback = get('function', arguments);
        var opts = range ? {min: range[0], max: range[1]} : null;
        this.schema.adapter.count(this.modelName, callback, where, opts);
    };

    function get(type, args) {
        for (var i = 0; i < args.length; i += 1) {
            var isArr = Object.prototype.toString.call(args[i]) === '[object Array]';
            if (type === 'array' && isArr) {
                return args[i];
            } else if (typeof args[i] === type && !isArr) {
                return args[i];
            }
        }
        return undefined;
    }
};

RedisHQ.prototype.defineForeignKey = function (model, key, foreignClassName, cb) {
    var type = this._models[foreignClassName].properties.id.type || Number;
    this.indexes[model][key] = {
        dataType: type,
        indexType: 'z-set'
    };
    if (this.backyard) {
        this.backyard.defineForeignKey(model, key, foreignClassName);
    }
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
            if (data && data[i]) {
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
    }, true);

    function save(updatedData, initialData) {
        var key = hq.modelName(model) + ':' + data.id;
        hq.client.set([key, JSON.stringify(updatedData)], function (err) {
            if (err) return callback(err);
            hq.updateIndexes(model, data.id, updatedData, function(err) {
                if (err) return callback(err);
                var expire = hq.backyardExpire(model);
                if (expire) {
                    hq.backyard.models[model].upsert(updatedData, function(err) {
                        if (err) {
                            callback(err);
                        } else {
                            callback();
                            expire(data.id);
                        }
                    });
                } else {
                    callback(err);
                }
            }, initialData);
        });
    }
};

/**
 * Get expiration function(id) for given model
 *
 * @param {String} model - name of model
 * @param {Boolean} safe - ensure that key was previously expired
 */
RedisHQ.prototype.backyardExpire = function backyardExpire(model, safe) {
    var hq = this;
    if (!hq.backyard) {
        return false;
    }
    var expireSetting = hq.get(model, 'expire');
    if (expireSetting === -1) {
        return false;
    }
    if ('undefined' === typeof expireSetting) {
        expireSetting = EXPIRE_DEF;
    }
    return function(id, force) {
        var key = hq.modelName(model) + ':' + id;
        if (safe && !force) {
            hq.client.ttl(key, function(err, ttl) {
                if (!err && ttl >= 0) {
                    hq.client.expire(key, expireSetting);
                }
            });
        } else {
            hq.client.expire(key, expireSetting);
        }
    }
};

RedisHQ.prototype.updateIndexes = function (model, id, data, callback, prevData) {
    var redis = this;
    var client = redis.client;
    var i = this.indexes[model];
    var p = this._models[model].properties;
    var settings = this._models[model].settings;
    var defaultSort = settings.defaultSort;
    var dsk = defaultSort.split(/\s+/)[0];
    var customSort = settings.customSort;

    this.step(callback);

    var delegated = this.get(model, 'delegatedIndexes') || {};

    function getVal(set, name) {
        if (i[name] && i[name].keys) {
            return i[name].keys.map(function(name) {
                return set && set[name];
            }).join('-');
        }
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
            if (typeof val === 'string') {
                try {
                    val = JSON.parse(val);
                } catch(e) {}
            }
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
            client.zrem(['z:' + redis.modelName(model) + '@' + key, id]);
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

                client.zrem([
                    'z:' + redis.modelName(model) + ':' + key + ':' + v,
                    id
                ]);
                if (delegated[key]) {
                    client.zrem([
                        'z:' + redis.modelName(delegated[key].model) + ':' + model + '-' + key + ':' + v,
                        effectiveId
                    ]);
                }
            });

        }
    });

    // add indexes
    Object.keys(data).concat(Object.keys(i).map(function(x) {
        if (i[x].keys) return x;
    }).filter(Boolean)).forEach(function (key) {
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
                client.zadd([
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
                if (settings.ignoreNullValues && v === null) {
                    return;
                }

                if (keyName !== 'id') {
                    client.zadd([
                        'z:' + redis.modelName(model) + ':' + keyName + ':' + v,
                        score,
                        id
                    ]);
                }

                if (delegated && delegated[key]) {
                    client.zadd([
                        'z:' + redis.modelName(delegated[key].model) + ':' + model + '-' + key + ':' + effectiveId,
                        score,
                        v
                    ]);
                }
            });

        }
    });

    // fulltext indexes
    var fti = [], atLeastOne = false, noFullText = true;
    Object.keys(p).forEach(function (key) {
        if (p[key] && p[key].fulltext) {
            noFullText = false;
            if (data[key]) {
                atLeastOne = true;
            }
            fti.push(data[key]);
        }
    });

    if (this.schema.fulltextSearch) {
        if (this.schema.fulltextSearch.syncMode) {
            client.__afterStep(function() {
                updFulltext(callback);
            });
            return;
        } else {
            updFulltext();
        }
    }

    client.__afterStep(callback);

    function updFulltext(done) {
        if (atLeastOne) {
            redis.schema.fulltextSearch.update(redis.modelName(model), id, fti.join(' '), callback);
        } else if (!noFullText) {
            redis.schema.fulltextSearch.remove(redis.modelName(model), id, callback);
        } else {
            callback();
        }

        function callback() {
            if ('function' === typeof done) {
                done();
            }
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

};

RedisHQ.prototype.create = function (model, data, callback, obj) {
    if (data.id) return create.call(this, data.id, true);

    var uuidType = this.get(model, 'uuid');
    if (uuidType === 'v1' || uuidType === 'v4') {
        data.id = uuid[uuidType]();
        this.logger()('{NODE-UUID} ' + data.id);
        return create.call(this, data.id, true);
    }

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

RedisHQ.prototype.find = function find(model, id, callback, noexpire) {
    var hq = this;
    var key = this.modelName(model) + ':' + id;
    this.client.get(key, function (err, data) {
        var expire = hq.backyardExpire(model, true);
        if (expire) {
            if (data) {
                if (!noexpire) {
                    expire(id);
                }
            } else {
                hq.backyard.models[model].find(id, function(err, obj) {
                    if (obj && !noexpire) {
                        hq.client.set(key, JSON.stringify(obj));
                        expire(id, true);
                    }
                    callback(err, obj && obj.toObject() || null);
                });
                return;
            }
        }
        if (data) {
            data = this.fromDb(model, data);
        }
        if (data && 'undefined' === typeof data.id) {
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
            if (err) {
                return callback(err);
            }
            if (hq.backyard) {
                (new (hq.backyard.models[model])({id: id})).destroy(callback);
            } else {
                callback();
            }
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
    var i = this.indexes[model];
    // match complex indexes
    var complexIndexes = {};
    var complexIndexName;
    Object.keys(i).forEach(function(k) {
        if (!i[k].keys) return;
        var fit = !!i[k].keys.length;
        i[k].keys.forEach(function(field) {
            if ('undefined' === typeof where[field] || where[field] === null) {
                fit = false;
            }
        });
        if (fit) {
            complexIndexName = k;
        }
    });

    if (complexIndexName && i[complexIndexName].keys.length === Object.keys(where).length) {
        where[complexIndexName] = i[complexIndexName].keys.map(function(field) {
            var val = where[field];
            delete where[field];
            return val;
        }).join('-');
    }

    Object.keys(where).forEach(function (key) {
        var val = where[key];
        if (val && 'object' === typeof val) {

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

        if (i[key]) {
            var index = i[key];
            if (val instanceof Date) {
                val = val.getTime();
            }
            var kv = key + '.' + val;
            if (customSort && kv in customSort ||
                index.indexType === 'sort' || index.indexType === 'sort-only') {
                res.foundIndex.unshift('z:' + modelKey + ':' + key + ':' + val);
            } else {
                if (val && 'object' === typeof val && val.length > 1) {
                    val.forEach(function (val) {
                        res.foundIndex.push('z:' + modelKey + ':' + key + ':' + val);
                    });
                } else {
                    res.foundIndex.push('z:' + modelKey + ':' + key + ':' + val);
                }
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
        if (ixs.indexOf(dest) === -1) {
            ixs.push(dest);
        }
    }

    if (ixs.length) {
        if (ixs.length === 1) {
            if (ixs[0] === dest) {
                this.client.expire([dest, 7]); // TODO: replace with DEL dest
            }
            return ixs[0];
        }
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

RedisHQ.prototype.getRangeCmd = function(model, orderBy, del) {
    if (orderBy) {
        var o = orderBy.split(/\s+/);
        var propIndex = this.indexes[model][o[0]];
        if (propIndex && propIndex.indexType.substr(0, 4) === 'sort') {
            if (o[1] && o[1].toLowerCase() === 'desc') {
                return 'zrevrange' + (del ? 'del' : '');
            } else {
                return 'zrange' + (del ? 'del' : '');
            }
        }
    }
    var ds = this.get(model, 'defaultSort').split(/\s+/);

    return (ds[1] && ds[1].match(/desc/i) ? 'zrevrange' : 'zrange') + (del ? 'del' : '');
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
    // when query by ids
    if (filter.where && filter.where.id &&
        filter.where.id.inq && Object.keys(filter.where).length === 1) {
        if (filter.offset) {
            filter.where.id.inq = filter.where.id.inq.slice(filter.offset);
        }
        if (filter.limit) {
            filter.where.id.inq = filter.where.id.inq.slice(0, filter.limit);
        }
        return handleKeys(null, filter.where.id.inq);
    }

    var delegated = redis.get(model, 'delegatedIndexes');
    var firstKey = Object.keys(filter.where)[0];
    var orderSuffix = this.calcOrderSuffix(model, filter.order);
    var orderedSetName = null, defOrderedSetName = null;
    var throughModel = delegated && filter.collect &&
        filter.collect === filter.include && filter.where && delegated[firstKey];
    if (throughModel) {
        var pi = this.possibleIndexes(model, filter.where, orderSuffix);
        orderedSetName = pi.resetIndex;
    }

    defOrderedSetName = this.query(model, {}, orderSuffix);
    // query ids into named ordered set
    orderedSetName = orderedSetName || this.query(model, filter.where, orderSuffix);;
    // when limit specified - retrieve count of records before limit applied
    var countBeforeLimit, from = 0, to = -1;
    if (!filter.noCount && filter.limit && (filter.limit > 1 || filter.offset)) {

        if (filter.min && filter.max) {
            this.client.zcount([orderedSetName, filter.min, filter.max], function (err, count) {
                countBeforeLimit = count;
            });
        } else {
            this.client.zcard(orderedSetName, function (err, count) {
                countBeforeLimit = count;
            });
        }
    }
    if (filter.offset) {
        from = parseInt(filter.offset, 10);
    }
    if (filter.limit) {
        to = from + parseInt(filter.limit, 10) - 1;
    }

    var rangeCmd;
    if ('reverse' in filter) {
        rangeCmd = filter.reverse ? 'zrevrange' : 'zrange';
    } else {
        rangeCmd = this.getRangeCmd(model, filter.order, filter.del);
    }

    var rangeCmdHash;
    // use the lua command to retrieve the results at the same time as z(rev)range
    if (!filter.onlyKeys && !throughModel) {
        rangeCmdHash = this.schema.client.lua[rangeCmd];
        if (!rangeCmdHash) {
            throw new Error(rangeCmd + ' lua script is not loaded');
        }

        var command = [rangeCmdHash, 0, orderedSetName, from, to, redis.modelName(model)];
        // if we have filter.min and filter.max, use Z(REV)RANGEBYSCORE instead, which has slightly different params
        if (filter.min && filter.max) {
            var count = to && (to +1 - from) || -1;
            command = [rangeCmdHash, 0, orderedSetName, from, count, redis.modelName(model), filter.min, filter.max];
        }

        if (filter.del && defOrderedSetName !== orderedSetName) {
            command.push(defOrderedSetName);
        }

        this.client.evalsha(command, handleReplies());
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

        redis.client.mget(query, handleReplies(keys));
    }

    function handleReplies(keys) {
        return function onReply(err, replies) {
            if (err) {
                return callback(err, null);
            }
            if (!keys) {
                if (replies && replies.length) {
                    keys = replies[0];
                    replies = replies[1];
                } else {
                    keys = [];
                    replies = [];
                }
            }
            var keysWithNoData = replies.map(function(r, i) {
                return r ? null : keys[i];
            }).filter(Boolean);
            var safeExpire = redis.backyardExpire(model, true);
            var unsafeExpire = redis.backyardExpire(model);
            if (!redis.backyard || keysWithNoData.length === 0) {

                if (safeExpire) {
                    replies.forEach(function(r) {
                        if (r) {
                            r = JSON.parse(r);
                            safeExpire(r.id);
                        }
                    });
                }

                respondWith(replies);
            } else {
                redis.backyard.models[model].all({where: {id: {inq: keysWithNoData}}}, function(err, records) {
                    if (safeExpire) {
                        replies.forEach(function(r) {
                            if (r) {
                                r = JSON.parse(r);
                                safeExpire(r.id);
                            }
                        });
                    }
                    respondWith(fillHoles(replies, records.map(function(r) {
                        var key = redis.modelName(model) + ':' + r.id;
                        var val = JSON.stringify(r.toObject());
                        redis.client.set(key, val);
                        if (unsafeExpire) {
                            unsafeExpire(r.id);
                        }
                        return val;
                    })));
                });
            }
        };

        function fillHoles(withHoles, fillFromMe) {
            withHoles.forEach(function(r, i) {
                if (!r) {
                    withHoles[i] = fillFromMe.shift();
                }
            });
            return withHoles;
        }

        function respondWith(replies) {
            if (!Array.isArray(replies)) {
                return callback(new Error('Reply is not an array.'), replies);
            }

            replies = replies.filter(Boolean).map(function (r) {
                return redis.fromDb(model, r);
            });
            replies.countBeforeLimit = countBeforeLimit || replies.length;


            if (filter && filter.include) {
                redis._models[model].model.include(replies, filter.include, callback);
            } else {
                callback(null, replies);
            }
        }
    }

};

RedisHQ.prototype.step = function(cb) {
    return this.client.__startStep(cb);
};

RedisHQ.prototype.destroyAll = function destroyAll(model, callback) {
    var redis = this;
    redis.client.keys(this.modelName(model) + ':*');
    redis.client.keys('z:' + this.modelName(model) + '@*');
    redis.client.keys('*:' + this.modelName(model) + ':*');
    redis.client.__afterStep(function (err, replies) {
        if (err) {
            return callback(err, []);
        }
        if (replies === 'QUEUED') {
            return callback(new Error('Redis returned QUEUED'));
        }
        var query = [];
        redis.client.del('z:' + redis.modelName(model));
        replies.forEach(function(keys) {
            if (keys && keys.forEach) {
                keys.forEach(function (key) {
                    redis.client.del(key);
                });
            }
        });
        redis.client.__afterStep(callback);
        redis.client.__endStep();
    });
    redis.client.__endStep();
    if (redis.backyard) {
        redis.backyard.models[model].destroyAll();
    }
};

RedisHQ.prototype.count = function count(model, callback, where, options) {
    var t1 = Date.now();
    var keys = where && Object.keys(where) || [];
    var settings = this._models[model].settings;
    var defaultSort = settings.defaultSort;
    var dsk = defaultSort.split(/\s+/)[0] || 'id';
    if (keys.length === 1 && typeof where[keys[0]] !== 'object' || options) {
        if (options && 'min' in options && 'max' in options) {
            var zsetName;
            if (keys.length) {
                if (where[keys[0]] !== null) {
                    zsetName = 'z:' + this.modelName(model) + ':' + keys[0] + ':' + where[keys[0]];
                } else {
                    zsetName = 'z:' + this.modelName(model) + '@' + keys[0];
                }
            } else {
                zsetName = 'z:' + this.modelName(model) + '@' + dsk;
            }
            this.client.zcount([zsetName, options.min, options.max], function (err, count) {
                callback(err, err ? null : count);
            });
        } else {
            this.client.zcard('z:' + this.modelName(model) + ':' + keys[0] + ':' + where[keys[0]], function (err, count) {
                callback(err, err ? null : count);
            });
        }
    } else if (keys.length > 1 || keys.length === 1 && typeof where[keys[0]] === 'object') {
        this.all(model, {where: where, onlyKeys: true}, function (err, data) {
            callback(err, err ? null : data.length);
        });
    } else {
        this.client.zcard('z:' + this.modelName(model) + '@' + dsk, function (err, count) {
            callback(err, err ? null : count);
        });
    }
};

RedisHQ.prototype.updateAttributes = function updateAttrs(model, id, data, cb) {
    data.id = id;
    this.save(model, data, cb);
};

RedisHQ.prototype.disconnect = function disconnect() {
    this.client.quit();
};
