var Content, db, should = require('should');

describe.only('redis', function() {

    before(function() {
        db = getSchema();

        Content = db.define('Content', {
            groupId: { type: Number, index: true },
            url: { type: String, index: 'unique' },
            text: String,
            score: { type: Number, index: true },
            groupModel: { type: [], index: true },
            tags: { type: [], index: true }
        }, {
            defaultSort: 'id desc',
            customSort: {
                'tags.popular': 'score'
            }
        });
    });

    describe('defaultSort', function(err) {

        beforeEach(function(done) {
            Content.destroyAll(done);
        });

        it('should handle ORDER clause', function (done) {
            Content.create({text: '1'}, function () {
                Content.create({text: '2'}, function () {
                    Content.all(function (err, contents) {
                        should.not.exist(err);
                        contents.should.have.lengthOf(2);
                        contents[0].text.should.equal('2');
                        contents[1].text.should.equal('1');
                        done();
                    });
                });
            });
        });

        it('should handle order clause with direction', function (done) {
            Content.create({text: '1'}, function () {
                Content.create({text: '2'}, function () {
                    Content.all({reverse: false}, function (err, contents) {
                        should.not.exist(err);
                        should.exist(contents);
                        contents.should.have.lengthOf(2);
                        contents[0].text.should.equal('1');
                        contents[1].text.should.equal('2');
                        Content.all({reverse: true}, function (err, contents) {
                            should.not.exist(err);
                            should.exist(contents);
                            contents.should.have.lengthOf(2);
                            contents[0].text.should.equal('2');
                            contents[1].text.should.equal('1');
                            done();
                        });
                    });
                });
            });
        });

        it('should work with array fields', function (done) {
            Content.create({groupModel: [1, '34', 'hello']}, function (err, c) {
                should.not.exist(err);
                Content.findOne({where: {groupModel: 'hello'}}, found);
                Content.findOne({where: {groupModel: '1'}}, found);
                Content.findOne({where: {groupModel: '34'}}, found);
                Content.findOne({where: {groupModel: 'hello world'}}, function (err, cn) {
                    should.not.exist(err);
                    should.not.exist(cn);
                    ok();
                });
                function found(err, cn) {
                    cn.id.should.equal(c.id);
                    ok();
                }
            });

            var wait = 4;
            function ok() {
                if (--wait === 0) done();
            }
        });

        it('should get a single content record by URL with no need to sort', function(test) {
            var url = 'host/path';
            Content.create({url: url}, function (err, c) {
                should.not.exist(err);
                Content.all({where: {url: url}}, function (err, cs) {
                    should.not.exist(err);
                    cs.should.have.lengthOf(1);
                    c = cs[0];
                    c.url.should.equal(url);
                    c.url = url + '.html';
                    c.save(function () {
                        Content.all({where: {url: url}}, function (err, cs) {
                            should.not.exist(err);
                            cs.should.have.lengthOf(0);
                            Content.all({where: {url: url + '.html'}}, function (err, cs) {
                                should.not.exist(err);
                                cs.should.have.lengthOf(1);
                                test();
                            });
                        });
                    });
                });
            });

        });

        //standard tag query with default sort order
        it('should get all content tagged with "news" sorted by "id desc"', function(done) {
            Content.create({ url: 'url1', tags: [ 'news' ] }, function () {
                Content.create({ url: 'url2', tags: [ 'news' ] }, function () {
                    Content.all({where: {tags: 'news'}}, function (e, c) {
                        should.not.exist(e);
                        should.exist(c);
                        c.should.have.lengthOf(2);
                        c[0].url.should.equal('url2');
                        c[1].url.should.equal('url1');
                        done();
                    });
                });
            });

        });
    });

    describe('customSort', function() {

        before(function(done) {
            Content.create({
                groupId: 1,
                url: 'one',
                score: 7,
                tags: [ 'popular' ]
            }, function (e) {
                should.not.exist(e);
                Content.create({
                    groupId: 1,
                    url: 'three',
                    score: 9,
                    tags: [ 'popular' ]
                }, function (e) {
                    should.not.exist(e);
                    Content.create({
                        url: 'two',
                        score: 8,
                        tags: [ 'popular' ]
                    }, done);
                });
            });
        });

        //standard tag query with tag-specified sort order
        it('should get all content tagged with "popular" sorted by "score asc"', function(done) {
            Content.all({where: {tags: 'popular'}, reverse: false}, function (e, c) {
                should.not.exist(e);
                should.exist(c);
                c.should.have.lengthOf(3);
                c[0].url.should.equal('one');
                c[1].url.should.equal('two');
                c[2].url.should.equal('three');
                done();
            });

        });

        //intersection with 2 sorted sets - always sort by the last index in the query?
        it('should get all content in groupId=1 tagged with "popular" sorted by "score desc"', function(done) {
            Content.all({where: {groupId: 1, tags: 'popular'}}, function (e, c) {
                should.not.exist(e);
                should.exist(c);
                c.should.have.lengthOf(2);
                c[0].score.should.equal(9);
                c[1].score.should.equal(7);
                done();
            });
        });

        it('should get all content in groupId=1 tagged with "popular" sorted by "score asc"', function(done) {
            Content.all({where: {groupId: 1, tags: 'popular'}, reverse: true}, function (e, c) {
                should.not.exist(e);
                should.exist(c);
                c.should.have.lengthOf(2);
                c[0].score.should.equal(9);
                c[1].score.should.equal(7);
                done();
            });
        });

    });
});
