var should = require('./init.js');
var db, queries = [], Item, log;

describe('queries', function() {

    before(function() {
        db = getSchema();
        Item = db.define('Item', {
            name: String,
            index1: {type: String, index: true},
            score: Number
        }, {
            defaultSort: 'score'
        });
        log = db.log;
        db.log = function (q) {
            queries.push(q);
        };
    });

    after(function() {
        db.log = log;
    });

    describe('indexes', function() {

        beforeEach(function(done) {
            Item.destroyAll(function() {
                queries = [];
                done();
            });
        });

        it('should query by single index', function(done) {
            Item.all({where: {index1: 'filter'}}, function(err, collection) {
                queries.should.have.lengthOf(1);
                queries.pop().should.match(/EVALSHA .*? 0 z:Item:index1:filter 0 -1 Item/);
                done();
            });
        });

        it('should add items to index using defaultSort on creation', function(done) {
            Item.create({
                score: 29,
                index1: 'bada',
                name: 'Jon'
            }, function(err, item) {
                should.not.exist(err);
                should.exist(item);
                queries.shift().should.equal('INCR id:Item');
                queries.shift().should.equal('SET Item:' + item.id + ' ' + JSON.stringify(item));
                queries.shift().should.equal([
                    'MULTI',
                    '  ZREM z:Item@id ' + item.id,
                    '  ZREM z:Item@score ' + item.id,
                    '  ZADD z:Item:index1:bada 29 ' + item.id,
                    '  ZADD z:Item@score 29 ' + item.id,
                    '  ZADD z:Item@id ' + item.id + ' ' + item.id,
                    'EXEC'
                ].join('\n'));
                done();
            });
        });
    });

    describe('score casting', function() {

        beforeEach(function() {
            queries = [];
        });

        it('should convert date to number when used in score', function(done) {
            var ScoreByDate = db.define('ScoreByDate', {
                date: Date,
                haha: {type: String, index: true}
            }, {defaultSort: 'date'});
            var date = new Date, ts = date.getTime();
            ScoreByDate.create({date: date, haha: 'hoho'}, function(e, s) {
                var q = queries.pop();
                q.should.include('ZADD z:ScoreByDate@date ' + ts + ' ' + s.id);
                q.should.include('ZADD z:ScoreByDate:haha:hoho ' + ts + ' ' + s.id);
                done();
            });
        });

        it('should convert string to number when used in score', function(done) {
            var ScoreByString = db.define('ScoreByStr', {
                str: String,
                haha: {type: String, index: true}
            }, {defaultSort: 'str'});
            var str = 'hello',
                score = parseInt([
                    'h'.charCodeAt(0).toString(2),
                    'e'.charCodeAt(0).toString(2),
                    'l'.charCodeAt(0).toString(2),
                    'l'.charCodeAt(0).toString(2)
                ].join(''), 2);
            ScoreByString.create({str: str, haha: 'hoho'}, function(e, s) {
                var q = queries.pop();
                q.should.include('ZADD z:ScoreByStr@str ' + score + ' ' + s.id);
                q.should.include('ZADD z:ScoreByStr:haha:hoho ' + score + ' ' + s.id);
                done();
            });
        });

        it('should convert bool to number when used in score', function(done) {
            var ScoreByBool = db.define('ScoreByBool', {
                bool: Boolean,
                haha: {type: String, index: true}
            }, {defaultSort: 'bool'});
            ScoreByBool.create({bool: true, haha: 'hoho'}, function(e, s) {
                var q = queries.pop();
                q.should.include('ZADD z:ScoreByBool@bool 1 ' + s.id);
                q.should.include('ZADD z:ScoreByBool:haha:hoho 1 ' + s.id);
                done();
            });
        });

    });

    describe('count', function() {

        var Mana;
        before(function(done) {
            Mana = db.define('Mana', {foo: {type: String, index: true}});
            Mana.create([
                {foo: 'bar'},
                {foo: 'bza'},
                {foo: 'bar'}
            ], done);
        });

        beforeEach(function() {
            queries = [];
        });

        it('should query count using zcard', function(done) {
            Mana.count(function() {
                queries[0].should.equal('ZCARD z:Mana@id');
                done();
            });
        });

        it('should query conditional count using zcard', function(done) {
            Mana.count({foo: 'bar'}, function() {
                queries[0].should.equal('ZCARD z:Mana:foo:bar');
                done();
            });
        });

    });

});
