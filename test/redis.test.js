require('jugglingdb/test/common.batch.js');
// require('jugglingdb/test/include.test.js');

return;

//these paging params should be used in all below tests
var pageSize = 5;
var pageNumber = 1;

//define the content test schema
var Content = schema.define('Content', {
    groupId: { type: Number, index: true },
    authorId: { type: Number, index: true },
    url: { type: String, index: 'unique' },
    text: String,
    title: String,
    createdAt: { type: Date, defaultSort: 'desc' },
    score: { type: Number, index: true },
    groupModel: { type: [], index: true },
    tags: { type: [], index: true }
}, {
    customSort: {
        'tags.popular': 'score'
    }
});

// the groupModel field allows us to query by group+model with one redis command
// Tag.getter.groupModel = function() {
//     return this.groupId + '.' + this.model;
// };

test(module.exports, schema);


test.it('should handle ORDER clause', function (test) {
    Content.hasMany(schema.models.User, {as: 'author', foreignKey: 'authorId'});
    Content.destroyAll(function () {
        Content.create({text: '1'}, function () {
            Content.create({text: '2'}, function () {
                Content.all(function (err, contents) {
                    test.equal(contents.length, 2);
                    test.equal(contents[0].text, '2');
                    test.equal(contents[1].text, '1');
                    Content.destroyAll(test.done);
                });
            });
        });
    });
});

test.it('should handle order clause with direction', function (test) {
    Content.hasMany(schema.models.User, {as: 'author', foreignKey: 'authorId'});
    Content.create({text: '1'}, function () {
        Content.create({text: '2'}, function () {
            Content.all({reverse: false}, function (err, contents) {
                test.equal(contents.length, 2);
                test.equal(contents[0].text, '1');
                test.equal(contents[1].text, '2');
                Content.destroyAll(test.done);
            });
        });
    });
});

test.it('should work with array fields', function (test) {
    Content.create({groupModel: [1, '34', 'hello']}, function (err, c) {
        test.ok(!err);
        Content.findOne({where: {groupModel: 'hello'}}, found);
        Content.findOne({where: {groupModel: '1'}}, found);
        Content.findOne({where: {groupModel: '34'}}, found);
        Content.findOne({where: {groupModel: 'hello world'}}, function (err, cn) {
            test.ok(!cn);
            done();
        });
        function found(err, cn) {
            console.log('asdasda', arguments);
            test.equal(cn.id, c.id);
            done();
        }
    });

    var wait = 4;
    function done() {
        if (--wait === 0) test.done();
    }
});

test.it('should get a single content record by URL with no need to sort', function(test) {
    var url = 'host/path';
    Content.create({url: url}, function (err, c) {
        Content.all({where: {url: url}}, function (err, cs) {
            test.ok(cs.length === 1);
            test.ok(cs[0].url === url);
            cs[0].url = url + '.html';
            cs[0].save(function () {
                Content.all({where: {url: url}}, function (err, cs) {
                    test.ok(cs.length === 0);
                    Content.all({where: {url: url + '.html'}}, function (err, cs) {
                        test.ok(cs.length === 1);
                        test.done();
                    });
                });
            });
        });
    });

});

//standard tag query with default sort order
test.it('should get all content tagged with "news" sorted by "createdAt desc"', function(test) {
    Content.create({ url: 'url1', tags: [ 'news' ] }, function () {
        Content.create({ url: 'url2', tags: [ 'news' ] }, function () {
            Content.all({where: {tags: 'news'}}, function (e, c) {
                test.ok(c.length === 2);
                test.equal(c[0].url, 'url2');
                test.equal(c[1].url, 'url1');
                test.done();
            });
        });
    });

});

//standard tag query with tag-specified sort order
test.it('should get all content tagged with "popular" sorted by "score asc"', function(test) {
    Content.create({ groupId: 1, url: 'one', score: 7, tags: [ 'popular' ] }, function () {
        Content.create({ groupId: 1, url: 'three', score: 9, tags: [ 'popular' ] }, function () {
            Content.create({ url: 'two', score: 8, tags: [ 'popular' ] }, function () {
                Content.all({where: {tags: 'popular'}, reverse: false}, function (e, c) {
                    test.equal(c.length, 3);
                    test.equal(c[0].url, 'one');
                    test.equal(c[1].url, 'two');
                    test.equal(c[2].url, 'three');
                    test.done();
                });
            });
        });
    });

});

//intersection with 2 sorted sets - always sort by the last index in the query?
test.it('should get all content in groupId=1 tagged with "popular" sorted by "score desc"', function(test) {
    Content.all({where: {groupId: 1, tags: 'popular'}}, function (e, c) {
        test.equal(c.length, 2);
        test.equal(c[0].score, 9);
        test.equal(c[1].score, 7);
        test.done();
    });
});
