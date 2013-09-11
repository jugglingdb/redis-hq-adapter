var should = require('./init.js');
var Content, db, queries = [];

describe('queue', function() {

    before(function() {
        db = getSchema();

        Content = db.define('Content', {hello: String, index: {type: String, index: true}});
        db.log = function (q) {
            queries.push(q);
        };
    });

    it('should not queue Model.all queries', function(done) {
        db.settings.maxMultiBatchSize = 1;
        Content.all({where: {index: 'hey'}}, function() {});
        Content.all(function() {
            queries.should.have.lengthOf(2);
            queries[0].should.equal('EVALSHA [Lua: ZRANGE+MGET] 0 z:Content:index:hey 0 -1 Content');
            queries[1].should.equal('EVALSHA [Lua: ZRANGE+MGET] 0 z:Content@id 0 -1 Content');
            done();
        });
    });

    it('should not queue similar queries', function(done) {
        queries = [];
        db.settings.maxMultiBatchSize = 1;
        var called = false;
        Content.all({}, function() {
            called = true;
        });
        Content.all(function() {
            called.should.be.true;
            queries.should.have.lengthOf(1);
            queries[0].should.equal('EVALSHA [Lua: ZRANGE+MGET] 0 z:Content@id 0 -1 Content');
            done();
        });
    });

    it('should handle failure', function(done) {
        if (process.env.DEBUG_REDIS) {
            db.log = console.log;
        } else {
            db.log = function() {};
        }
        db.settings.maxMultiBatchSize = 10;
        var one = 0, two = 0;
        db.adapter.client.set(['key', 'value'], function(err, data) {
            should.not.exist(err);
            one += 1;
        });
        db.adapter.client.set(['keys'], function(err, data) {
            should.exist(err);
            two += 1;
        });
        db.adapter.client.get(['key'], function(err, data) {
            should.not.exist(err);
            data.should.equal('value');
            one.should.equal(1);
            two.should.equal(1);
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

