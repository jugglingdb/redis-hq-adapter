var should = require('./init.js');

var db, Step;

describe('index-only model', function() {

    before(function(done) {
        db = getSchema();
        Step = db.define('Step', {
            touchedAt: {
                type: Date,
                sort: true
            },
            name: String
        }, {
            defaultSort: 'touchedAt ASC'
        });
        Step.destroyAll(done);
    });

    it('should support default sort order', function(done) {
        Step.create([
            {touchedAt: Date(1), name: 'one'},
            {touchedAt: Date(2), name: 'two'}
        ], function(err, steps) {
            Step.all(function(err, steps) {
                steps.should.have.lengthOf(2);
                steps[0].name.should.eql('one');
                steps[1].name.should.eql('two');
                Step.all({order: 'touchedAt DESC'}, function(err, steps) {
                    steps.should.have.lengthOf(2);
                    steps[1].name.should.eql('one');
                    steps[0].name.should.eql('two');
                    done();
                });
            });
        });
    });

    it('should update sort index when remove item', function(done) {
        Step.findOne(function(err, step) {
            should.exist(step);
            step.name.should.eql('one');
            step.destroy(function() {
                Step.findOne(function(err, step) {
                    should.exist(step);
                    step.name.should.eql('two');
                    Step.findOne({order: 'id ASC'}, function(err, step) {
                        should.exist(step);
                        step.name.should.eql('two');
                        done();
                    });
                });
            });
        });
    });
});
