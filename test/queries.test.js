var should = require('./init.js');
var db, queries = [], Item, log;

describe('queries', function() {

    before(function() {
        db = getSchema();
        Item = db.define('Item', {
            name: String,
            index1: {type: String, index: true},
            score: Number
        }, {
            defaultSort: 'score'
        });
        log = db.log;
        db.log = function (q) {
            queries.push(q);
        };
    });

    after(function() {
        db.log = log;
    });

    beforeEach(function(done) {
        Item.destroyAll(function() {
            queries = [];
            done();
        });
    });

    it('should query by single index', function(done) {
        Item.all({where: {index1: 'filter'}}, function(err, collection) {
            queries.should.have.lengthOf(1);
            queries.pop().should.equal('ZRANGE z:Item:index1:filter 0 -1');
            done();
        });
    });

    it('should add items to index using defaultSort on creation', function(done) {
        Item.create({
            score: 29,
            index1: 'bada',
            name: 'Jon'
        }, function(err, item) {
            should.not.exist(err);
            should.exist(item);
            queries.shift().should.equal('INCR id:Item');
            queries.shift().should.equal('GET Item:' + item.id);
            queries.shift().should.equal('SET Item:' + item.id + ' ' + JSON.stringify(item));
            queries.shift().should.equal([
                'MULTI',
                '  ZADD z:Item:index1:bada 29 ' + item.id,
                '  ZADD z:Item@score 29 ' + item.id,
                '  ZADD z:Item@id ' + item.id + ' ' + item.id,
                'EXEC'
            ].join('\n'));
            done();
        });
    });

});
