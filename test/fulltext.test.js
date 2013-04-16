var should = require('./init.js'), reds = require('reds');

var db, Book;

describe('fulltext-search', function() {

    before(function(done) {
        db = getSchema();
        reds.client = db.adapter.client.__connection;
        db.fulltextSearch = new SearchAPI;
        Book = db.define('Book', {
            title: {type: String, fulltext: true},
            author: {type: String, fulltext: true},
            tags: String
        });

        Book.destroyAll(function() {
            db.adapter.client.keys('global:*', function (e, k) {
                if (k.length) {
                    k.forEach(function(k) {
                        db.adapter.client.del(k);
                    });
                    db.adapter.client.__afterStep(done);
                } else done();
            })
        });

    });

    it('should update fulltext index and query data', function(done) {
        var b;
        Book.create([
            {title: 'Idiot', author: 'Fedor Dostoevsky'},
            {title: 'Anna Karenina', author: 'Fedor Dostoevsky'},
            {title: 'War and Peace', author: 'Lev Tolstoy'}
        ], function(e, book) {
            b = book[0];;
            should.not.exist(e);
            setTimeout(queryIndex, 50);
        });

        function queryIndex() {
            Book.all({fulltext: 'idiot'}, function(e, books) {
                should.not.exist(e);
                should.exist(books);
                books.should.have.lengthOf(1);
                books[0].id.should.equal(b.id);
                next();
            });
        }

        function next() {
            Book.all({fulltext: 'dostoevsky'}, function(e, books) {
                should.not.exist(e);
                should.exist(books);
                books.should.have.lengthOf(2);
                last();
            });
        }

        function last() {
            Book.all({fulltext: 'tolstoy'}, function(e, books) {
                should.not.exist(e);
                should.exist(books);
                books.should.have.lengthOf(1);
                books[0].title.should.equal('War and Peace');
                done();
            });
        }

    });

});

function SearchAPI(){
    this.search = reds.createSearch('global');
}

SearchAPI.prototype.queryNS = function(ns, query, cb) {
    this.search.query(query || '').end(cb);
};

SearchAPI.prototype.update = function(ns, id, content, done) {
    this.search.remove(id, function() {
        this.search.index(content, id, done);
    }.bind(this));
};

SearchAPI.prototype.remove = function(ns, id, done) {
    this.search.remove(id, done);
};
