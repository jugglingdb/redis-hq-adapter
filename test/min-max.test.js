var should = require('./init.js');
var db, Hama, log;

describe('min-max', function() {

    before(function(done) {
        db = getSchema();
        Hama = db.define('Hama', {
            name: String,
            score: {type: Number, index: true}
        }, {defaultSort: 'score'});

        Hama.destroyAll(function() {
            Hama.create([
                {name: 'huda', score: 18},
                {name: 'mira', score: 71},
                {name: 'bics', score: 30},
                {name: 'sica', score: 43},
                {name: 'sica', score: 43},
                {name: 'sica1', score: 43},
                {name: 'sica2', score: 43},
                {name: 'sica3', score: 43},
                {name: 'sica4', score: 43},
                {name: 'sica5', score: 43},
                {name: 'sica6', score: 43},
                {name: 'sica7', score: 43}
            ], function(err, hamas) {
                done();
            });
        });
    });

    it('should query with range', function(done) {
        Hama.all({min: 7, max: 20, limit: 5}, function(err, hamas) {
            should.not.exist(err);
            should.exist(hamas);
            hamas.should.have.lengthOf(1);
            hamas[0].name.should.equal('huda');
            done();
        });
    });

    it('should fetch a whole page of results', function(done) {
        Hama.all({min: 1, max: 200, limit: 10}, function(err, hamas) {
            should.not.exist(err);
            should.exist(hamas);
            hamas.should.have.lengthOf(10);
            hamas[0].name.should.equal('huda');
            done();
        });
    });

    it('should query with range with reverse order', function(done) {
        Hama.all({min: 20, max: 40, order: 'score DESC'}, function(err, hamas) {
            should.not.exist(err);
            should.exist(hamas);
            hamas.should.have.lengthOf(1);
            hamas[0].name.should.equal('bics');
            done();
        });
    });

});
