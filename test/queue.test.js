var should = require('./init.js');
var Content, db;

describe('queue', function() {

    var queries = [];
    before(function() {
        db = getSchema();

        Content = db.define('Content', {hello: String});
        db.log = function (q) {
            queries.push(q);
        };
    });

    it('should not queue Model.all queries', function(done) {
        Content.all({}, function() {});
        Content.all(function() {
            queries.should.have.lengthOf(2);
            queries[0].should.equal('EVALSHA [Lua: ZRANGE+MGET] 0 z:Content@id 0 -1 Content');
            queries[1].should.equal('EVALSHA [Lua: ZRANGE+MGET] 0 z:Content@id 0 -1 Content');
            done();
        });
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

