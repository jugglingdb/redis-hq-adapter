var should = require('./init.js');
var db, Item, items;

describe('inq', function() {
    before(function(done) {
        db = getSchema();
        Item = db.define('Item', {
            name: {type: String, index: true}
        });
        Item.destroyAll(function() {
            Item.create([{name: 1},{name: 1},{name: 1}], function(err, data) {
                items = data;
                done();
            });
        });
    });

    it('should correctly handle removed objects', function(done) {
        var ids = items.map(function(item) {
            return item.id;
        });
        ids.should.have.lengthOf(3);
        items[0].destroy(function(err) {
            should.not.exist(err);
            Item.all({where: {id: {inq: ids }}}, function(err, items) {
                items.should.have.lengthOf(2);
                done();
            });
        });
    });
});
