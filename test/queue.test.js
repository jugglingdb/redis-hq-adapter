var should = require('./init.js');
var Content, db;

describe('queue', function() {

    before(function() {
        db = getSchema();

        Content = db.define('Content', {hello: String});
    });

    it.skip('should queue queries', function(done) {
        Content.create(function(err, content) {
            var id = content.id
            Content.find(id, function(err, content) {
                should.not.exists(err);
                should.exists(content);
                should.not.exists(content.hello);
            });
            content.hello = 'world';
            content.save(function(err, content) {
                should.not.exists(err);
            });
            Content.find(id, function(err, content) {
                should.not.exists(err);
                content.hello.should.equal('world');
            });
            content.hello = 'foo';
            content.save(function(err) {
                should.not.exists(err);
            });
            Content.find(id, function(err, content) {
                should.not.exists(err);
                content.hello.should.equal('foo');
                done();
            });
        });
    });

});

