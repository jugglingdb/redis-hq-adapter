var queues = {};
var instances = {};
var timeouts = {};

module.exports = postpone;

function postpone(Model, prop, options) {
    return function(id) {
        var key = Model.modelName + ':' + id + ':' + prop;
        var onSchedule = postpone.action[options.action].onSchedule;
        if (onSchedule && !instances[key]) {
            instances[key] = true;
            Model.find(id, function(err, inst) {
                instances[key] = inst;
                if (onSchedule) {
                    queues[key].forEach(function(fn) {
                        fn(inst);
                    });
                }
            });
        } else if (onSchedule && instances[key] instanceof Model) {
            onSchedule(instances[key], prop, options);
        }

        if (!queues[key]) {
            queues[key] = [];
        }

        if (onSchedule) {
            queues[key].push(function(instance) {
                onSchedule(instance, prop, options);
            });
        }

        var onTimeout = postpone.action[options.action].onTimeout;
        if (!timeouts[key]) {
            timeouts[key] = setTimeout(function() {
                delete timeouts[key];
                delete queues[key];
                onTimeout(Model, id, prop, options);
                delete instances[key];
            }, options.timeout);
        }
    };
}

postpone.action = {
    INCR: {
        onSchedule: function(instance, prop, options) {
            instance[prop] += 1;
        },
        onTimeout: function(Model, id, prop, options) {
            var instance = instances[Model.modelName + ':' + id + ':' + prop];
            if (instance) {
                instance.save();
            }
        }
    },
    CACHE: {
        onSchedule: null,
        onTimeout: function(Model, id, prop, options) {
            Model.find(id, function(err, instance) {
                instance[options.relation](options.query, function(err, collection) {
                    instance[prop].items = [];
                    collection.forEach(function(item) {
                        instance[prop].push(item.toObject());
                    });
                    instance.save();
                });
            });
        }
    }
};
