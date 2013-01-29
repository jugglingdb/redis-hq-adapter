var jdb = require('jugglingdb'),
    Schema = jdb.Schema,
    test = jdb.test,
    schema = new Schema(__dirname + '/..', {
    });

schema.name = 'redis-hq';

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
    groupModel: { type: String, index: true }
});

//define the tags test schema - should this be a standard type that belongs inside redis-hq.js ?
var Tag = schema.define('Tag', {
    groupId: { type: Number, index: true }, //can be null
    name: { type: String },
    model: String,
    sort: String,
    groupModel: { type: String, index: true },
    count: { type: Number, defaultSort: 'desc' }
});

// schema.extendModel('Content', { tags: schema.Tag});

//the groupModel field allows us to query by group+model with one redis command
// Tag.getter.groupModel = function() {
//     return this.groupId + '.' + this.model;
// };

test(module.exports, schema);

if (test.skip) {
    test.skip('hasMany should be cached');
}

// test.it('should create some test data', function(test) {
//     //create some random-ish content data
//     var contentData = [
//         { groupId: 1, authorId: 1, url: 'localhost/post1', title: 'post 1', text: 'hello, world', createdAt: new Date('2000-01-01'), score: 1, tags: [{ id: 1, name: 'news'}]},
//         { groupId: 1, authorId: 2, url: 'localhost/post2', title: 'post 2', text: 'hello, world', createdAt: new Date('2000-01-02'), score: 5, tags: [{ id: 2, name: 'blog'}, { id: 5, name: 'popular'}]},
//         { groupId: 1, authorId: 3, url: 'localhost/post3', title: 'post 3', text: 'hello, world', createdAt: new Date('2000-01-03'), score: 3, tags: [{ id: 1, name: 'news'}]},
//         { groupId: 1, authorId: 1, url: 'localhost/post4', title: 'post 4', text: 'hello, world', createdAt: new Date('2000-01-04'), score: 0, tags: [{ id: 2, name: 'blog'}]},
//         { groupId: 2, authorId: 2, url: 'localhost/post5', title: 'post 5', text: 'hello, world', createdAt: new Date('2000-01-05'), score: 10, tags: [{ id: 1, name: 'news'}, { id: 5, name: 'popular'}]},
//         { groupId: 2, authorId: 3, url: 'localhost/post6', title: 'post 6', text: 'hello, world', createdAt: new Date('2000-01-06'), score: 3, tags: [{ id: 1, name: 'news'}]},
//         { groupId: 2, authorId: 1, url: 'localhost/post7', title: 'post 7', text: 'hello, world', createdAt: new Date('2001-02-02'), score: 7, tags: [{ id: 1, name: 'news'}, { id: 5, name: 'popular'}]},
//         { groupId: 3, authorId: 2, url: 'localhost/post8', title: 'post 8', text: 'hello, world', createdAt: new Date('2002-03-03'), score: 4, tags: [{ id: 1, name: 'news'}]},
//         { groupId: 3, authorId: 3, url: 'localhost/post9', title: 'post 9', text: 'hello, world', createdAt: new Date('2004-05-06'), score: 9, tags: [{ id: 1, name: 'news'}, { id: 5, name: 'popular'}]},
//         { groupId: 3, authorId: 1, url: 'localhost/post10', title: 'post 10', text: 'hello, world', createdAt: new Date('2005-06-07'), score: 3, tags: [{ id: 1, name: 'news'}]},
//         { groupId: 4, authorId: 2, url: 'localhost/post11', title: 'post 11', text: 'hello, world', createdAt: new Date('2010-01-12'), score: 1, tags: [{ id: 1, name: 'news'}]}
//     ];
// 
//     //create the tags - if not defined, sort should default to the defaultSort of the model - i.e. in this case 'createdAt desc'
//     var tagData = [
//         { id: 1, model: 'Content', name: 'news' },
//         { id: 2, model: 'Content', name: 'blog' },
//         { id: 5, model: 'Content', name: 'popular', sort: 'score desc' }
//     ];
// });

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

// //query on unique index - we don't need a sorted set - don't mind whether we use one or not for 'url'
// test.it('should get a single content record by URL with no need to sort', function(test) {
// 
// });
// 
// //standard tag query with default sort order
// test.it('Should get all content tagged with "news" sorted by "createdAt desc"', function(test) {
// 
// });
// 
// //standard tag query with tag-specified sort order
// test.it('Should get all content tagged with "popular" sorted by "score desc"', function(test) {
// 
// });
// 
// //intersection with 2 sorted sets - always sort by the last index in the query?
// test.it('Should get all content in groupId=1 tagged with "popular" sorted by "score desc"', function(test) {
// 
// });
