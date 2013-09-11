var should = require('./init.js');
var db, List, Item, queries = [], log;

describe('postpone', function() {

    before(function(done) {
        db = getSchema();
        List = db.define('List', {
            itemsCount: {type: Number, default: 0, postpone: {
                action: 'INCR', timeout: 1000, method: 'incrItemsCount'
            }},
            itemsCache: {type: [], postpone: {
                action: 'CACHE', timeout: 2000, method: 'updateCachedItems',
                relation: 'items', query: {limit: 3}
            }}
        });
        Item = db.define('Item');
        List.hasMany('items');
        Item.belongsTo('list');
        Item.afterCreate = function(done) {
            List.incrItemsCount(this.list());
            List.updateCachedItems(this.list());
            done();
        };

        log = db.log;
        db.log = function (q) {
            queries.push(q);
        };
        seedData(5, done);
    });

    after(function() {
        db.log = log;
    });

    it.skip('should allow to postpone increments', function(done) {
        queries.should.have.lengthOf(6);
        setTimeout(function() {
            done();
        }, 1020);
    });

    it.skip('should allow to postpone caching', function(done) {
        setTimeout(function() {
            // console.log(queries);
            done();
        }, 1000);
    });

    function seedData(count, done) {
        List.destroyAll(function() {
            Item.destroyAll(function() {
                var wait = count;
                queries = [];
                List.create(function(err, list) {
                    for (var i = 0; i < count; i += 1) {
                        list.items.create(ok);
                    }
                });

                function ok() {
                    if (--wait === 0) {
                        done();
                    }
                }
            });
        });
    }

});
