var jdb = require('jugglingdb'),
    Schema = jdb.Schema,
    test = jdb.test,
    schema = new Schema(__dirname + '/..', {
    });

schema.name = 'redis-hq';

var Content = schema.define('Content', {
    text: jdb.Schema.Text
});

test(module.exports, schema);

if (test.skip) {
    test.skip('hasMany should be cached');
}

test.it('should handle ORDER clause', function (test) {
    Content.hasMany(schema.models.User, {as: 'author', foreignKey: 'authorId'});
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

