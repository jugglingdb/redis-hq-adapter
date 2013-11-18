var should = require('./init.js');
var db, Token, Schema = require('jugglingdb').Schema, log, queries = [];

describe('backyard', function() {

    before(function() {
        db = getSchema();
        db.backyard = new Schema(require('../'), {database: 3});
        defs(db);
        defs(db.backyard);
        log = db.log;
        db.log = db.backyard.log = function (q) {
            queries.push(q);
        };
        Token = db.models.Token;
        function defs(db) {
            db.define('Token', {
                name: String,
                index: {type: String, index: true}
            }, {
                expire: 1
            });
        }
    });

    beforeEach(function() {
        queries = [];
    });

    it('should create and read one item', function(done) {
        Token.create({name: 'foo', index: 'a'}, function(err, token) {
            db.adapter.client.del('Token:' + token.id, function(err, res) {
                Token.find(token.id, function(err, t) {
                    should.exist(t);
                    t.id.should.equal(token.id);
                    t.name.should.equal('foo');
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
                    queries.should.have.lengthOf(2);
                    queries[1].should.equal('EXPIRE Token:' + t.id + ' 1');
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
                            queries[1].should.equal('MGET Token:' + tokens[1].id);
                            queries[2].should.equal('MULTI\n  SET Token:' + tokens[1].id + ' {"name":"bar","index":"fuzz","id":' + tokens[1].id + '}\n  EXPIRE Token:' + tokens[0].id + ' 1\n  EXPIRE Token:' + tokens[1].id + ' 1\n  EXPIRE Token:' + tokens[2].id + ' 1\nEXEC');
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
                {name: 'bar', index: 'fuzz'},
                {name: 'baz', index: 'bar'}
            ], function(err, tokens) {
                queries = [];
                var ids = tokens.map(function(x) { return x.id});
                db.client.del('Token:' + tokens[1].id, function() {
                    Token.all({where: {id: {inq: ids}}}, function(err, result) {
                        result.should.have.lengthOf(3);
                        setTimeout(function() {
                            queries[1].should.equal('MGET Token:' + tokens[1].id);
                            queries[2].should.equal('MULTI\n  SET Token:' + tokens[1].id + ' {"name":"bar","index":"fuzz","id":' + tokens[1].id + '}\n  EXPIRE Token:' + tokens[0].id + ' 1\n  EXPIRE Token:' + tokens[1].id + ' 1\n  EXPIRE Token:' + tokens[2].id + ' 1\nEXEC');
                        done();
                        }, 100);
                    });
                });
            });
        });
    });

});

