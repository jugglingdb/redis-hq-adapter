var should = require('./init.js');
var db, Token, Schema = require('jugglingdb').Schema, log, queries = [];

describe('backyard', function() {

    before(function(done) {
        db = getSchema();
        db.backyard = new Schema(require('jugglingdb-mysql'), {
            username: 'root',
            database: 'myapp_test',
            // log: true,
            slave: true
        });
        defs(db);
        defs(db.backyard);
        log = db.log;
        db.log = db.backyard.log = function (q) {
            queries.push(q);
        };
        db.backyard.automigrate(done);
        Token = db.models.Token;
        function defs(db) {
            function JSON() {};
            db.define('Token', {
                name: String,
                json: JSON,
                fixed: {type: Number, dataType: 'decimal'},
                index: {type: String, index: true, length: 50}
            }, {
                expire: 1,
                uuid: 'v4'
            });
        }
    });

    beforeEach(function() {
        queries = [];
    });

    it('should create and read one item', function(done) {
        Token.create({name: 'foo', fixed: 2.17, index: 'a'}, function(err, token) {
            db.adapter.client.del('Token:' + token.id, function(err, res) {
                Token.find(token.id, function(err, t) {
                    should.exist(t);
                    t.id.should.equal(token.id);
                    t.name.should.equal('foo');
                    t.fixed.should.equal(2.17);
                    done();
                });
            });
        });
    });

    it('should reset expire after reading data', function(done) {
        Token.create({name: 'name'}, function(err, token) {
            queries = [];
            Token.find(token.id, function(err, t) {
                setTimeout(function() {
                    queries.should.have.lengthOf(3);
                    queries[1].should.equal('TTL Token:' + t.id);
                    queries[2].should.equal('EXPIRE Token:' + t.id + ' 1');
                    done();
                }, 100);
            });
        });
    });

    it('should create and read bunch of items', function(done) {
        Token.destroyAll(function() {
            Token.create([
                {name: 'foo', index: 'bar'},
                {name: 'bar', index: 'fuzz'},
                {name: 'baz', index: 'bar'}
            ], function(err, tokens) {
                queries = [];
                var ids = tokens.map(function(x) { return x.id});
                db.client.del('Token:' + tokens[1].id, function() {
                    Token.all(function(err, result) {
                        result.should.have.lengthOf(3);
                        setTimeout(function() {
                            done();
                        }, 100);
                    });
                });
            });
        });
    });

    it('should create and reand bunch of items by id', function(done) {
        Token.destroyAll(function() {
            Token.create([
                {name: 'foo', index: 'bar'},
                {name: 'bar', index: 'fuzz'}, // will be expired manually
                {name: 'baz', index: 'bar'}
            ], function(err, tokens) {
                queries = [];
                var ids = tokens.map(function(x) { return x.id});
                db.client.del('Token:' + tokens[1].id, function() {
                    Token.all({where: {id: {inq: ids}}}, function(err, result) {
                        result.should.have.lengthOf(3);
                        setTimeout(function() {
                            done();
                        }, 100);
                    });
                });
            });
        });
    });

    it('should not expire item on reading after backyard error: one hole', function(done) {
        Token.destroyAll(function() {
            Token.create([
                {id: 1, name: 'normal', index: 'bar'},
                {id: 2, name: 'expired', index: 'fuzz'}, // will be expired manually
                {id: 3, name: 'errored', index: 'bar'} // will emulate backyard error
            ], function(err, tokens) {
                // emulate expire with no backyard error
                db.client.del('Token:2', function() {
                    // emulate backyard error (no expire was set on create, no data in backyard)
                    db.adapter.client.del('Token:3', function() {
                    db.adapter.client.set('Token:3', JSON.stringify(tokens[2]), function() {
                        db.backyard.models.Token({id: 3}).destroy(function() {
                    queries = [];
                            // test how it works
                            Token.all(function() {
                                setTimeout(function() {
                                    queries.should.have.lengthOf(4);
                                    queries[0].should.equal('EVALSHA [Lua: ZRANGE+MGET] 0 z:Token@id 0 -1 Token');
                                    queries[1].should.equal('SELECT * FROM `Token` WHERE `id` IN (\'2\')');
                                    queries[2].should.equal('MULTI\n  TTL Token:1\n  TTL Token:3\n  SET Token:2 {"name":"expired","json":null,"fixed":null,"index":"fuzz","id":"2"}\n  EXPIRE Token:2 1\nEXEC');
                                    queries[3].should.equal('EXPIRE Token:1 1');
                                    done();
                                }, 100);
                            });
                        });
                    });
                });
            });
            });
        });
    });

    it('should not expire item on reading after backyard error: all present', function(done) {
        Token.destroyAll(function() {
            Token.create([
                {id: 1, name: 'normal', index: 'bar'},
                {id: 2, name: 'normal', index: 'fuzz'}, // will be expired manually
                {id: 3, name: 'errored', index: 'bar'} // will emulate backyard error
            ], function(err, tokens) {
                // emulate backyard error (no expire was set on create, no data in backyard)
                db.adapter.client.del('Token:3', function() {
                db.adapter.client.set(['Token:3', JSON.stringify(tokens[2])], function() {
                    db.backyard.models.Token({id: 3}).destroy(function() {
                        queries = [];
                        // test how it works
                        Token.all(function() {
                            setTimeout(function() {
                                queries.should.have.lengthOf(3);
                                queries[0].should.equal('EVALSHA [Lua: ZRANGE+MGET] 0 z:Token@id 0 -1 Token');
                                queries[1].should.equal('MULTI\n  TTL Token:1\n  TTL Token:2\n  TTL Token:3\nEXEC');
                                queries[2].should.equal('MULTI\n  EXPIRE Token:1 1\n  EXPIRE Token:2 1\nEXEC');
                                done();
                            }, 100);
                        });
                    });
                });
                });
            });
        });
    });

    it('should not truncate expired items', function(done) {
        var s = '1234567890abcdef';
        while (s.length < 1000000) {
            s += s.concat(s);
        }
        var length = s.length;
        Token.create({json: s}, function(err, token) {
            db.adapter.client.del('Token:' + token.id, function() {
                setTimeout(function() {
                    Token.find(token.id, function(err, token) {
                        token.json.length.should.equal(length);
                        done();
                    });
                }, 10);
            });
        });
    });

});

