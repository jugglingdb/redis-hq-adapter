var should = require('./init.js');

var db, Task;

describe.only('index', function() {

    before(function(done) {
        db = getSchema();
        Task = db.define('Task', {
            status: {type: String, index: true}
        });

        Task.destroyAll(function() {
            done();
        });
    });

    it('update indexes', function(done) {
        Task.create({status: 'pending'}, function(err, task) {
            Task.all({where: {status: 'pending'}}, function(err, tasks) {
                should.exist(tasks);
                tasks.should.have.lengthOf(1);
                task.updateAttributes({status: 'completed'}, function(err) {
                    should.not.exist(err);
                    Task.all({where: {status: 'pending'}}, function(err, tasks) {
                        should.not.exist(err);
                        should.exist(tasks);
                        tasks.should.have.lengthOf(0);
                        Task.all({where: {status: 'completed'}}, function(err, tasks) {
                            should.not.exist(err);
                            should.exist(tasks);
                            tasks.should.have.lengthOf(1);
                            done();
                        });
                    });
                });
            });
        });
    });
});

