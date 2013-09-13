var should = require('./init.js');
var db, queries = [], Fruit, log;

describe('count', function() {

    var ids;

    before(function(done) {
        db = getSchema();
        Fruit = db.define('Fruit', {
            name: String,
            score: {type: Number, index: true}
        }, {defaultSort: 'score'});

        Fruit.destroyAll(function() {
            Fruit.create([
                {name: 'apple', score: 18},
                {name: 'peach', score: 71},
                {name: 'pear', score: 30},
                {name: 'dragonfruit', score: 43}
            ], function(err, fruits) {
                ids = fruits.map(function(f) {
                    return f.id;
                });
                done();
            });
        });
    });

    it('should query count with min and max in sorted set', function(done) {
        Fruit.count([20, 70], function(err, c) {
            should.not.exist(err);
            c.should.equal(2);
        });
        Fruit.count([20, '+inf'], function(err, c) {
            should.not.exist(err);
            c.should.equal(3);
        });
        Fruit.count(['-inf', '+inf'], function(err, c) {
            should.not.exist(err);
            c.should.equal(4);
        });

        db.adapter.client.__afterStep(done);
        db.adapter.client.__endStep();
    });

    it('should work with inq queries', function(done) {
        Fruit.count({score: {inq: [1,18,10]}}, function(err, count) {
            should.not.exist(err);
            count.should.equal(1);
            done();
        });
    });

});
