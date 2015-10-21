var should = require('./init.js');
var db, Hama, log, queries = [];

describe('complex-index', function() {

    before(function(done) {
        db = getSchema();
        Huba = db.define('Huba', {
            name: String,
            score: {type: Number, index: true},
            huba: {type: String, index: true}
        }, {
            indexes: {
                ixNameScore: {keys: ['name', 'score']}
            }
        });
        log = db.log;
        db.log = function (q) {
            queries.push(q);
        };
        done();

    });

    beforeEach(function() {
        queries = [];
    });

    it('should create obj with complex index', function(done) {
        Huba.create({name: 'foo', score: 18, huba: 'buta'}, function(err, h) {
            should.not.exist(err);
            should.exist(h);
            queries[2].indexOf('ZADD z:Huba:ixNameScore:foo-18').should.greaterThan(-1);
            done();
        });
    });

    it('should use complex index on queries', function(done) {
        Huba.all({where: {name: 'foo', score: 18}}, function(err, hubas) {
            should.not.exist(err);
            queries[0].should.equal('EVALSHA [Lua: ZRANGE+MGET] 0 z:Huba:ixNameScore:foo-18 0 -1 Huba');
            done();
        });
    });

});
