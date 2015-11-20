var should = require('./init.js');
var db, Ruba, log, queries = [];

describe('complex-query', function() {

    before(function(done) {
        db = getSchema();
        Ruba = db.define('Ruba', {
            huba: {type: String, index: true}
        });
        done();

    });

    beforeEach(function() {
        queries = [];
    });

    it('should use complex index on queries', function(done) {
        Ruba.all({where: {huba: {inq: ['foo', 'sco']}}}, function(err, hubas) {
            should.not.exist(err);
            done();
        });
    });

});
