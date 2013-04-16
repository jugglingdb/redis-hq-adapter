var should = require('./init.js');
var db, queries = [], Item;

describe.only('query-collection', function() {

    before(function() {
        db = getSchema();
        Item = db.define('Item', {
            name: String,
            index1: {type: String, index: true}
        });
        db.log = function (q) {
            queries.push(q);
        };
    });

    beforeEach(function(done) {
        Item.destroyAll(function() {
            queries = [];
            done();
        });
    });

    it('should query by single index', function(done) {
        Item.all({index1: 'filter'}, function(err, collection) {
            queries.should.have.lengthOf(1);
            queries.pop().should.equal('ZRANGE z:Item@id 0 -1');
            done();
        });
    });
});
